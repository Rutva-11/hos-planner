from django.apps import AppConfig


class TripsConfig(AppConfig):
    name = "trips"

    def ready(self):
        import logging
        from trips.services.route_service import RouteService
        logger = logging.getLogger(__name__)
        
        api_key, source = RouteService._get_api_key_details()
        if not api_key:
            logger.warning("Startup Check: OpenRouteService API key is missing. The application will operate in Mock Fallback Mode.")
            print("\n" + "=" * 80)
            print(" WARNING: OpenRouteService API key is not set in environment variables (ORS_API_KEY, OPENROUTESERVICE_API_KEY)!")
            print(" The application will operate in HIGH-FIDELITY MOCK FALLBACK MODE.")
            print("=" * 80 + "\n")
        else:
            masked = f"{api_key[:4]}..." if len(api_key) > 4 else "***"
            logger.info("Startup Check: OpenRouteService API key detected from variable: %s (Prefix: %s).", source, masked)
            print("\n" + "=" * 80)
            print(f" SUCCESS: OpenRouteService API key detected via {source}. Live integration active.")
            print("=" * 80 + "\n")
            
        logger.info("Startup Check: TripsConfig initialized successfully. Routing service ready.")
