from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from rest_framework import serializers
from .serializers import TripRequestSerializer, TripResponseSerializer
from .services.trip_planner import TripPlanner
from .services.route_service import RouteService
from .exceptions import (
    GeocodingException,
    RoutingException,
    ORSRateLimitException,
    ORSTimeoutException,
    ORSUnavailableException
)
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
@api_view(['POST'])
def plan_trip(request):
    logger.info(f"Received plan trip request: {request.data}")
    serializer = TripRequestSerializer(data=request.data)
    if not serializer.is_valid():
        logger.error(f"Validation errors: {serializer.errors}")
        return Response({
            "error": "Validation failed",
            "code": "validation_error",
            "details": serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        trip = TripPlanner.plan_trip(
            origin=serializer.validated_data['origin'],
            pickup=serializer.validated_data['pickup'],
            dropoff=serializer.validated_data['dropoff'],
            initial_cycle_hours=serializer.validated_data.get('current_cycle_hours', 70.0),
            start_time=serializer.validated_data.get('start_time')
        )
        response_serializer = TripResponseSerializer(trip)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
    except serializers.ValidationError as e:
        logger.error(f"Validation error: {e.detail}")
        return Response({
            "error": "Validation failed",
            "code": "validation_error",
            "details": e.detail
        }, status=status.HTTP_400_BAD_REQUEST)
        
    except GeocodingException as e:
        logger.error(f"Geocoding exception: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=e.status_code)
        
    except RoutingException as e:
        logger.error(f"Routing exception: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=e.status_code)
        
    except ORSRateLimitException as e:
        logger.error(f"Rate limit exception: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=e.status_code)
        
    except ORSTimeoutException as e:
        logger.error(f"Timeout exception: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=e.status_code)
        
    except ORSUnavailableException as e:
        logger.error(f"Service unavailable exception: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=e.status_code)
        
    except ValueError as e:
        logger.error(f"ValueError: {e}")
        return Response({
            "error": str(e),
            "code": "bad_request"
        }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        logger.exception("Error planning trip:")
        return Response({
            "error": "An unexpected server error occurred. Please try again later.",
            "code": "internal_error",
            "details": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
@api_view(['GET'])
def autocomplete_location(request):
    query = request.GET.get('q', '').strip()
    if not query:
        return Response([], status=status.HTTP_200_OK)

    try:
        results = RouteService.autocomplete(query)
        return Response(results, status=status.HTTP_200_OK)
    except ORSRateLimitException as e:
        logger.error(f"Rate limit exception in autocomplete: {e.detail}")
        return Response({
            "error": str(e.detail),
            "code": e.default_code
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)
    except Exception as e:
        logger.exception("Unexpected error in autocomplete:")
        return Response([], status=status.HTTP_200_OK)

@csrf_exempt
@api_view(['POST'])
def copilot_chat(request):
    logger.info(f"Received copilot chat request: {request.data}")
    message = request.data.get('message', '').strip()
    route_context = request.data.get('route_context') or request.data.get('context')
    
    if not message:
        return Response({
            "error": "Message is required",
            "code": "validation_error"
        }, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        from .services.copilot_service import CopilotService
        reply = CopilotService.ask_copilot(message, route_context)
        return Response({"response": reply}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.exception("Error in copilot chat view:")
        return Response({
            "error": "Failed to generate copilot response",
            "code": "internal_error",
            "details": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)