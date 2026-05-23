from datetime import datetime, timedelta

class HOSRules:
    """
    FMCSA Hours of Service simplified rules configuration.
    All times are stored in seconds.
    """
    MAX_DRIVING_DAILY = 11.0 * 3600             # 11 hours
    MAX_ON_DUTY_DAILY = 14.0 * 3600             # 14 hours
    MAX_DRIVING_BEFORE_BREAK = 8.0 * 3600        # 8 hours
    
    REST_BREAK_DURATION = 30 * 60                # 30 minutes
    OVERNIGHT_RESET_DURATION = 10 * 3600         # 10 hours
    
    FUEL_INTERVAL_MILES = 1000.0                 # Fuel every 1000 miles
    FUEL_STOP_DURATION = 30 * 60                 # 30 minutes
    
    PICKUP_LOAD_DURATION = 2 * 3600              # 2 hours loading
    DROPOFF_UNLOAD_DURATION = 2 * 3600            # 2 hours unloading


class DriverState:
    """
    Maintains the state of a truck driver during HOS simulation.
    """
    def __init__(self, start_time: datetime, initial_cycle_hours: float = 0.0):
        self.current_time = start_time
        
        # Accumulated metrics for the current shift (day)
        self.driving_seconds_today = 0.0
        self.on_duty_seconds_today = 0.0
        
        # Accumulated metrics for the current driving stretch
        self.driving_seconds_since_break = 0.0
        
        # Accumulated distance since last fueling
        self.miles_since_fuel = 0.0

        # Total metrics for the entire trip
        self.total_distance_miles = 0.0
        self.total_duration_seconds = 0.0

    def get_remaining_driving_today(self) -> float:
        """Returns remaining driving seconds allowed today."""
        return max(0.0, HOSRules.MAX_DRIVING_DAILY - self.driving_seconds_today)

    def get_remaining_on_duty_today(self) -> float:
        """Returns remaining on-duty seconds allowed today."""
        return max(0.0, HOSRules.MAX_ON_DUTY_DAILY - self.on_duty_seconds_today)

    def get_remaining_before_break(self) -> float:
        """Returns remaining driving seconds allowed before a 30-min break is required."""
        return max(0.0, HOSRules.MAX_DRIVING_BEFORE_BREAK - self.driving_seconds_since_break)

    def get_miles_before_fuel(self) -> float:
        """Returns remaining miles before a fuel stop is required."""
        return max(0.0, HOSRules.FUEL_INTERVAL_MILES - self.miles_since_fuel)

    def perform_activity(self, duration_seconds: float, activity_type: str):
        """
        Applies a non-driving activity (like loading, unloading, rest, overnight, fuel).
        activity_type can be: 'REST', 'OVERNIGHT', 'FUEL', 'PICKUP', 'DROPOFF'
        """
        self.current_time += timedelta(seconds=duration_seconds)
        self.total_duration_seconds += duration_seconds

        if activity_type == 'FUEL':
            # Fueling counts as on-duty non-driving
            self.on_duty_seconds_today += duration_seconds
            self.miles_since_fuel = 0.0
            
        elif activity_type == 'REST':
            # 30-minute break counts as off-duty, resets the 8-hour driving clock
            self.driving_seconds_since_break = 0.0
            
        elif activity_type == 'OVERNIGHT':
            # 10-hour reset counts as off-duty, resets daily driving, daily on-duty, and break clocks
            self.driving_seconds_today = 0.0
            self.on_duty_seconds_today = 0.0
            self.driving_seconds_since_break = 0.0
            
        elif activity_type in ['PICKUP', 'DROPOFF']:
            # Loading/unloading counts as on-duty non-driving
            self.on_duty_seconds_today += duration_seconds
