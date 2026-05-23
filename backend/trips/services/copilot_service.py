import os
import logging
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
    @staticmethod
    def ask_copilot(prompt: str) -> str:
        """
        Sends a single compliance query to OpenRouter and returns a concise response.
        Uses a 3-model fallback chain: gpt-4o-mini → claude-3-haiku → deepseek-chat.
        No conversational state or route context is maintained.
        """
        from openai import APITimeoutError, APIConnectionError, APIStatusError

        load_env_variables()

        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key or not api_key.strip():
            logger.warning(
                "OPENROUTER_API_KEY not configured. "
                "Returning offline fallback response."
            )
            return (
                "Compliance Assistant is currently offline. "
                "Please configure the OPENROUTER_API_KEY on the server."
            )

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

            models_to_try = [
                "openai/gpt-4o-mini",
                "anthropic/claude-3-haiku",
                "deepseek/deepseek-chat",
            ]

            last_exception = None
            for model in models_to_try:
                for attempt in range(1, 3):  # 2 attempts per model
                    try:
                        logger.info(
                            "Dispatching compliance query (Attempt %d/2) via model: %s",
                            attempt, model
                        )
                        response = client.chat.completions.create(
                            model=model,
                            messages=messages,
                            timeout=12.0,
                            temperature=0.2,
                            max_tokens=400,
                        )
                        content = response.choices[0].message.content
                        logger.info(
                            "OpenRouter success. Model: %s. Output: %d chars.",
                            model, len(content)
                        )
                        return content

                    except APITimeoutError as te:
                        logger.warning(
                            "Timeout (attempt %d, model %s): %s", attempt, model, te
                        )
                        last_exception = te

                    except APIConnectionError as ce:
                        logger.warning(
                            "Connection error (attempt %d, model %s): %s", attempt, model, ce
                        )
                        last_exception = ce

                    except APIStatusError as se:
                        logger.warning(
                            "API status error HTTP %d (attempt %d, model %s): %s",
                            se.status_code, attempt, model, se.message
                        )
                        last_exception = se
                        if se.status_code == 401:
                            logger.error("OpenRouter authentication failed (401).")
                            return (
                                "Compliance Assistant is offline. "
                                "Please configure a valid OPENROUTER_API_KEY on the server."
                            )
                        if se.status_code in (400, 404):
                            logger.warning(
                                "Model %s unavailable (HTTP %d). Trying next model.",
                                model, se.status_code
                            )
                            break  # Skip remaining retries for this model

                    except Exception as e:
                        logger.error(
                            "Unexpected error (attempt %d, model %s): %s", attempt, model, e,
                            exc_info=True
                        )
                        last_exception = e
                        break  # Skip remaining retries for this model

            if last_exception:
                raise last_exception
            raise Exception("All fallback models exhausted without a response.")

        except Exception as e:
            logger.error(
                "OpenRouter failed after all fallback models: %s", e, exc_info=True
            )
            return (
                "I'm having trouble connecting to compliance validation servers. "
                "Please check your internet connection and try again."
            )
