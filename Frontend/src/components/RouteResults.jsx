import React from 'react';
import { motion } from 'framer-motion';
import { Compass, Fuel, Clock, Milestone, MapPin, Calendar, HelpCircle, Info } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 100, damping: 18 }
  }
};

export default function RouteResults({ route }) {
  if (!route) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-luxury-ivory-300 dark:border-luxury-charcoal-700/80 rounded-3xl min-h-[300px]">
        <Compass className="h-10 w-10 text-luxury-charcoal-300 dark:text-luxury-charcoal-600 mb-3 animate-spin" style={{ animationDuration: '6s' }} />
        <h3 className="font-serif text-lg text-luxury-charcoal-900 dark:text-white font-medium mb-1">Awaiting Fleet Destination</h3>
        <p className="text-xs text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-light max-w-xs">
          Select one of our preset shipping corridors or type a custom destination to compute compliance telemetry.
        </p>
      </div>
    );
  }

  const { metrics, stops } = route;
  if (!metrics || !stops) return null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {route.fallbackMode && (
        <div className="p-4 rounded-2xl border border-luxury-gold-500/20 bg-luxury-gold-500/5 text-luxury-gold-400 text-xs font-light leading-relaxed flex items-start gap-3">
          <Info className="h-5 w-5 text-luxury-gold-500 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <span className="font-semibold block mb-0.5 uppercase tracking-wider text-[10px]">Estimated Compliance Projection</span>
            Live routing data is temporarily unavailable. Showing estimated compliance projection.
          </div>
        </div>
      )}
      
      {/* Route Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Metric 1: Distance */}
        <motion.div
          variants={cardVariants}
          className="p-5 rounded-2xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/45 dark:bg-luxury-charcoal-900/40 shadow-premium-light dark:shadow-premium-dark flex flex-col"
        >
          <div className="flex items-center gap-2 text-luxury-gold-500 mb-3">
            <Milestone className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Route Distance</span>
          </div>
          <span className="text-2xl font-light text-luxury-charcoal-900 dark:text-white leading-none">
            {metrics.distance.toLocaleString()}
          </span>
          <span className="text-[10px] uppercase text-luxury-charcoal-400 font-medium mt-1">Total Miles</span>
        </motion.div>

        {/* Metric 2: Driving Time */}
        <motion.div
          variants={cardVariants}
          className="p-5 rounded-2xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/45 dark:bg-luxury-charcoal-900/40 shadow-premium-light dark:shadow-premium-dark flex flex-col"
        >
          <div className="flex items-center gap-2 text-luxury-gold-500 mb-3">
            <Clock className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Driving Duration</span>
          </div>
          <span className="text-2xl font-light text-luxury-charcoal-900 dark:text-white leading-none">
            {metrics.duration}
          </span>
          <span className="text-[10px] uppercase text-luxury-charcoal-400 font-medium mt-1">Calculated Hours</span>
        </motion.div>

        {/* Metric 3: Fuel Consumed */}
        <motion.div
          variants={cardVariants}
          className="p-5 rounded-2xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/45 dark:bg-luxury-charcoal-900/40 shadow-premium-light dark:shadow-premium-dark flex flex-col"
        >
          <div className="flex items-center gap-2 text-luxury-gold-500 mb-3">
            <Fuel className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Fuel Stop Volume</span>
          </div>
          <span className="text-2xl font-light text-luxury-charcoal-900 dark:text-white leading-none">
            {metrics.fuel}
          </span>
          <span className="text-[10px] uppercase text-luxury-charcoal-400 font-medium mt-1">Est. Gallons Required</span>
        </motion.div>

        {/* Metric 4: Estimated Stops */}
        <motion.div
          variants={cardVariants}
          className="p-5 rounded-2xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/45 dark:bg-luxury-charcoal-900/40 shadow-premium-light dark:shadow-premium-dark flex flex-col"
        >
          <div className="flex items-center gap-2 text-luxury-gold-500 mb-3">
            <Calendar className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Transit Period</span>
          </div>
          <span className="text-2xl font-light text-luxury-charcoal-900 dark:text-white leading-none">
            {Math.ceil(metrics.duration / 11)} 
          </span>
          <span className="text-[10px] uppercase text-luxury-charcoal-400 font-medium mt-1">Active Duty Days</span>
        </motion.div>

      </div>

      {/* Driver stops timeline card */}
      <motion.div
        variants={cardVariants}
        className="p-6 md:p-8 rounded-3xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/50 bg-white/50 dark:bg-luxury-charcoal-900/50 backdrop-blur-sm shadow-premium-light dark:shadow-premium-dark"
      >
        <div className="flex items-center justify-between border-b border-luxury-ivory-200 dark:border-luxury-charcoal-750 pb-5 mb-8">
          <div>
            <h3 className="font-serif text-xl text-luxury-charcoal-900 dark:text-white font-medium">Driver Chronological Timeline</h3>
            <p className="text-xs text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-light mt-0.5">
              Duty transitions, fuel stops, and rest windows optimized for FMCSA regulatory structures.
            </p>
          </div>
        </div>

        {/* Vertical Timeline */}
        <div className="relative border-l border-luxury-ivory-200/80 dark:border-luxury-charcoal-700/80 ml-3 pl-8 md:pl-10 space-y-8">
          
          {stops.map((stop, index) => {
            const isFirst = index === 0;
            const isLast = index === stops.length - 1;
            
            // Icon color styling based on stop type
            let badgeBg = 'bg-luxury-gold-500';
            let dotColor = 'bg-white';
            
            if (stop.type === 'Destination') {
              badgeBg = 'bg-emerald-500';
            } else if (stop.type === 'Pickup') {
              badgeBg = 'bg-blue-500';
            } else if (stop.type === 'Rest Stop' || stop.type === 'Fuel & Rest') {
              badgeBg = 'bg-amber-600';
            }

            return (
              <motion.div
                key={`${stop.name}-${index}`}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0 }
                }}
                className="relative group"
              >
                
                {/* Visual marker pin on the vertical axis line */}
                <div className={`absolute -left-[42px] md:-left-[50px] top-1.5 w-6 h-6 rounded-full border border-luxury-ivory-50 dark:border-luxury-charcoal-900 shadow-md ${badgeBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </div>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-8">
                  
                  {/* Stop Metadata Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-luxury-gold-600 dark:text-luxury-gold-400">
                        {stop.type}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-luxury-ivory-300 dark:bg-luxury-charcoal-600" />
                      <span className="text-[10px] text-luxury-charcoal-400 font-light">
                        Stop #{index + 1}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white leading-normal group-hover:text-luxury-gold-600 dark:group-hover:text-luxury-gold-400 transition-colors">
                      {stop.name}
                    </h4>
                  </div>

                  {/* Scheduled Transit Timing */}
                  <div className="flex items-center gap-1.5 text-xs text-luxury-charcoal-500 dark:text-luxury-charcoal-350 min-w-[130px] md:text-right md:justify-end">
                    <Calendar className="h-3.5 w-3.5 text-luxury-gold-500" />
                    <span>{stop.time}</span>
                  </div>

                </div>

              </motion.div>
            );
          })}

        </div>

      </motion.div>

    </motion.div>
  );
}
