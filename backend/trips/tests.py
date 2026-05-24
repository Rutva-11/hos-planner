from django.test import TestCase
from django.utils import timezone
from rest_framework import serializers
from trips.serializers import TripRequestSerializer
from trips.services.route_service import RouteService
from trips.exceptions import (
    GeocodingException,
    RoutingException,
    ORSRateLimitException,
    ORSTimeoutException,
    ORSUnavailableException
)
from unittest.mock import patch
import requests

class TripRequestSerializerTestCase(TestCase):
    def test_valid_input(self):
        data = {
            "origin": "Los Angeles Port, CA",
            "pickup": "Phoenix Hub, AZ",
            "dropoff": "Dallas DFW Logistics, TX",
            "current_cycle_hours": 70.0,
            "start_time": "2026-05-22T14:33:24Z"
        }
        serializer = TripRequestSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_empty_fields(self):
        data = {
            "origin": "",
            "pickup": "Phoenix Hub, AZ",
            "dropoff": "Dallas DFW Logistics, TX",
            "current_cycle_hours": 70.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("origin", serializer.errors)

    def test_same_locations(self):
        # origin == pickup
        data = {
            "origin": "Los Angeles",
            "pickup": "Los Angeles",
            "dropoff": "Dallas",
            "current_cycle_hours": 70.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("pickup", serializer.errors)

        # pickup == dropoff
        data = {
            "origin": "Los Angeles",
            "pickup": "Phoenix",
            "dropoff": "Phoenix",
            "current_cycle_hours": 70.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("dropoff", serializer.errors)

    def test_invalid_cycle_hours(self):
        # negative cycle hours
        data = {
            "origin": "Los Angeles",
            "pickup": "Phoenix",
            "dropoff": "Dallas",
            "current_cycle_hours": -5.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("current_cycle_hours", serializer.errors)

        # cycle hours > 70
        data = {
            "origin": "Los Angeles",
            "pickup": "Phoenix",
            "dropoff": "Dallas",
            "current_cycle_hours": 75.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("current_cycle_hours", serializer.errors)

    def test_valid_input_coordinates(self):
        data = {
            "origin": {"name": "Los Angeles Port, CA", "lat": 33.74, "lon": -118.26},
            "pickup": {"name": "Phoenix Hub, AZ", "lat": 33.45, "lon": -112.07},
            "dropoff": {"name": "Dallas DFW Logistics, TX", "lat": 32.77, "lon": -96.79},
            "current_cycle_hours": 70.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["origin"]["lat"], 33.74)
        
    def test_invalid_input_coordinates_bounds(self):
        data = {
            "origin": {"name": "Invalid Port", "lat": 100.0, "lon": -118.26},
            "pickup": {"name": "Phoenix Hub, AZ", "lat": 33.45, "lon": -112.07},
            "dropoff": {"name": "Dallas DFW Logistics, TX", "lat": 32.77, "lon": -96.79},
            "current_cycle_hours": 70.0
        }
        serializer = TripRequestSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("origin", serializer.errors)

class RouteServiceTestCase(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_preset_geocoding(self):
        result = RouteService.geocode("Los Angeles")
        self.assertEqual(result["name"], "Los Angeles Port, CA")
        self.assertEqual(result["lat"], 33.74)
        self.assertEqual(result["lon"], -118.26)

        result_mixed_case = RouteService.geocode("  PhOeNiX HuB, AZ  ")
        self.assertEqual(result_mixed_case["name"], "Phoenix Hub, AZ")

    @patch("trips.services.route_service.requests.get")
    def test_custom_geocoding_api(self, mock_get):
        # Mock successful geocode response from Photon
        mock_response = type('Response', (), {
            'status_code': 200,
            'json': lambda: {
                "features": [
                    {
                        "geometry": {
                            "coordinates": [-73.935242, 40.730610]
                        },
                        "properties": {
                            "name": "New York",
                            "state": "New York",
                            "country": "United States",
                            "countrycode": "US",
                            "type": "city"
                        }
                    }
                ]
            }
        })
        mock_get.return_value = mock_response
        
        result = RouteService.geocode("New York")
        self.assertEqual(result["name"], "New York, USA")
        self.assertEqual(result["lat"], 40.730610)
        self.assertEqual(result["lon"], -73.935242)

    @patch("trips.services.route_service.requests.get")
    def test_geocoding_rate_limit(self, mock_get):
        mock_response = type('Response', (), {
            'status_code': 429,
            'text': "Rate limit exceeded"
        })
        mock_get.return_value = mock_response
        
        with self.assertRaises(ORSRateLimitException):
            RouteService.geocode("New York")

    @patch("trips.services.route_service.requests.post")
    @patch("trips.services.route_service.os.getenv")
    def test_routing_impossible_route(self, mock_getenv, mock_post):
        mock_getenv.return_value = "fake_api_key"
        mock_response = type('Response', (), {
            'status_code': 400,
            'text': '{"error": {"code": 2009, "message": "Route could not be found"}}',
            'json': lambda: {"error": {"code": 2009, "message": "Route could not be found"}}
        })
        mock_post.return_value = mock_response
        
        with self.assertRaises(RoutingException):
            RouteService.get_route([[33.74, -118.26], [13.0827, 80.2707]])

    @patch("trips.services.route_service.requests.get")
    def test_autocomplete_presets(self, mock_get):
        # Mock Photon API to return "Los Angeles, California, USA"
        mock_response = type('Response', (), {
            'status_code': 200,
            'json': lambda: {
                "features": [
                    {
                        "geometry": {
                            "coordinates": [-118.2437, 34.0522]
                        },
                        "properties": {
                            "name": "Los Angeles",
                            "state": "California",
                            "country": "United States",
                            "countrycode": "US",
                            "type": "city"
                        }
                    }
                ]
            }
        })
        mock_get.return_value = mock_response

        # Match a preset + mock results
        results = RouteService.autocomplete("los angeles")
        self.assertTrue(len(results) > 0)
        self.assertEqual(results[0]["name"], "Los Angeles, California, USA")
        self.assertTrue(any(r["name"] == "Los Angeles Port, CA" for r in results))

        # Match a partial preset
        mock_response_phoenix = type('Response', (), {
            'status_code': 200,
            'json': lambda: {
                "features": [
                    {
                        "geometry": {
                            "coordinates": [-112.0740, 33.4484]
                        },
                        "properties": {
                            "name": "Phoenix",
                            "state": "Arizona",
                            "country": "United States",
                            "countrycode": "US",
                            "type": "city"
                        }
                    }
                ]
            }
        })
        mock_get.return_value = mock_response_phoenix
        results_partial = RouteService.autocomplete("phoenix")
        self.assertTrue(len(results_partial) > 0)
        self.assertEqual(results_partial[0]["name"], "Phoenix, Arizona, USA")

    @patch("trips.services.route_service.requests.get")
    def test_autocomplete_api_success(self, mock_get):
        from django.core.cache import cache
        cache.clear()
        
        mock_response = type('Response', (), {
            'status_code': 200,
            'json': lambda: {
                "features": [
                    {
                        "geometry": {
                            "coordinates": [-122.33, 47.60]
                        },
                        "properties": {
                            "name": "Seattle",
                            "state": "WA",
                            "country": "United States",
                            "countrycode": "US",
                            "type": "city"
                        }
                    }
                ]
            }
        })
        mock_get.return_value = mock_response
        
        results = RouteService.autocomplete("Seattle")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Seattle, Washington, USA")
        self.assertEqual(results[0]["lat"], 47.60)
        self.assertEqual(results[0]["lon"], -122.33)

        # Confirm eager caching for geocoding works: geocode query for label should hit cache
        cache_key = RouteService._make_cache_key("geocode", "Seattle, Washington, USA")
        cached_geocode = cache.get(cache_key)
        self.assertIsNotNone(cached_geocode)
        self.assertEqual(cached_geocode["name"], "Seattle, Washington, USA")

    @patch("trips.services.route_service.requests.get")
    def test_circuit_breaker_active(self, mock_get):
        from django.core.cache import cache
        cache.clear()
        
        # 1. Set circuit breaker manually in cache
        cache.set("ors_rate_limited", True, timeout=30)
        
        # 2. Assert that geocode and autocomplete fail immediately without calling GET
        with self.assertRaises(ORSRateLimitException):
            RouteService.geocode("New York")
            
        with self.assertRaises(ORSRateLimitException):
            RouteService.autocomplete("New York")
            
        self.assertFalse(mock_get.called)

    @patch("trips.services.route_service.requests.get")
    def test_global_cities_geocoding(self, mock_get):
        def get_mock_response(url, headers=None, params=None, timeout=None):
            q = params.get("q", "").lower()
            features = []
            if "jammu" in q:
                features = [{
                    "geometry": {"coordinates": [74.87, 32.73]},
                    "properties": {
                        "name": "Jammu",
                        "state": "Jammu and Kashmir",
                        "country": "India",
                        "countrycode": "IN",
                        "type": "city"
                    }
                }]
            elif "ahmedabad" in q:
                features = [{
                    "geometry": {"coordinates": [72.57, 23.02]},
                    "properties": {
                        "name": "Ahmedabad",
                        "state": "Gujarat",
                        "country": "India",
                        "countrycode": "IN",
                        "type": "city"
                    }
                }]
            elif "sydney" in q:
                features = [{
                    "geometry": {"coordinates": [151.2093, -33.8688]},
                    "properties": {
                        "name": "Sydney",
                        "state": "New South Wales",
                        "country": "Australia",
                        "countrycode": "AU",
                        "type": "city"
                    }
                }]
            elif "berlin" in q:
                features = [{
                    "geometry": {"coordinates": [13.4049, 52.5200]},
                    "properties": {
                        "name": "Berlin",
                        "country": "Deutschland",
                        "countrycode": "DE",
                        "type": "city"
                    }
                }]
            elif "toronto" in q:
                features = [{
                    "geometry": {"coordinates": [-79.3832, 43.6532]},
                    "properties": {
                        "name": "Toronto",
                        "state": "Ontario",
                        "country": "Canada",
                        "countrycode": "CA",
                        "type": "city"
                    }
                }]
            
            return type('Response', (), {
                'status_code': 200,
                'json': lambda: {"features": features}
            })
            
        mock_get.side_effect = get_mock_response
        
        res = RouteService.geocode("Jammu")
        self.assertEqual(res["name"], "Jammu, Jammu and Kashmir, India")
        self.assertEqual(res["lat"], 32.73)
        self.assertEqual(res["lon"], 74.87)
        
        res = RouteService.geocode("Ahmedabad")
        self.assertEqual(res["name"], "Ahmedabad, Gujarat, India")
        
        res = RouteService.geocode("Sydney")
        self.assertEqual(res["name"], "Sydney, New South Wales, Australia")
        
        res = RouteService.geocode("Berlin")
        self.assertEqual(res["name"], "Berlin, Germany")
        
        res = RouteService.geocode("Toronto")
        self.assertEqual(res["name"], "Toronto, Ontario, Canada")

    @patch("trips.services.route_service.requests.get")
    def test_autocomplete_relevance_ranking(self, mock_get):
        from django.core.cache import cache
        cache.clear()

        def get_mock_response(url, headers=None, params=None, timeout=None):
            q = params.get("q", "").lower()
            features = []
            if "kashmir" in q:
                features = [
                    {
                        "geometry": {"coordinates": [-0.12, 51.50]},
                        "properties": {
                            "name": "Kashmir Road",
                            "city": "London",
                            "country": "United Kingdom",
                            "countrycode": "GB",
                            "type": "street"
                        }
                    },
                    {
                        "geometry": {"coordinates": [73.5, 31.5]},
                        "properties": {
                            "name": "Kashmir Village",
                            "state": "Punjab",
                            "country": "Pakistan",
                            "countrycode": "PK",
                            "type": "village"
                        }
                    },
                    {
                        "geometry": {"coordinates": [74.87, 32.73]},
                        "properties": {
                            "name": "Kashmir",
                            "state": "Jammu and Kashmir",
                            "country": "India",
                            "countrycode": "IN",
                            "type": "state"
                        }
                    },
                    {
                        "geometry": {"coordinates": [77.2, 28.6]},
                        "properties": {
                            "name": "Kashmir House",
                            "city": "Delhi",
                            "country": "India",
                            "countrycode": "IN",
                            "type": "house"
                        }
                    }
                ]
            elif "ahmedabad" in q:
                features = [
                    {
                        "geometry": {"coordinates": [-118.0, 34.0]},
                        "properties": {
                            "name": "Ahmedabad Street",
                            "city": "Los Angeles",
                            "country": "United States",
                            "countrycode": "US",
                            "type": "street"
                        }
                    },
                    {
                        "geometry": {"coordinates": [72.57, 23.02]},
                        "properties": {
                            "name": "Ahmedabad",
                            "state": "Gujarat",
                            "country": "India",
                            "countrycode": "IN",
                            "type": "city"
                        }
                    },
                    {
                        "geometry": {"coordinates": [72.6, 23.1]},
                        "properties": {
                            "name": "Ahmedabad Logistics Hub",
                            "state": "Gujarat",
                            "country": "India",
                            "countrycode": "IN",
                            "type": "industrial"
                        }
                    }
                ]
            
            return type('Response', (), {
                'status_code': 200,
                'json': lambda: {"features": features}
            })

        mock_get.side_effect = get_mock_response

        # Test query "Kashmir"
        results_kashmir = RouteService.autocomplete("Kashmir")
        # Top result must be the Jammu and Kashmir region, India
        self.assertTrue(len(results_kashmir) > 0)
        self.assertEqual(results_kashmir[0]["name"], "Kashmir, Jammu and Kashmir, India")
        obscure_names = [r["name"] for r in results_kashmir]
        self.assertIn("Kashmir, Jammu and Kashmir, India", obscure_names)
        
        # Test query "Ahmedabad"
        results_ahmedabad = RouteService.autocomplete("Ahmedabad")
        self.assertTrue(len(results_ahmedabad) > 0)
        # Top result must be Ahmedabad, Gujarat, India (major city)
        self.assertEqual(results_ahmedabad[0]["name"], "Ahmedabad, Gujarat, India")
        # Next should be Ahmedabad Logistics Hub (due to logistics boost + industrial type)
        self.assertEqual(results_ahmedabad[1]["name"], "Ahmedabad Logistics Hub, Gujarat, India")

    def test_drivable_continent_europe_and_australia(self):
        self.assertEqual(RouteService.get_drivable_continent(52.5200, 13.4049), "europe")
        self.assertEqual(RouteService.get_drivable_continent(48.1351, 11.5820), "europe")
        self.assertEqual(RouteService.get_drivable_continent(-33.8688, 151.2093), "australia")
        self.assertEqual(RouteService.get_drivable_continent(-37.8136, 144.9631), "australia")
        
        # Route Berlin -> Munich (same continent, Europe)
        waypoints_europe = [[52.5200, 13.4049], [48.1351, 11.5820]]
        res = RouteService.get_route(waypoints_europe)
        self.assertTrue(res["distance_meters"] > 0)
        
        # Route Sydney -> Melbourne (same continent, Australia)
        waypoints_australia = [[-33.8688, 151.2093], [-37.8136, 144.9631]]
        res = RouteService.get_route(waypoints_australia)
        self.assertTrue(res["distance_meters"] > 0)
        
        # Route Berlin -> Sydney (different continents: Europe to Australia)
        waypoints_cross = [[52.5200, 13.4049], [-33.8688, 151.2093]]
        with self.assertRaises(RoutingException):
            RouteService.get_route(waypoints_cross)
            
        # Route Berlin -> New York (different continents: Europe to North America)
        waypoints_cross2 = [[52.5200, 13.4049], [40.7128, -74.0060]]
        with self.assertRaises(RoutingException):
            RouteService.get_route(waypoints_cross2)

    def test_routing_coordinates_validation_invalid_format(self):
        # Verify that non-numeric coordinate values raise RoutingException
        with self.assertRaises(RoutingException):
            RouteService.get_route([[33.74, "invalid_lon"], [33.45, -112.07]])
            
        with self.assertRaises(RoutingException):
            RouteService.get_route([["invalid_lat", -118.26], [33.45, -112.07]])

    def test_routing_coordinates_validation_out_of_bounds(self):
        # Verify that out of bounds latitude/longitude values raise RoutingException
        with self.assertRaises(RoutingException):
            RouteService.get_route([[95.0, -118.26], [33.45, -112.07]])
            
        with self.assertRaises(RoutingException):
            RouteService.get_route([[-95.0, -118.26], [33.45, -112.07]])
            
        with self.assertRaises(RoutingException):
            RouteService.get_route([[33.74, -185.0], [33.45, -112.07]])

        with self.assertRaises(RoutingException):
            RouteService.get_route([[33.74, 185.0], [33.45, -112.07]])

    def test_routing_ocean_crossing_rejection(self):
        # Verify that routes crossing oceans raise RoutingException
        with self.assertRaises(RoutingException):
            RouteService.get_route([[33.74, -118.26], [48.8566, 2.3522]]) # LA to Paris

    @patch("trips.services.route_service.os.getenv")
    def test_routing_mock_calculation_when_key_missing(self, mock_getenv):
        # Verify that RouteService falls back to a high-fidelity mock route when the key is missing
        mock_getenv.return_value = ""
        
        waypoints = [[33.74, -118.26], [33.45, -112.07]]
        result = RouteService.get_route(waypoints)
        
        self.assertIn("distance_meters", result)
        self.assertIn("duration_seconds", result)
        self.assertIn("polyline", result)
        self.assertIn("legs", result)
        
        self.assertTrue(result["distance_meters"] > 0)
        self.assertTrue(result["duration_seconds"] > 0)
        self.assertTrue(len(result["polyline"]) > 0)
        self.assertEqual(len(result["legs"]), 1)
        self.assertEqual(result["legs"][0]["distance_meters"], result["distance_meters"])
        self.assertEqual(result["legs"][0]["duration_seconds"], result["duration_seconds"])

    @patch("trips.services.route_service.os.getenv")
    def test_routing_india_to_usa(self, mock_getenv):
        # India -> USA coordinates should raise RoutingException
        mock_getenv.return_value = "fake_key"
        india_coords = [19.0760, 72.8777] # Mumbai
        usa_coords = [34.0522, -118.2437] # LA
        with self.assertRaises(RoutingException):
            RouteService.get_route([india_coords, usa_coords])

    def test_geocoding_miami_to_atlantic_ocean(self):
        # Miami is allowed, but "Atlantic Ocean" should raise GeocodingException
        RouteService.geocode("Miami, Florida, USA") # should succeed
        with self.assertRaises(GeocodingException):
            RouteService.geocode("Atlantic Ocean")

    def test_geocoding_hawaii_to_mainland(self):
        # Hawaii should raise GeocodingException
        with self.assertRaises(GeocodingException):
            RouteService.geocode("Hawaii")
            
        # Routing to/from Hawaii coordinates should raise RoutingException
        hawaii_coords = [21.3099, -157.8581]
        seattle_coords = [47.6062, -122.3321]
        with self.assertRaises(RoutingException):
            RouteService.get_route([hawaii_coords, seattle_coords])

    @patch("trips.services.route_service.os.getenv")
    def test_routing_insufficient_road_geometry_and_straight_lines(self, mock_getenv):
        # A route response with too few coordinates should raise RoutingException (insufficient geometry)
        mock_getenv.return_value = "fake_key"
        with patch("trips.services.route_service.requests.post") as mock_post:
            mock_post.return_value = type('Response', (), {
                'status_code': 200,
                'json': lambda: {
                    "features": [{
                        "geometry": {
                            "coordinates": [[-118.26, 33.74], [-112.07, 33.45]] # Only 2 coordinates (straight line)
                        },
                        "properties": {
                            "summary": {"distance": 500000.0, "duration": 20000.0},
                            "segments": [{"distance": 500000.0, "duration": 20000.0}]
                        }
                    }]
                }
            })
            with self.assertRaises(RoutingException):
                RouteService.get_route([[33.74, -118.26], [33.45, -112.07]])

    @patch("trips.services.route_service.os.getenv")
    def test_routing_insufficient_segments(self, mock_getenv):
        # A route response with insufficient segments should raise RoutingException
        mock_getenv.return_value = "fake_key"
        with patch("trips.services.route_service.requests.post") as mock_post:
            mock_post.return_value = type('Response', (), {
                'status_code': 200,
                'json': lambda: {
                    "features": [{
                        "geometry": {
                            "coordinates": [[-118.26, 33.74], [-112.07, 33.45]] * 10
                        },
                        "properties": {
                            "summary": {"distance": 500000.0, "duration": 20000.0},
                            "segments": [] # 0 segments returned
                        }
                    }]
                }
            })
            with self.assertRaises(RoutingException):
                RouteService.get_route([[33.74, -118.26], [33.45, -112.07], [32.77, -96.79]])

class CopilotChatTestCase(TestCase):
    def test_copilot_chat_missing_message(self):
        response = self.client.post("/api/copilot/", {}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "prompt is required")

    @patch("trips.services.copilot_service.OpenAI")
    @patch.dict("os.environ", {"OPENROUTER_API_KEY": "test_key"})
    def test_copilot_chat_domain_restriction(self, mock_openai_class):
        mock_client = mock_openai_class.return_value
        mock_response = type('Response', (), {
            'choices': [
                type('Choice', (), {
                    'message': type('Message', (), {
                        'content': "I specialize in trucking compliance and HOS rules."
                    })
                })
            ]
        })
        mock_client.chat.completions.create.return_value = mock_response

        payload = {
            "message": "What is the capital of France?",
            "history": [],
            "context": {}
        }
        response = self.client.post("/api/copilot/", payload, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        reply = response.json()["response"]
        self.assertIn("trucking compliance", reply)
        self.assertIn("HOS rules", reply)

    @patch("trips.services.copilot_service.OpenAI")
    @patch.dict("os.environ", {"OPENROUTER_API_KEY": "test_key"})
    def test_copilot_chat_valid_response(self, mock_openai_class):
        mock_client = mock_openai_class.return_value
        mock_response = type('Response', (), {
            'choices': [
                type('Choice', (), {
                    'message': type('Message', (), {
                        'content': "The 11-Hour Driving Limit allows you to drive up to 11 hours."
                    })
                })
            ]
        })
        mock_client.chat.completions.create.return_value = mock_response

        payload = {
            "message": "Explain the 11-hour rule",
            "history": [],
            "context": {}
        }
        response = self.client.post("/api/copilot/", payload, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        reply = response.json()["response"]
        self.assertIn("11-Hour Driving Limit", reply)
        self.assertIn("11 hours", reply)

    @patch("trips.services.copilot_service.OpenAI")
    @patch.dict("os.environ", {"OPENROUTER_API_KEY": "test_key"})
    def test_copilot_chat_with_context(self, mock_openai_class):
        mock_client = mock_openai_class.return_value
        mock_response = type('Response', (), {
            'choices': [
                type('Choice', (), {
                    'message': type('Message', (), {
                        'content': "Your active route is Custom Test Route."
                    })
                })
            ]
        })
        mock_client.chat.completions.create.return_value = mock_response

        payload = {
            "message": "show violations for my route",
            "history": [],
            "context": {
                "name": "Custom Test Route",
                "distance": "500 Miles",
                "cycleRemaining": 45.0,
                "drivingLimit": 5.0,
                "stops": []
            }
        }
        response = self.client.post("/api/copilot/", payload, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        reply = response.json()["response"]
        self.assertIn("Custom Test Route", reply)

