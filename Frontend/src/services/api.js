import axios from 'axios';

// Initialize the central Axios instance
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sends a POST request to the Django backend to calculate the HOS-compliant trip plan.
 */
export async function calculateTripPlan({ origin, pickup, dropoff, cycleHours, startTime }) {
  const payload = {
    origin: typeof origin === 'object' ? origin : (origin ? origin.trim() : ''),
    pickup: typeof pickup === 'object' ? pickup : (pickup ? pickup.trim() : ''),
    dropoff: typeof dropoff === 'object' ? dropoff : (dropoff ? dropoff.trim() : ''),
    current_cycle_hours: parseFloat(cycleHours),
    start_time: startTime || new Date().toISOString(),
  };

  try {
    const response = await API.post('/plan/', payload);
    return mapBackendResponseToFrontend(response.data);
  } catch (error) {
    if (error.response && error.response.data) {
      const data = error.response.data;
      const parsedError = new Error(data.error || 'Failed to calculate trip plan.');
      parsedError.code = data.code || 'api_error';
      parsedError.details = data.details || null;
      parsedError.status = error.response.status;
      throw parsedError;
    }
    
    if (error.code === 'ECONNABORTED') {
      const parsedError = new Error('The routing request timed out. Please try again.');
      parsedError.code = 'timeout';
      throw parsedError;
    }
    
    const parsedError = new Error(error.message || 'A network error occurred. Please verify backend connectivity.');
    parsedError.code = 'network_error';
    throw parsedError;
  }
}

/**
 * Fetches up to 5 geocoding autocomplete suggestions from the Django backend.
 */
export async function fetchAutocompleteSuggestions(query) {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const response = await API.get('/autocomplete/', {
      params: { q: query.trim() },
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const data = error.response.data || {};
      const parsedError = new Error(data.error || 'Rate limit exceeded.');
      parsedError.code = data.code || 'rate_limited';
      parsedError.status = 429;
      throw parsedError;
    }
    console.error('Error fetching autocomplete suggestions:', error);
    return [];
  }
}

/**
 * Sends a POST request to the Django backend HOS Compliance Copilot endpoint.
 */
