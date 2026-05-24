import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate, animate } from 'framer-motion';
import { ArrowRight, ShieldCheck, Compass, Clock, MapPin, Sparkles, X, Info, AlertTriangle, RotateCcw, ChevronRight } from 'lucide-react';
import { sendComplianceQuery } from '../services/api';



// Preset compliance actions for the Compliance Assistant panel
const PRESET_ACTIONS = [
  {
    id: 'eleven_hour',
    label: 'Explain 11-Hour Rule',
    desc: 'FMCSA § 395.3(a)(3)',
    prompt: 'Explain the FMCSA 11-hour driving rule clearly and concisely, including when it applies and how drivers should track it.',
    icon: Clock,
  },
  {
    id: 'sleeper_berth',
    label: 'Sleeper Berth Split',
    desc: 'FMCSA § 395.1(g)',
    prompt: 'Explain sleeper berth split rest options under FMCSA rules, including the 8/2 and 7/3 configurations and how they affect the 14-hour window.',
    icon: ShieldCheck,
  },
  {
    id: 'non_compliant',
    label: 'Route Non-Compliant?',
    desc: 'Common violation causes',
    prompt: 'What are the most common reasons a trucking route becomes non-compliant with FMCSA HOS regulations, and how can a driver address them?',
    icon: AlertTriangle,
  },
  {
    id: 'optimize',
    label: 'Optimize This Trip',
    desc: 'Maximize drive time',
    prompt: 'What are the best strategies for optimizing a long-haul trucking trip to maximize legal driving time while maintaining full FMCSA HOS compliance?',
    icon: Compass,
  },
  {
    id: 'fmcsa_risk',
    label: 'FMCSA Risk Review',
    desc: 'Safety scoring factors',
    prompt: 'What factors contribute to a high FMCSA safety risk score, and what operational changes can a carrier make to reduce their CSA score and audit exposure?',
    icon: Sparkles,
  },
];

function CountUp({ value, decimals = 0, suffix = '', duration = 1.5, prefix = '' }) {
  const nodeRef = useRef(null);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const startValue = prevValueRef.current;
    const controls = animate(startValue, value, {
      duration: duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(val) {
        node.textContent = prefix + val.toFixed(decimals) + suffix;
      }
    });

    prevValueRef.current = value;
    return () => controls.stop();
  }, [value, decimals, suffix, prefix, duration]);

  return <span ref={nodeRef}>{prefix}{prevValueRef.current.toFixed(decimals)}{suffix}</span>;
}

// Custom Glassmorphic Tooltip Component
function Tooltip({ children, content }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-64 p-3 rounded-xl border border-luxury-ivory-300 dark:border-luxury-charcoal-600 bg-white/95 dark:bg-luxury-charcoal-900/95 backdrop-blur-md shadow-premium-dark/10 dark:shadow-premium-dark text-left text-xs pointer-events-none"
          >
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-white/95 dark:border-t-luxury-charcoal-900/95" />
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px border-8 border-transparent border-t-luxury-ivory-300 dark:border-t-luxury-charcoal-600 -z-10" />
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simulated routes dataset for rotating mockup
const SIMULATED_ROUTES = [
  {
    name: "Pacific Corridor",
    distance: "1,310 Miles",
    cycleRemaining: 61.5,
    drivingLimit: 8.0,
    progress: 87,
    drivingProgress: 100,
    stops: [
      { name: "Port of Seattle, WA", type: "Origin", desc: "Departure: 08:00 AM", status: "completed" },
      { name: "Salt Lake Depot, UT", type: "Intermediate", desc: "Mandatory 30-Min Rest Break", status: "active" },
      { name: "Denver Hub, CO", type: "Destination", desc: "Delivery Window: 04:00 PM", status: "pending" }
    ],
    points: [{ x: 30, y: 25 }, { x: 55, y: 55 }, { x: 80, y: 65 }],
    truckProgress: 0.45,
  },
  {
    name: "Sunbelt Corridor",
    distance: "1,065 Miles",
    cycleRemaining: 54.2,
    drivingLimit: 4.5,
    progress: 77,
    drivingProgress: 56,
    stops: [
      { name: "Dallas Logistics Center, TX", type: "Origin", desc: "Departure: 04:30 AM", status: "completed" },
      { name: "El Paso Terminal, TX", type: "Intermediate", desc: "Refuel & Inspection Break", status: "completed" },
      { name: "Phoenix Hub, AZ", type: "Destination", desc: "Delivery Window: 09:00 PM", status: "active" }
    ],
    points: [{ x: 75, y: 80 }, { x: 45, y: 70 }, { x: 20, y: 45 }],
    truckProgress: 0.85,
  },
  {
    name: "Midwest Corridor",
    distance: "720 Miles",
    cycleRemaining: 68.0,
    drivingLimit: 11.0,
    progress: 97,
    drivingProgress: 100,
    stops: [
      { name: "Atlanta Hub, GA", type: "Origin", desc: "Departure: 07:00 AM", status: "completed" },
      { name: "Nashville Station, TN", type: "Intermediate", desc: "Mandatory 30-Min Rest Break", status: "active" },
      { name: "Chicago Yards, IL", type: "Destination", desc: "Delivery Window: 06:15 PM", status: "pending" }
    ],
    points: [{ x: 70, y: 85 }, { x: 58, y: 55 }, { x: 40, y: 25 }],
    truckProgress: 0.35,
  }
];

// Quadratic Bezier interpolation helper for truck position along SVG curve
const getQuadraticPoint = (p0, p1, p2, t) => {
  const mt = 1 - t;
  const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
  const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
  return { x, y };
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 100, damping: 20 },
  },
};


