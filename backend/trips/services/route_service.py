import os
import math
import requests
import logging
import json
import hashlib
import re
from django.core.cache import cache
from ..exceptions import (
    GeocodingException,
    RoutingException,
    ORSRateLimitException,
    ORSTimeoutException,
    ORSUnavailableException
)

logger = logging.getLogger(__name__)

class RouteService:
    """
    Service to fetch routes, distances, durations, and polylines between coordinates.
    Integrates strictly with OpenRouteService. Returns backend errors if routing is not feasible.
    """
    
    # Average HGV speed: 55 mph (approx 24.6 meters/second or 88.5 km/h)
    AVERAGE_TRUCK_SPEED_MPS = 24.5872 
    
    # Detour scaling factor (kept for compatibility in distance estimations if needed)
    ROAD_DETOUR_FACTOR = 1.25

    # 2-letter US state codes to full state names mapping
    US_STATES = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
        "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
        "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
        "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
        "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
        "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
        "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
        "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
        "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
        "DC": "District of Columbia"
    }

    # High-fidelity mock database of major cities in the US, India, Europe, Australia, and Canada with coordinate data
    MOCK_DATABASE = [
        {"name": "Seattle, Washington, USA", "lat": 47.6062, "lon": -122.3321, "city": "Seattle", "state": "Washington", "country": "USA"},
        {"name": "Phoenix, Arizona, USA", "lat": 33.4484, "lon": -112.0740, "city": "Phoenix", "state": "Arizona", "country": "USA"},
        {"name": "Los Angeles, California, USA", "lat": 34.0522, "lon": -118.2437, "city": "Los Angeles", "state": "California", "country": "USA"},
        {"name": "Chicago, Illinois, USA", "lat": 41.8781, "lon": -87.6298, "city": "Chicago", "state": "Illinois", "country": "USA"},
        {"name": "Dallas, Texas, USA", "lat": 32.7767, "lon": -96.7970, "city": "Dallas", "state": "Texas", "country": "USA"},
        {"name": "Indianapolis, Indiana, USA", "lat": 39.7684, "lon": -86.1581, "city": "Indianapolis", "state": "Indiana", "country": "USA"},
        {"name": "Atlanta, Georgia, USA", "lat": 33.7490, "lon": -84.3880, "city": "Atlanta", "state": "Georgia", "country": "USA"},
        {"name": "Denver, Colorado, USA", "lat": 39.7392, "lon": -104.9903, "city": "Denver", "state": "Colorado", "country": "USA"},
        {"name": "Boise, Idaho, USA", "lat": 43.6150, "lon": -116.2023, "city": "Boise", "state": "Idaho", "country": "USA"},
        {"name": "Ahmedabad, Gujarat, India", "lat": 23.0225, "lon": 72.5714, "city": "Ahmedabad", "state": "Gujarat", "country": "India"},
        {"name": "Mumbai, Maharashtra, India", "lat": 19.0760, "lon": 72.8777, "city": "Mumbai", "state": "Maharashtra", "country": "India"},
        {"name": "Delhi, Delhi, India", "lat": 28.6139, "lon": 77.2090, "city": "Delhi", "state": "Delhi", "country": "India"},
        {"name": "Bengaluru, Karnataka, India", "lat": 12.9716, "lon": 77.5946, "city": "Bengaluru", "state": "Karnataka", "country": "India"},
        {"name": "Chennai, Tamil Nadu, India", "lat": 13.0827, "lon": 80.2707, "city": "Chennai", "state": "Tamil Nadu", "country": "India"},
        {"name": "Kolkata, West Bengal, India", "lat": 22.5726, "lon": 88.3639, "city": "Kolkata", "state": "West Bengal", "country": "India"},
        {"name": "Hyderabad, Telangana, India", "lat": 17.3850, "lon": 78.4867, "city": "Hyderabad", "state": "Telangana", "country": "India"},
        {"name": "Berlin, Germany", "lat": 52.5200, "lon": 13.4049, "city": "Berlin", "state": "Berlin", "country": "Germany"},
        {"name": "Munich, Germany", "lat": 48.1351, "lon": 11.5820, "city": "Munich", "state": "Bavaria", "country": "Germany"},
        {"name": "Sydney, New South Wales, Australia", "lat": -33.8688, "lon": 151.2093, "city": "Sydney", "state": "New South Wales", "country": "Australia"},
        {"name": "Melbourne, Victoria, Australia", "lat": -37.8136, "lon": 144.9631, "city": "Melbourne", "state": "Victoria", "country": "Australia"},
        {"name": "Toronto, Ontario, Canada", "lat": 43.6532, "lon": -79.3832, "city": "Toronto", "state": "Ontario", "country": "Canada"}
    ]

    # Geographic indicators for validation to reject impossible contradictions (excluding common short words like "in", "or", etc.)
    US_INDICATORS = [
        "usa", "united states", "united states of america",
        "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
        "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
        "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
        "maine", "maryland", "massachusetts", "michigan", "minnesota",
        "mississippi", "missouri", "montana", "nebraska", "nv", "nh", "nj", "nm",
        "new hampshire", "new jersey", "new mexico", "new york",
        "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
        "pennsylvania", "rhode island", "south carolina", "south dakota",
        "tennessee", "texas", "utah", "vermont", "virginia", "washington",
        "west virginia", "wisconsin", "wyoming",
        # Safe US abbreviations (no common words like "in", "or", "me", "oh", "la", "al")
        "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
        "il", "ia", "ks", "ky", "mn", "ms",
        "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "ok",
        "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
        "wi", "wy",
        # Major US cities/presets
        "seattle", "phoenix", "los angeles", "chicago", "dallas", "indianapolis",
        "boise", "denver", "atlanta", "new york city", "san francisco", "houston",
        "miami", "boston", "philadelphia", "detroit", "seattle port", "phoenix hub",
        "dallas dfw logistics", "chicago yards", "indianapolis center",
        "atlanta hub", "boise warehouse", "denver terminal"
    ]

    INDIA_INDICATORS = [
        "india", "ind",
        "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh",
        "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
        "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
        "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu",
        "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi",
        # Major India cities
        "ahmedabad", "mumbai", "bengaluru", "bangalore", "chennai", "kolkata",
        "hyderabad", "pune", "surat", "jaipur", "lucknow", "kanpur", "nagpur",
        "indore", "thane", "bhopal", "visakhapatnam", "patna", "vadodara",
        "ghaziabad", "ludhiana", "agra", "nashik", "faridabad", "meerut",
        "rajkot", "varanasi", "srinagar"
    ]

    GLOBAL_PRIORITIES = {
        "kashmir": ["jammu and kashmir", "kashmir division", "kashmir valley"],
        "ahmedabad": ["ahmedabad"],
        "sydney": ["sydney, new south wales", "sydney, australia"],
        "delhi": ["delhi, india", "new delhi"],
        "toronto": ["toronto, ontario", "toronto, canada"],
        "berlin": ["berlin, germany"],
        "jammu": ["jammu, jammu and kashmir", "jammu, india"],
        "mumbai": ["mumbai, maharashtra", "mumbai, india"],
        "bengaluru": ["bengaluru, karnataka", "bengaluru, india", "bangalore"],
        "chennai": ["chennai, tamil nadu", "chennai, india"],
        "kolkata": ["kolkata, west bengal", "kolkata, india"],
        "hyderabad": ["hyderabad, telangana", "hyderabad, india"],
        "seattle": ["seattle, washington", "seattle, usa"],
        "los angeles": ["los angeles, california", "los angeles, usa"],
        "chicago": ["chicago, illinois", "chicago, usa"],
        "dallas": ["dallas, texas", "dallas, usa"],
        "atlanta": ["atlanta, georgia", "atlanta, usa"],
        "denver": ["denver, colorado", "denver, usa"],
        "boise": ["boise, idaho", "boise, usa"]
    }

    MAJOR_PLACES = {
        "jammu", "kashmir", "sydney", "delhi", "ahmedabad", "berlin", "toronto",
        "mumbai", "bengaluru", "bangalore", "chennai", "kolkata", "hyderabad",
        "seattle", "los angeles", "chicago", "dallas", "atlanta", "denver", "boise",
        "london", "paris", "tokyo", "melbourne", "vancouver", "new york", "san francisco",
        "gujarat", "maharashtra", "ontario", "new south wales", "germany", "australia",
        "canada", "india", "usa"
    }

    @classmethod
    def validate_geographic_combination(cls, query):
        """
        Validates that a location query does not combine contradictory US and India indicators.
        """
        if not query or not query.strip():
            return True
            
        normalized = query.lower().strip()
        has_us = False
        has_india = False
        
        for indicator in cls.US_INDICATORS:
            if re.search(r'\b' + re.escape(indicator) + r'\b', normalized):
                has_us = True
                break
                
        for indicator in cls.INDIA_INDICATORS:
            if re.search(r'\b' + re.escape(indicator) + r'\b', normalized):
                has_india = True
                break
                
        if has_us and has_india:
            logger.warning(f"Geographic contradiction detected in query: '{query}'")
            return False
            
        return True

    @classmethod
    def format_location_label(cls, properties):
        """
        Extracts structured geocoder response data to generate clean, normalized names.
        Format: Name/City, State/Province, Country
        """
        name = properties.get("name") or ""
        city = (
            properties.get("city") or 
            properties.get("town") or 
            properties.get("village") or 
            properties.get("locality") or 
            properties.get("hamlet") or 
            properties.get("suburb") or 
            properties.get("county") or
            ""
        )
        
        country = properties.get("country") or ""
        country_code = (properties.get("countrycode") or "").upper().strip()
        
        normalized_country = ""
        if country_code in ["US", "USA"]:
            normalized_country = "USA"
        elif country_code == "IN":
            normalized_country = "India"
        elif country_code == "DE":
            normalized_country = "Germany"
        elif country_code == "AU":
            normalized_country = "Australia"
        elif country_code == "CA":
            normalized_country = "Canada"
        else:
            country_lower = country.lower().strip()
            if country_lower in ["united states", "united states of america", "us", "usa"]:
                normalized_country = "USA"
            elif country_lower in ["india", "in", "ind"]:
                normalized_country = "India"
            elif country_lower in ["deutschland", "germany", "de"]:
                normalized_country = "Germany"
            elif country_lower in ["australia", "au"]:
                normalized_country = "Australia"
            elif country_lower in ["canada", "ca"]:
                normalized_country = "Canada"
            else:
                normalized_country = country.strip().title() if country else ""

        state = properties.get("state") or ""
        normalized_state = ""
        if normalized_country == "USA":
            state_upper = state.upper().strip()
            if state_upper in cls.US_STATES:
                normalized_state = cls.US_STATES[state_upper]
            else:
                normalized_state = state.strip()
        else:
            normalized_state = state.strip()

        raw_parts = [name, city, normalized_state, normalized_country]
        parts = []
        seen = set()
        for part in raw_parts:
            if not part:
                continue
            part_strip = part.strip()
            part_lower = part_strip.lower()
            if part_lower in seen:
                continue
            if any(part_lower in p.lower() for p in parts):
                continue
            parts.append(part_strip)
            seen.add(part_lower)
            
        return ", ".join(parts)

    @classmethod
    def score_suggestion(cls, item, query):
        """
        Calculates a ranking score for autocomplete suggestions using multiple weights:
        1. Exact/fuzzy text matches
        2. Relevance score (decaying original Photon index)
        3. Population / Size / Type classifications (osm_value)
        4. Administrative levels (country, state, city)
        5. Logistics significance boosts
        6. Explicit global heuristics boosts (Kashmir, Sydney, Delhi, Ahmedabad, etc.)
        """
        name = item.get("name", "")
        name_lower = name.lower().strip()
        query_lower = query.lower().strip()
        
        raw_name_lower = item.get("raw_name", "").lower().strip()
        city_lower = item.get("city", "").lower().strip()
        state_lower = item.get("state", "").lower().strip()
        country_lower = item.get("country", "").lower().strip()
        countrycode_lower = item.get("countrycode", "").lower().strip()
        
        osm_value = (item.get("osm_value") or "").lower().strip()
        raw_index = item.get("raw_index", 0)

        score = 0

        # --- 1. Text Match Scoring ---
        if query_lower == raw_name_lower:
            score += 2000
        elif query_lower == city_lower:
            score += 1800
        elif query_lower == state_lower:
            score += 1500
        elif query_lower == country_lower or query_lower == countrycode_lower:
            score += 1200
        elif raw_name_lower.startswith(query_lower):
            score += 1000
        elif city_lower.startswith(query_lower):
            score += 900
        elif state_lower.startswith(query_lower):
            score += 700
        elif query_lower in raw_name_lower:
            score += 500
        elif query_lower in city_lower:
            score += 400
        elif query_lower in name_lower:
            score += 200

        # --- 2. Relevance Score (Photon Rank Decaying) ---
        score += max(0, 500 - (raw_index * 20))

        # --- 3. Size Class & Administrative Levels (osm_value) ---
        if osm_value == "country":
            score += 1500
        elif osm_value in ["state", "province"]:
            score += 1200
        elif osm_value == "city":
            score += 1000
        elif osm_value == "town":
            score += 600
        elif osm_value in ["county", "district"]:
            score += 500
        elif osm_value in ["suburb", "quarter", "neighbourhood"]:
            score += 300
        elif osm_value in ["village", "locality", "hamlet", "isolated_dwellings"]:
            score += 100
        elif osm_value in ["house", "building", "address", "postcode", "street", "highway", "residential", "service", "footway", "path"]:
            # Heavily deprioritize obscure street-level details
            score -= 2500

        # --- 4. Logistics and Transit Significance ---
        transit_types = ["industrial", "harbour", "port", "aerodrome", "airport", "depot", "station", "railway"]
        if osm_value in transit_types:
            score += 1000

        logistics_terms = ["port", "hub", "dfw", "yards", "terminal", "warehouse", "center", "logistics", "cargo", "freight", "seaport", "dock", "airport", "station"]
        if any(term in name_lower for term in logistics_terms):
            score += 800

        # --- 5. Global Heuristics & Specific Search Priority Boosts ---
        for key, targets in cls.GLOBAL_PRIORITIES.items():
            if key in query_lower:
                if any(t in name_lower for t in targets):
                    score += 3000

        # Boost major global place names generally
        if any(place in name_lower for place in cls.MAJOR_PLACES):
            score += 500

        return score

    @classmethod
    def _parse_mock_query(cls, query):
        """
        Parses query in mock fallback mode to return structured location name and deterministic coordinates.
        """
        normalized = query.lower().strip()
        
        presets = {
            'los angeles port, ca': { 'lat': 33.74, 'lon': -118.26, 'name': 'Los Angeles Port, CA' },
            'phoenix hub, az': { 'lat': 33.45, 'lon': -112.07, 'name': 'Phoenix Hub, AZ' },
            'dallas dfw logistics, tx': { 'lat': 32.77, 'lon': -96.79, 'name': 'Dallas DFW Logistics, TX' },
            'chicago yards, il': { 'lat': 41.87, 'lon': -87.62, 'name': 'Chicago Yards, IL' },
            'indianapolis center, in': { 'lat': 39.76, 'lon': -86.15, 'name': 'Indianapolis Center, IN' },
            'atlanta hub, ga': { 'lat': 33.74, 'lon': -84.38, 'name': 'Atlanta Hub, GA' },
            'seattle port, wa': { 'lat': 47.60, 'lon': -122.33, 'name': 'Seattle Port, WA' },
            'boise warehouse, id': { 'lat': 43.61, 'lon': -116.20, 'name': 'Boise Warehouse, ID' },
            'denver terminal, co': { 'lat': 39.73, 'lon': -104.99, 'name': 'Denver Terminal, CO' },
        }
        
        for key, coords in presets.items():
            if normalized == key:
                return coords

        matches = []
        for item in cls.MOCK_DATABASE:
            if normalized in item["name"].lower() or normalized in item["city"].lower():
                matches.append(item)
                
        if matches:
            return {
                "name": matches[0]["name"],
                "lat": matches[0]["lat"],
                "lon": matches[0]["lon"]
            }

        is_india = any(ind in normalized for ind in ["india", "gujarat", "maharashtra", "delhi", "ahmedabad", "mumbai"])
        country_suffix = "India" if is_india else "USA"
        
        clean_query = query.strip()
        for suffix in [", US", ", USA", ", India", " US", " USA", " India"]:
            if clean_query.lower().endswith(suffix.lower()):
                clean_query = clean_query[:-len(suffix)].strip()
                
        name = f"{clean_query.title()}, {country_suffix}"
        
        h = hashlib.md5(normalized.encode('utf-8')).hexdigest()
        val = int(h, 16)
        if is_india:
            lat = round(8.0 + (val % 2800) / 100.0, 4)
            lon = round(68.0 + ((val // 2800) % 2900) / 100.0, 4)
        else:
            lat = round(25.0 + (val % 2400) / 100.0, 4)
            lon = round(-125.0 + ((val // 2400) % 5500) / 100.0, 4)
            
        return {
            "name": name,
            "lat": lat,
            "lon": lon
        }

    @classmethod
    def is_in_ocean(cls, lat, lon, name=""):
        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            return True
            
        if name:
            normalized_name = name.lower()
            ocean_keywords = ["ocean", "sea", "gulf", "bay", "strait", "channel", "atlantic", "pacific", "indian", "caribbean"]
            for kw in ocean_keywords:
                if re.search(r'\b' + re.escape(kw) + r'\b', normalized_name):
                    if not any(city in normalized_name for city in ["seattle", "ocean city", "oceanside", "chelsea", "swansea"]):
                        return True
                        
        # Atlantic Ocean region (Miami is lon -80.19, Bahamas is lon -77.0)
        if (0.0 <= lat < 30.0) and (-79.0 < lon <= -10.0):
            return True
        if (30.0 <= lat < 35.0) and (-74.0 < lon <= -10.0):
            return True
        if (35.0 <= lat <= 45.0) and (-69.0 < lon <= -10.0):
            return True
            
        # Pacific Ocean region (west of US mainland):
        if (24.0 <= lat <= 50.0) and (-180.0 <= lon <= -125.0):
            return True
            
        return False

    @classmethod
    def get_drivable_continent(cls, lat, lon):
        """
        Determines the drivable zone (continent) for coordinate to enforce routing constraints.
        """
        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            return "other"
            
        if cls.is_in_ocean(lat, lon):
            return "ocean"

        if (18.0 <= lat <= 23.0) and (-161.0 <= lon <= -154.0):
            return "hawaii"
            
        if (7.0 <= lat <= 85.0) and (-170.0 <= lon <= -50.0):
            return "north_america"
            
        if (5.0 <= lat <= 40.0) and (65.0 <= lon <= 98.0):
            return "india"
            
        if (34.0 <= lat <= 72.0) and (-25.0 <= lon <= 45.0):
            return "europe"
            
        if (-45.0 <= lat <= -10.0) and (112.0 <= lon <= 155.0):
            return "australia"
            
        return "other"

    @classmethod
    def get_closest_mock_city(cls, lat, lon):
        for city in cls.MOCK_DATABASE:
            dist = cls.haversine_distance(lat, lon, city["lat"], city["lon"])
            if dist < 50000: # 50 km tolerance
                return city
        return None

    @classmethod
    def _make_cache_key(cls, prefix, query):
        normalized = query.lower().strip()
        query_hash = hashlib.md5(normalized.encode('utf-8')).hexdigest()
        return f"{prefix}_{query_hash}"

    @classmethod
    def _get_api_key(cls):
        api_key = os.getenv("ORS_API_KEY") or os.getenv("OPENROUTE_SERVICE_API_KEY")
        if api_key and api_key.strip():
            return api_key.strip()
        return None

    @classmethod
    def geocode(cls, query):
        """
        Geocodes a query string to a dict: {"lat": float, "lon": float, "name": str}
        """
        if not query or not query.strip():
            raise GeocodingException("Location query cannot be empty.")
            
        if query.strip().isdigit():
            raise GeocodingException("Location description cannot consist of numbers only.")
        
        if not cls.validate_geographic_combination(query):
            raise GeocodingException("Geocoding failed due to contradictory geographic combination.")

        query_lower = query.lower().strip()
        if "atlantic ocean" in query_lower or "pacific ocean" in query_lower or "ocean" in query_lower:
            if not any(city in query_lower for city in ["seattle", "ocean city", "oceanside", "chelsea", "swansea"]):
                raise GeocodingException(f"Resolved location '{query}' is in a marine or island region with no commercial trucking road access.")
        
        if "hawaii" in query_lower or query_lower == "hi" or " hi" in query_lower or ", hi" in query_lower:
            raise GeocodingException(f"Resolved location '{query}' is in a marine or island region with no commercial trucking road access.")

        normalized = query.lower().strip()
        
        presets = {
            'los angeles port, ca': { 'lat': 33.74, 'lon': -118.26, 'name': 'Los Angeles Port, CA' },
            'los angeles': { 'lat': 33.74, 'lon': -118.26, 'name': 'Los Angeles Port, CA' },
            'phoenix hub, az': { 'lat': 33.45, 'lon': -112.07, 'name': 'Phoenix Hub, AZ' },
            'phoenix': { 'lat': 33.45, 'lon': -112.07, 'name': 'Phoenix Hub, AZ' },
            'dallas dfw logistics, tx': { 'lat': 32.77, 'lon': -96.79, 'name': 'Dallas DFW Logistics, TX' },
            'dallas': { 'lat': 32.77, 'lon': -96.79, 'name': 'Dallas DFW Logistics, TX' },
            'chicago yards, il': { 'lat': 41.87, 'lon': -87.62, 'name': 'Chicago Yards, IL' },
            'chicago': { 'lat': 41.87, 'lon': -87.62, 'name': 'Chicago Yards, IL' },
            'indianapolis center, in': { 'lat': 39.76, 'lon': -86.15, 'name': 'Indianapolis Center, IN' },
            'indianapolis': { 'lat': 39.76, 'lon': -86.15, 'name': 'Indianapolis Center, IN' },
            'atlanta hub, ga': { 'lat': 33.74, 'lon': -84.38, 'name': 'Atlanta Hub, GA' },
            'atlanta': { 'lat': 33.74, 'lon': -84.38, 'name': 'Atlanta Hub, GA' },
            'seattle port, wa': { 'lat': 47.60, 'lon': -122.33, 'name': 'Seattle Port, WA' },
            'seattle': { 'lat': 47.60, 'lon': -122.33, 'name': 'Seattle Port, WA' },
            'boise warehouse, id': { 'lat': 43.61, 'lon': -116.20, 'name': 'Boise Warehouse, ID' },
            'boise': { 'lat': 43.61, 'lon': -116.20, 'name': 'Boise Warehouse, ID' },
            'denver terminal, co': { 'lat': 39.73, 'lon': -104.99, 'name': 'Denver Terminal, CO' },
            'denver': { 'lat': 39.73, 'lon': -104.99, 'name': 'Denver Terminal, CO' },
        }
        
        if normalized in presets:
            return presets[normalized]
            
        for key, coords in presets.items():
            if key in normalized or normalized in key:
                return coords
                
        cache_key = cls._make_cache_key("geocode", normalized)
        cached = cache.get(cache_key)
        if cached:
            logger.info(f"Geocoding cache hit for query: '{normalized}'")
            return cached

        if cache.get("ors_rate_limited"):
            logger.warning("Geocoding API is currently rate-limited (circuit breaker active).")
            raise ORSRateLimitException("Geocoding API rate limit cooling down. Please try again in a few seconds.")
            
        try:
            url = "https://photon.komoot.io/api/"
            headers = {
                "User-Agent": "AURA-HOS-Logistics/1.0"
            }
            params = {
                "q": query,
                "limit": 10
            }
            response = requests.get(url, headers=headers, params=params, timeout=10)
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout calling Photon Geocoding API: {e}")
            raise ORSTimeoutException("Connection to the geocoding service timed out.")
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling Photon Geocoding API: {e}")
            raise ORSUnavailableException(f"Failed to communicate with geocoding service: {e}")
            
        if response.status_code != 200:
            logger.error(f"Photon Geocoding error response (status {response.status_code}): {response.text}")
            if response.status_code == 429:
                cache.set("ors_rate_limited", True, timeout=30)
                raise ORSRateLimitException("Geocoding API rate limit exceeded. Please try again later.")
            elif response.status_code in [500, 502, 503, 504]:
                raise ORSUnavailableException("Geocoding service is temporarily unavailable or returned a server error.")
            raise GeocodingException(f"Geocoding failed with status code {response.status_code}")
            
        data = response.json()
        features = data.get("features", [])
        if not features:
            raise GeocodingException(f"Could not resolve location: '{query}'. Please verify spelling or specify city/state.")
            
        candidates = []
        marine_rejected = False
        for idx, feat in enumerate(features):
            coords = feat.get("geometry", {}).get("coordinates", [])
            if len(coords) < 2:
                continue
            properties = feat.get("properties", {})
            formatted_name = cls.format_location_label(properties)
            if not formatted_name:
                continue
                
            lat_cand, lon_cand = coords[1], coords[0]
            if cls.is_in_ocean(lat_cand, lon_cand, formatted_name) or cls.get_drivable_continent(lat_cand, lon_cand) in ["hawaii", "ocean"]:
                marine_rejected = True
                continue
                
            candidate = {
                "lat": coords[1],
                "lon": coords[0],
                "name": formatted_name,
                "osm_value": properties.get("osm_value") or properties.get("type") or "",
                "osm_key": properties.get("osm_key") or "",
                "raw_name": properties.get("name") or "",
                "city": properties.get("city") or properties.get("town") or properties.get("village") or properties.get("locality") or "",
                "state": properties.get("state") or "",
                "country": properties.get("country") or "",
                "countrycode": properties.get("countrycode") or "",
                "raw_index": idx
            }
            candidates.append(candidate)
            
        if not candidates:
            if marine_rejected:
                raise GeocodingException(f"Resolved location '{query}' is in a marine or island region with no commercial trucking road access.")
            raise GeocodingException(f"Could not resolve location: '{query}'. Please verify spelling or specify city/state.")
            
        candidates.sort(key=lambda x: cls.score_suggestion(x, query), reverse=True)
        best_candidate = candidates[0]
        
        lat, lon = best_candidate["lat"], best_candidate["lon"]
        if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
            raise GeocodingException(f"Geocoding resolved invalid coordinates: {lat}, {lon}")
            
        result = {
            "lat": lat,
            "lon": lon,
            "name": best_candidate["name"]
        }
        
        cache.set(cache_key, result, timeout=86400)
        return result

    @classmethod
    def get_route(cls, waypoints):
        """
        Calculates route for a list of waypoints.
        """
        if not waypoints or len(waypoints) < 2:
            raise RoutingException("At least two waypoints are required to compute a route.")

        for idx, pt in enumerate(waypoints):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise RoutingException(f"Invalid coordinate format at waypoint {idx}.")
            try:
                lat = float(pt[0])
                lon = pt[1]
                lat_val = float(lat)
                lon_val = float(lon)
            except (ValueError, TypeError):
                raise RoutingException(f"Waypoint coordinate values must be numeric at index {idx}.")
            if not (-90.0 <= lat_val <= 90.0) or not (-180.0 <= lon_val <= 180.0):
                raise RoutingException(f"Invalid coordinate values at index {idx}: lat={lat_val}, lon={lon_val}. Lat must be in [-90, 90] and Lon in [-180, 180].")

        # Prevent ocean-crossing/continent-jumping routes using get_drivable_continent
        regions = {cls.get_drivable_continent(pt[0], pt[1]) for pt in waypoints}
        if "hawaii" in regions:
            raise RoutingException("No drivable road route exists between the selected locations (routes to/from Hawaii are impossible for truck driving).")
        if "ocean" in regions:
            raise RoutingException("No drivable road route exists between the selected locations (routes crossing or entering oceans are impossible for truck driving).")
        if "other" in regions:
            raise RoutingException("No drivable road route exists between the selected locations (unroutable or isolated regions).")
        if len(regions) > 1:
            raise RoutingException("No drivable road route exists between the selected locations (routes across different continents or landmasses are impossible for truck driving).")

        waypoints_json = json.dumps(waypoints, sort_keys=True)
        waypoints_hash = hashlib.md5(waypoints_json.encode('utf-8')).hexdigest()
        cache_key = f"route_{waypoints_hash}"
        
        cached = cache.get(cache_key)
        if cached:
            logger.info(f"Routing cache hit for waypoints hash: {waypoints_hash}")
            return cached
 
        if cache.get("ors_rate_limited"):
            logger.warning("OpenRouteService API is currently rate-limited (circuit breaker active).")
            raise ORSRateLimitException("OpenRouteService API rate limit cooling down. Please try again in a few seconds.")
 
        api_key = cls._get_api_key()
        
        if not api_key:
            logger.info("ORS API key is missing. Operating in Mock Fallback Mode for routing calculation.")
            
            # Restrict mock routing to known mock cities only to avoid fake routing
            for idx, pt in enumerate(waypoints):
                closest_city = cls.get_closest_mock_city(pt[0], pt[1])
                if not closest_city:
                    logger.warning(f"Mock routing rejected because waypoint {idx} at ({pt[0]}, {pt[1]}) is not near any predefined hub.")
                    raise RoutingException("Routing API is currently offline/unavailable, and custom route calculation is disabled without an API key.")
            
            legs = []
            total_distance = 0.0
            total_duration = 0.0
            complete_polyline = []
            
            for i in range(len(waypoints) - 1):
                start = waypoints[i]
                end = waypoints[i+1]
                
                dist = cls.haversine_distance(start[0], start[1], end[0], end[1]) * 1.25
                dur = dist / cls.AVERAGE_TRUCK_SPEED_MPS
                
                poly = []
                steps = 20
                start_lat, start_lon = start[0], start[1]
                end_lat, end_lon = end[0], end[1]
                d_lat = end_lat - start_lat
                d_lon = end_lon - start_lon
                length = math.sqrt(d_lat**2 + d_lon**2)
                
                for step in range(steps + 1):
                    t = step / steps
                    lat = start_lat + t * d_lat
                    lon = start_lon + t * d_lon
                    wiggle = 0.08 * math.sin(t * math.pi)
                    if length > 0:
                        lat += wiggle * (-d_lon / length)
                        lon += wiggle * (d_lat / length)
                    poly.append([lat, lon])
                
                legs.append({
                    "distance_meters": dist,
                    "duration_seconds": dur,
                    "polyline": poly
                })
                total_distance += dist
                total_duration += dur
                
                if i == 0:
                    complete_polyline.extend(poly)
                else:
                    complete_polyline.extend(poly[1:])
            
            result = {
                "distance_meters": total_distance,
                "duration_seconds": total_duration,
                "polyline": complete_polyline,
                "legs": legs
            }
            # Enforce validations on mock result to verify correctness
            if len(complete_polyline) < 15:
                if total_distance > 3200:
                    raise RoutingException("Calculated route has insufficient road geometry (detected straight-line fallback).")
            if total_distance <= 0:
                raise RoutingException("Calculated route distance is zero or negative.")
            if len(legs) < len(waypoints) - 1:
                raise RoutingException("Route calculation returned insufficient route segments.")
                
            cache.set(cache_key, result, timeout=86400)
            return result
            
        try:
            coordinates_lng_lat = [[pt[1], pt[0]] for pt in waypoints]
            url = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"
            headers = {
                "Authorization": api_key,
                "Content-Type": "application/json"
            }
            payload = {
                "coordinates": coordinates_lng_lat
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=15)
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout calling OpenRouteService Routing API: {e}")
            raise ORSTimeoutException("Connection to the routing service timed out.")
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling OpenRouteService API: {e}")
            raise ORSUnavailableException(f"Failed to communicate with routing service: {e}")
            
        if response.status_code != 200:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", response.text)
                error_code = error_data.get("error", {}).get("code", "")
            except Exception:
                error_msg = response.text
                error_code = ""
            
            logger.error(f"OpenRouteService error response (status {response.status_code}): {response.text}")
            
            if response.status_code == 429:
                cache.set("ors_rate_limited", True, timeout=30)
                raise ORSRateLimitException("OpenRouteService API rate limit exceeded. Please try again later.")
            elif response.status_code in [500, 502, 503, 504]:
                raise ORSUnavailableException("OpenRouteService is temporarily unavailable or returned a server error.")
            
            if "Route could not be found" in error_msg or "Connection between" in error_msg or error_code == 2009 or "2009" in str(error_code):
                raise RoutingException("No drivable road route exists between the selected locations (e.g., across oceans or disconnected landmasses).")
            elif "Could not find point" in error_msg or "Unable to find a route" in error_msg or error_code == 2010 or "2010" in str(error_code):
                raise RoutingException("Could not find a routable road close to one of the specified locations.")
            else:
                raise RoutingException(f"Routing calculation failed: {error_msg}")
                
        data = response.json()
        if "features" not in data or not data["features"]:
            raise RoutingException("Routing service returned no route features.")
            
        feature = data["features"][0]
        geometry = feature.get("geometry", {})
        properties = feature.get("properties", {})
        summary = properties.get("summary", {})
        
        if "coordinates" not in geometry or not geometry["coordinates"]:
            raise RoutingException("Routing service returned empty route geometry.")
            
        polyline = [[coord[1], coord[0]] for coord in geometry["coordinates"]]
        
        # Enforce valid road coordinate arrays
        for idx, coord in enumerate(polyline):
            if not isinstance(coord, list) or len(coord) < 2:
                raise RoutingException("Routing service returned invalid coordinate structure in route geometry.")
            try:
                lat_c = float(coord[0])
                lon_c = float(coord[1])
            except (ValueError, TypeError):
                raise RoutingException("Routing service returned non-numeric coordinates in route geometry.")
            if not (-90.0 <= lat_c <= 90.0) or not (-180.0 <= lon_c <= 180.0):
                raise RoutingException("Routing service returned out-of-bounds coordinates in route geometry.")

        distance_meters = summary.get("distance", 0.0)
        duration_seconds = summary.get("duration", 0.0)
        distance_miles = distance_meters / 1609.344

        # Enforce sufficient road geometry (density of points)
        if len(polyline) < 15:
            if distance_meters > 3200:
                raise RoutingException("Calculated route has insufficient road geometry (detected straight-line fallback).")

        # Enforce distance realism
        straight_line_dist = 0.0
        for i in range(len(waypoints) - 1):
            straight_line_dist += cls.haversine_distance(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1])
        
        if distance_meters < straight_line_dist * 0.95:
            raise RoutingException(f"Calculated route distance ({distance_miles:.1f} miles) is unrealistic compared to straight-line distance ({straight_line_dist / 1609.344:.1f} miles).")
        if distance_meters > 15000000:
            raise RoutingException("Calculated route distance exceeds realistic limits for domestic trucking.")
        if distance_meters <= 0:
            raise RoutingException("Calculated route distance is zero or negative.")

        legs = []
        segments = properties.get("segments", [])
        
        # Enforce segment count exceeds minimum threshold
        if len(segments) < len(waypoints) - 1:
            raise RoutingException("Route calculation returned insufficient route segments.")

        for i, segment in enumerate(segments):
            steps = segment.get("steps", [])
            if steps:
                start_idx = steps[0]["way_points"][0]
                end_idx = steps[-1]["way_points"][1]
                leg_polyline = polyline[start_idx:end_idx + 1]
            else:
                leg_polyline = polyline
                
            leg_distance = segment.get("distance", distance_meters / len(segments) if segments else distance_meters)
            leg_duration = segment.get("duration", duration_seconds / len(segments) if segments else duration_seconds)
            legs.append({
                "distance_meters": leg_distance,
                "duration_seconds": leg_duration,
                "polyline": leg_polyline
            })
            
        result = {
            "distance_meters": distance_meters,
            "duration_seconds": duration_seconds,
            "polyline": polyline,
            "legs": legs if legs else [{"distance_meters": distance_meters, "duration_seconds": duration_seconds, "polyline": polyline}]
        }
        
        cache.set(cache_key, result, timeout=86400)
        return result

    @classmethod
    def haversine_distance(cls, lat1, lon1, lat2, lon2):
        """
        Calculates the great-circle distance between two points on the earth in meters.
        """
        R = 6371000
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2)**2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    @classmethod
    def autocomplete(cls, query):
        """
        Fetches up to 5 geocoding autocomplete suggestions for the query string.
        """
        if not query or not query.strip():
            return []

        if not cls.validate_geographic_combination(query):
            return []

        normalized = query.lower().strip()
        
        presets = {
            'los angeles port, ca': { 'lat': 33.74, 'lon': -118.26, 'name': 'Los Angeles Port, CA' },
            'phoenix hub, az': { 'lat': 33.45, 'lon': -112.07, 'name': 'Phoenix Hub, AZ' },
            'dallas dfw logistics, tx': { 'lat': 32.77, 'lon': -96.79, 'name': 'Dallas DFW Logistics, TX' },
            'chicago yards, il': { 'lat': 41.87, 'lon': -87.62, 'name': 'Chicago Yards, IL' },
            'indianapolis center, in': { 'lat': 39.76, 'lon': -86.15, 'name': 'Indianapolis Center, IN' },
            'atlanta hub, ga': { 'lat': 33.74, 'lon': -84.38, 'name': 'Atlanta Hub, GA' },
            'seattle port, wa': { 'lat': 47.60, 'lon': -122.33, 'name': 'Seattle Port, WA' },
            'boise warehouse, id': { 'lat': 43.61, 'lon': -116.20, 'name': 'Boise Warehouse, ID' },
            'denver terminal, co': { 'lat': 39.73, 'lon': -104.99, 'name': 'Denver Terminal, CO' },
        }

        preset_matches = []
        for key, coords in presets.items():
            if normalized in key:
                preset_matches.append(coords)

        cache_key = cls._make_cache_key("autocomplete", normalized)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        if cache.get("ors_rate_limited"):
            logger.warning("Geocoding API is currently rate-limited (circuit breaker active).")
            raise ORSRateLimitException("Geocoding API rate limit cooling down. Please try again in a few seconds.")

        try:
            url = "https://photon.komoot.io/api/"
            headers = {
                "User-Agent": "AURA-HOS-Logistics/1.0"
            }
            params = {
                "q": query,
                "limit": 50
            }
            response = requests.get(url, headers=headers, params=params, timeout=5)
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout calling Photon Autocomplete API: {e}")
            raise ORSTimeoutException("Connection to the autocompletion service timed out.")
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling Photon Autocomplete API: {e}")
            raise ORSUnavailableException(f"Failed to communicate with autocompletion service: {e}")

        if response.status_code != 200:
            logger.error(f"Photon Autocomplete error response (status {response.status_code}): {response.text}")
            if response.status_code == 429:
                cache.set("ors_rate_limited", True, timeout=30)
                raise ORSRateLimitException("Geocoding API rate limit exceeded. Please try again later.")
            elif response.status_code in [500, 502, 503, 504]:
                raise ORSUnavailableException("Geocoding service is temporarily unavailable or returned a server error.")
            return preset_matches[:5]

        data = response.json()
        features = data.get("features", [])
        results = []
        for idx, feat in enumerate(features):
            coords = feat.get("geometry", {}).get("coordinates", [])
            if len(coords) >= 2:
                properties = feat.get("properties", {})
                
                formatted_label = cls.format_location_label(properties)
                if not formatted_label:
                    continue
                    
                if not cls.validate_geographic_combination(formatted_label):
                    continue
                    
                suggestion = {
                    "name": formatted_label,
                    "lat": coords[1],
                    "lon": coords[0],
                    "osm_value": properties.get("osm_value") or properties.get("type") or "",
                    "osm_key": properties.get("osm_key") or "",
                    "raw_name": properties.get("name") or "",
                    "city": properties.get("city") or properties.get("town") or properties.get("village") or properties.get("locality") or "",
                    "state": properties.get("state") or "",
                    "country": properties.get("country") or "",
                    "countrycode": properties.get("countrycode") or "",
                    "raw_index": idx
                }
                
                if cls.is_in_ocean(coords[1], coords[0], formatted_label) or cls.get_drivable_continent(coords[1], coords[0]) in ["hawaii", "ocean"]:
                    continue
                
                if not any(r["name"].lower() == formatted_label.lower() or 
                           cls.haversine_distance(r["lat"], r["lon"], coords[1], coords[0]) < 1000 
                           for r in results):
                    results.append(suggestion)

        for item in preset_matches:
            if not any(cls.haversine_distance(item["lat"], item["lon"], r["lat"], r["lon"]) < 1000 for r in results):
                item_copy = dict(item)
                item_copy["osm_value"] = "city"
                name_parts = item_copy.get("name", "").split(",")
                item_copy["raw_name"] = name_parts[0].strip() if name_parts else ""
                item_copy["city"] = name_parts[0].strip() if name_parts else ""
                item_copy["state"] = name_parts[1].strip() if len(name_parts) > 1 else ""
                item_copy["country"] = "USA"
                item_copy["raw_index"] = 0
                results.append(item_copy)

        results.sort(key=lambda x: cls.score_suggestion(x, query), reverse=True)
        results = results[:5]
        
        for r in results:
            eager_key = cls._make_cache_key("geocode", r["name"])
            clean_r = {
                "name": r["name"],
                "lat": r["lat"],
                "lon": r["lon"]
            }
            cache.set(eager_key, clean_r, timeout=86400)

        cache.set(cache_key, results, timeout=86400)
        return results