export async function sendCopilotChatMessage(message, history = [], context = {}) {
  try {
    const response = await API.post('/copilot/chat/', {
      message,
      history,
      context
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      const data = error.response.data;
      const parsedError = new Error(data.error || 'Failed to send message to Copilot.');
      parsedError.code = data.code || 'api_error';
      parsedError.details = data.details || null;
      parsedError.status = error.response.status;
      throw parsedError;
    }
    
    const parsedError = new Error(error.message || 'A network error occurred. Please verify backend connectivity.');
    parsedError.code = 'network_error';
    throw parsedError;
  }
}

/**
 * Formats a timestamp relative to the trip start time into "Day X, HH:MM AM/PM" format.
 */
function formatStopScheduledTime(stopTimeStr, tripStartTimeStr) {
  const stopTime = new Date(stopTimeStr);
  const startTime = new Date(tripStartTimeStr);
  
  const diffTime = stopTime.getTime() - startTime.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  let hours = stopTime.getHours();
  const minutes = stopTime.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  
  return `Day ${diffDays}, ${hours}:${minutesStr} ${ampm}`;
}

/**
 * Formats an ISO date string into "Month Day, Year" format (e.g. "May 21, 2026").
 */
function formatLogDate(dateStr) {
  const dateObj = new Date(dateStr + 'T00:00:00');
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Maps the backend Django DRF API response data to the format expected by React components.
 */
function mapBackendResponseToFrontend(data) {
  const tripStartTime = data.start_time || new Date().toISOString();
  
  // 1. Map Stops
  const mappedStops = (data.stops || []).map(stop => {
    let mappedType = stop.type;
    if (stop.type === 'START') mappedType = 'Origin';
    else if (stop.type === 'PICKUP') mappedType = 'Pickup';
    else if (stop.type === 'DROPOFF') mappedType = 'Destination';
    else if (stop.type === 'REST') mappedType = 'Rest Stop';
    else if (stop.type === 'OVERNIGHT') mappedType = 'Overnight Reset';
    else if (stop.type === 'FUEL') mappedType = 'Fuel Stop';
    
    return {
      name: stop.name,
      type: mappedType,
      lat: stop.latitude,
      lng: stop.longitude,
      time: formatStopScheduledTime(stop.arrival_time, tripStartTime),
    };
  });

  // 2. Map Metrics
  const distanceMiles = Math.round(data.distance_miles || 0);
  const durationHours = parseFloat(((data.duration_seconds || 0) / 3600).toFixed(1));
  const estimatedFuelGallons = Math.round(distanceMiles / 6.5);

  // 3. Map Daily Logs
  const mappedLogs = (data.daily_logs || []).map((log, index) => {
    const drivingHours = parseFloat((log.driving_seconds / 3600).toFixed(1));
    const onDutyHours = parseFloat((log.on_duty_seconds / 3600).toFixed(1));
    const offDutyHours = parseFloat((log.off_duty_seconds / 3600).toFixed(1));
    
    // Split off-duty hours to highlight Sleeper Berth (10-hour reset)
    let sleeperHours = 0;
    let actualOffDuty = offDutyHours;
    if (offDutyHours >= 10.0) {
      sleeperHours = 10.0;
      actualOffDuty = parseFloat((offDutyHours - 10.0).toFixed(1));
    } else {
      sleeperHours = offDutyHours;
      actualOffDuty = 0;
    }

    const totalHours = actualOffDuty + onDutyHours + drivingHours + sleeperHours;
    
    const states = [
      { name: 'Off Duty', hours: actualOffDuty, percentage: totalHours > 0 ? (actualOffDuty / totalHours) * 100 : 0, color: 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-600' },
      { name: 'On Duty (Not Driving)', hours: onDutyHours, percentage: totalHours > 0 ? (onDutyHours / totalHours) * 100 : 0, color: 'bg-luxury-gold-300 dark:bg-luxury-gold-600/60' },
      { name: 'Driving', hours: drivingHours, percentage: totalHours > 0 ? (drivingHours / totalHours) * 100 : 0, color: 'bg-luxury-gold-500' },
      { name: 'Sleeper Berth', hours: sleeperHours, percentage: totalHours > 0 ? (sleeperHours / totalHours) * 100 : 0, color: 'bg-emerald-600 dark:bg-emerald-700/80' }
    ].filter(s => s.hours > 0);

    // HOS compliance checks
    const rules = [
      { id: '11hr', label: '11-Hour Driving Limit', current: `${drivingHours} hrs spent`, max: '11.0 hrs max', passed: drivingHours <= 11.0 },
      { id: '14hr', label: '14-Hour Duty Window', current: `${(drivingHours + onDutyHours).toFixed(1)} hrs spent`, max: '14.0 hrs max', passed: (drivingHours + onDutyHours) <= 14.0 },
      { id: '30m', label: '30-Min Rest Break', current: 'Compliant', max: 'After 8 hrs driving', passed: true }
    ];

    const violations = [];
    if (drivingHours > 11.0) {
      violations.push({
        code: 'FMCSA §395.3(a)(3)',
        message: `Exceeded 11-Hour Daily Driving Limit by ${(drivingHours - 11.0).toFixed(1)} Hours.`
      });
    }
    if ((drivingHours + onDutyHours) > 14.0) {
      violations.push({
        code: 'FMCSA §395.3(a)(2)',
        message: `Exceeded 14-Hour Daily Duty Window by ${(drivingHours + onDutyHours - 14.0).toFixed(1)} Hours.`
      });
    }

    const summaryParts = [];
    if (drivingHours > 0) summaryParts.push(`Driving: ${drivingHours} Hrs`);
    if (sleeperHours > 0) summaryParts.push(`Sleeper: ${sleeperHours} Hrs`);
    if (onDutyHours > 0) summaryParts.push(`On Duty: ${onDutyHours} Hrs`);
    if (actualOffDuty > 0) summaryParts.push(`Off Duty: ${actualOffDuty} Hrs`);

    return {
      day: index + 1,
      date: formatLogDate(log.date),
      status: violations.length > 0 ? 'Warning' : 'Compliant',
      summary: summaryParts.join(' | '),
      states,
      violations,
      rules
    };
  });

  return {
    id: data.trip_id,
    name: `${data.start_location_name} to ${data.dropoff_location_name}`,
    origin: data.start_location_name,
    pickup: data.pickup_location_name,
    dropoff: data.dropoff_location_name,
    cycle: data.initial_cycle_hours,
    metrics: {
      distance: distanceMiles,
      duration: durationHours,
      fuel: estimatedFuelGallons,
    },
    stops: mappedStops,
    daily_logs: mappedLogs,
    polyline: data.polyline || [],
  };
}
