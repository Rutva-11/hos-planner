from rest_framework import serializers
from .models import Trip, Stop, DailyLog
from .services.route_service import RouteService
import json

class StopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stop
        fields = [
            'id',
            'name',
            'type',
            'latitude',
            'longitude',
            'arrival_time',
            'departure_time',
            'duration_seconds',
            'distance_from_previous_miles',
            'sequence',
            'notes',
        ]


class DailyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyLog
        fields = [
            'id',
            'date',
            'driving_seconds',
            'on_duty_seconds',
            'off_duty_seconds',
            'start_time',
            'end_time',
        ]


class TripSerializer(serializers.ModelSerializer):
    stops = StopSerializer(many=True, read_only=True)
    daily_logs = DailyLogSerializer(many=True, read_only=True)

    class Meta:
        model = Trip
        fields = [
            'id',
            'start_location_name',
            'start_location_lat',
            'start_location_lon',
            'pickup_location_name',
            'pickup_location_lat',
            'pickup_location_lon',
            'dropoff_location_name',
            'dropoff_location_lat',
            'dropoff_location_lon',
            'distance_miles',
            'duration_seconds',
            'polyline',
            'start_time',
            'end_time',
            'initial_cycle_hours',
            'stops',
            'daily_logs',
            'created_at',
            'updated_at',
        ]


class TripRequestSerializer(serializers.Serializer):
    origin = serializers.JSONField(required=True)
    pickup = serializers.JSONField(required=True)
    dropoff = serializers.JSONField(required=True)
    current_cycle_hours = serializers.FloatField(required=False, default=70.0)
    start_time = serializers.DateTimeField(required=False, allow_null=True)

    def _validate_location(self, value, field_name):
        if isinstance(value, str):
            val = value.strip()
            if not val:
                raise serializers.ValidationError(f"{field_name} location description cannot be empty.")
            if len(val) < 2:
                raise serializers.ValidationError(f"{field_name} location description must be at least 2 characters long.")
            return val
        elif isinstance(value, dict):
            name = value.get("name")
            lat = value.get("lat")
            lon = value.get("lon")
            if not name or not isinstance(name, str) or not name.strip():
                raise serializers.ValidationError(f"{field_name} name is required and must be a string.")
            if lat is None or lon is None:
                raise serializers.ValidationError(f"{field_name} lat/lon coordinates are required.")
            try:
                lat_val = float(lat)
                lon_val = float(lon)
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"{field_name} lat/lon must be valid float coordinates.")
            if not (-90.0 <= lat_val <= 90.0) or not (-180.0 <= lon_val <= 180.0):
                raise serializers.ValidationError(f"{field_name} lat/lon coordinates are out of bounds.")
                
            # Perform ocean & Hawaii checks
            if RouteService.is_in_ocean(lat_val, lon_val, name) or RouteService.get_drivable_continent(lat_val, lon_val) in ["hawaii", "ocean"]:
                raise serializers.ValidationError(f"Resolved location '{name}' is in a marine or island region with no commercial trucking road access.")
                
            return {
                "name": name.strip(),
                "lat": lat_val,
                "lon": lon_val
            }
        else:
            raise serializers.ValidationError(f"Invalid format for {field_name}. Must be a string or a coordinate object.")

    def validate_origin(self, value):
        return self._validate_location(value, "Origin")

    def validate_pickup(self, value):
        return self._validate_location(value, "Pickup")

    def validate_dropoff(self, value):
        return self._validate_location(value, "Dropoff")

    def validate_current_cycle_hours(self, value):
        if value is None:
            raise serializers.ValidationError("Available cycle hours are required.")
        if value < 0.0:
            raise serializers.ValidationError("Cycle hours cannot be negative.")
        if value > 70.0:
            raise serializers.ValidationError("Cycle hours cannot exceed the legal FMCSA limit of 70 hours.")
        return value

    def validate(self, data):
        origin_val = data.get('origin')
        pickup_val = data.get('pickup')
        dropoff_val = data.get('dropoff')
        
        origin_name = origin_val.get('name', '').strip().lower() if isinstance(origin_val, dict) else str(origin_val).strip().lower()
        pickup_name = pickup_val.get('name', '').strip().lower() if isinstance(pickup_val, dict) else str(pickup_val).strip().lower()
        dropoff_name = dropoff_val.get('name', '').strip().lower() if isinstance(dropoff_val, dict) else str(dropoff_val).strip().lower()

        if origin_name == pickup_name:
            raise serializers.ValidationError({"pickup": "Pickup location cannot be identical to the origin location."})
        if pickup_name == dropoff_name:
            raise serializers.ValidationError({"dropoff": "Dropoff location cannot be identical to the pickup location."})
        if origin_name == dropoff_name:
            raise serializers.ValidationError({"dropoff": "Dropoff location cannot be identical to the origin location."})
        
        return data


class TripResponseSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField(source='id')
    start_location_name = serializers.CharField()
    start_location_lat = serializers.FloatField()
    start_location_lon = serializers.FloatField()
    pickup_location_name = serializers.CharField()
    pickup_location_lat = serializers.FloatField()
    pickup_location_lon = serializers.FloatField()
    dropoff_location_name = serializers.CharField()
    dropoff_location_lat = serializers.FloatField()
    dropoff_location_lon = serializers.FloatField()
    
    distance_miles = serializers.FloatField()
    duration_seconds = serializers.FloatField()
    polyline = serializers.SerializerMethodField()
    
    stops = StopSerializer(many=True)
    fuel_stops = serializers.SerializerMethodField()
    daily_logs = DailyLogSerializer(many=True)
    
    created_at = serializers.DateTimeField()
    
    def get_polyline(self, obj):
        try:
            return json.loads(obj.polyline)
        except Exception:
            return []

    def get_fuel_stops(self, obj):
        # filter to only return FUEL stops
        fuel_stops = [stop for stop in obj.stops.all() if stop.type == 'FUEL']
        return StopSerializer(fuel_stops, many=True).data