export default function LandingPage() {
  const navigate = useNavigate();
  const [isPhilosophyOpen, setIsPhilosophyOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);

  const activeRoute = SIMULATED_ROUTES[activeRouteIndex];

  // Compliance Assistant States — simple request/response, no history
  const [isLoading, setIsLoading] = useState(false);
  const [assistantResponse, setAssistantResponse] = useState(null);
  const [assistantError, setAssistantError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

const LOCAL_FALLBACK_ANSWERS = {
  eleven_hour: "Under FMCSA regulation § 395.3(a)(3), commercial motor vehicle drivers are permitted to drive a maximum of 11 cumulative hours following 10 consecutive hours off duty. All driving time must be completed within a 14-hour consecutive duty window. To maintain compliance, ensure your Electronic Logging Device (ELD) is set to 'Driving' when active, and track your remaining drive time against the 11-hour limit to prevent daily violations.",
  sleeper_berth: "FMCSA regulation § 395.1(g) allows drivers to split their mandatory 10-hour off-duty period using two sleeper berth periods: an 8/2 or 7/3 split. The shorter period (2 or 3 hours) must be spent off-duty or in the sleeper berth, while the longer period (8 or 7 hours) must be spent entirely in the sleeper berth. When combined, these periods pause and reset your 14-hour duty window, allowing for flexible scheduling on long-haul routes.",
  non_compliant: "Logistics routes typically become non-compliant due to three primary factors: exceeding the 11-hour daily driving limit, exceeding the 14-hour daily duty window, or neglecting the mandatory 30-minute rest break after 8 hours of driving. Unplanned traffic delays, shipper detention times, and bad weather are common operational causes. To mitigate these risks, dispatcher schedules should incorporate realistic buffer times and leverage HOS-compliant rest stops.",
  optimize: "To maximize legal driving time and optimize routing, plan your departures to align with low-traffic windows and pre-schedule all pickup and drop-off windows. Utilizing 8/2 or 7/3 sleeper berth splits can prevent the 14-hour clock from expiring during shipper loading delays. Additionally, maintaining a steady cruise speed and identifying HOS-compliant parking locations in advance ensures that mandatory rest breaks do not incur unnecessary dwell time.",
  fmcsa_risk: "A carrier's FMCSA safety profile (CSA score) is determined by the Behavior Analysis and Safety Improvement Categories (BASICs), HOS compliance, and vehicle maintenance. HOS violations—such as form and manner errors or false logs—negatively impact your HOS Compliance BASIC score. To reduce audit exposure, operators should implement automated ELD monitoring, conduct regular driver training on log certification, and establish pre-trip inspection protocols."
};

  const handlePresetAction = async (action) => {
    if (isLoading) return;
    setActiveAction(action);
    setAssistantResponse(null);
    setAssistantError(null);
    setIsLoading(true);
    try {
      const response = await sendComplianceQuery(action.prompt);
      if (isMountedRef.current) {
        setAssistantResponse(response);
      }
    } catch (error) {
      console.warn('Compliance Assistant error, failing over to premium fallback:', error);
      if (isMountedRef.current) {
        const fallback = LOCAL_FALLBACK_ANSWERS[action.id] || "To maintain regulatory alignment, all commercial operations must adhere strictly to FMCSA § 395 regulations. Ensure that your driving logs are fully certified, your daily driving does not exceed 11 hours within the 14-hour duty window, and a 30-minute rest break is logged after 8 hours of driving.";
        setAssistantResponse(fallback);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleResetAssistant = () => {
    setAssistantResponse(null);
    setAssistantError(null);
    setActiveAction(null);
  };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const handleMouseMove = useCallback(({ clientX, clientY, currentTarget }) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }, [mouseX, mouseY]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveRouteIndex((prev) => (prev + 1) % SIMULATED_ROUTES.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const handleDesignClick = (e) => {
    e.preventDefault();
    setIsTransitioning(true);
    setTimeout(() => {
      navigate('/planner');
    }, 750);
  };

  const truckPos = getQuadraticPoint(
    activeRoute.points[0],
    activeRoute.points[1],
    activeRoute.points[2],
    activeRoute.truckProgress
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsPhilosophyOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="relative min-h-[100dvh] overflow-x-hidden bg-luxury-ivory-50 dark:bg-luxury-charcoal-800 transition-colors duration-500 flex flex-col"
      onMouseMove={handleMouseMove}
    >

      {/* Cursor-reactive Subtle Glowing Gradients */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: useMotionTemplate`radial-gradient(650px circle at ${springX}px ${springY}px, rgba(171, 137, 77, 0.08), transparent 80%)`
        }}
      />

      <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] rounded-full bg-luxury-gold-200/20 dark:bg-luxury-gold-950/20 blur-[130px] pointer-events-none" />

      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-luxury-gold-200/10 dark:bg-luxury-gold-900/10 blur-[150px] pointer-events-none" />

      {/* Hero Content Grid */}
      <motion.div
        animate={
          isTransitioning
            ? { opacity: 0, y: -20, scale: 0.98 }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="
    flex-1
    max-w-7xl
    mx-auto
    w-full
    px-6
    md:px-10
    lg:px-12
    pt-8
    md:pt-12
    lg:pt-16
    pb-10
    md:pb-14
    relative
    z-10
    grid
    grid-cols-1
    lg:grid-cols-12
    gap-8
    lg:gap-12
    xl:gap-16
    items-center
  "
      >

        {/* Left Column: Typography & CTAs */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lg:col-span-7 flex flex-col items-start space-y-7 lg:space-y-8 pt-6 lg:pt-0"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-luxury-gold-500/20 bg-luxury-gold-500/5 text-luxury-gold-600 dark:text-luxury-gold-400 text-xs font-semibold uppercase tracking-wider"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Operational Artistry</span>
          </motion.div>

          {/* Heading */}
          <motion.div variants={itemVariants} className="space-y-3 lg:space-y-4">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-luxury-charcoal-900 dark:text-white leading-[1.1] font-normal">
              Redefining <span className="italic font-light text-luxury-gold-600 dark:text-luxury-gold-400">Hours of Service</span> Planning
            </h1>
            <p className="font-sans text-base sm:text-lg text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed font-light max-w-xl">
              A premium, design-first scheduling system for intelligent carriers. Calculate FMCSA compliance cycles, optimal route metrics, and fuel stops with cinematic precision.
            </p>
          </motion.div>

          {/* Action Buttons */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button
              onClick={handleDesignClick}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-sm font-semibold uppercase tracking-wider bg-luxury-charcoal-900 text-white dark:bg-luxury-gold-500 dark:text-luxury-charcoal-950 hover:bg-luxury-gold-600 dark:hover:bg-luxury-gold-400 transition-all duration-300 shadow-premium-light dark:shadow-glow hover:scale-[1.03] active:scale-[0.98] group"
            >
              <span>Design Your Route</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => setIsPhilosophyOpen(true)}
              className="inline-flex items-center justify-center px-8 py-4 rounded-full text-sm font-semibold uppercase tracking-wider border border-luxury-ivory-300 dark:border-luxury-charcoal-600 text-luxury-charcoal-700 dark:text-luxury-charcoal-300 hover:bg-white/40 dark:hover:bg-luxury-charcoal-700/45 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              Learn Philosophy
            </button>
          </motion.div>

          {/* Micro Stats */}
          <motion.div
            variants={itemVariants}
            className="flex items-center justify-between w-full pt-8 mt-2 border-t border-luxury-ivory-200 dark:border-luxury-charcoal-700/60"
          >
            <div className="flex-1">
              <Tooltip content={
                <div>
                  <span className="font-semibold block text-luxury-charcoal-900 dark:text-white mb-1">FMCSA Compliance Monitoring</span>
                  <span className="text-[10px] text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed block mb-1">
                    Validates shift logs against the 60/70-Hour rolling limit, flagging safety violations in real time.
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-luxury-gold-500 font-bold block">Ref: § 395.3(b)</span>
                </div>
              }>
                <div className="cursor-help group">
                  <p className="font-sans text-2xl lg:text-3xl font-light tracking-tight text-luxury-charcoal-950 dark:text-white flex items-baseline gap-1">
                    <CountUp value={100} suffix="%" />
                  </p>
                  <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-widest text-luxury-charcoal-400 dark:text-luxury-charcoal-550 mt-1.5 transition-colors group-hover:text-luxury-gold-500">
                    Compliant
                  </p>
                </div>
              </Tooltip>
            </div>

            <div className="w-px h-8 bg-luxury-ivory-200 dark:bg-luxury-charcoal-700/60 mx-4 lg:mx-6" />

            <div className="flex-1">
              <Tooltip content={
                <div>
                  <span className="font-semibold block text-luxury-charcoal-900 dark:text-white mb-1">Instant Operations Engine</span>
                  <span className="text-[10px] text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed block mb-1">
                    Computes drivable corridors, rest times, and fuel checkpoints on the fly to maximize dispatch yield.
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-luxury-gold-500 font-bold block">Real-time Telemetry</span>
                </div>
              }>
                <div className="cursor-help group">
                  <p className="font-sans text-2xl lg:text-3xl font-light tracking-tight text-luxury-charcoal-950 dark:text-white flex items-baseline gap-1">
                    <CountUp value={3} decimals={1} prefix="< " suffix="s" />
                  </p>
                  <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-widest text-luxury-charcoal-400 dark:text-luxury-charcoal-550 mt-1.5 transition-colors group-hover:text-luxury-gold-500">
                    Calculations
                  </p>
                </div>
              </Tooltip>
            </div>

            <div className="w-px h-8 bg-luxury-ivory-200 dark:bg-luxury-charcoal-700/60 mx-4 lg:mx-6" />

            <div className="flex-1">
              <Tooltip content={
                <div>
                  <span className="font-semibold block text-luxury-charcoal-900 dark:text-white mb-1">Interstate Routing Network</span>
                  <span className="text-[10px] text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed block mb-1">
                    Seamless global geocoding support across all US logistics corridors, ports, and transit stations.
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-luxury-gold-500 font-bold block">Leaflet + Photon APIs</span>
                </div>
              }>
                <div className="cursor-help group">
                  <p className="font-sans text-2xl lg:text-3xl font-light tracking-tight text-luxury-charcoal-950 dark:text-white flex items-baseline gap-1">
                    <CountUp value={48} suffix="" />
                  </p>
                  <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-widest text-luxury-charcoal-400 dark:text-luxury-charcoal-550 mt-1.5 transition-colors group-hover:text-luxury-gold-500">
                    Live Coverage
                  </p>
                </div>
              </Tooltip>
            </div>
          </motion.div>
        </motion.div>

        {/* Right Column: AURA Compliance Copilot Panel */}
        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}
          className="lg:col-span-5 relative flex justify-center items-start w-full pt-6 lg:pt-0 pb-4 lg:pb-0"
        >
          {/* Outer glow halo behind card */}
          <div className="absolute inset-x-8 inset-y-4 rounded-3xl bg-luxury-gold-500/5 blur-2xl pointer-events-none" />

          {/* Main Compliance Assistant Card */}
          <div className="relative w-full max-w-[480px] rounded-3xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-900/90 dark:bg-luxury-charcoal-950/85 backdrop-blur-xl shadow-glow flex flex-col overflow-hidden group text-left">

            {/* Glossy Overlay Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />

            {/* Telemetry Background Decoration */}
            <div className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-20 dark:opacity-30 z-0">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(171,137,77,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(171,137,77,0.04)_1px,transparent_1px)] bg-[size:20px_20px]" />
              <svg className="absolute inset-0 w-full h-full text-luxury-gold-500/10" xmlns="http://www.w3.org/2000/svg">
                <line x1="5%" y1="30%" x2="95%" y2="30%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 6" />
                <line x1="5%" y1="70%" x2="95%" y2="70%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 6" />
                <circle cx="50%" cy="50%" r="70" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 5" fill="none" className="animate-spin" style={{ animationDuration: '40s', transformOrigin: 'center' }} />
                <circle cx="50%" cy="50%" r="120" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 8" fill="none" className="animate-spin" style={{ animationDuration: '60s', transformOrigin: 'center', animationDirection: 'reverse' }} />
                <path d="M 14,28 L 14,14 L 28,14" fill="none" stroke="currentColor" strokeWidth="0.75" />
                <path d="M calc(100% - 14),28 L calc(100% - 14),14 L calc(100% - 28),14" fill="none" stroke="currentColor" strokeWidth="0.75" />
              </svg>
              <div className="absolute bottom-3 right-5 font-mono text-[7px] text-luxury-gold-500/30 tracking-widest uppercase">AURA_HOS_V2.1 • ACTIVE</div>
            </div>

            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-luxury-charcoal-800/70 px-5 py-3.5 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="relative flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-60" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-luxury-gold-500 font-bold block leading-none">Compliance Assistant</span>
                  <span className="text-[8px] text-luxury-charcoal-500 uppercase tracking-wider font-mono">FMCSA Intelligence · HOS Auditor</span>
                </div>
              </div>
              {(assistantResponse || assistantError) && (
                <button
                  onClick={handleResetAssistant}
                  title="Back to Actions"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-luxury-charcoal-700/50 hover:border-luxury-gold-500/30 text-luxury-charcoal-500 hover:text-luxury-gold-400 transition-all duration-200 text-[9px] uppercase tracking-wider font-semibold"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Content Area */}
            <div className="relative z-10 flex-1 flex flex-col">

              <AnimatePresence mode="wait">

                {/* Default View: Preset Action Grid */}
                {!isLoading && !assistantResponse && !assistantError && (
                  <motion.div
                    key="presets"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col p-5 gap-4"
                  >
                    <p className="text-[10px] text-luxury-charcoal-500 uppercase tracking-widest font-semibold">
                      Select a compliance query
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {PRESET_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            id={`preset-action-${action.id}`}
                            onClick={() => handlePresetAction(action)}
                            className="group/btn relative flex flex-col items-start gap-2 p-3.5 rounded-2xl border border-luxury-charcoal-700/50 bg-luxury-charcoal-900/60 hover:bg-luxury-charcoal-800/80 hover:border-luxury-gold-500/30 transition-all duration-250 text-left active:scale-[0.97]"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="p-1.5 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500 group-hover/btn:bg-luxury-gold-500/15 transition-colors">
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <ChevronRight className="h-3 w-3 text-luxury-charcoal-600 group-hover/btn:text-luxury-gold-500 group-hover/btn:translate-x-0.5 transition-all duration-200" />
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-luxury-charcoal-200 group-hover/btn:text-white transition-colors leading-snug">{action.label}</p>
                              <p className="text-[9px] text-luxury-charcoal-550 font-mono mt-0.5">{action.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                      {/* 5th card spans full width on its row */}
                    </div>
                    <div className="pt-1 flex items-center justify-between text-[8px] text-luxury-charcoal-600 uppercase tracking-widest border-t border-luxury-charcoal-800/50">
                      <span>FMCSA Auditor · § 395 Compliant</span>
                      <span className="flex items-center gap-1 text-luxury-gold-500/60 font-semibold">
                        <Info className="h-2.5 w-2.5" />
                        AI-Powered
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Loading State */}
                {isLoading && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-5 py-16 px-8"
                  >
                    <div className="relative">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                        className="w-10 h-10 rounded-full border-2 border-luxury-gold-500/15 border-t-luxury-gold-500"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-luxury-gold-500/60 animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[11px] font-semibold text-luxury-charcoal-300">{activeAction?.label}</p>
                      <p className="text-[9px] text-luxury-charcoal-550 uppercase tracking-wider italic">Auditing compliance data...</p>
                    </div>
                    <div className="flex space-x-1.5">
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500/60 rounded-full animate-bounce" style={{ animationDelay: '140ms' }} />
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500/60 rounded-full animate-bounce" style={{ animationDelay: '280ms' }} />
                    </div>
                  </motion.div>
                )}

                {/* Response View */}
                {!isLoading && assistantResponse && (
                  <motion.div
                    key="response"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col p-5 gap-3.5"
                  >
                    {/* Action label badge */}
                    <div className="flex items-center gap-2">
                      {activeAction && (() => { const Icon = activeAction.icon; return <div className="p-1.5 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500"><Icon className="h-3 w-3" /></div>; })()}
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-luxury-gold-500 font-bold">{activeAction?.label}</p>
                        <p className="text-[8px] text-luxury-charcoal-600 font-mono">{activeAction?.desc}</p>
                      </div>
                    </div>

                    {/* Response Text */}
                    <div className="p-4 rounded-2xl border border-luxury-charcoal-700/50 bg-luxury-charcoal-950/60">
                      <p className="text-[11.5px] text-luxury-charcoal-200 leading-relaxed tracking-[0.01em] font-light whitespace-pre-wrap">
                        {assistantResponse}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[8px] text-luxury-charcoal-600 uppercase tracking-widest">
                      <span>AURA Compliance Engine · AI-Generated</span>
                      <span className="text-luxury-gold-500/50">§ 395 Reference</span>
                    </div>
                  </motion.div>
                )}


              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Features Section */}

      <div id="features" className="max-w-7xl mx-auto px-6 md:px-10 lg:px-12 pt-12 pb-16 border-t border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/40 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="font-serif text-3xl md:text-4xl text-luxury-charcoal-900 dark:text-white">Designed for Operational Excellence</h2>
          <p className="font-sans text-sm md:text-base text-luxury-charcoal-500 dark:text-luxury-charcoal-350 font-light">
            Every screen layout, font spacing, and border weight has been balanced to provide a luxury experience that respects the complexity of real-world logistics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="p-6 rounded-2xl border border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/40 bg-white/40 dark:bg-luxury-charcoal-900/30 backdrop-blur-sm space-y-4 hover:border-luxury-gold-500/30 transition-all duration-300">
            <div className="p-2.5 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-600 dark:text-luxury-gold-400 w-fit">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-luxury-charcoal-900 dark:text-white">FMCSA Rules Engine</h3>
            <p className="text-sm font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
              Real-time calculation of driving hours limits, mandatory 30-minute breaks, and cycle constraints dynamically update as you plan.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-2xl border border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/40 bg-white/40 dark:bg-luxury-charcoal-900/30 backdrop-blur-sm space-y-4 hover:border-luxury-gold-500/30 transition-all duration-300">
            <div className="p-2.5 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-600 dark:text-luxury-gold-400 w-fit">
              <Compass className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-luxury-charcoal-900 dark:text-white">Interactive Map Rendering</h3>
            <p className="text-sm font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
              A visually striking leaflet-based viewport displaying polylines, fuel stops, and rest locations synced directly with driver logs.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-2xl border border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/40 bg-white/40 dark:bg-luxury-charcoal-900/30 backdrop-blur-sm space-y-4 hover:border-luxury-gold-500/30 transition-all duration-300">
            <div className="p-2.5 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-600 dark:text-luxury-gold-400 w-fit">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-luxury-charcoal-900 dark:text-white">Dynamic Timeline Visuals</h3>
            <p className="text-sm font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
              No generic dashboards. We visualize hours in chronological order using beautiful timeline components and duty status logs.
            </p>
          </div>
        </div>
      </div>

      {/* Learn Philosophy Modal */}
      <AnimatePresence>
        {isPhilosophyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Glassmorphic Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPhilosophyOpen(false)}
              className="absolute inset-0 bg-luxury-charcoal-950/40 dark:bg-black/60 backdrop-blur-md"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
              className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-luxury-ivory-300 dark:border-luxury-charcoal-600 bg-white/90 dark:bg-luxury-charcoal-900/90 backdrop-blur-xl p-6 md:p-8 shadow-premium-dark text-left"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsPhilosophyOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full border border-luxury-ivory-300 dark:border-luxury-charcoal-700/60 text-luxury-charcoal-400 hover:text-luxury-charcoal-900 dark:hover:text-white hover:bg-luxury-ivory-100 dark:hover:bg-luxury-charcoal-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Title */}
              <div className="space-y-2 mb-8">
                <span className="text-[10px] uppercase tracking-widest text-luxury-gold-500 font-bold">OPERATIONAL PILLARS</span>
                <h3 className="font-serif text-2xl md:text-3xl text-luxury-charcoal-900 dark:text-white font-normal">
                  The AURA HOS Philosophy
                </h3>
                <p className="font-sans text-xs md:text-sm text-luxury-charcoal-500 dark:text-luxury-charcoal-350 font-light">
                  A modern paradigm combining regulatory mathematical rigor with human-centric scheduling design.
                </p>
              </div>

              {/* Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: FMCSA Compliance */}
                <div className="p-5 rounded-2xl border border-luxury-ivory-200 dark:border-luxury-charcoal-700/65 bg-white/40 dark:bg-luxury-charcoal-850/40 hover:border-luxury-gold-500/40 hover:translate-y-[-2px] transition-all duration-300 flex flex-col space-y-2 group">
                  <div className="w-8 h-8 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white">FMCSA Compliance Rigor</h4>
                  <p className="text-xs font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
                    Calculates rolling 60/70-hour shift limits and mandatory breaks automatically, ensuring absolute compliance with FMCSA § 395 regulations to prevent audits.
                  </p>
                </div>

                {/* Card 2: Intelligent Scheduling */}
                <div className="p-5 rounded-2xl border border-luxury-ivory-200 dark:border-luxury-charcoal-700/65 bg-white/40 dark:bg-luxury-charcoal-850/40 hover:border-luxury-gold-500/40 hover:translate-y-[-2px] transition-all duration-300 flex flex-col space-y-2 group">
                  <div className="w-8 h-8 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Compass className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white">Intelligent Scheduling</h4>
                  <p className="text-xs font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
                    Predictive routing coordinates rest times, shipper delivery windows, and traffic patterns synchronously to optimize the entire trip sequence.
                  </p>
                </div>

                {/* Card 3: Fatigue Reduction */}
                <div className="p-5 rounded-2xl border border-luxury-ivory-200 dark:border-luxury-charcoal-700/65 bg-white/40 dark:bg-luxury-charcoal-850/40 hover:border-luxury-gold-500/40 hover:translate-y-[-2px] transition-all duration-300 flex flex-col space-y-2 group">
                  <div className="w-8 h-8 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white">Fatigue Reduction</h4>
                  <p className="text-xs font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
                    Applies circadian sleep models to suggest breaks when driver fatigue is peak, lowering highway risk and improving cargo safety margins.
                  </p>
                </div>

                {/* Card 4: Operational Yield */}
                <div className="p-5 rounded-2xl border border-luxury-ivory-200 dark:border-luxury-charcoal-700/65 bg-white/40 dark:bg-luxury-charcoal-850/40 hover:border-luxury-gold-500/40 hover:translate-y-[-2px] transition-all duration-300 flex flex-col space-y-2 group">
                  <div className="w-8 h-8 rounded-lg bg-luxury-gold-500/10 text-luxury-gold-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-luxury-charcoal-900 dark:text-white">Operational Yield</h4>
                  <p className="text-xs font-light text-luxury-charcoal-550 dark:text-luxury-charcoal-300 leading-relaxed">
                    Minimizes deadhead miles and empty waiting times through high-precision geocoding queries, driving up load utility and fleet profitability.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cinematic Transition Overlay */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-luxury-charcoal-950/80 dark:bg-black/90 backdrop-blur-md"
          >
            <div className="flex flex-col items-center space-y-4">
              {/* Spinner/Loader */}
              <div className="relative w-16 h-16">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-luxury-gold-500/20 border-t-luxury-gold-500"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
                  className="absolute inset-2 rounded-full border border-luxury-gold-500/10 border-b-luxury-gold-500/60"
                />
              </div>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xs uppercase tracking-widest text-luxury-gold-500 font-bold animate-pulse"
              >
                Initializing HOS Engine
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
