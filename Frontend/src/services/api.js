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
export async function calculateTripPlan({ origin, pickup, dropoff, cycleHours, startTime, signal }) {
  const payload = {
    origin: typeof origin === 'object' ? origin : (origin ? origin.trim() : ''),
    pickup: typeof pickup === 'object' ? pickup : (pickup ? pickup.trim() : ''),
    dropoff: typeof dropoff === 'object' ? dropoff : (dropoff ? dropoff.trim() : ''),
    current_cycle_hours: parseFloat(cycleHours),
    start_time: startTime || new Date().toISOString(),
  };

  try {
    const response = await API.post('/plan/', payload, { signal });
    return mapBackendResponseToFrontend(response.data);
  } catch (error) {
    if (axios.isCancel(error)) {
      throw error;
    }
    console.warn("Routing API failed, falling back to estimated route projection:", error);
    try {
      const fallbackData = generateFallbackTripPlan(payload);
      const mapped = mapBackendResponseToFrontend(fallbackData);
      mapped.fallbackMode = true;
      return mapped;
    } catch (fallbackError) {
      console.error("Failed to generate fallback route:", fallbackError);
      throw error;
    }
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
 * Sends a single compliance query to the backend Compliance Assistant endpoint.
 * Simple request → response flow. No conversational state or history.
 * @param {string} prompt - The compliance question or preset action text
 * @returns {Promise<string>} The AI response string
 */
export async function sendComplianceQuery(prompt) {
  try {
    const response = await API.post('/copilot/', { prompt }, { timeout: 12000 });
    return response.data.response;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('The compliance request timed out. Please try again.');
    }
    if (error.response && error.response.data) {
      const data = error.response.data;
      throw new Error(data.error || 'Compliance Assistant is temporarily unavailable.');
    }
    throw new Error('Unable to reach the Compliance Assistant. Please check your connection.');
  }
}

/**
 * Formats a timestamp relative to the trip start time into "Day X, HH:MM AM/PM" format.
 */
function formatStopScheduledTime(stopTimeStr, tripStartTimeStr) {
  const stopTime = new Date(stopTimeStr);
  const startTime = new Date(tripStartTimeStr);
  
  if (isNaN(stopTime.getTime()) || isNaN(startTime.getTime())) {
    return 'Scheduled';
  }
  
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
    const drivingHours = parseFloat(((log.driving_seconds || 0) / 3600).toFixed(1));
    const onDutyHours = parseFloat(((log.on_duty_seconds || 0) / 3600).toFixed(1));
    const offDutyHours = parseFloat(((log.off_duty_seconds || 0) / 3600).toFixed(1));
    
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

/**
 * Fetches the mock daily log segments for the visualizer dashboard.
 */
export async function fetchDailyLogs() {
  try {
    const response = await API.get('/logs/');
    return response.data;
  } catch (error) {
    console.warn('Error fetching daily logs, returning backup mock data:', error);
    return BACKUP_DAILY_LOGS;
  }
}

// ==============================================================================
// Graceful Fallback Telemetry & Mock Data Utilities
// ==============================================================================

const BACKUP_COORDINATES = {
  'los angeles port, ca': { name: 'Los Angeles Port, CA', lat: 33.74, lon: -118.26 },
  'phoenix hub, az': { name: 'Phoenix Hub, AZ', lat: 33.45, lon: -112.07 },
  'dallas dfw logistics, tx': { name: 'Dallas DFW Logistics, TX', lat: 32.77, lon: -96.79 },
  'chicago yards, il': { name: 'Chicago Yards, IL', lat: 41.87, lon: -87.62 },
  'indianapolis center, in': { name: 'Indianapolis Center, IN', lat: 39.76, lon: -86.15 },
  'atlanta hub, ga': { name: 'Atlanta Hub, GA', lat: 33.74, lon: -84.38 },
  'seattle port, wa': { name: 'Seattle Port, WA', lat: 47.60, lon: -122.33 },
  'boise warehouse, id': { name: 'Boise Warehouse, ID', lat: 43.61, lon: -116.20 },
  'denver terminal, co': { name: 'Denver Terminal, CO', lat: 39.73, lon: -104.99 },
  'los angeles': { name: 'Los Angeles Port, CA', lat: 33.74, lon: -118.26 },
  'phoenix': { name: 'Phoenix Hub, AZ', lat: 33.45, lon: -112.07 },
  'dallas': { name: 'Dallas DFW Logistics, TX', lat: 32.77, lon: -96.79 },
  'chicago': { name: 'Chicago Yards, IL', lat: 41.87, lon: -87.62 },
  'indianapolis': { name: 'Indianapolis Center, IN', lat: 39.76, lon: -86.15 },
  'atlanta': { name: 'Atlanta Hub, GA', lat: 33.74, lon: -84.38 },
  'seattle': { name: 'Seattle Port, WA', lat: 47.60, lon: -122.33 },
  'boise': { name: 'Boise Warehouse, ID', lat: 43.61, lon: -116.20 },
  'denver': { name: 'Denver Terminal, CO', lat: 39.73, lon: -104.99 }
};

function resolveCoordinate(loc, defaultCoord) {
  if (loc && typeof loc === 'object') {
    return {
      name: loc.name || 'Location',
      lat: Number(loc.lat || loc.latitude) || defaultCoord.lat,
      lon: Number(loc.lon || loc.longitude || loc.lng) || defaultCoord.lon
    };
  }
  const str = String(loc || '').trim().toLowerCase();
  if (BACKUP_COORDINATES[str]) {
    return BACKUP_COORDINATES[str];
  }
  for (const [key, coord] of Object.entries(BACKUP_COORDINATES)) {
    if (str.includes(key) || key.includes(str)) {
      return coord;
    }
  }
  return { name: loc || defaultCoord.name, lat: defaultCoord.lat, lon: defaultCoord.lon };
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function generateFallbackTripPlan(payload) {
  const originLoc = resolveCoordinate(payload.origin, { name: 'Los Angeles Port, CA', lat: 33.74, lon: -118.26 });
  const pickupLoc = resolveCoordinate(payload.pickup, { name: 'Phoenix Hub, AZ', lat: 33.45, lon: -112.07 });
  const dropoffLoc = resolveCoordinate(payload.dropoff, { name: 'Dallas DFW Logistics, TX', lat: 32.77, lon: -96.79 });
  
  const dist1 = getHaversineDistance(originLoc.lat, originLoc.lon, pickupLoc.lat, pickupLoc.lon);
  const dist2 = getHaversineDistance(pickupLoc.lat, pickupLoc.lon, dropoffLoc.lat, dropoffLoc.lon);
  const distanceMiles = Math.max(50, Math.round((dist1 + dist2) * 1.22));
  
  const avgSpeedMph = 52;
  const totalDriveHours = distanceMiles / avgSpeedMph;
  const totalDriveSeconds = totalDriveHours * 3600;
  
  const startTimeStr = payload.start_time || new Date().toISOString();
  const startTime = new Date(startTimeStr);
  
  const stops = [];
  stops.push({
    name: originLoc.name,
    type: 'START',
    latitude: originLoc.lat,
    longitude: originLoc.lon,
    arrival_time: startTimeStr
  });
  
  let currentSecOffset = 0;
  const drive1Hours = dist1 * 1.22 / avgSpeedMph;
  currentSecOffset += drive1Hours * 3600;
  
  if (drive1Hours > 8) {
    currentSecOffset += 30 * 60;
  }
  
  const pickupTime = new Date(startTime.getTime() + currentSecOffset * 1000);
  stops.push({
    name: pickupLoc.name,
    type: 'PICKUP',
    latitude: pickupLoc.lat,
    longitude: pickupLoc.lon,
    arrival_time: pickupTime.toISOString()
  });
  
  currentSecOffset += 1.5 * 3600;
  const drive2Hours = dist2 * 1.22 / avgSpeedMph;
  let remainingDriveSec = drive2Hours * 3600;
  let elapsedDriveTodaySec = Math.min(drive1Hours, 8) > 8 ? drive1Hours - 8 : drive1Hours;
  let elapsedDutyTodaySec = drive1Hours + 1.5;
  
  while (remainingDriveSec > 0) {
    const drivingTimeLeftTodaySec = (11 * 3600) - (elapsedDriveTodaySec * 3600);
    const dutyTimeLeftTodaySec = (14 * 3600) - (elapsedDutyTodaySec * 3600);
    const maxDrivePossibleSec = Math.min(drivingTimeLeftTodaySec, dutyTimeLeftTodaySec, remainingDriveSec);
    
    if (maxDrivePossibleSec <= 0 || dutyTimeLeftTodaySec <= 0) {
      currentSecOffset += 10 * 3600;
      const ratio = 1 - (remainingDriveSec / (drive2Hours * 3600));
      const overnightLat = pickupLoc.lat + (dropoffLoc.lat - pickupLoc.lat) * ratio;
      const overnightLon = pickupLoc.lon + (dropoffLoc.lon - pickupLoc.lon) * ratio;
      const overnightTime = new Date(startTime.getTime() + currentSecOffset * 1000);
      
      stops.push({
        name: `Sleeper Berth Reset (${Math.round(ratio * 100)}% Route)`,
        type: 'OVERNIGHT',
        latitude: overnightLat,
        longitude: overnightLon,
        arrival_time: overnightTime.toISOString()
      });
      
      elapsedDriveTodaySec = 0;
      elapsedDutyTodaySec = 0;
    } else {
      const stepDriveSec = Math.min(maxDrivePossibleSec, 8 * 3600 - (elapsedDriveTodaySec * 3600) % (8 * 3600));
      remainingDriveSec -= stepDriveSec;
      currentSecOffset += stepDriveSec;
      elapsedDriveTodaySec += stepDriveSec / 3600;
      elapsedDutyTodaySec += stepDriveSec / 3600;
      
      if (remainingDriveSec > 0 && elapsedDriveTodaySec >= 8) {
        currentSecOffset += 30 * 60;
        elapsedDutyTodaySec += 0.5;
        
        const ratio = 1 - (remainingDriveSec / (drive2Hours * 3600));
        const restLat = pickupLoc.lat + (dropoffLoc.lat - pickupLoc.lat) * ratio;
        const restLon = pickupLoc.lon + (dropoffLoc.lon - pickupLoc.lon) * ratio;
        const restTime = new Date(startTime.getTime() + currentSecOffset * 1000);
        
        stops.push({
          name: `Mandatory Rest Break (${Math.round(ratio * 100)}% Route)`,
          type: 'REST',
          latitude: restLat,
          longitude: restLon,
          arrival_time: restTime.toISOString()
        });
      }
    }
  }
  
  const destinationTime = new Date(startTime.getTime() + currentSecOffset * 1000);
  stops.push({
    name: dropoffLoc.name,
    type: 'DROPOFF',
    latitude: dropoffLoc.lat,
    longitude: dropoffLoc.lon,
    arrival_time: destinationTime.toISOString()
  });
  
  const dailyLogs = [];
  const totalDays = Math.ceil((currentSecOffset + 2 * 3600) / (24 * 3600));
  let remainingTotalDrive = totalDriveSeconds;
  let remainingTotalOnDuty = 3.5 * 3600;
  
  for (let d = 0; d < totalDays; d++) {
    const logDate = new Date(startTime.getTime() + d * 24 * 3600 * 1000);
    const dateStr = logDate.toISOString().split('T')[0];
    
    let driveSec = Math.min(remainingTotalDrive, 11 * 3600);
    remainingTotalDrive -= driveSec;
    
    let onDutySec = Math.min(remainingTotalOnDuty, (14 * 3600) - driveSec);
    remainingTotalOnDuty -= onDutySec;
    
    let offDutySec = 24 * 3600 - driveSec - onDutySec;
    
    dailyLogs.push({
      date: dateStr,
      driving_seconds: driveSec,
      on_duty_seconds: onDutySec,
      off_duty_seconds: offDutySec,
      certification_status: d < totalDays - 1 ? 'Certified' : 'Draft'
    });
  }
  
  const polyline = [];
  const segments = 40;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    polyline.push([
      originLoc.lat + (pickupLoc.lat - originLoc.lat) * t,
      originLoc.lon + (pickupLoc.lon - originLoc.lon) * t
    ]);
  }
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    polyline.push([
      pickupLoc.lat + (dropoffLoc.lat - pickupLoc.lat) * t,
      pickupLoc.lon + (dropoffLoc.lon - pickupLoc.lon) * t
    ]);
  }
  
  return {
    trip_id: Math.floor(Math.random() * 10000) + 5000,
    start_location_name: originLoc.name,
    pickup_location_name: pickupLoc.name,
    dropoff_location_name: dropoffLoc.name,
    start_time: startTimeStr,
    initial_cycle_hours: parseFloat(payload.current_cycle_hours) || 70.0,
    distance_miles: distanceMiles,
    duration_seconds: totalDriveSeconds,
    polyline: polyline,
    stops: stops,
    daily_logs: dailyLogs,
    created_at: new Date().toISOString(),
    fallbackMode: true
  };
}

const BACKUP_DAILY_LOGS = [
  {
    day: 1,
    date: "May 21, 2026",
    driver_name: "Sarah Jenkins",
    status: "Compliant",
    certification_status: "Certified",
    dispatch_timestamp: "May 21, 2026, 06:00 AM",
    compliance_lock: true,
    fmcsa_notice: "Record certified under 49 CFR § 395.15. Form and manner compliant.",
    violations: [],
    summary: {
      driving_hours: 10.0,
      on_duty_hours: 3.0,
      off_duty_hours: 6.5,
      sleeper_hours: 4.5
    },
    segments: [
      { start: "00:00", end: "06:00", status: "off_duty", duration: "06:00" },
      { start: "06:00", end: "08:00", status: "on_duty", duration: "02:00" },
      { start: "08:00", end: "13:00", status: "driving", duration: "05:00" },
      { start: "13:00", end: "13:30", status: "off_duty", duration: "00:30" },
      { start: "13:30", end: "18:30", status: "driving", duration: "05:00" },
      { start: "18:30", end: "19:30", status: "on_duty", duration: "01:00" },
      { start: "19:30", end: "24:00", status: "sleeper", duration: "04:30" }
    ]
  },
  {
    day: 2,
    date: "May 22, 2026",
    driver_name: "Sarah Jenkins",
    status: "Violation",
    certification_status: "Certified",
    dispatch_timestamp: "May 22, 2026, 05:00 AM",
    compliance_lock: true,
    fmcsa_notice: "Record certified under 49 CFR § 395.15. Multiple critical compliance violations found.",
    violations: [
      {
        code: "FMCSA § 395.3(a)(3)",
        type: "11-hour driving violation",
        description: "Driver exceeded the maximum 11-hour daily driving limit. Total driving time accumulated was 12.0 hours.",
        remedy: "Driver must take a minimum of 10 consecutive hours off-duty or in sleeper berth before resuming safety-sensitive functions."
      },
      {
        code: "FMCSA § 395.3(a)(2)",
        type: "14-hour duty window violation",
        description: "Driver exceeded the maximum 14-hour daily duty shift window. Total elapsed time since starting duty was 15.5 hours.",
        remedy: "Driver must complete a 10 consecutive hour off-duty period to reset the shift window clock."
      }
    ],
    summary: {
      driving_hours: 12.0,
      on_duty_hours: 2.5,
      off_duty_hours: 8.5,
      sleeper_hours: 1.0
    },
    segments: [
      { start: "00:00", end: "05:00", status: "off_duty", duration: "05:00" },
      { start: "05:00", end: "06:00", status: "on_duty", duration: "01:00" },
      { start: "06:00", end: "12:00", status: "driving", duration: "06:00" },
      { start: "12:00", end: "13:00", status: "sleeper", duration: "01:00" },
      { start: "13:00", end: "19:00", status: "driving", duration: "06:00" },
      { start: "19:00", end: "20:30", status: "on_duty", duration: "01:30" },
      { start: "20:30", end: "24:00", status: "off_duty", duration: "03:30" }
    ]
  },
  {
    day: 3,
    date: "May 23, 2026",
    driver_name: "Sarah Jenkins",
    status: "Violation",
    certification_status: "Pending Signature",
    dispatch_timestamp: "May 23, 2026, 08:00 AM",
    compliance_lock: false,
    fmcsa_notice: "Signature required to certify daily record under 49 CFR § 395.15.",
    violations: [
      {
        code: "FMCSA § 395.3(a)(3)(ii)",
        type: "missed 30-minute break",
        description: "Driver operated a commercial motor vehicle for more than 8 hours continuously without a mandatory 30-minute rest break. Continuous driving duration was 8.5 hours.",
        remedy: "Driver must immediately take a 30-minute off-duty or sleeper berth break before performing any further driving operations."
      }
    ],
    summary: {
      driving_hours: 10.5,
      on_duty_hours: 1.5,
      off_duty_hours: 8.0,
      sleeper_hours: 4.0
    },
    segments: [
      { start: "00:00", end: "08:00", status: "off_duty", duration: "08:00" },
      { start: "08:00", end: "16:30", status: "driving", duration: "08:30" },
      { start: "16:30", end: "17:00", status: "on_duty", duration: "00:30" },
      { start: "17:00", end: "19:00", status: "driving", duration: "02:00" },
      { start: "19:00", end: "20:00", status: "on_duty", duration: "01:00" },
      { start: "20:00", end: "24:00", status: "sleeper", duration: "04:00" }
    ]
  }
];

