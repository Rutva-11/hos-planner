from django.db import models

class Trip(models.Model):
    """
    Represents a full planned trip for a commercial truck driver.
    """
    # Start/Current location
    start_location_name = models.CharField(max_length=255, default="Current Location")
    start_location_lat = models.FloatField()
    start_location_lon = models.FloatField()

    # Pickup location
    pickup_location_name = models.CharField(max_length=255, default="Pickup Location")
    pickup_location_lat = models.FloatField()
    pickup_location_lon = models.FloatField()

    # Dropoff location
    dropoff_location_name = models.CharField(max_length=255, default="Dropoff Location")
    dropoff_location_lat = models.FloatField()
    dropoff_location_lon = models.FloatField()

    # Route summary metrics
    distance_miles = models.FloatField(help_text="Total trip distance in miles")
    duration_seconds = models.FloatField(help_text="Total transit duration in seconds (driving + HOS breaks)")
    
    # Encoded polyline or coordinate list representation
    polyline = models.TextField(help_text="JSON representation of route coordinates [[lat, lon], ...]")
    
    # Time window
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    
    # Initial driver state input
    initial_cycle_hours = models.FloatField(default=0.0, help_text="Starting cycle hours used")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Trip {self.id}: {self.start_location_name} -> {self.pickup_location_name} -> {self.dropoff_location_name}"


class Stop(models.Model):
    """
    Represents a physical stopping point along a Trip, which can be for loading,
    unloading, resting, sleeping, or fueling.
    """
    STOP_TYPES = [
        ("START", "Start/Current Location"),
        ("PICKUP", "Pickup/Loading Location"),
        ("FUEL", "Fuel Stop"),
        ("REST", "30-minute Rest Break"),
        ("OVERNIGHT", "10-hour Overnight Reset"),
        ("DROPOFF", "Dropoff/Unloading Location"),
    ]

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="stops")
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=STOP_TYPES)
    latitude = models.FloatField()
    longitude = models.FloatField()
    
    arrival_time = models.DateTimeField()
    departure_time = models.DateTimeField()
    duration_seconds = models.FloatField(help_text="Time spent at this stop in seconds")
    
    distance_from_previous_miles = models.FloatField(default=0.0, help_text="Distance from previous stop in miles")
    sequence = models.IntegerField(help_text="Order in which this stop occurs (0-indexed)")
    
    notes = models.TextField(blank=True, null=True, help_text="HOS reasoning or stop details")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sequence"]
        unique_together = ("trip", "sequence")

    def __str__(self):
        return f"Stop {self.sequence} ({self.type}) on Trip {self.trip_id}: {self.name}"


class DailyLog(models.Model):
    """
    Represents the daily log summary required by HOS FMCSA rules for a single calendar day.
    """
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="daily_logs")
    date = models.DateField(help_text="The date of the log entry")
    
    # Hours of Service metrics (stored in seconds for high-fidelity calculations)
    driving_seconds = models.FloatField(default=0.0, help_text="Time spent driving in seconds")
    on_duty_seconds = models.FloatField(default=0.0, help_text="Time spent on duty (non-driving) in seconds")
    off_duty_seconds = models.FloatField(default=0.0, help_text="Time spent off duty/resting in seconds")
    
    start_time = models.DateTimeField(help_text="Start of the log day (first activity)")
    end_time = models.DateTimeField(help_text="End of the log day (last activity)")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date"]
        unique_together = ("trip", "date")

    def __str__(self):
        return f"DailyLog for Trip {self.trip_id} on {self.date}"
