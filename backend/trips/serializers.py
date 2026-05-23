from rest_framework import serializers
from .models import Trip, Stop, DailyLog
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
    origin = serializers.CharField(required=True, allow_blank=False)
    pickup = serializers.CharField(required=True, allow_blank=False)
    dropoff = serializers.CharField(required=True, allow_blank=False)
    current_cycle_hours = serializers.FloatField(required=False, default=70.0)
    start_time = serializers.DateTimeField(required=False, allow_null=True)

    def validate_origin(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Origin location description cannot be empty.")
        if len(val) < 2:
            raise serializers.ValidationError("Origin location description must be at least 2 characters long.")
        return val

    def validate_pickup(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Pickup location description cannot be empty.")
        if len(val) < 2:
            raise serializers.ValidationError("Pickup location description must be at least 2 characters long.")
        return val

    def validate_dropoff(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Dropoff location description cannot be empty.")
        if len(val) < 2:
            raise serializers.ValidationError("Dropoff location description must be at least 2 characters long.")
        return val

    def validate_current_cycle_hours(self, value):
        if value is None:
            raise serializers.ValidationError("Available cycle hours are required.")
        if value < 0.0:
            raise serializers.ValidationError("Cycle hours cannot be negative.")
        if value > 70.0:
            raise serializers.ValidationError("Cycle hours cannot exceed the legal FMCSA limit of 70 hours.")
        return value

    def validate(self, data):
        origin = data.get('origin', '').strip().lower()
        pickup = data.get('pickup', '').strip().lower()
        dropoff = data.get('dropoff', '').strip().lower()

        if origin == pickup:
            raise serializers.ValidationError({"pickup": "Pickup location cannot be identical to the origin location."})
        if pickup == dropoff:
            raise serializers.ValidationError({"dropoff": "Dropoff location cannot be identical to the pickup location."})
        if origin == dropoff:
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
