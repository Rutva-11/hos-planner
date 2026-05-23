import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class CopilotService:
    @staticmethod
    def get_response(message: str, history: List[Dict], context: Dict) -> str:
        # Normalize the message for checks
        msg_lower = message.lower().strip()
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or not api_key.strip():
            logger.info("OPENAI_API_KEY not found in env. Falling back to local HOS simulator.")
            return CopilotService.get_mock_response(message, context)

        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key.strip())
            
            # Format system prompt with strict domain guidelines
            system_prompt = (
                "You are AURA Compliance Copilot, a premium, domain-specific AI assistant for "
                "trucking logistics, hours of service (HOS) compliance, and FMCSA rules auditing. "
                "You are integrated into the AURA HOS Landing Page.\n\n"
                "CRITICAL LIMITATION: You MUST only answer questions about:\n"
                "- FMCSA regulations (§ 395 and related HOS rules)\n"
                "- Hours of Service (11-hour driving limit, 14-hour duty window, 30-minute breaks, 60/70-hour cycles)\n"
                "- Sleeper berth rules and split rest configurations (8/2, 7/3, etc.)\n"
                "- Logistics scheduling, route planning, and dispatch optimization\n"
                "- Fuel stops, driving fatigue, and route HOS violations.\n\n"
                "If the user's message is unrelated to these domains, you must politely but firmly decline to answer, "
                "explaining that you specialize in trucking compliance and HOS planning assistance.\n\n"
            )
            
            # Inject context if provided
            if context:
                route_name = context.get("name", "Unknown Corridor")
                distance = context.get("distance", "N/A")
                cycle_rem = context.get("cycleRemaining", "N/A")
                drive_lim = context.get("drivingLimit", "N/A")
                stops = context.get("stops", [])
                violations = context.get("violations", [])
                
                stops_str = ", ".join([f"{s.get('name')} ({s.get('type', 'Stop')})" for s in stops])
                violations_str = "; ".join([v.get("message", "") for v in violations]) if violations else "No active HOS violations flagged."
                
                system_prompt += (
                    "CONTEXT: The user is currently viewing the following route details in the dashboard preview:\n"
                    f"- Route Name: {route_name}\n"
                    f"- Distance: {distance}\n"
                    f"- Current HOS Cycle Remaining: {cycle_rem} hours\n"
                    f"- Current Daily Driving Limit: {drive_lim} hours\n"
                    f"- Planned Stops: {stops_str}\n"
                    f"- Active Violations: {violations_str}\n\n"
                    "Use this route details context to answer questions contextually if the user asks about 'my route', "
                    "'this trip', 'compliance violations', or details regarding their active corridor.\n\n"
                )
            
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add dialogue history
            for chat in history[-10:]:
                role = "user" if chat.get("sender") == "user" else "assistant"
                messages.append({"role": role, "content": chat.get("text", "")})
                
            # Add user query
            messages.append({"role": "user", "content": message})
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.2,
                max_tokens=800
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.exception("Error during OpenAI API call, falling back to local simulator:")
            return CopilotService.get_mock_response(message, context, is_error_fallback=True)

    @staticmethod
    def get_mock_response(message: str, context: Dict, is_error_fallback: bool = False) -> str:
        msg_lower = message.lower().strip()
        route_name = context.get("name", "Pacific Corridor")
        distance = context.get("distance", "1,310 Miles")
        cycle_rem = context.get("cycleRemaining", 61.5)
        drive_lim = context.get("drivingLimit", 8.0)
        
        # Domain validation keywords
        domain_keywords = [
            "fmcsa", "hos", "hours of service", "compliance", "sleeper", "berth", "split", 
            "rule", "violation", "limit", "drive", "driving", "rest", "break", "fuel", "stop",
            "logistics", "routing", "route", "trip", "planner", "fatigue", "dispatch", 
            "optimization", "optimize", "boise", "denver", "seattle", "salt lake", "dallas", 
            "el paso", "phoenix", "atlanta", "nashville", "chicago", "cycle", "70-hour", "34-hour",
            "11-hour", "14-hour", "shift", "break", "cycle", "truck", "driver", "carrier"
        ]
        
        is_related = any(keyword in msg_lower for keyword in domain_keywords)
        if not is_related and len(msg_lower) > 3:
            return (
                "I specialize in trucking compliance, HOS rules auditing, and route optimization. "
                "I cannot help with unrelated questions. Please let me know how I can assist with "
                "your FMCSA scheduling or HOS route planning!"
            )
            
        prefix = ""
        if is_error_fallback:
            prefix = "> [!NOTE]\n> *Note: Running in offline/fallback simulator mode due to an API connectivity issue.*\n\n"
        elif not os.getenv("OPENAI_API_KEY"):
            prefix = "> [!NOTE]\n> *Note: Running in offline/fallback simulator mode (OPENAI_API_KEY is not configured in .env).*\n\n"

        # Match specific prompts
        if "11-hour" in msg_lower or "11 hour" in msg_lower:
            return prefix + (
                "### The 11-Hour Driving Limit (§ 395.3(a)(3))\n\n"
                "Under FMCSA guidelines, commercial truck drivers are permitted to drive a **maximum of 11 hours** "
                "within a 14-hour duty window. However, this is only allowed after the driver has completed **10 consecutive hours off duty**.\n\n"
                "**Key Compliance Criteria:**\n"
                "- **Driving Clock:** Once you accumulate 11 hours of active driving time, you must stop driving immediately.\n"
                "- **Reset:** To restart your 11-hour driving clock, a consecutive 10-hour off-duty or sleeper berth period is required.\n"
                "- **Shift Extension:** In case of adverse driving conditions, the limit may be extended by up to 2 hours."
            )
            
        elif "violat" in msg_lower or "violating" in msg_lower or "complain" in msg_lower:
            return prefix + (
                f"### HOS Audit: {route_name} ({distance})\n\n"
                f"Analyzing your active route **{route_name}** with a remaining cycle time of **{cycle_rem} hours** and daily driving limit of **{drive_lim} hours**:\n\n"
                "1. **Boise to Denver Segment:** This segment exceeds the 11-hour daily driving limit if driven in a single stretch, resulting in a violation of **FMCSA § 395.3(a)(3)**.\n"
                "2. **Consecutive Duty Limit:** If you accumulate more than 14 hours of continuous on-duty time without a 10-hour reset, it triggers a **14-hour duty window violation**.\n"
                "3. **Resolution:** To make this route compliant, AURA suggests scheduling a **10-hour overnight reset** or utilizing a split sleeper berth rest break after the first 8 hours of driving."
            )
            
        elif "optimize" in msg_lower or "reduction" in msg_lower or "reduce" in msg_lower:
            return prefix + (
                f"### Route Optimization: {route_name}\n\n"
                f"Here is an optimized schedule for your {route_name} trip:\n\n"
                "| Activity | Duration | HOS Impact | Details |\n"
                "| :--- | :--- | :--- | :--- |\n"
                "| **Shift Start** | — | 14-hour window starts | Pre-trip inspection complete |\n"
                "| **Drive Segment 1** | 5.5 Hrs | 5.5 Hrs driving | Seattle → Yakima Corridor |\n"
                "| **Mandatory Break** | 30 Mins | Resets 8-hr drive limit | Rest area or fuel stop |\n"
                "| **Drive Segment 2** | 5.5 Hrs | 11.0 Hrs total driving | Arrive Salt Lake Depot |\n"
                "| **Overnight Rest** | 10.0 Hrs | Resets daily HOS limits | Complete sleeper berth reset |\n\n"
                "**Benefits:** Avoids 11-hour violations and maximizes driving yield without extending the shift window."
            )
            
        elif "sleeper" in msg_lower or "berth" in msg_lower or "split" in msg_lower:
            return prefix + (
                "### Sleeper Berth Rules & Split Rest (§ 395.1(g)(1))\n\n"
                "The FMCSA allows drivers to split their mandatory 10-hour off-duty reset into two periods using the sleeper berth. Common valid split ratios are **8/2** or **7/3**.\n\n"
                "**Split Requirements:**\n"
                "- **The Long Period:** Must be at least 7 consecutive hours (for a 7/3 split) or 8 consecutive hours (for an 8/2 split) spent entirely inside the sleeper berth.\n"
                "- **The Short Period:** Must be at least 2 hours (or 3 hours for a 7/3 split) spent off-duty, in the sleeper berth, or a combination of both.\n"
                "- **Summation:** The two periods combined must total at least 10 hours.\n"
                "- **Window Pauses:** Neither period counts against your 14-hour duty clock, effectively pausing your daily limit while resting."
            )
            
        elif "70-hour" in msg_lower or "70 hour" in msg_lower or "cycle" in msg_lower:
            return prefix + (
                "### The 60/70-Hour Rolling Cycle Rule (§ 395.3(b))\n\n"
                "Drivers cannot drive after accumulating **70 hours of on-duty time in any rolling period of 8 consecutive days** (or 60 hours in 7 days for carriers not operating every day).\n\n"
                "**Restarting the Clock:**\n"
                "- You can reset your rolling cycle to 0 hours by taking **34 consecutive hours off duty**.\n"
                "- This 34-hour restart period must include rest breaks off-duty or in a sleeper berth. Once completed, your full 70-hour pool is restored."
            )
            
        elif "fuel" in msg_lower or "stop" in msg_lower:
            return prefix + (
                f"### Fuel Stop Suggestions for {route_name}\n\n"
                f"For the **{route_name}** ({distance}), the truck's fuel range necessitates scheduling a checkpoint:\n\n"
                "- **Recommended Fuel Stop:** Salt Lake Depot, UT.\n"
                "- **Strategic Alignment:** Scheduling fueling at Salt Lake Depot allows you to combine the 30-minute fueling/on-duty activity with your mandatory 30-minute rest break (§ 395.3(a)(3)(ii)), saving 30 minutes of transit time.\n"
                "- **Fuel Level:** Keeps the fuel range comfortable and avoids high-cost highway fueling stops."
            )
            
        elif "break" in msg_lower or "mandatory" in msg_lower:
            return prefix + (
                "### Mandatory 30-Minute Rest Break (§ 395.3(a)(3)(ii))\n\n"
                "Commercial drivers must take a consecutive **30-minute break** after driving for **8 cumulative hours** without at least a 30-minute interruption.\n\n"
                "**Key Guidelines:**\n"
                "- **Allowed Activities:** The break can be satisfied by Off-Duty time, Sleeper Berth time, or On-Duty (Non-Driving) time.\n"
                "- **Timing:** If you drive 7.5 hours, take a 10-minute stop, and drive 0.5 hours more, you must take the 30-minute break now because you reached 8 cumulative driving hours."
            )
            
        else:
            return prefix + (
                "Hello! I am your AURA Compliance Copilot.\n\n"
                f"I am currently tracking your view of **{route_name}** ({distance}).\n\n"
                "You can ask me questions such as:\n"
                "- *\"Why is my route violating HOS?\"*\n"
                "- *\"Explain the split sleeper berth rule.\"*\n"
                "- *\"How can I optimize this trip?\"*\n"
                "- *\"Suggest fuel stops along this corridor.\"*"
            )
