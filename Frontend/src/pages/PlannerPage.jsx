import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TripPlannerForm from '../components/TripPlannerForm';
import MapExperience from '../components/MapExperience';
import RouteResults from '../components/RouteResults';
import HOSLogs from '../components/HOSLogs';
import { calculateTripPlan } from '../services/api';
import { Compass, FileText, ShieldAlert, RefreshCw } from 'lucide-react';

function SkeletonResults() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Route Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-luxury-ivory-200/30 dark:border-luxury-charcoal-700/30 bg-white/30 dark:bg-luxury-charcoal-900/30 flex flex-col space-y-3 shadow-premium-light dark:shadow-premium-dark">
            <div className="h-3 w-16 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md" />
            <div className="h-8 w-24 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md" />
            <div className="h-3.5 w-20 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md" />
          </div>
        ))}
      </div>

      {/* Driver stops timeline card */}
      <div className="p-6 md:p-8 rounded-3xl border border-luxury-ivory-200/30 dark:border-luxury-charcoal-700/30 bg-white/30 dark:bg-luxury-charcoal-900/30 shadow-premium-light dark:shadow-premium-dark">
        <div className="border-b border-luxury-ivory-200 dark:border-luxury-charcoal-750 pb-5 mb-8 space-y-2">
          <div className="h-6 w-56 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md" />
          <div className="h-4 w-96 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md max-w-full" />
        </div>

        {/* Vertical Timeline */}
        <div className="relative border-l border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 ml-3 pl-8 md:pl-10 space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative space-y-2">
              <div className="absolute -left-[42px] md:-left-[50px] top-1.5 w-6 h-6 rounded-full bg-luxury-ivory-300 dark:bg-luxury-charcoal-700" />
              <div className="h-3.5 w-16 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md" />
              <div className="h-5 w-64 bg-luxury-ivory-300 dark:bg-luxury-charcoal-700 rounded-md max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const [activeRoute, setActiveRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [lastParams, setLastParams] = useState(null);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' or 'logs'
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCountdown]);

  const handlePlanRoute = async ({ origin, pickup, dropoff, cycleHours }) => {
    setIsLoading(true);
    setApiError(null);
    setActiveRoute(null); // Clear previous route to prevent stale map drawing/lines
    const params = { origin, pickup, dropoff, cycleHours };
    setLastParams(params);

    try {
      const tripData = await calculateTripPlan(params);
      setActiveRoute(tripData);
    } catch (err) {
      console.error("API error planning route:", err);
      let message = 'An unexpected network error occurred. Please verify backend connectivity.';
      let details = null;
      
      if (err.details) {
        details = err.details;
      }
      
      if (err.message) {
        message = err.message;
      }

      const code = err.code || 'api_error';
      if (!err.message || err.message === 'Failed to calculate trip plan.') {
        if (code === 'service_unavailable') {
          message = 'Routing service temporarily unavailable';
        } else if (code === 'routing_failed') {
          message = 'Invalid route selected';
        } else if (code === 'rate_limited' || err.status === 429) {
          message = 'API limit reached, retry shortly';
        }
      } else {
        message = err.message;
      }

      if (err.status === 429 || code === 'rate_limited') {
        setRateLimitCountdown(30);
      }
      
      setApiError({
        message,
        code,
        details,
        status: err.status
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (rateLimitCountdown > 0) return;
    if (lastParams) {
      handlePlanRoute(lastParams);
    }
  };

  const handleClearErrors = () => {
    setApiError(null);
  };

  return (
    <div className="relative min-h-screen bg-luxury-ivory-50 dark:bg-luxury-charcoal-800 transition-colors duration-500 pt-28 pb-20 px-4 md:px-8">
      
      {/* Subtle Background Glows */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] rounded-full bg-luxury-gold-200/10 dark:bg-luxury-gold-950/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[30%] h-[30%] rounded-full bg-luxury-gold-250/10 dark:bg-luxury-gold-900/10 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-10 relative z-10">
        
        {/* Dashboard Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="border-b border-luxury-ivory-200 dark:border-luxury-charcoal-700/60 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <h1 className="font-serif text-3xl md:text-4xl text-luxury-charcoal-900 dark:text-white font-normal">
              Intelligent <span className="italic font-light text-luxury-gold-600 dark:text-luxury-gold-400">Scheduling Portal</span>
            </h1>
            <p className="text-xs md:text-sm text-luxury-charcoal-500 dark:text-luxury-charcoal-350 font-light mt-1">
              Optimize commercial routes, map waypoint telemetry, and inspect daily compliance metrics.
            </p>
          </div>
          
          {activeRoute && (
            <div className="flex items-center gap-3 bg-white/50 dark:bg-luxury-charcoal-900/40 border border-luxury-gold-500/25 px-4 py-2 rounded-full shadow-premium-light dark:shadow-glow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-luxury-charcoal-800 dark:text-luxury-ivory-300">
                Active Corridor: {activeRoute.name}
              </span>
            </div>
          )}
        </motion.div>

        {/* Core Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Config Form (4 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="lg:col-span-4 p-6 md:p-8 rounded-3xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/70 dark:bg-luxury-charcoal-900/55 backdrop-blur-md shadow-premium-light dark:shadow-premium-dark"
          >
            <div className="border-b border-luxury-ivory-200 dark:border-luxury-charcoal-750 pb-4 mb-6">
              <h2 className="font-serif text-xl text-luxury-charcoal-900 dark:text-white font-medium">Route Configuration</h2>
              <p className="text-[10px] text-luxury-charcoal-400 dark:text-luxury-charcoal-400 font-light mt-0.5">
                Set dispatch location parameters and remaining shift cycles.
              </p>
            </div>
            
            <TripPlannerForm 
              onPlanRoute={handlePlanRoute} 
              isSubmitting={isLoading}
              apiError={apiError}
              onClearErrors={handleClearErrors}
              rateLimitCountdown={rateLimitCountdown}
              onRateLimit={() => setRateLimitCountdown(30)}
            />
          </motion.div>

          {/* Right Column: Leaflet Map Visualizer (8 cols) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="lg:col-span-8"
          >
            <MapExperience 
              stops={activeRoute ? activeRoute.stops : []} 
              polyline={activeRoute ? activeRoute.polyline : []} 
            />
          </motion.div>

        </div>

        {/* Results Sections (Timeline & Daily logs, Loading, or Error states) */}
        <div className="space-y-8 relative">
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div
                key="loading-skeleton"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="space-y-8"
              >
                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/60"></div>
                  <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-widest text-luxury-gold-500 flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyzing Route Operations...</span>
                  </span>
                  <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/60"></div>
                </div>
                <SkeletonResults />
              </motion.div>
            )}

            {apiError && !isLoading && (
              <motion.div
                key="error-card"
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`p-6 md:p-8 rounded-3xl border backdrop-blur-md shadow-premium-light dark:shadow-premium-dark flex flex-col md:flex-row items-start md:items-center justify-between gap-6 ${
                  apiError.status === 429 || apiError.code === 'rate_limited'
                    ? 'border-luxury-gold-500/30 bg-luxury-gold-500/5 dark:bg-luxury-gold-950/10'
                    : 'border-red-500/30 dark:border-red-500/20 bg-white/90 dark:bg-luxury-charcoal-900/90'
                }`}
              >
                <div className="flex gap-5 items-start w-full md:w-auto">
                  <div className={`p-4 rounded-2xl flex-shrink-0 flex items-center justify-center ${
                    apiError.status === 429 || apiError.code === 'rate_limited'
                      ? 'bg-luxury-gold-500/10 text-luxury-gold-500'
                      : 'bg-red-500/10 dark:bg-red-500/20 text-red-500'
                  }`}>
                    <ShieldAlert className="h-6 w-6 animate-pulse" />
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                        Logistics Exception
                      </span>
                      <span className="text-[10px] text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-mono uppercase tracking-wider">
                        STATUS: REJECTED
                      </span>
                    </div>
                    <h3 className="font-serif text-lg text-luxury-charcoal-900 dark:text-white font-medium">
                      {apiError.status === 429 || apiError.code === 'rate_limited'
                        ? 'Rate Limit Cooldown Active'
                        : 'Commercial Freight Route Rejected'}
                    </h3>
                    <p className="text-xs text-luxury-charcoal-550 dark:text-luxury-charcoal-350 mt-1.5 max-w-xl font-light leading-relaxed">
                      {apiError.message}
                    </p>
                    
                    <div className="mt-4 pt-3.5 border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/50 text-[11px] text-luxury-charcoal-500 dark:text-luxury-charcoal-400">
                      <p className="font-semibold text-luxury-charcoal-700 dark:text-luxury-ivory-200 mb-1 flex items-center gap-1">
                        <span>Compliance Restrictions Applied:</span>
                      </p>
                      <ul className="list-disc pl-5 space-y-1 font-light">
                        <li>All straight-line polyline rendering fallbacks are strictly disabled.</li>
                        <li>Routing telemetry requires continuous road path coordinates.</li>
                        <li>Marine transitions (ocean crossings/ferry corridors) are rejected.</li>
                        <li>Validation requires realistic driving distances and segment counts.</li>
                      </ul>
                    </div>
                    
                    {(apiError.status === 429 || apiError.code === 'rate_limited') && rateLimitCountdown > 0 && (
                      <div className="mt-4 max-w-md">
                        <div className="flex justify-between text-[9px] uppercase tracking-wider font-semibold text-luxury-gold-600 dark:text-luxury-gold-400 mb-1">
                          <span>Circuit Breaker Active</span>
                          <span>{rateLimitCountdown}s Remaining</span>
                        </div>
                        <div className="w-full bg-luxury-ivory-300 dark:bg-luxury-charcoal-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-luxury-gold-500 h-full transition-all duration-1000 ease-linear" 
                            style={{ width: `${(rateLimitCountdown / 30) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {apiError.details && typeof apiError.details === 'object' && Object.keys(apiError.details).length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-red-700 dark:text-red-300">Validation Details:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1 text-[11px] text-red-650 dark:text-red-400 font-light">
                          {Object.entries(apiError.details).map(([field, msgs]) => (
                            <li key={field}>
                              <span className="font-semibold uppercase tracking-wider text-[9px] mr-1">{field.replace('_', ' ')}:</span>
                              {Array.isArray(msgs) ? msgs.join(' ') : String(msgs)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleRetry}
                  disabled={rateLimitCountdown > 0}
                  className={`px-6 py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2 flex-shrink-0 ${
                    rateLimitCountdown > 0
                      ? 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-700/50 text-luxury-charcoal-400 dark:text-luxury-charcoal-500 cursor-not-allowed border border-transparent'
                      : 'bg-red-500 hover:bg-red-600 dark:bg-red-600/80 dark:hover:bg-red-500 text-white'
                  }`}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${rateLimitCountdown > 0 ? '' : 'animate-spin'}`} />
                  <span>{rateLimitCountdown > 0 ? `Retry in ${rateLimitCountdown}s` : 'Retry Calculation'}</span>
                </button>
              </motion.div>
            )}

            {activeRoute && !isLoading && !apiError && (
              <motion.div
                key="results-content"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-8"
              >
                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/60"></div>
                  <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-widest text-luxury-gold-500">Route Compliance Analytics</span>
                  <div className="flex-grow border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/60"></div>
                </div>

                {/* Tabs selector to switch between Timeline and Daily Logs */}
                <div className="flex items-center gap-2 border-b border-luxury-ivory-200 dark:border-luxury-charcoal-700 pb-px">
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`py-3 px-6 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'timeline'
                        ? 'border-luxury-gold-500 text-luxury-gold-600 dark:text-luxury-gold-450 font-bold'
                        : 'border-transparent text-luxury-charcoal-450 dark:text-luxury-charcoal-400 hover:text-luxury-gold-600'
                    }`}
                  >
                    <Compass className="h-4 w-4" />
                    <span>Stops & Timeline</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`py-3 px-6 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'logs'
                        ? 'border-luxury-gold-500 text-luxury-gold-600 dark:text-luxury-gold-450 font-bold'
                        : 'border-transparent text-luxury-charcoal-450 dark:text-luxury-charcoal-400 hover:text-luxury-gold-600'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    <span>FMCSA Daily Logs</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {activeTab === 'timeline' ? (
                    <RouteResults route={activeRoute} />
                  ) : (
                    <div className="p-6 md:p-8 rounded-3xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/50 dark:bg-luxury-charcoal-900/50 backdrop-blur-sm shadow-premium-light dark:shadow-premium-dark">
                      <HOSLogs logs={activeRoute.daily_logs} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
