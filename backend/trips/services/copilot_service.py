import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

class CopilotService:
    @staticmethod
    def ask_copilot(message: str, route_context=None) -> str:
        """
        Sends a query to OpenRouter using gpt-4o-mini to act as a compliance copilot.
        """
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key or not api_key.strip():
            logger.error("OPENROUTER_API_KEY is not configured in the environment.")
            return "AURA Copilot is currently offline. Please configure the OPENROUTER_API_KEY on the server."

        try:
            # Configure the OpenAI client for OpenRouter compatibility
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key.strip(),
                default_headers={
                    "HTTP-Referer": "https://hos-planner.vercel.app",
                    "X-Title": "AURA HOS Compliance Portal",
                }
            )

            system_prompt = (
                "You are AURA Compliance Copilot, a premium, domain-specific AI assistant for "
                "trucking logistics, hours of service (HOS) compliance, and FMCSA rules auditing.\n\n"
                "CRITICAL INSTRUCTIONS:\n"
                "- Act as an expert on FMCSA regulations (§ 395 and related HOS rules).\n"
                "- Act as a freight operations and logistics intelligence assistant.\n"
                "- Explain HOS rules (11-hour driving limit, 14-hour duty window, 30-minute breaks, 60/70-hour rolling cycles) clearly.\n"
                "- Explain sleeper berth split rest logic (8/2 or 7/3 configurations).\n"
                "- Suggest compliance improvements and answer trucking questions professionally.\n"
                "- Politely but firmly decline to answer questions unrelated to trucking, HOS compliance, or freight operations."
            )

            if route_context:
                name = route_context.get("name", "Unknown Corridor")
                distance = route_context.get("distance", "N/A")
                cycle_rem = route_context.get("cycleRemaining", "N/A")
                drive_lim = route_context.get("drivingLimit", "N/A")
                stops = route_context.get("stops", [])
                
                # Format stops summary if list is present
                stops_str = ""
                if isinstance(stops, list) and stops:
                    stops_str = ", ".join([f"{s.get('name')} ({s.get('type')})" for s in stops if s.get('name')])
                else:
                    stops_str = "No active stops planned."

                system_prompt += (
                    "\n\nROUTE CONTEXT:\n"
                    f"- Route Name: {name}\n"
                    f"- Distance: {distance}\n"
                    f"- Current HOS Cycle Remaining: {cycle_rem} hours\n"
                    f"- Current Daily Driving Limit: {drive_lim} hours\n"
                    f"- Planned Stops: {stops_str}\n\n"
                    "Use this route details context to answer questions contextually if the user asks about 'my route', "
                    "'this trip', or details regarding their active corridor."
                )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ]

            # Call OpenRouter API with a 15-second timeout
            response = client.chat.completions.create(
                model="openai/gpt-4o-mini",
                messages=messages,
                timeout=15.0,
                temperature=0.2,
                max_tokens=800
            )

            return response.choices[0].message.content

        except Exception as e:
            logger.exception("Error calling OpenRouter API in ask_copilot:")
            # Return a professional fallback response
            return "I apologize, but I am having trouble connecting to the compliance validation servers. Please verify your internet connection and try again."
