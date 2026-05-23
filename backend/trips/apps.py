from django.apps import AppConfig


class TripsConfig(AppConfig):
    name = "trips"

    def ready(self):
        import os
        import logging
        logger = logging.getLogger(__name__)
        
        api_key = os.getenv("ORS_API_KEY") or os.getenv("OPENROUTE_SERVICE_API_KEY")
        if not api_key or not api_key.strip():
            logger.warning("Startup Check: ORS API key is missing. The application will start in Mock Fallback Mode.")
            print("\n" + "=" * 80)
            print(" WARNING: OpenRouteService API key (ORS_API_KEY) is not set in backend/.env!")
            print(" The application will operate in HIGH-FIDELITY MOCK FALLBACK MODE.")
            print("=" * 80 + "\n")
        else:
            logger.info("Startup Check: ORS API key detected. Using live OpenRouteService integration.")
            print("\n" + "=" * 80)
            print(" SUCCESS: OpenRouteService API key detected. Live integration active.")
            print("=" * 80 + "\n")
