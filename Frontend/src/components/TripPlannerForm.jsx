import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Clock, Sparkles, AlertCircle } from 'lucide-react';
import AutocompleteInput from './AutocompleteInput';

const PRESET_ROUTES = [
  {
    id: 'la-dallas',
    name: 'Southern Freight Corridor',
    origin: 'Los Angeles Port, CA',
    pickup: 'Phoenix Hub, AZ',
    dropoff: 'Dallas DFW Logistics, TX',
    cycle: 70
  },
  {
    id: 'chicago-atlanta',
    name: 'Midwest-Southeast Lane',
    origin: 'Chicago Yards, IL',
    pickup: 'Indianapolis Center, IN',
    dropoff: 'Atlanta Hub, GA',
    cycle: 60
  },
  {
    id: 'seattle-denver',
    name: 'Northwest Mountain Pass',
    origin: 'Seattle Port, WA',
    pickup: 'Boise Warehouse, ID',
    dropoff: 'Denver Terminal, CO',
    cycle: 65
  }
];

const PRESET_LOCATIONS = [
  'Los Angeles Port, CA',
  'Phoenix Hub, AZ',
  'Dallas DFW Logistics, TX',
  'Chicago Yards, IL',
  'Indianapolis Center, IN',
  'Atlanta Hub, GA',
  'Seattle Port, WA',
  'Boise Warehouse, ID',
  'Denver Terminal, CO',
  'Los Angeles',
  'Phoenix',
  'Dallas',
  'Chicago',
  'Indianapolis',
  'Atlanta',
  'Seattle',
  'Boise',
  'Denver'
];

const shakeVariants = {
  shake: {
    x: [0, -6, 6, -6, 6, 0],
    transition: { duration: 0.4 }
  },
  idle: { x: 0 }
};

