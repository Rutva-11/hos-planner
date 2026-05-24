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
            "code": "internal_error"
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
    # Accept "prompt" as the primary field, with "message" as a backwards-compat alias
    prompt = (
        request.data.get('prompt', '').strip()
        or request.data.get('message', '').strip()
    )
    logger.info("Received compliance assistant query. Length: %d chars.", len(prompt))

    if not prompt:
        return Response({
            "error": "prompt is required",
            "code": "validation_error"
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        from .services.copilot_service import CopilotService
        reply = CopilotService.ask_copilot(prompt)
        return Response({"response": reply}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.exception("Unexpected error in compliance assistant view:")
        return Response({
            "error": "Failed to generate compliance response.",
            "code": "internal_error",
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
@api_view(['GET'])
def get_daily_logs(request):
    mock_logs = [
        {
            "day": 1,
            "date": "May 21, 2026",
            "driver_name": "Sarah Jenkins",
            "status": "Compliant",
            "certification_status": "Certified",
            "dispatch_timestamp": "May 21, 2026, 06:00 AM",
            "compliance_lock": True,
            "fmcsa_notice": "Record certified under 49 CFR § 395.15. Form and manner compliant.",
            "violations": [],
            "summary": {
                "driving_hours": 10.0,
                "on_duty_hours": 3.0,
                "off_duty_hours": 6.5,
                "sleeper_hours": 4.5
            },
            "segments": [
                { "start": "00:00", "end": "06:00", "status": "off_duty", "duration": "06:00" },
                { "start": "06:00", "end": "08:00", "status": "on_duty", "duration": "02:00" },
                { "start": "08:00", "end": "13:00", "status": "driving", "duration": "05:00" },
                { "start": "13:00", "end": "13:30", "status": "off_duty", "duration": "00:30" },
                { "start": "13:30", "end": "18:30", "status": "driving", "duration": "05:00" },
                { "start": "18:30", "end": "19:30", "status": "on_duty", "duration": "01:00" },
                { "start": "19:30", "end": "24:00", "status": "sleeper", "duration": "04:30" }
            ]
        },
        {
            "day": 2,
            "date": "May 22, 2026",
            "driver_name": "Sarah Jenkins",
            "status": "Violation",
            "certification_status": "Certified",
            "dispatch_timestamp": "May 22, 2026, 05:00 AM",
            "compliance_lock": True,
            "fmcsa_notice": "Record certified under 49 CFR § 395.15. Multiple critical compliance violations found.",
            "violations": [
                {
                    "code": "FMCSA § 395.3(a)(3)",
                    "type": "11-hour driving violation",
                    "description": "Driver exceeded the maximum 11-hour daily driving limit. Total driving time accumulated was 12.0 hours.",
                    "remedy": "Driver must take a minimum of 10 consecutive hours off-duty or in sleeper berth before resuming safety-sensitive functions."
                },
                {
                    "code": "FMCSA § 395.3(a)(2)",
                    "type": "14-hour duty window violation",
                    "description": "Driver exceeded the maximum 14-hour daily duty shift window. Total elapsed time since starting duty was 15.5 hours.",
                    "remedy": "Driver must complete a 10 consecutive hour off-duty period to reset the shift window clock."
                }
            ],
            "summary": {
                "driving_hours": 12.0,
                "on_duty_hours": 2.5,
                "off_duty_hours": 8.5,
                "sleeper_hours": 1.0
            },
            "segments": [
                { "start": "00:00", "end": "05:00", "status": "off_duty", "duration": "05:00" },
                { "start": "05:00", "end": "06:00", "status": "on_duty", "duration": "01:00" },
                { "start": "06:00", "end": "12:00", "status": "driving", "duration": "06:00" },
                { "start": "12:00", "end": "13:00", "status": "sleeper", "duration": "01:00" },
                { "start": "13:00", "end": "19:00", "status": "driving", "duration": "06:00" },
                { "start": "19:00", "end": "20:30", "status": "on_duty", "duration": "01:30" },
                { "start": "20:30", "end": "24:00", "status": "off_duty", "duration": "03:30" }
            ]
        },
        {
            "day": 3,
            "date": "May 23, 2026",
            "driver_name": "Sarah Jenkins",
            "status": "Violation",
            "certification_status": "Pending Signature",
            "dispatch_timestamp": "May 23, 2026, 08:00 AM",
            "compliance_lock": False,
            "fmcsa_notice": "Signature required to certify daily record under 49 CFR § 395.15.",
            "violations": [
                {
                    "code": "FMCSA § 395.3(a)(3)(ii)",
                    "type": "missed 30-minute break",
                    "description": "Driver operated a commercial motor vehicle for more than 8 hours continuously without a mandatory 30-minute rest break. Continuous driving duration was 8.5 hours.",
                    "remedy": "Driver must immediately take a 30-minute off-duty or sleeper berth break before performing any further driving operations."
                }
            ],
            "summary": {
                "driving_hours": 10.5,
                "on_duty_hours": 1.5,
                "off_duty_hours": 8.0,
                "sleeper_hours": 4.0
            },
            "segments": [
                { "start": "00:00", "end": "08:00", "status": "off_duty", "duration": "08:00" },
                { "start": "08:00", "end": "16:30", "status": "driving", "duration": "08:30" },
                { "start": "16:30", "end": "17:00", "status": "on_duty", "duration": "00:30" },
                { "start": "17:00", "end": "19:00", "status": "driving", "duration": "02:00" },
                { "start": "19:00", "end": "20:00", "status": "on_duty", "duration": "01:00" },
                { "start": "20:00", "end": "24:00", "status": "sleeper", "duration": "04:00" }
            ]
        }
    ]
    return Response(mock_logs, status=status.HTTP_200_OK)