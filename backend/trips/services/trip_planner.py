import json
from datetime import datetime, timedelta, date
from django.db import transaction
from django.utils import timezone
from .route_service import RouteService
from .hos_service import HOSRules, DriverState
from ..models import Trip, Stop, DailyLog

class TripPlanner:
    """
    Orchestrates the HOS routing, simulation, stop generation, and database persistence.
    """

    @classmethod
    def get_coordinate_at_fraction(cls, polyline, fraction):
        """
        Interpolates the [latitude, longitude] coordinate at a given progress fraction (0.0 to 1.0)
        along a polyline.
        """
        if not polyline:
            return [0.0, 0.0]
        if len(polyline) == 1:
            return polyline[0]
        if fraction <= 0.0:
            return polyline[0]
        if fraction >= 1.0:
            return polyline[-1]

        # Calculate segment distances
        distances = []
        total_dist = 0.0
        for idx in range(len(polyline) - 1):
            d = RouteService.haversine_distance(
                polyline[idx][0], polyline[idx][1],
                polyline[idx + 1][0], polyline[idx + 1][1]
            )
            distances.append(d)
            total_dist += d

        if total_dist == 0.0:
            return polyline[0]

        target_dist = fraction * total_dist
        current_dist = 0.0

        for idx, d in enumerate(distances):
            if current_dist + d >= target_dist:
                # Interpolate inside this segment
                seg_fraction = (target_dist - current_dist) / d
                lat = polyline[idx][0] + (polyline[idx + 1][0] - polyline[idx][0]) * seg_fraction
                lon = polyline[idx][1] + (polyline[idx + 1][1] - polyline[idx][1]) * seg_fraction
                return [lat, lon]
            current_dist += d

        return polyline[-1]

    @classmethod
    @transaction.atomic
    def plan_trip(cls, origin, pickup, dropoff, initial_cycle_hours=0.0, start_time=None):
        """
        Calculates the HOS-compliant trip plan, geocodes inputs, generates stops/logs, and saves to database.
        
        origin: string location name
        pickup: string location name
        dropoff: string location name
        """
        # Geocode inputs on the backend if they are strings, otherwise use them directly
        if isinstance(origin, dict):
            current_location = origin
        else:
            current_location = RouteService.geocode(origin)

        if isinstance(pickup, dict):
            pickup_location = pickup
        else:
            pickup_location = RouteService.geocode(pickup)

        if isinstance(dropoff, dict):
            dropoff_location = dropoff
        else:
            dropoff_location = RouteService.geocode(dropoff)

        if start_time is None:
            start_time = timezone.now()
        else:
            # Ensure start_time is timezone-aware
            if timezone.is_naive(start_time):
                start_time = timezone.make_aware(start_time)

        # 1. Fetch Routing Information
        waypoints = [
            [current_location["lat"], current_location["lon"]],
            [pickup_location["lat"], pickup_location["lon"]],
            [dropoff_location["lat"], dropoff_location["lon"]]
        ]
        
        route_data = RouteService.get_route(waypoints)
        full_polyline = route_data["polyline"]
        legs = route_data["legs"] # Usually 2 legs: current->pickup, pickup->dropoff

        # Convert meters to miles
        total_distance_miles = route_data["distance_meters"] / 1609.344

        # Initialize driver HOS state
        driver_state = DriverState(start_time, initial_cycle_hours)
        
        # Apply initial cycle hours (e.g. driving/on-duty logged today prior to starting this trip)
        driver_state.driving_seconds_today = initial_cycle_hours * 3600.0
        driver_state.on_duty_seconds_today = initial_cycle_hours * 3600.0
        driver_state.driving_seconds_since_break = initial_cycle_hours * 3600.0

        # Collections for output
        generated_stops = []
        daily_log_data = {} # date -> dict of driving_seconds, on_duty_seconds, off_duty_seconds, start_time, end_time
        
        # Helper to log time split across days (midnight boundaries)
        def log_time_allocation(duration, activity_type):
            if duration <= 0:
                return
            st = driver_state.current_time
            et = st + timedelta(seconds=duration)
            
            curr = st
            rem = duration
            
            while rem > 0:
                # Time until next midnight in local timezone / UTC
                next_mid = datetime.combine(curr.date() + timedelta(days=1), datetime.min.time()).replace(tzinfo=curr.tzinfo)
                sec_to_midnight = (next_mid - curr).total_seconds()
                
                chunk = min(rem, sec_to_midnight)
                dt_key = curr.date()
                
                if dt_key not in daily_log_data:
                    daily_log_data[dt_key] = {
                        "driving_seconds": 0.0,
                        "on_duty_seconds": 0.0,
                        "off_duty_seconds": 0.0,
                        "start_time": curr,
                        "end_time": curr
                    }
                
                if activity_type == 'driving':
                    daily_log_data[dt_key]["driving_seconds"] += chunk
                elif activity_type == 'on_duty':
                    daily_log_data[dt_key]["on_duty_seconds"] += chunk
                elif activity_type == 'off_duty':
                    daily_log_data[dt_key]["off_duty_seconds"] += chunk
                
                daily_log_data[dt_key]["end_time"] = curr + timedelta(seconds=chunk)
                
                rem -= chunk
                curr += timedelta(seconds=chunk)

        # Create START Stop
        start_stop = {
            "name": current_location.get("name") or "Start Location",
            "type": "START",
            "latitude": current_location["lat"],
            "longitude": current_location["lon"],
            "arrival_time": driver_state.current_time,
            "departure_time": driver_state.current_time,
            "duration_seconds": 0.0,
            "distance_from_previous_miles": 0.0,
            "notes": "Trip initialized.",
            "sequence": 0
        }
        generated_stops.append(start_stop)
        
        # Log 0-duration activity to initialize day logs if necessary
        log_time_allocation(0, 'on_duty')

        last_stop_odometer = 0.0
        sequence_counter = 1

        # Simulate route leg by leg
        for leg_idx, leg in enumerate(legs):
            leg_polyline = leg.get("polyline") or full_polyline # fallback to full polyline if leg polyline missing
            leg_distance_meters = leg["distance_meters"]
            leg_distance_miles = leg_distance_meters / 1609.344
            leg_duration_seconds = leg["duration_seconds"]
            
            # Calculate speed of travel along this leg
            if leg_duration_seconds > 0:
                speed_mps = leg_distance_meters / leg_duration_seconds
                speed_mph = speed_mps * 2.23694
            else:
                speed_mps = RouteService.AVERAGE_TRUCK_SPEED_MPS
                speed_mph = speed_mps * 2.23694

            time_remaining = leg_duration_seconds
            leg_time_elapsed = 0.0
            leg_distance_driven = 0.0

            # Simulate driving on this leg
            while time_remaining > 0.0:
                # 1. Evaluate remaining hours until HOS thresholds are reached
                rem_driving_today = driver_state.get_remaining_driving_today()
                rem_on_duty_today = driver_state.get_remaining_on_duty_today()
                rem_before_break = driver_state.get_remaining_before_break()
                
                # Daily limit is the tighter of remaining daily driving or on-duty hours
                daily_driving_limit = min(rem_driving_today, rem_on_duty_today)

                # Fuel limit evaluation
                rem_miles_before_fuel = driver_state.get_miles_before_fuel()
                if speed_mph > 0:
                    time_to_fuel_limit = (rem_miles_before_fuel / speed_mph) * 3600.0
                else:
                    time_to_fuel_limit = float('inf')

                # Check if we are already at or past HOS limits (must stop IMMEDIATELY)
                if daily_driving_limit <= 0.0:
                    # Overnight reset required
                    frac = leg_time_elapsed / leg_duration_seconds if leg_duration_seconds > 0 else 0.0
                    coords = cls.get_coordinate_at_fraction(leg_polyline, frac)
                    
                    stop_record = {
                        "name": f"HOS Overnight Reset (Sequence {sequence_counter})",
                        "type": "OVERNIGHT",
                        "latitude": coords[0],
                        "longitude": coords[1],
                        "arrival_time": driver_state.current_time,
                        "departure_time": driver_state.current_time + timedelta(seconds=HOSRules.OVERNIGHT_RESET_DURATION),
                        "duration_seconds": HOSRules.OVERNIGHT_RESET_DURATION,
                        "distance_from_previous_miles": driver_state.total_distance_miles - last_stop_odometer,
                        "notes": "Mandatory 10-hour overnight reset (Daily driving or shift on-duty limit reached).",
                        "sequence": sequence_counter
                    }
                    sequence_counter += 1
                    last_stop_odometer = driver_state.total_distance_miles
                    generated_stops.append(stop_record)
                    
                    # Apply rest activity
                    log_time_allocation(HOSRules.OVERNIGHT_RESET_DURATION, 'off_duty')
                    driver_state.perform_activity(HOSRules.OVERNIGHT_RESET_DURATION, 'OVERNIGHT')
                    continue

                if rem_before_break <= 0.0:
                    # Rest break required
                    frac = leg_time_elapsed / leg_duration_seconds if leg_duration_seconds > 0 else 0.0
                    coords = cls.get_coordinate_at_fraction(leg_polyline, frac)
                    
                    stop_record = {
                        "name": f"HOS 30-minute Rest Break (Sequence {sequence_counter})",
                        "type": "REST",
                        "latitude": coords[0],
                        "longitude": coords[1],
                        "arrival_time": driver_state.current_time,
                        "departure_time": driver_state.current_time + timedelta(seconds=HOSRules.REST_BREAK_DURATION),
                        "duration_seconds": HOSRules.REST_BREAK_DURATION,
                        "distance_from_previous_miles": driver_state.total_distance_miles - last_stop_odometer,
                        "notes": "Mandatory 30-minute rest break (Exceeded 8 driving hours).",
                        "sequence": sequence_counter
                    }
                    sequence_counter += 1
                    last_stop_odometer = driver_state.total_distance_miles
                    generated_stops.append(stop_record)
                    
                    log_time_allocation(HOSRules.REST_BREAK_DURATION, 'off_duty')
                    driver_state.perform_activity(HOSRules.REST_BREAK_DURATION, 'REST')
                    continue

                if rem_miles_before_fuel <= 0.0:
                    # Fuel stop required
                    frac = leg_time_elapsed / leg_duration_seconds if leg_duration_seconds > 0 else 0.0
                    coords = cls.get_coordinate_at_fraction(leg_polyline, frac)
                    
                    stop_record = {
                        "name": f"Fuel Stop (Sequence {sequence_counter})",
                        "type": "FUEL",
                        "latitude": coords[0],
                        "longitude": coords[1],
                        "arrival_time": driver_state.current_time,
                        "departure_time": driver_state.current_time + timedelta(seconds=HOSRules.FUEL_STOP_DURATION),
                        "duration_seconds": HOSRules.FUEL_STOP_DURATION,
                        "distance_from_previous_miles": driver_state.total_distance_miles - last_stop_odometer,
                        "notes": "Vehicle refueling (Fuel limit reached).",
                        "sequence": sequence_counter
                    }
                    sequence_counter += 1
                    last_stop_odometer = driver_state.total_distance_miles
                    generated_stops.append(stop_record)
                    
                    log_time_allocation(HOSRules.FUEL_STOP_DURATION, 'on_duty')
                    driver_state.perform_activity(HOSRules.FUEL_STOP_DURATION, 'FUEL')
                    continue

                # Determine how long we can safely drive in this step
                drive_step_duration = min(
                    daily_driving_limit,
                    rem_before_break,
                    time_to_fuel_limit,
                    time_remaining
                )

                # Drive for the computed step duration
                leg_time_elapsed += drive_step_duration
                dist_driven_step = (drive_step_duration / 3600.0) * speed_mph
                leg_distance_driven += dist_driven_step
                
                # Apply driving metrics
                driver_state.driving_seconds_today += drive_step_duration
                driver_state.on_duty_seconds_today += drive_step_duration
                driver_state.driving_seconds_since_break += drive_step_duration
                driver_state.miles_since_fuel += dist_driven_step
                driver_state.total_distance_miles += dist_driven_step
                driver_state.total_duration_seconds += drive_step_duration
                
                # Log driving activity
                log_time_allocation(drive_step_duration, 'driving')
                driver_state.current_time += timedelta(seconds=drive_step_duration)
                time_remaining -= drive_step_duration

            # 2. Leg Completed — Driver arrived at intermediate waypoint or destination
            if leg_idx == 0:
                # Arrived at PICKUP location
                arrival_time = driver_state.current_time
                departure_time = arrival_time + timedelta(seconds=HOSRules.PICKUP_LOAD_DURATION)
                
                pickup_stop = {
                    "name": pickup_location.get("name") or "Pickup Location",
                    "type": "PICKUP",
                    "latitude": pickup_location["lat"],
                    "longitude": pickup_location["lon"],
                    "arrival_time": arrival_time,
                    "departure_time": departure_time,
                    "duration_seconds": HOSRules.PICKUP_LOAD_DURATION,
                    "distance_from_previous_miles": driver_state.total_distance_miles - last_stop_odometer,
                    "notes": "Loading cargo (2 hours on-duty).",
                    "sequence": sequence_counter
                }
                sequence_counter += 1
                last_stop_odometer = driver_state.total_distance_miles
                generated_stops.append(pickup_stop)
                
                # Log loading time (on-duty)
                log_time_allocation(HOSRules.PICKUP_LOAD_DURATION, 'on_duty')
                driver_state.perform_activity(HOSRules.PICKUP_LOAD_DURATION, 'PICKUP')

                # Check if loading pushed driver past the 14-hour daily limit.
                # If so, must take overnight reset at the pickup location before starting the next driving leg
                if driver_state.on_duty_seconds_today >= HOSRules.MAX_ON_DUTY_DAILY:
                    coords = [pickup_location["lat"], pickup_location["lon"]]
                    reset_stop = {
                        "name": f"HOS Overnight Reset at Pickup (Sequence {sequence_counter})",
                        "type": "OVERNIGHT",
                        "latitude": coords[0],
                        "longitude": coords[1],
                        "arrival_time": driver_state.current_time,
                        "departure_time": driver_state.current_time + timedelta(seconds=HOSRules.OVERNIGHT_RESET_DURATION),
                        "duration_seconds": HOSRules.OVERNIGHT_RESET_DURATION,
                        "distance_from_previous_miles": 0.0,
                        "notes": "10-hour overnight reset due to shift limit reached during cargo loading.",
                        "sequence": sequence_counter
                    }
                    sequence_counter += 1
                    generated_stops.append(reset_stop)
                    
                    log_time_allocation(HOSRules.OVERNIGHT_RESET_DURATION, 'off_duty')
                    driver_state.perform_activity(HOSRules.OVERNIGHT_RESET_DURATION, 'OVERNIGHT')

            elif leg_idx == 1:
                # Arrived at DROPOFF location
                arrival_time = driver_state.current_time
                departure_time = arrival_time + timedelta(seconds=HOSRules.DROPOFF_UNLOAD_DURATION)
                
                dropoff_stop = {
                    "name": dropoff_location.get("name") or "Dropoff Location",
                    "type": "DROPOFF",
                    "latitude": dropoff_location["lat"],
                    "longitude": dropoff_location["lon"],
                    "arrival_time": arrival_time,
                    "departure_time": departure_time,
                    "duration_seconds": HOSRules.DROPOFF_UNLOAD_DURATION,
                    "distance_from_previous_miles": driver_state.total_distance_miles - last_stop_odometer,
                    "notes": "Unloading cargo (2 hours on-duty).",
                    "sequence": sequence_counter
                }
                sequence_counter += 1
                last_stop_odometer = driver_state.total_distance_miles
                generated_stops.append(dropoff_stop)
                
                # Log unloading time (on-duty)
                log_time_allocation(HOSRules.DROPOFF_UNLOAD_DURATION, 'on_duty')
                driver_state.perform_activity(HOSRules.DROPOFF_UNLOAD_DURATION, 'DROPOFF')

        # 3. Save to database
        trip = Trip.objects.create(
            start_location_name=current_location.get("name") or "Current Location",
            start_location_lat=current_location["lat"],
            start_location_lon=current_location["lon"],
            pickup_location_name=pickup_location.get("name") or "Pickup Location",
            pickup_location_lat=pickup_location["lat"],
            pickup_location_lon=pickup_location["lon"],
            dropoff_location_name=dropoff_location.get("name") or "Dropoff Location",
            dropoff_location_lat=dropoff_location["lat"],
            dropoff_location_lon=dropoff_location["lon"],
            distance_miles=total_distance_miles,
            duration_seconds=driver_state.total_duration_seconds,
            polyline=json.dumps(full_polyline),
            start_time=start_time,
            end_time=driver_state.current_time,
            initial_cycle_hours=initial_cycle_hours
        )

        # Create stops
        for s in generated_stops:
            Stop.objects.create(
                trip=trip,
                name=s["name"],
                type=s["type"],
                latitude=s["latitude"],
                longitude=s["longitude"],
                arrival_time=s["arrival_time"],
                departure_time=s["departure_time"],
                duration_seconds=s["duration_seconds"],
                distance_from_previous_miles=s["distance_from_previous_miles"],
                sequence=s["sequence"],
                notes=s["notes"]
            )

        # Create daily logs
        # Calculate off-duty hours for each day (a full day has 86400 seconds)
        # Any time not spent driving or on-duty is counted as off-duty/rest
        for dt, log in daily_log_data.items():
            total_logged = log["driving_seconds"] + log["on_duty_seconds"] + log["off_duty_seconds"]
            
            # The off_duty time is either explicitly logged (breaks/sleep) or is the remaining time in the active period
            # Let's clean up off duty: any hours in the active day not accounted for is off duty
            active_span_seconds = (log["end_time"] - log["start_time"]).total_seconds()
            unaccounted_seconds = max(0.0, active_span_seconds - (log["driving_seconds"] + log["on_duty_seconds"] + log["off_duty_seconds"]))
            log["off_duty_seconds"] += unaccounted_seconds
            
            # Ensure off duty accounts for the remaining portion of the 24 hour period
            # if this is a multi-day trip
            DailyLog.objects.create(
                trip=trip,
                date=dt,
                driving_seconds=log["driving_seconds"],
                on_duty_seconds=log["on_duty_seconds"],
                off_duty_seconds=log["off_duty_seconds"],
                start_time=log["start_time"],
                end_time=log["end_time"]
            )

        return trip
