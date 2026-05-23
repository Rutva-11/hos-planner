import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Lock, 
  Unlock, 
  FileText, 
  PenTool, 
  AlertTriangle, 
  LockKeyhole,
  CheckCircle2,
  Calendar,
  User,
  Info,
  ChevronRight
} from 'lucide-react';
import { fetchDailyLogs } from '../services/api';

// Helper to format HH:MM into AM/PM
function formatTimeToAMPM(timeStr) {
  if (timeStr === '00:00') return '12:00 AM';
  if (timeStr === '12:00') return '12:00 PM';
  if (timeStr === '24:00') return '12:00 AM';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${ampm}`;
}

// Convert "HH:MM" to total minutes from midnight
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export default function DailyLogVisualizer() {
  const [logs, setLogs] = useState([]);
  const [activeDay, setActiveDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Interactive signature tracking
  const [signedDays, setSignedDays] = useState({ 1: true, 2: true, 3: false });
  const [isSigning, setIsSigning] = useState(false);

  // Hover tracking for SVG segments
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const data = await fetchDailyLogs();
        setLogs(data);
      } catch (err) {
        setError('Failed to fetch daily logs. Make sure the backend server is running.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  const handleSignLogs = (dayNum) => {
    setIsSigning(true);
    setTimeout(() => {
      setSignedDays(prev => ({ ...prev, [dayNum]: true }));
      setIsSigning(false);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-charcoal-800 text-white flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-luxury-gold-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold tracking-widest text-luxury-gold-400 uppercase">Synchronizing ELD Telemetry...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-luxury-charcoal-800 text-white flex items-center justify-center p-8">
        <div className="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto animate-pulse" />
          <h2 className="font-serif text-2xl font-medium text-white">Connection Interrupted</h2>
          <p className="text-xs text-luxury-charcoal-300 font-light leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  const activeLog = logs.find(log => log.day === activeDay) || logs[0];
  const isCertified = signedDays[activeLog.day];

  // SVG dimensions & scales
  const svgWidth = 840;
  const svgHeight = 240;
  const leftPad = 110;
  const rightPad = 20;
  const graphWidth = svgWidth - leftPad - rightPad; // 710

  const getX = (timeStr) => {
    const mins = timeToMinutes(timeStr);
    return leftPad + (mins / 1440) * graphWidth;
  };

  const getY = (status) => {
    if (status === 'off_duty') return 45;
    if (status === 'sleeper') return 95;
    if (status === 'driving') return 145;
    if (status === 'on_duty') return 195;
    return 45;
  };

  // Helper to format status text nicely
  const formatStatus = (status) => {
    if (status === 'off_duty') return 'Off Duty';
    if (status === 'sleeper') return 'Sleeper Berth';
    if (status === 'driving') return 'Driving';
    if (status === 'on_duty') return 'On Duty';
    return status;
  };

  // Build the continuous stair-step path
  let pathD = '';
  if (activeLog.segments && activeLog.segments.length > 0) {
    activeLog.segments.forEach((seg, index) => {
      const startX = getX(seg.start);
      const endX = getX(seg.end);
      const currentY = getY(seg.status);

      if (index === 0) {
        pathD += `M ${startX} ${currentY}`;
      }
      pathD += ` H ${endX}`;

      const nextSeg = activeLog.segments[index + 1];
      if (nextSeg) {
        const nextY = getY(nextSeg.status);
        pathD += ` V ${nextY}`;
      }
    });
  }

  // Detect which segments are violations for custom highlighting
  const getSegmentViolation = (seg) => {
    if (activeLog.day === 2) {
      // Day 2 has an 11-hour driving violation and 14-hour duty violation.
      // Driving exceeds 11 hours cumulative.
      // Shift started at 05:00, 14 hours ended at 19:00.
      if (seg.status === 'driving') {
        const startMin = timeToMinutes(seg.start);
        const endMin = timeToMinutes(seg.end);
        // The second driving segment is 13:00 -> 19:00.
        // The first driving segment was 06:00 -> 12:00 (6 hours driving).
        // Total driving starts exceeding 11 hours at 18:00.
        if (seg.start === '13:00') {
          return {
            type: '11-hour driving limit',
            description: 'Cumulative driving exceeded 11 hours at 18:00.'
          };
        }
      }
      // Any duty state after 19:00 (since duty day started at 05:00) is a 14-hour violation.
      const startMin = timeToMinutes(seg.start);
      if (startMin >= 1140) { // 19:00 is 19*60 = 1140 minutes
        return {
          type: '14-hour duty window',
          description: 'Shift window exceeded 14 hours.'
        };
      }
    } else if (activeLog.day === 3) {
      // Day 3 has missed 30-minute break.
      // Driven continuously 08:00 -> 16:30 (8.5 hours). Limit is 8 hours.
      // So at 16:00 it exceeded the 8 hours limit.
      if (seg.status === 'driving' && seg.start === '08:00') {
        return {
          type: 'Missed 30-min break',
          description: 'Drove 8.5 hours continuously without a 30-minute break.'
        };
      }
    }
    return null;
  };

  return (
    <div className="relative min-h-screen bg-luxury-charcoal-800 text-white pt-24 pb-20 px-4 md:px-8 font-sans transition-colors duration-500">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 right-0 w-[45%] h-[40%] rounded-full bg-luxury-gold-200/5 dark:bg-luxury-gold-950/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[35%] h-[35%] rounded-full bg-luxury-gold-250/5 dark:bg-luxury-gold-900/5 blur-[110px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* Dashboard Title Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="border-b border-luxury-charcoal-700/60 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-luxury-gold-500/10 text-luxury-gold-400 border border-luxury-gold-500/20">
                ELD Compliance Portal
              </span>
              <span className="text-[10px] text-luxury-charcoal-400 font-mono uppercase tracking-wider">
                System: Active Telemetry
              </span>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl text-white font-normal">
              FMCSA Daily Log <span className="italic font-light text-luxury-gold-400">Visualizer</span>
            </h1>
            <p className="text-xs md:text-sm text-luxury-charcoal-300 font-light mt-1 max-w-2xl">
              Inspect electronic logbook entries, analyze duty status transitions, review compliance parameters, and digitally sign reports.
            </p>
          </div>

          {/* Active Driver Profile Summary */}
          <div className="flex items-center gap-4 bg-luxury-charcoal-900/40 border border-luxury-charcoal-700/50 p-4 rounded-2xl shadow-premium-dark max-w-md">
            <div className="p-2 bg-luxury-gold-500/10 text-luxury-gold-400 rounded-xl">
              <User className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold tracking-widest text-luxury-charcoal-400">Assigned Driver</p>
              <h4 className="text-sm font-semibold text-white">Sarah Jenkins</h4>
              <p className="text-[11px] text-luxury-charcoal-350 font-light">CDL Class A • ID: #CA-88921</p>
            </div>
          </div>
        </motion.div>

        {/* Day Navigation Tabs with Compliance Badges */}
        <div className="flex flex-wrap items-center gap-3 border-b border-luxury-charcoal-700 pb-px">
          {logs.map(log => {
            const hasViolations = log.violations && log.violations.length > 0;
            const logSigned = signedDays[log.day];
            
            return (
              <button
                key={log.day}
                onClick={() => {
                  setActiveDay(log.day);
                  setHoveredSegment(null);
                }}
                className={`pb-3 px-5 text-xs uppercase tracking-wider font-semibold border-b-2 transition-all duration-300 flex items-center gap-2.5 ${
                  activeDay === log.day
                    ? 'border-luxury-gold-500 text-luxury-gold-400 font-bold'
                    : 'border-transparent text-luxury-charcoal-400 hover:text-luxury-charcoal-200'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>Day {log.day}</span>
                <span className="text-[10px] opacity-70">({log.date})</span>
                
                {/* Day Compliance Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  hasViolations
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasViolations ? 'bg-red-400' : 'bg-emerald-400'}`} />
                  <span>{hasViolations ? 'Violations' : 'Compliant'}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Primary Page Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: 24h Timeline Visualizer & Event Grid (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* SVG Timeline Card */}
            <motion.div
              key={`graph-day-${activeLog.day}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="p-6 rounded-3xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-900/50 backdrop-blur-md shadow-premium-dark relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6 border-b border-luxury-charcoal-700/50 pb-4">
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">24-Hour Duty Status Grid</h3>
                  <p className="text-[10px] text-luxury-charcoal-400 font-light mt-0.5">
                    Hover over duty status bars to inspect duration, timings, and compliance highlights.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-luxury-charcoal-400 font-mono uppercase">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Timezone: UTC</span>
                  </div>
                </div>
              </div>

              {/* The SVG Grid Box */}
              <div className="relative overflow-x-auto select-none py-2">
                <svg 
                  width={svgWidth} 
                  height={svgHeight} 
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="mx-auto"
                >
                  {/* Grid Row Background Highlights */}
                  {['off_duty', 'sleeper', 'driving', 'on_duty'].map((status, index) => {
                    const y = getY(status);
                    return (
                      <line 
                        key={status}
                        x1={leftPad}
                        y1={y}
                        x2={svgWidth - rightPad}
                        y2={y}
                        className="stroke-luxury-charcoal-700 dark:stroke-luxury-charcoal-600/30"
                        strokeWidth={1}
                      />
                    );
                  })}

                  {/* Hourly Vertical Grid Lines */}
                  {Array.from({ length: 25 }).map((_, hour) => {
                    const timeStr = `${hour < 10 ? '0' + hour : hour}:00`;
                    const x = getX(timeStr);
                    const isMajor = hour % 2 === 0;

                    return (
                      <g key={hour}>
                        <line
                          x1={x}
                          y1={20}
                          x2={x}
                          y2={220}
                          className={`${
                            isMajor 
                              ? 'stroke-luxury-charcoal-700/60 dark:stroke-luxury-charcoal-600/30' 
                              : 'stroke-luxury-charcoal-700/30 dark:stroke-luxury-charcoal-600/10'
                          }`}
                          strokeWidth={1}
                          strokeDasharray={isMajor ? '' : '2,2'}
                        />
                        {/* Hour Labels at the bottom */}
                        {isMajor && (
                          <text
                            x={x}
                            y={235}
                            textAnchor="middle"
                            className="fill-luxury-charcoal-400 font-mono text-[9px] font-medium"
                          >
                            {hour === 0 ? '00' : hour === 12 ? '12' : hour === 24 ? '24' : hour}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Row Headers Labeling */}
                  <g className="fill-luxury-charcoal-300 font-mono text-[10px] uppercase font-bold tracking-wider">
                    <text x={leftPad - 15} y={getY('off_duty') + 3} textAnchor="end">Off Duty</text>
                    <text x={leftPad - 15} y={getY('sleeper') + 3} textAnchor="end">Sleeper</text>
                    <text x={leftPad - 15} y={getY('driving') + 3} textAnchor="end">Driving</text>
                    <text x={leftPad - 15} y={getY('on_duty') + 3} textAnchor="end">On Duty</text>
                  </g>

                  {/* Shaded status blocks with subtle animations & highlights */}
                  <g>
                    {activeLog.segments && activeLog.segments.map((seg, i) => {
                      const startX = getX(seg.start);
                      const endX = getX(seg.end);
                      const width = endX - startX;
                      const y = getY(seg.status) - 15;
                      const height = 30;

                      // Check if this segment contains a violation
                      const violation = getSegmentViolation(seg);
                      const isHovered = hoveredSegment === seg;

                      let fillClass = 'fill-luxury-charcoal-750 dark:fill-luxury-charcoal-800/40';
                      let strokeClass = 'stroke-luxury-charcoal-600/50';

                      if (seg.status === 'driving') {
                        fillClass = violation ? 'fill-red-500/15' : 'fill-luxury-gold-500/15';
                        strokeClass = violation ? 'stroke-red-500/40' : 'stroke-luxury-gold-500/30';
                      } else if (seg.status === 'sleeper') {
                        fillClass = 'fill-emerald-600/15';
                        strokeClass = 'stroke-emerald-600/30';
                      } else if (seg.status === 'on_duty') {
                        fillClass = violation ? 'fill-red-500/15' : 'fill-amber-500/15';
                        strokeClass = violation ? 'stroke-red-500/40' : 'stroke-amber-500/30';
                      }

                      return (
                        <g 
                          key={i}
                          onMouseEnter={(e) => {
                            setHoveredSegment(seg);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPos({
                              x: e.clientX - rect.left + startX - 40,
                              y: y - 85
                            });
                          }}
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPos({
                              x: e.clientX - rect.left + startX - 40,
                              y: y - 85
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredSegment(null);
                          }}
                          className="cursor-pointer"
                        >
                          {/* Shaded Area */}
                          <rect
                            x={startX}
                            y={y}
                            width={width}
                            height={height}
                            rx={4}
                            className={`transition-all duration-300 ${fillClass} ${strokeClass}`}
                            strokeWidth={isHovered ? 2 : 1}
                            style={{
                              filter: isHovered 
                                ? `drop-shadow(0 0 4px ${
                                    violation 
                                      ? 'rgba(239, 68, 68, 0.4)' 
                                      : seg.status === 'driving' 
                                        ? 'rgba(171, 137, 77, 0.4)' 
                                        : 'rgba(16, 185, 129, 0.4)'
                                  })`
                                : ''
                            }}
                          />

                          {/* Hover Vertical Guide Lines */}
                          {isHovered && (
                            <>
                              <line
                                x1={startX}
                                y1={20}
                                x2={startX}
                                y2={220}
                                className="stroke-luxury-gold-500/30 stroke-dasharray"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                              />
                              <line
                                x1={endX}
                                y1={20}
                                x2={endX}
                                y2={220}
                                className="stroke-luxury-gold-500/30 stroke-dasharray"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                              />
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* The Continuous Stair-Step Line */}
                  <path
                    d={pathD}
                    className="stroke-luxury-gold-500 dark:stroke-luxury-gold-400 fill-none"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Draw circular nodes at transition coordinates */}
                  {activeLog.segments && activeLog.segments.map((seg, i) => {
                    const startX = getX(seg.start);
                    const y = getY(seg.status);
                    return (
                      <circle
                        key={`node-${i}`}
                        cx={startX}
                        cy={y}
                        r={4.5}
                        className="fill-luxury-gold-950 stroke-luxury-gold-500"
                        strokeWidth={2}
                      />
                    );
                  })}
                  {/* Ending point circle */}
                  {activeLog.segments && activeLog.segments.length > 0 && (
                    <circle
                      cx={getX(activeLog.segments[activeLog.segments.length - 1].end)}
                      cy={getY(activeLog.segments[activeLog.segments.length - 1].status)}
                      r={4.5}
                      className="fill-luxury-gold-950 stroke-luxury-gold-500"
                      strokeWidth={2}
                    />
                  )}
                </svg>

                {/* SVG Hover Tooltip Overlay (Absolute Positioned inside Relative Container) */}
                <AnimatePresence>
                  {hoveredSegment && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute z-20 pointer-events-none p-3.5 rounded-xl border border-luxury-charcoal-600 bg-luxury-charcoal-900/90 backdrop-blur-md shadow-premium-dark text-left w-52 text-xs flex flex-col space-y-1.5"
                      style={{
                        left: `${tooltipPos.x}px`,
                        top: `${tooltipPos.y}px`,
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white uppercase tracking-wider text-[10px]">
                          {formatStatus(hoveredSegment.status)}
                        </span>
                        
                        {/* Status Color Dot */}
                        <span className={`w-2 h-2 rounded-full ${
                          getSegmentViolation(hoveredSegment)
                            ? 'bg-red-500 animate-pulse'
                            : hoveredSegment.status === 'driving'
                              ? 'bg-luxury-gold-500'
                              : hoveredSegment.status === 'sleeper'
                                ? 'bg-emerald-500'
                                : 'bg-luxury-charcoal-400'
                        }`} />
                      </div>

                      <div className="border-t border-luxury-charcoal-700/80 pt-1.5 space-y-1 font-mono text-luxury-charcoal-300 text-[10px]">
                        <div>
                          <span className="text-luxury-charcoal-450 mr-1.5">Interval:</span>
                          <span className="text-white">
                            {formatTimeToAMPM(hoveredSegment.start)} - {formatTimeToAMPM(hoveredSegment.end)}
                          </span>
                        </div>
                        <div>
                          <span className="text-luxury-charcoal-450 mr-1.5">Duration:</span>
                          <span className="text-white font-semibold">
                            {hoveredSegment.duration} Hours
                          </span>
                        </div>
                      </div>

                      {/* Display violation context if hovered segment is in breach */}
                      {getSegmentViolation(hoveredSegment) && (
                        <div className="mt-1.5 p-1.5 rounded bg-red-500/10 border border-red-500/20 text-[9px] text-red-400 leading-tight">
                          <strong className="block uppercase text-[8px] tracking-wide font-black">Warning Violation</strong>
                          {getSegmentViolation(hoveredSegment).type} Exceeded.
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Grid Legend & Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-5 border-t border-luxury-charcoal-700/50">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-luxury-charcoal-700 border border-luxury-charcoal-600" />
                    <span className="text-[11px] text-luxury-charcoal-300 uppercase tracking-wider font-semibold">Off Duty</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-emerald-600/30 border border-emerald-500/30" />
                    <span className="text-[11px] text-luxury-charcoal-300 uppercase tracking-wider font-semibold">Sleeper</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-luxury-gold-500/30 border border-luxury-gold-500/40" />
                    <span className="text-[11px] text-luxury-charcoal-300 uppercase tracking-wider font-semibold">Driving</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/40" />
                    <span className="text-[11px] text-luxury-charcoal-300 uppercase tracking-wider font-semibold">On Duty</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center sm:text-right text-[10px] uppercase font-bold tracking-widest text-luxury-charcoal-400">
                  <div>
                    <span className="block text-[8px] text-luxury-charcoal-450 font-normal">Off</span>
                    <span className="text-white font-mono">{activeLog.summary.off_duty_hours}h</span>
                  </div>
                  <div>
                    <span className="block text-[8px] text-luxury-charcoal-450 font-normal">Sleeper</span>
                    <span className="text-white font-mono">{activeLog.summary.sleeper_hours}h</span>
                  </div>
                  <div>
                    <span className="block text-[8px] text-luxury-charcoal-450 font-normal">Drive</span>
                    <span className="text-white font-mono text-luxury-gold-400">{activeLog.summary.driving_hours}h</span>
                  </div>
                  <div>
                    <span className="block text-[8px] text-luxury-charcoal-450 font-normal">On Duty</span>
                    <span className="text-white font-mono">{activeLog.summary.on_duty_hours}h</span>
                  </div>
                </div>
              </div>

            </motion.div>

            {/* Event Audit Table */}
            <motion.div
              key={`events-day-${activeLog.day}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="p-6 rounded-3xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-900/50 backdrop-blur-md shadow-premium-dark"
            >
              <div className="border-b border-luxury-charcoal-700/50 pb-4 mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">Duty Status Change Event Log</h3>
                  <p className="text-[10px] text-luxury-charcoal-400 font-light mt-0.5">
                    Official chronologically ordered registry of duty status adjustments.
                  </p>
                </div>
                <div className="px-3 py-1 bg-luxury-charcoal-950 text-luxury-charcoal-350 border border-luxury-charcoal-750 text-[10px] rounded-lg font-mono">
                  {activeLog.segments.length} LOGGED CHANGES
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-luxury-charcoal-700 text-[10px] uppercase font-bold tracking-widest text-luxury-charcoal-400">
                      <th className="py-3 px-2 text-center w-12">Seq</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Start Time</th>
                      <th className="py-3 px-3">End Time</th>
                      <th className="py-3 px-3">Duration</th>
                      <th className="py-3 px-3 text-right">Audit Code</th>
                    </tr>
                  </thead>
                  <tbody className="font-light divide-y divide-luxury-charcoal-750/30">
                    {activeLog.segments.map((seg, i) => {
                      const violation = getSegmentViolation(seg);
                      
                      return (
                        <tr key={i} className="hover:bg-luxury-charcoal-900/20 transition-colors">
                          <td className="py-3 px-2 text-center font-mono font-bold text-luxury-charcoal-400">{i + 1}</td>
                          <td className="py-3 px-3 font-semibold">
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                violation
                                  ? 'bg-red-500'
                                  : seg.status === 'driving'
                                    ? 'bg-luxury-gold-500'
                                    : seg.status === 'sleeper'
                                      ? 'bg-emerald-500'
                                      : 'bg-luxury-charcoal-400'
                              }`} />
                              {formatStatus(seg.status)}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono">{formatTimeToAMPM(seg.start)}</td>
                          <td className="py-3 px-3 font-mono">{formatTimeToAMPM(seg.end)}</td>
                          <td className="py-3 px-3 font-mono text-white font-medium">{seg.duration} Hrs</td>
                          <td className="py-3 px-3 text-right text-[10px] font-mono text-luxury-charcoal-450 uppercase">
                            {violation ? (
                              <span className="text-red-400 font-semibold">{violation.type.slice(0, 15)}</span>
                            ) : (
                              `AURA-HOS-${i + 100}`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>

          </div>

          {/* Right Column: Driver Certification & Compliance Warnings (4 cols) */}
          <div className="lg:col-span-4 space-y-8">

            {/* Certification Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="p-6 rounded-3xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-900/50 backdrop-blur-md shadow-premium-dark flex flex-col space-y-6"
            >
              <div className="border-b border-luxury-charcoal-700/50 pb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">Log Certification</h3>
                  <p className="text-[10px] text-luxury-charcoal-400 font-light mt-0.5">
                    FMCSA 49 CFR compliance verification.
                  </p>
                </div>

                {/* Secure Lock Badge */}
                <div className={`p-2 rounded-xl border flex items-center justify-center ${
                  isCertified 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                }`}>
                  {isCertified ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </div>
              </div>

              {/* Status metrics list */}
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-luxury-charcoal-750/30">
                  <span className="text-luxury-charcoal-400">Driver Signature:</span>
                  <span className="font-mono font-bold text-white uppercase text-[11px]">
                    {isCertified ? 'Sarah Jenkins' : 'UNSIGNED'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-luxury-charcoal-750/30">
                  <span className="text-luxury-charcoal-400">Status:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    isCertified 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                  }`}>
                    {isCertified ? 'Certified' : 'Pending Verification'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-luxury-charcoal-750/30">
                  <span className="text-luxury-charcoal-400">Lock Indicator:</span>
                  <span className={`font-mono text-[10px] font-bold ${isCertified ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isCertified ? 'AUDIT LOCK: ACTIVE' : 'OPEN FOR CORRECTIONS'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-luxury-charcoal-750/30">
                  <span className="text-luxury-charcoal-400">Dispatch Time:</span>
                  <span className="font-mono text-white text-[10px]">{activeLog.dispatch_timestamp}</span>
                </div>
              </div>

              {/* FMCSA Official Notice */}
              <div className="p-4 rounded-2xl bg-luxury-charcoal-950 border border-luxury-charcoal-750 text-[11px] text-luxury-charcoal-350 leading-relaxed font-light flex gap-3">
                <Info className="h-4.5 w-4.5 text-luxury-gold-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block uppercase text-[9px] tracking-wider text-luxury-gold-400 font-bold mb-1">
                    FMCSA Compliance Advisory
                  </strong>
                  {activeLog.fmcsa_notice}
                </div>
              </div>

              {/* Action Button: Digital Signature Pad */}
              <div>
                {isCertified ? (
                  <div className="w-full flex items-center justify-center gap-2 p-3.5 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold uppercase tracking-wider">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Report Certified</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSignLogs(activeLog.day)}
                    disabled={isSigning}
                    className="w-full p-4 rounded-xl text-xs font-semibold uppercase tracking-wider bg-luxury-gold-500 text-luxury-charcoal-950 hover:bg-luxury-gold-400 transition-all duration-300 shadow-glow flex items-center justify-center gap-2"
                  >
                    {isSigning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-luxury-charcoal-950 border-t-transparent rounded-full animate-spin" />
                        <span>Signing Record...</span>
                      </>
                    ) : (
                      <>
                        <PenTool className="h-4 w-4" />
                        <span>Certify & Sign Log</span>
                      </>
                    )}
                  </button>
                )}
              </div>

            </motion.div>

            {/* Violation Details Details Card */}
            <AnimatePresence mode="wait">
              {activeLog.violations && activeLog.violations.length > 0 ? (
                <motion.div
                  key={`violations-${activeLog.day}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-md shadow-premium-dark flex flex-col space-y-4"
                >
                  <div className="border-b border-red-500/20 pb-3">
                    <h3 className="font-serif text-lg text-red-400 font-medium flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
                      <span>Regulatory Violations ({activeLog.violations.length})</span>
                    </h3>
                    <p className="text-[10px] text-luxury-charcoal-400 font-light mt-0.5">
                      The log contains hours-of-service compliance exceptions.
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {activeLog.violations.map((violation, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400">
                            {violation.code}
                          </span>
                          <span className="text-[9px] uppercase tracking-widest font-black text-red-500 font-mono">
                            BREACH
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white uppercase">{violation.type}</h4>
                        <p className="text-[11px] text-luxury-charcoal-300 font-light leading-relaxed">
                          {violation.description}
                        </p>
                        
                        <div className="pt-2 border-t border-red-500/10 text-[10px] text-red-400 font-light leading-relaxed">
                          <strong className="block text-[8px] uppercase tracking-widest font-black mb-0.5">Required Action:</strong>
                          {violation.remedy}
                        </div>
                      </div>
                    ))}
                  </div>

                </motion.div>
              ) : (
                <motion.div
                  key="compliant-notice"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.5 }}
                  className="p-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md shadow-premium-dark flex flex-col space-y-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-serif text-lg text-white font-medium">Compliance Seal</h3>
                      <p className="text-[10px] text-luxury-charcoal-400 font-light mt-0.5">
                        Hours of service fully validated.
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-luxury-charcoal-300 font-light leading-relaxed">
                    This daily log record complies with all current FMCSA HOS rules: 11-hour daily driving limit, 14-hour daily duty shift window, and the mandatory 30-minute rest break after 8 hours of driving.
                  </p>

                  <div className="p-3 bg-emerald-500/10 rounded-xl text-[10px] text-emerald-400 font-mono flex items-center justify-between">
                    <span>STATUS: VALIDATED</span>
                    <span>100% REGULATORY ASSURANCE</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>

      </div>
    </div>
  );
}