export default function TripPlannerForm({ onPlanRoute, isSubmitting, apiError, onClearErrors, onRateLimit, rateLimitCountdown }) {
  const [origin, setOrigin] = useState(PRESET_ROUTES[0].origin);
  const [pickup, setPickup] = useState(PRESET_ROUTES[0].pickup);
  const [dropoff, setDropoff] = useState(PRESET_ROUTES[0].dropoff);
  const [cycleHours, setCycleHours] = useState(70);
  
  const [touched, setTouched] = useState({
    origin: false,
    pickup: false,
    dropoff: false,
    cycle: false
  });
  const [showAllErrors, setShowAllErrors] = useState(false);

  // Shared query cache and tracking of selected suggestion values
  const queryCache = useRef({});
  const lastSelectedValues = useRef({
    origin: PRESET_ROUTES[0].origin,
    pickup: PRESET_ROUTES[0].pickup,
    dropoff: PRESET_ROUTES[0].dropoff
  });

  // Clear API errors from parent when the user updates input fields
  const handleInputChange = (field, value, setter) => {
    setter(value);
    setTouched(prev => ({ ...prev, [field]: true }));
    if (onClearErrors) {
      onClearErrors();
    }
  };

  // Perform client-side input validation
  const getValidationErrors = (originVal, pickupVal, dropoffVal, cycleVal) => {
    const errs = {};
    const trimmedOrigin = (originVal || '').trim();
    const trimmedPickup = (pickupVal || '').trim();
    const trimmedDropoff = (dropoffVal || '').trim();

    const isValidatedLocation = (val, field) => {
      if (!val) return false;
      const lowerVal = val.trim().toLowerCase();
      const isPreset = PRESET_LOCATIONS.some(p => p.toLowerCase() === lowerVal);
      const isLastSelected = lastSelectedValues.current[field] && lastSelectedValues.current[field].trim().toLowerCase() === lowerVal;
      return isPreset || isLastSelected;
    };

    // Empty field validations
    if (!trimmedOrigin) {
      errs.origin = 'Origin location description is required.';
    } else if (trimmedOrigin.length < 2) {
      errs.origin = 'Location must be at least 2 characters.';
    } else if (/^\d+$/.test(trimmedOrigin)) {
      errs.origin = 'Origin cannot consist of numbers only.';
    } else if (!isValidatedLocation(trimmedOrigin, 'origin')) {
      errs.origin = 'Please select a location from the dropdown suggestions.';
    }

    if (!trimmedPickup) {
      errs.pickup = 'Pickup location is required.';
    } else if (trimmedPickup.length < 2) {
      errs.pickup = 'Location must be at least 2 characters.';
    } else if (/^\d+$/.test(trimmedPickup)) {
      errs.pickup = 'Pickup cannot consist of numbers only.';
    } else if (!isValidatedLocation(trimmedPickup, 'pickup')) {
      errs.pickup = 'Please select a location from the dropdown suggestions.';
    }

    if (!trimmedDropoff) {
      errs.dropoff = 'Dropoff destination is required.';
    } else if (trimmedDropoff.length < 2) {
      errs.dropoff = 'Location must be at least 2 characters.';
    } else if (/^\d+$/.test(trimmedDropoff)) {
      errs.dropoff = 'Dropoff cannot consist of numbers only.';
    } else if (!isValidatedLocation(trimmedDropoff, 'dropoff')) {
      errs.dropoff = 'Please select a location from the dropdown suggestions.';
    }

    // Impossible location validation (e.g. identical entries)
    if (trimmedOrigin && trimmedPickup && trimmedOrigin.toLowerCase() === trimmedPickup.toLowerCase()) {
      errs.pickup = 'Pickup location cannot be identical to the origin location.';
    }
    if (trimmedPickup && trimmedDropoff && trimmedPickup.toLowerCase() === trimmedDropoff.toLowerCase()) {
      errs.dropoff = 'Dropoff location cannot be identical to the pickup location.';
    }
    if (trimmedOrigin && trimmedDropoff && trimmedOrigin.toLowerCase() === trimmedDropoff.toLowerCase()) {
      errs.dropoff = 'Dropoff location cannot be identical to the origin location.';
    }

    // Available cycle hours validation
    const parsedHours = Number(cycleVal);
    if (cycleVal === '' || isNaN(parsedHours)) {
      errs.cycle = 'Cycle hours are required and must be a valid number.';
    } else if (parsedHours < 0.0) {
      errs.cycle = 'Cycle hours cannot be negative.';
    } else if (parsedHours > 70.0) {
      errs.cycle = 'Cycle hours cannot exceed the legal FMCSA limit of 70 hours.';
    }

    return errs;
  };

  const clientErrors = getValidationErrors(origin, pickup, dropoff, cycleHours);
  const isFormValid = Object.keys(clientErrors).length === 0;

  // Retrieve matching field error (prioritizes client-side validation, falls back to backend serialization details)
  const getFieldError = (field) => {
    if (showAllErrors || touched[field]) {
      if (clientErrors[field]) return clientErrors[field];
      
      // Map current_cycle_hours backend key to cycle field
      const apiField = field === 'cycle' ? 'current_cycle_hours' : field;
      if (apiError && apiError.details && apiError.details[apiField]) {
        const err = apiError.details[apiField];
        return Array.isArray(err) ? err[0] : String(err);
      }
    }
    return null;
  };

  const handlePresetSelect = (preset) => {
    if (isSubmitting) return;
    lastSelectedValues.current.origin = preset.origin;
    lastSelectedValues.current.pickup = preset.pickup;
    lastSelectedValues.current.dropoff = preset.dropoff;
    setOrigin(preset.origin);
    setPickup(preset.pickup);
    setDropoff(preset.dropoff);
    setCycleHours(preset.cycle);
    
    // Reset validation states
    setTouched({ origin: false, pickup: false, dropoff: false, cycle: false });
    setShowAllErrors(false);
    if (onClearErrors) onClearErrors();

    onPlanRoute({
      origin: preset.origin,
      pickup: preset.pickup,
      dropoff: preset.dropoff,
      cycleHours: preset.cycle
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowAllErrors(true);

    if (!isFormValid) {
      // Trigger touched for all inputs to show validation visual feedback
      setTouched({ origin: true, pickup: true, dropoff: true, cycle: true });
      return;
    }

    onPlanRoute({ origin, pickup, dropoff, cycleHours });
  };

  const originError = getFieldError('origin');
  const pickupError = getFieldError('pickup');
  const dropoffError = getFieldError('dropoff');
  const cycleError = getFieldError('cycle');

  return (
    <div className="flex flex-col space-y-8">
      
      {/* Preset Lane Selector */}
      <div className="space-y-3">
        <label className="text-xs uppercase tracking-wider text-luxury-charcoal-400 dark:text-luxury-ivory-400 font-semibold block">
          Preset Shipping Corridors
        </label>
        <div className="grid grid-cols-1 gap-2">
          {PRESET_ROUTES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => handlePresetSelect(preset)}
              className={`w-full text-left p-3.5 rounded-xl border border-luxury-ivory-200 dark:border-luxury-charcoal-700/60 bg-white/45 dark:bg-luxury-charcoal-800/40 hover:border-luxury-gold-500/30 hover:bg-white/80 dark:hover:bg-luxury-charcoal-850/50 hover:shadow-premium-light dark:hover:shadow-glow transition-all duration-300 flex items-center justify-between group ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div>
                <p className="text-xs font-semibold text-luxury-charcoal-900 dark:text-white group-hover:text-luxury-gold-600 dark:group-hover:text-luxury-gold-400 transition-colors">
                  {preset.name}
                </p>
                <p className="text-[10px] text-luxury-charcoal-400 dark:text-luxury-charcoal-400 font-light mt-0.5">
                  {preset.origin} → {preset.dropoff}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-semibold text-luxury-charcoal-400 dark:text-luxury-charcoal-400 tracking-wider group-hover:text-luxury-gold-500 transition-colors">
                  Calculate
                </span>
                <div className="w-5 h-5 rounded-full border border-luxury-ivory-300 dark:border-luxury-charcoal-600 flex items-center justify-center text-luxury-charcoal-400 group-hover:border-luxury-gold-500 group-hover:bg-luxury-gold-500 group-hover:text-white transition-all">
                  →
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/50"></div>
        <span className="flex-shrink mx-4 text-[10px] uppercase tracking-widest text-luxury-charcoal-450 font-bold">Or Configure Custom Lane</span>
        <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/50"></div>
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
             {/* Origin */}
        <AutocompleteInput
          label="Driver Location (Origin)"
          value={origin}
          onChange={(val) => handleInputChange('origin', val, setOrigin)}
          onSelectSuggestion={(suggestion) => {
            lastSelectedValues.current.origin = suggestion.name;
            setOrigin(suggestion.name);
          }}
          onClearErrors={onClearErrors}
          placeholder="e.g. Los Angeles Port, CA"
          disabled={isSubmitting}
          error={originError}
          icon={Navigation}
          queryCache={queryCache}
          isSubmitting={isSubmitting}
          presets={PRESET_LOCATIONS}
          rateLimitCountdown={rateLimitCountdown}
          onRateLimit={onRateLimit}
        />

        {/* Pickup */}
        <AutocompleteInput
          label="Pickup Hub"
          value={pickup}
          onChange={(val) => handleInputChange('pickup', val, setPickup)}
          onSelectSuggestion={(suggestion) => {
            lastSelectedValues.current.pickup = suggestion.name;
            setPickup(suggestion.name);
          }}
          onClearErrors={onClearErrors}
          placeholder="e.g. Phoenix Logistics Park, AZ"
          disabled={isSubmitting}
          error={pickupError}
          icon={MapPin}
          queryCache={queryCache}
          isSubmitting={isSubmitting}
          presets={PRESET_LOCATIONS}
          rateLimitCountdown={rateLimitCountdown}
          onRateLimit={onRateLimit}
        />

        {/* Dropoff */}
        <AutocompleteInput
          label="Final Dropoff Destination"
          value={dropoff}
          onChange={(val) => handleInputChange('dropoff', val, setDropoff)}
          onSelectSuggestion={(suggestion) => {
            lastSelectedValues.current.dropoff = suggestion.name;
            setDropoff(suggestion.name);
          }}
          onClearErrors={onClearErrors}
          placeholder="e.g. Dallas DFW Logistics, TX"
          disabled={isSubmitting}
          error={dropoffError}
          icon={MapPin}
          iconColorClass="text-red-500"
          queryCache={queryCache}
          isSubmitting={isSubmitting}
          presets={PRESET_LOCATIONS}
          rateLimitCountdown={rateLimitCountdown}
          onRateLimit={onRateLimit}
        />

        {/* Cycle Hours */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-luxury-charcoal-400 dark:text-luxury-ivory-400 font-semibold flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-luxury-gold-500" />
            <span>Driver Available Cycle Hours</span>
          </label>
          <div className="flex items-center gap-3">
            <motion.div
              animate={cycleError ? "shake" : "idle"}
              variants={shakeVariants}
            >
              <input
                type="number"
                step="any"
                disabled={isSubmitting}
                value={cycleHours}
                onChange={(e) => handleInputChange('cycle', e.target.value === '' ? '' : Number(e.target.value), setCycleHours)}
                onBlur={() => setTouched(prev => ({ ...prev, cycle: true }))}
                placeholder="70"
                max="70"
                min="0"
                className={`w-28 py-3.5 px-4 rounded-xl bg-white/60 dark:bg-luxury-charcoal-900/60 border ${
                  cycleError ? 'border-red-500 dark:border-red-500/80 focus:ring-red-400' : 'border-luxury-ivory-200 dark:border-luxury-charcoal-700 focus:border-luxury-gold-500'
                } text-sm text-luxury-charcoal-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-luxury-gold-500 transition-all duration-300 ${
                  isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              />
            </motion.div>
            <span className="text-xs text-luxury-charcoal-400 dark:text-luxury-charcoal-400">
              Hours remaining on 8-Day Cycle
            </span>
          </div>
          <AnimatePresence>
            {cycleError && (
              <motion.p
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                className="text-[11px] text-red-500 flex items-center gap-1 mt-1 font-light"
              >
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span>{cycleError}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Submit Button */}
        <motion.button
          whileHover={isFormValid && !isSubmitting && !(rateLimitCountdown > 0) ? { scale: 1.01 } : {}}
          whileTap={isFormValid && !isSubmitting && !(rateLimitCountdown > 0) ? { scale: 0.99 } : {}}
          type="submit"
          disabled={!isFormValid || isSubmitting || rateLimitCountdown > 0}
          className={`w-full mt-4 py-4 rounded-xl text-xs font-semibold tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 ${
            !isFormValid || isSubmitting || rateLimitCountdown > 0
              ? 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-700/50 text-luxury-charcoal-400 dark:text-luxury-charcoal-500 cursor-not-allowed border border-transparent'
              : 'bg-luxury-gold-500 text-luxury-charcoal-950 hover:bg-luxury-gold-600 hover:text-white dark:hover:bg-luxury-gold-400 shadow-premium-light dark:shadow-glow'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="h-3.5 w-3.5 border-2 border-luxury-charcoal-950 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing Lane Telemetry...</span>
            </>
          ) : rateLimitCountdown > 0 ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-red-500 animate-pulse" />
              <span>Cooldown Active ({rateLimitCountdown}s)</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>Compute Optimal Schedule</span>
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}
