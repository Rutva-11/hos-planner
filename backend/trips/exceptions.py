from rest_framework.exceptions import APIException
from rest_framework import status

class GeocodingException(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Could not resolve location address.'
    default_code = 'geocoding_failed'

class RoutingException(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Could not calculate drivable route between locations.'
    default_code = 'routing_failed'

class ORSRateLimitException(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = 'OpenRouteService API rate limit exceeded. Please try again later.'
    default_code = 'rate_limited'

class ORSTimeoutException(APIException):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = 'OpenRouteService API request timed out.'
    default_code = 'timeout'

class ORSUnavailableException(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'OpenRouteService is temporarily unavailable or returned a server error.'
    default_code = 'service_unavailable'
