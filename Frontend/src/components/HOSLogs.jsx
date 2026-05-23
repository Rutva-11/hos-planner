import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ShieldCheck, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';

const MOCK_DAILY_LOGS = [
  {
    day: 1,
    date: 'May 21, 2026',
    status: 'Compliant',
    summary: 'Driving: 9.5 Hrs | Sleeper: 10 Hrs | On Duty: 1.5 Hrs | Off Duty: 3 Hrs',
    states: [
      { name: 'Off Duty', hours: 3, percentage: 12.5, color: 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-600' },
      { name: 'On Duty (Not Driving)', hours: 1.5, percentage: 6.25, color: 'bg-luxury-gold-300 dark:bg-luxury-gold-600/60' },
      { name: 'Driving', hours: 9.5, percentage: 39.58, color: 'bg-luxury-gold-500' },
      { name: 'Sleeper Berth', hours: 10, percentage: 41.67, color: 'bg-emerald-600 dark:bg-emerald-700/80' }
    ],
    violations: [],
    rules: [
      { id: '11hr', label: '11-Hour Driving Limit', current: '9.5 hrs spent', max: '11.0 hrs max', passed: true },
      { id: '14hr', label: '14-Hour Duty Window', current: '11.0 hrs spent', max: '14.0 hrs max', passed: true },
      { id: '30m', label: '30-Min Rest Break', current: 'Compliant', max: 'After 8 hrs driving', passed: true },
    ]
  },
  {
    day: 2,
    date: 'May 22, 2026',
    status: 'Compliant',
    summary: 'Driving: 10.0 Hrs | Sleeper: 10 Hrs | On Duty: 2.0 Hrs | Off Duty: 2 Hrs',
    states: [
      { name: 'Off Duty', hours: 2, percentage: 8.33, color: 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-600' },
      { name: 'On Duty (Not Driving)', hours: 2, percentage: 8.33, color: 'bg-luxury-gold-300 dark:bg-luxury-gold-600/60' },
      { name: 'Driving', hours: 10, percentage: 41.67, color: 'bg-luxury-gold-500' },
      { name: 'Sleeper Berth', hours: 10, percentage: 41.67, color: 'bg-emerald-600 dark:bg-emerald-700/80' }
    ],
    violations: [],
    rules: [
      { id: '11hr', label: '11-Hour Driving Limit', current: '10.0 hrs spent', max: '11.0 hrs max', passed: true },
      { id: '14hr', label: '14-Hour Duty Window', current: '12.0 hrs spent', max: '14.0 hrs max', passed: true },
      { id: '30m', label: '30-Min Rest Break', current: 'Compliant', max: 'After 8 hrs driving', passed: true },
    ]
  },
  {
    day: 3,
    date: 'May 23, 2026',
    status: 'Warning',
    summary: 'Driving: 11.2 Hrs | Sleeper: 8 Hrs | On Duty: 3.5 Hrs | Off Duty: 1.3 Hrs',
    states: [
      { name: 'Off Duty', hours: 1.3, percentage: 5.4, color: 'bg-luxury-ivory-300 dark:bg-luxury-charcoal-600' },
      { name: 'On Duty (Not Driving)', hours: 3.5, percentage: 14.6, color: 'bg-luxury-gold-300 dark:bg-luxury-gold-600/60' },
      { name: 'Driving', hours: 11.2, percentage: 46.7, color: 'bg-red-400 dark:bg-red-500/80' },
      { name: 'Sleeper Berth', hours: 8, percentage: 33.3, color: 'bg-emerald-600 dark:bg-emerald-700/80' }
    ],
    violations: [
      { code: 'FMCSA §395.3', message: 'Exceeded 11-Hour Daily Driving Limit by 0.2 Hours.' }
    ],
    rules: [
      { id: '11hr', label: '11-Hour Driving Limit', current: '11.2 hrs spent', max: '11.0 hrs max', passed: false },
      { id: '14hr', label: '14-Hour Duty Window', current: '14.7 hrs spent', max: '14.0 hrs max', passed: false },
      { id: '30m', label: '30-Min Rest Break', current: 'Compliant', max: 'After 8 hrs driving', passed: true },
    ]
  }
];

export default function HOSLogs({ logs }) {
  const displayLogs = logs && logs.length > 0 ? logs : MOCK_DAILY_LOGS;
  const [expandedDay, setExpandedDay] = useState(1);

  const toggleDay = (dayNum) => {
    setExpandedDay(expandedDay === dayNum ? null : dayNum);
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-luxury-ivory-200 dark:border-luxury-charcoal-700 pb-3 mb-6">
        <h3 className="font-serif text-xl text-luxury-charcoal-900 dark:text-white font-medium">Daily Log compliance</h3>
        <p className="text-xs text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-light mt-0.5">
          Review FMCSA 70-hour / 8-day duty segment details and automated compliance logs.
        </p>
      </div>

      <div className="space-y-3">
        {displayLogs.map((log) => {
          const isExpanded = expandedDay === log.day;
          const isWarning = log.status === 'Warning';

          return (
            <div
              key={log.day}
              className="rounded-2xl border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/60 bg-white/45 dark:bg-luxury-charcoal-900/40 shadow-premium-light dark:shadow-premium-dark overflow-hidden transition-all duration-300"
            >
              {/* Header Toggle */}
              <button
                onClick={() => toggleDay(log.day)}
                className="w-full flex items-center justify-between p-5 text-left focus:outline-none focus:ring-1 focus:ring-luxury-gold-500/30"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 flex-grow">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white">
                      Day {log.day}
                    </span>
                    <span className="text-xs text-luxury-charcoal-400 font-light">
                      ({log.date})
                    </span>
                  </div>
                  <span className="hidden md:inline text-xs text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-light truncate max-w-sm">
                    {log.summary}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Status Indicator */}
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    isWarning
                      ? 'bg-red-400/10 text-red-500 border border-red-450/20'
                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-550/20'
                  }`}>
                    {isWarning ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                    <span>{log.status}</span>
                  </span>
                  
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="text-luxury-charcoal-400"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </div>
              </button>

              {/* Accordion Content */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden border-t border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/40 bg-white/20 dark:bg-luxury-charcoal-950/25"
                  >
                    <div className="p-5 space-y-6">
                      
                      {/* Duty State Visual Bar Chart */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-luxury-charcoal-400">
                          <span>Duty Status Distribution (24 HR Grid)</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3" /> 24 Hours Total
                          </span>
                        </div>
                        
                        {/* Stacked Progress Bar */}
                        <div className="w-full h-7 rounded-lg overflow-hidden flex shadow-inner border border-luxury-ivory-200/60 dark:border-luxury-charcoal-800">
                          {log.states.map((state, i) => (
                            <div
                              key={i}
                              style={{ width: `${state.percentage}%` }}
                              className={`${state.color} h-full transition-all duration-300 relative group`}
                              title={`${state.name}: ${state.hours} Hours`}
                            />
                          ))}
                        </div>

                        {/* Bar Labels Legend */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1.5">
                          {log.states.map((state, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-sm ${state.color}`} />
                              <span className="text-xs font-light text-luxury-charcoal-600 dark:text-luxury-charcoal-350">
                                {state.name}: <strong className="font-semibold text-luxury-charcoal-800 dark:text-white">{state.hours}h</strong>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rule Checks & Violations */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/40">
                        
                        {/* Violations warnings if present */}
                        <div className="space-y-3">
                          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-luxury-charcoal-400">
                            Regulatory Rule Validation
                          </h4>
                          <div className="space-y-2">
                            {log.rules.map((rule) => (
                              <div
                                key={rule.id}
                                className={`flex items-center justify-between p-3 rounded-xl border ${
                                  rule.passed
                                    ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-red-400/5 border-red-400/10 text-red-500'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  {rule.passed ? (
                                    <ShieldCheck className="h-4 w-4" />
                                  ) : (
                                    <ShieldAlert className="h-4 w-4" />
                                  )}
                                  <span className="text-xs font-medium">{rule.label}</span>
                                </div>
                                <span className="text-[10px] font-mono font-medium">
                                  {rule.current} / {rule.max}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Violation details summary */}
                        <div className="space-y-3">
                          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-luxury-charcoal-400">
                            Compliance Advisories
                          </h4>
                          {log.violations.length > 0 ? (
                            <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/20 text-red-500 space-y-2">
                              {log.violations.map((v, i) => (
                                <div key={i} className="text-xs leading-relaxed">
                                  <strong className="font-bold block uppercase tracking-wider text-[9px] mb-0.5">
                                    Violation: {v.code}
                                  </strong>
                                  {v.message}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-light leading-relaxed">
                              No FMCSA hours-of-service violations detected for this duty cycle day. The driver holds sufficient driving remaining limits and complied with the rest periods.
                            </div>
                          )}
                        </div>

                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
