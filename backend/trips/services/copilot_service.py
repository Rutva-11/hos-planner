import os
import logging
import time
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# Resolve path to backend/.env to ensure it loads correctly regardless of CWD
BASE_DIR = Path(__file__).resolve().parent.parent.parent
env_path = BASE_DIR / '.env'

def load_env_variables():
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()

load_env_variables()

logger = logging.getLogger(__name__)

api_key_env = os.getenv("OPENROUTER_API_KEY")
if api_key_env and api_key_env.strip():
    logger.info("OPENROUTER_API_KEY environment variable loaded successfully.")
else:
    logger.warning(
        "OPENROUTER_API_KEY is missing or empty. "
        "Compliance Assistant will run in fallback offline mode."
    )


class CopilotService:
    DEFAULT_MODEL = os.getenv("OPENROUTER_DEFAULT_MODEL", "openai/gpt-4o-mini")
    FALLBACK_MODELS = [
        os.getenv("OPENROUTER_FALLBACK_MODEL_1", "anthropic/claude-3-haiku"),
        os.getenv("OPENROUTER_FALLBACK_MODEL_2", "deepseek/deepseek-chat"),
    ]

    @classmethod
    def _get_fallback_response(cls, prompt: str) -> str:
        query_lower = prompt.lower()
        if "11-hour" in query_lower or "11 hour" in query_lower:
            return (
                "Under FMCSA regulation § 395.3(a)(3), commercial motor vehicle drivers are permitted to drive a "
                "maximum of 11 cumulative hours following 10 consecutive hours off duty. All driving time must "
                "be completed within a 14-hour consecutive duty window. To maintain compliance, ensure your Electronic "
                "Logging Device (ELD) is set to 'Driving' when active, and track your remaining drive time against "
                "the 11-hour limit to prevent daily violations."
            )
        elif "sleeper berth" in query_lower or "split" in query_lower or "395.1(g)" in query_lower:
            return (
                "FMCSA regulation § 395.1(g) allows drivers to split their mandatory 10-hour off-duty period using "
                "two sleeper berth periods: an 8/2 or 7/3 split. The shorter period (2 or 3 hours) must be spent "
                "off-duty or in the sleeper berth, while the longer period (8 or 7 hours) must be spent entirely "
                "in the sleeper berth. When combined, these periods pause and reset your 14-hour duty window, "
                "allowing for flexible scheduling on long-haul routes."
            )
        elif "non-compliant" in query_lower or "violation" in query_lower or "reasons" in query_lower:
            return (
                "Logistics routes typically become non-compliant due to three primary factors: exceeding the 11-hour "
                "daily driving limit, exceeding the 14-hour daily duty window, or neglecting the mandatory 30-minute "
                "rest break after 8 hours of driving. Unplanned traffic delays, shipper detention times, and bad "
                "weather are common operational causes. To mitigate these risks, dispatcher schedules should incorporate "
                "realistic buffer times and leverage HOS-compliant rest stops."
            )
        elif "optimize" in query_lower or "optimizing" in query_lower:
            return (
                "To maximize legal driving time and optimize routing, plan your departures to align with low-traffic "
                "windows and pre-schedule all pickup and drop-off windows. Utilizing 8/2 or 7/3 sleeper berth splits "
                "can prevent the 14-hour clock from expiring during shipper loading delays. Additionally, maintaining "
                "a steady cruise speed and identifying HOS-compliant parking locations in advance ensures that "
                "mandatory rest breaks do not incur unnecessary dwell time."
            )
        elif "fmcsa" in query_lower or "risk" in query_lower or "safety" in query_lower or "csa" in query_lower:
            return (
                "A carrier's FMCSA safety profile (CSA score) is determined by the Behavior Analysis and Safety "
                "Improvement Categories (BASICs), which track unsafe driving, crash history, HOS compliance, and "
                "vehicle maintenance. HOS violations—such as form and manner errors or false logs—negatively impact "
                "your HOS Compliance BASIC score. To reduce audit exposure, operators should implement automated ELD "
                "monitoring, conduct regular driver training on log certification, and establish pre-trip inspection protocols."
            )
        else:
            return (
                "To maintain regulatory alignment, all commercial operations must adhere strictly to FMCSA § 395 regulations. "
                "Ensure that your driving logs are fully certified, your daily driving does not exceed 11 hours within the "
                "14-hour duty window, and a 30-minute rest break is logged after 8 hours of driving. For specific scheduling "
                "or compliance questions, please consult the route planner or your operations team."
            )

    @classmethod
    def ask_copilot(cls, prompt: str) -> str:
        """
        Sends a single compliance query to OpenRouter and returns a concise response.
        Uses a 3-model fallback chain configured by DEFAULT_MODEL and FALLBACK_MODELS.
        No conversational state or route context is maintained.
        """
        from openai import APITimeoutError, APIConnectionError, APIStatusError

        load_env_variables()

        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key or not api_key.strip():
            logger.warning(
                "OPENROUTER_API_KEY not configured. "
                "Returning premium offline fallback response."
            )
            return cls._get_fallback_response(prompt)

        masked_key = api_key[:8] + "..." if len(api_key) >= 8 else "..."
        logger.info(
            "OPENROUTER_API_KEY detected. Length: %d, Prefix: %s",
            len(api_key), masked_key
        )

        try:
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key.strip(),
                default_headers={
                    "HTTP-Referer": "https://hos-planner.vercel.app",
                    "X-Title": "AURA HOS Compliance Portal",
                }
            )

            system_prompt = (
                "You are AURA Compliance Assistant, a premium, domain-specific AI "
                "for trucking logistics, hours of service (HOS) compliance, and FMCSA "
                "rules auditing.\n\n"
                "INSTRUCTIONS:\n"
                "- Be concise and operational. Responses must be 3–6 sentences maximum.\n"
                "- Act as an expert on FMCSA regulations (§ 395 and related HOS rules).\n"
                "- Explain HOS rules clearly: 11-hour driving limit, 14-hour duty window, "
                "30-minute breaks, 60/70-hour rolling cycles, sleeper berth splits.\n"
                "- Suggest compliance improvements professionally.\n"
                "- Reference specific FMCSA regulation codes (e.g., § 395.3(a)) when relevant.\n"
                "- Politely decline questions unrelated to trucking, HOS, or freight operations.\n"
                "- Never use excessive filler text. Be direct, authoritative, and precise."
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]

            models_to_try = [cls.DEFAULT_MODEL] + [m for m in cls.FALLBACK_MODELS if m]

            last_exception = None
            for model in models_to_try:
                for attempt in range(1, 3):  # 2 attempts per model
                    start_time = time.time()
                    try:
                        logger.info(
                            "API_REQUEST: OpenRouter dispatch. model=%s, attempt=%d, prompt_len=%d",
                            model, attempt, len(prompt)
                        )
                        response = client.chat.completions.create(
                            model=model,
                            messages=messages,
                            timeout=12.0,
                            temperature=0.2,
                            max_tokens=400,
                        )
                        content = response.choices[0].message.content
                        latency = time.time() - start_time
                        logger.info(
                            "API_SUCCESS: OpenRouter completed. model=%s, attempt=%d, latency=%.2fs, output_len=%d",
                            model, attempt, latency, len(content)
                        )
                        return content

                    except APITimeoutError as te:
                        latency = time.time() - start_time
                        logger.warning(
                            "API_WARNING: OpenRouter timeout. model=%s, attempt=%d, latency=%.2fs, error=%s",
                            model, attempt, latency, str(te)
                        )
                        last_exception = te

                    except APIConnectionError as ce:
                        latency = time.time() - start_time
                        logger.warning(
                            "API_WARNING: OpenRouter connection error. model=%s, attempt=%d, latency=%.2fs, error=%s",
                            model, attempt, latency, str(ce)
                        )
                        last_exception = ce

                    except APIStatusError as se:
                        latency = time.time() - start_time
                        logger.warning(
                            "API_WARNING: OpenRouter status error HTTP %d. model=%s, attempt=%d, latency=%.2fs, error=%s",
                            se.status_code, model, attempt, latency, se.message
                        )
                        last_exception = se
                        if se.status_code == 401:
                            logger.error(
                                "API_ERROR: OpenRouter authentication failed (401). model=%s, latency=%.2fs",
                                model, latency
                            )
                            return cls._get_fallback_response(prompt)
                        if se.status_code in (400, 404):
                            logger.warning(
                                "API_WARNING: Model %s unavailable (HTTP %d). Skipping remaining retries.",
                                model, se.status_code
                            )
                            break  # Skip remaining retries for this model

                    except Exception as e:
                        latency = time.time() - start_time
                        logger.error(
                            "API_ERROR: OpenRouter unexpected error. model=%s, attempt=%d, latency=%.2fs, error=%s",
                            model, attempt, latency, str(e), exc_info=True
                        )
                        last_exception = e
                        break  # Skip remaining retries for this model

            if last_exception:
                raise last_exception
            raise Exception("All fallback models exhausted without a response.")

        except Exception as e:
            logger.error(
                "API_ERROR: OpenRouter failed after all fallback models. error=%s",
                str(e), exc_info=True
            )
            return cls._get_fallback_response(prompt)
