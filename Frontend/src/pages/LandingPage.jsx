import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate, animate } from 'framer-motion';
import { ArrowRight, ShieldCheck, Compass, Clock, MapPin, Sparkles, X, Info, Send, Trash2, Copy, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { sendCopilotChatMessage } from '../services/api';

// Quick action suggestions for the copilot
const COPILOT_SUGGESTIONS = [
  "Explain 11-hour rule",
  "Why is my route violating HOS?",
  "Optimize this trip",
  "Explain sleeper berth rules",
  "How can I reduce drive time?",
  "What is the 70-hour cycle rule?",
  "Suggest fuel stops",
  "Explain mandatory break rules"
];

// CountUp component using framer-motion animate for spring-like counts without triggering component re-renders
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

// Simple helper to parse basic markdown elements inside chatbot message bubbles
function formatMessageText(text) {
  if (!text) return '';

  let html = text;

  // Replace GitHub-style alerts: > [!NOTE]\n> *Note: ...*
  html = html.replace(/> \[\!(NOTE|WARNING|IMPORTANT)\]\n>\s*(.*)/g, (match, type, content) => {
    const colors = {
      NOTE: 'border-l-2 border-luxury-gold-500 bg-luxury-gold-500/5 text-luxury-gold-400',
      WARNING: 'border-l-2 border-red-500 bg-red-500/5 text-red-400',
      IMPORTANT: 'border-l-2 border-blue-500 bg-blue-500/5 text-blue-400'
    };
    return `<div class="p-2 rounded-r-lg my-2 text-[10px] ${colors[type] || colors.NOTE}">${content}</div>`;
  });

  // Headers: ### text
  html = html.replace(/^### (.*$)/gim, '<h4 class="text-xs font-bold text-luxury-gold-400 mt-2 mb-1">$1</h4>');

  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');

  // Bullet lists: - item
  html = html.replace(/^\s*-\s*(.*$)/gim, '<li class="list-disc ml-4 my-0.5">$1</li>');

  // Linebreaks: \n
  html = html.replace(/\n/g, '<br />');

  // Parse tables if any are present in the response
  if (html.includes('|')) {
    const lines = html.split('<br />');
    let inTable = false;
    let tableHtml = '<div class="overflow-x-auto my-3"><table class="min-w-full text-[10px] border-collapse border border-luxury-charcoal-700/60">';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes('---') || line.includes(':---')) {
          continue;
        }

        if (!inTable) {
          inTable = true;
        }

        const cells = line.split('|').slice(1, -1);
        tableHtml += '<tr class="border-b border-luxury-charcoal-800/80">';
        cells.forEach(cell => {
          const isHeader = !lines[i - 1] || !lines[i - 1].trim().startsWith('|') || lines[i + 1]?.includes('---');
          const cellTag = isHeader ? 'th' : 'td';
          const cellClass = isHeader
            ? 'p-1.5 font-semibold text-luxury-gold-400 bg-luxury-charcoal-900 text-left'
            : 'p-1.5 text-luxury-charcoal-200 text-left';
          tableHtml += `<${cellTag} class="${cellClass}">${cell.trim()}</${cellTag}>`;
        });
        tableHtml += '</tr>';
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</table></div>';
          lines[i] = tableHtml + lines[i];
        }
      }
    }
    if (inTable) {
      tableHtml += '</table></div>';
      html = lines.join('<br />') + tableHtml;
    } else {
      html = lines.join('<br />');
    }
  }

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [isPhilosophyOpen, setIsPhilosophyOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);

  const activeRoute = SIMULATED_ROUTES[activeRouteIndex];

  // Copilot Chat States
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: "Hello! I am your **AURA Compliance Copilot**.\n\nI am tracking your route metrics in real time. Ask me about FMCSA regulations, 11-hour driving limits, sleeper berth rules, or fuel stops.",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    setInputValue('');
    setChatError(null);
    setIsLoading(true);

    const userMessageId = `user-${Date.now()}`;
    const userMessage = {
      id: userMessageId,
      sender: 'user',
      text: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Send dialogue history up to last 6 messages
    const formattedHistory = messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({
        sender: m.sender,
        text: m.text
      }));

    const contextData = {
      name: activeRoute.name,
      distance: activeRoute.distance,
      cycleRemaining: activeRoute.cycleRemaining,
      drivingLimit: activeRoute.drivingLimit,
      stops: activeRoute.stops
    };

    try {
      const response = await sendCopilotChatMessage(text, formattedHistory, contextData);
      const botMessageId = `bot-${Date.now()}`;

      const placeholderBotMessage = {
        id: botMessageId,
        sender: 'bot',
        text: '',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, placeholderBotMessage]);
      setIsLoading(false);

      // Stream the response text word-by-word
      let currentWordIndex = 0;
      const words = response.reply.split(' ');
      const typingTimer = setInterval(() => {
        if (currentWordIndex < words.length) {
          const chunk = words.slice(0, currentWordIndex + 1).join(' ');
          setMessages(prev =>
            prev.map(msg => msg.id === botMessageId ? { ...msg, text: chunk } : msg)
          );
          currentWordIndex++;
        } else {
          clearInterval(typingTimer);
        }
      }, 35);

    } catch (error) {
      console.error("Copilot error:", error);
      setIsLoading(false);
      setChatError({
        message: error.message || 'Failed to reach AURA Copilot service.',
        retryText: text
      });
    }
  };

  const handleRetry = () => {
    if (chatError && chatError.retryText) {
      const textToRetry = chatError.retryText;
      setChatError(null);
      handleSendMessage(textToRetry);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'bot',
        text: "Hello! I am your **AURA Compliance Copilot**.\n\nI am tracking your route metrics in real time. Ask me about FMCSA regulations, 11-hour driving limits, sleeper berth rules, or fuel stops.",
        timestamp: new Date()
      }
    ]);
    setChatError(null);
  };

  const handleCopyMessage = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handlePillClick = (promptText) => {
    handleSendMessage(promptText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
          {/* Main Card Container */}
          <div className="relative w-full max-w-[500px] h-[490px] rounded-3xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-900/90 dark:bg-luxury-charcoal-950/85 backdrop-blur-xl shadow-glow flex flex-col overflow-hidden group text-left">

            {/* Glossy Overlay Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />

            {/* Header: Title and controls */}
            <div className="flex items-center justify-between border-b border-luxury-charcoal-800/70 px-6 py-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-60" />
                </div>
                <span className="text-[10px] uppercase tracking-widest text-luxury-gold-500 font-bold">AURA Compliance Copilot</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] px-2.5 py-1 rounded-lg bg-luxury-charcoal-800/80 text-luxury-charcoal-400 border border-luxury-charcoal-700/30 font-mono truncate max-w-[130px]">
                  {activeRoute.name}
                </span>
                <button
                  onClick={handleClearChat}
                  title="Clear Conversation"
                  className="p-1.5 rounded-lg border border-luxury-charcoal-700/50 hover:border-luxury-charcoal-600 text-luxury-charcoal-500 hover:text-luxury-gold-400 transition-all duration-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Message Feed Area */}
            <div className="flex-1 overflow-y-auto px-6 py-3.5 space-y-3.5 scrollbar-thin scrollbar-thumb-luxury-gold-500/10 hover:scrollbar-thumb-luxury-gold-500/20 overscroll-contain relative">

              {/* Subtle Operational UI Visuals */}
              <div className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-30 dark:opacity-40 z-0">
                {/* Faint Grid Texture */}
                <div
                  className="absolute inset-0 bg-[linear-gradient(to_right,rgba(171,137,77,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(171,137,77,0.04)_1px,transparent_1px)] bg-[size:16px_16px]"
                />

                {/* Soft glow gradient overlay */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full bg-luxury-gold-500/5 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />

                {/* Telemetry Visuals */}
                <svg className="absolute inset-0 w-full h-full text-luxury-gold-500/10" xmlns="http://www.w3.org/2000/svg">
                  {/* Faint Horizontal/Vertical Telemetry lines */}
                  <line x1="5%" y1="25%" x2="95%" y2="25%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 6" />
                  <line x1="5%" y1="75%" x2="95%" y2="75%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 6" />
                  <line x1="25%" y1="5%" x2="25%" y2="95%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 10" />
                  <line x1="75%" y1="5%" x2="75%" y2="95%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 10" />

                  {/* Concentric rotating radar lines */}
                  <circle cx="50%" cy="50%" r="50" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 4" fill="none" className="animate-spin" style={{ animationDuration: '30s', transformOrigin: 'center' }} />
                  <circle cx="50%" cy="50%" r="90" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 8" fill="none" className="animate-spin" style={{ animationDuration: '50s', transformOrigin: 'center', animationDirection: 'reverse' }} />

                  {/* Target Crosshairs in the corners */}
                  <path d="M 16,32 L 16,16 L 32,16" fill="none" stroke="currentColor" strokeWidth="0.75" />
                  <path d="M 16,calc(100% - 32) L 16,calc(100% - 16) L 32,calc(100% - 16)" fill="none" stroke="currentColor" strokeWidth="0.75" />
                  <path d="M calc(100% - 16),32 L calc(100% - 16),16 L calc(100% - 32),16" fill="none" stroke="currentColor" strokeWidth="0.75" />
                  <path d="M calc(100% - 16),calc(100% - 32) L calc(100% - 16),calc(100% - 16) L calc(100% - 32),calc(100% - 16)" fill="none" stroke="currentColor" strokeWidth="0.75" />
                </svg>

                {/* Pulse Compliance Indicator */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center space-y-1.5 opacity-60">
                  <div className="relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-luxury-gold-500/40" />
                    <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-luxury-gold-500/30 animate-ping" />
                  </div>
                  <span className="text-[7px] font-mono tracking-widest text-luxury-gold-500/30 uppercase">SYSTEM ACTIVE</span>
                </div>

                {/* Faint Telemetry text in corners */}
                <div className="absolute top-4 left-6 font-mono text-[7px] text-luxury-gold-500/20 tracking-widest uppercase">
                  LAT: 47.6062° N | LON: 122.3321° W
                </div>
                <div className="absolute bottom-4 right-6 font-mono text-[7px] text-luxury-gold-500/20 tracking-widest uppercase">
                  AURA_HOS_V2.1.0 • COMPLIANT
                </div>
              </div>

              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} relative z-10`}
                  >
                    <div
                      className={`relative group/msg max-w-[88%] rounded-2xl px-4 py-3 text-[11px] shadow-sm border ${msg.sender === 'user'
                          ? 'bg-luxury-gold-500/10 text-luxury-gold-100 border-luxury-gold-500/20 rounded-tr-sm'
                          : 'bg-luxury-charcoal-805/85 text-luxury-charcoal-200 border-luxury-charcoal-700/40 rounded-tl-sm'
                        }`}
                    >
                      {/* Message Content */}
                      <div className="prose prose-invert prose-xs max-w-none leading-relaxed tracking-[0.01em]">
                        {formatMessageText(msg.text)}
                      </div>

                      {/* Floating Timestamp & Actions (only show for bot/AI answers) */}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-luxury-charcoal-550">
                        <span>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.sender === 'bot' && msg.text && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.text)}
                            className="opacity-0 group-hover/msg:opacity-100 p-1 hover:text-luxury-gold-400 transition-all rounded"
                            title="Copy Response"
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Bot loading state */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start relative z-10"
                >
                  <div className="bg-luxury-charcoal-805/85 border border-luxury-charcoal-700/40 rounded-2xl rounded-tl-sm p-3.5 text-xs max-w-[85%] shadow-sm flex items-center space-x-2 text-luxury-charcoal-350">
                    <span className="flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-luxury-gold-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="text-[10px] italic">Auditing compliance...</span>
                  </div>
                </motion.div>
              )}

              {/* Error cards state */}
              {chatError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-200 space-y-2.5 shadow-sm relative z-10"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-300">Connection Interrupted</p>
                      <p className="text-[10px] text-red-400 mt-0.5 leading-relaxed">{chatError.message}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleRetry}
                      className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-[10px] font-semibold tracking-wider uppercase text-red-200 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Retry</span>
                    </button>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Suggestions & Input Tray */}
            <div className="px-6 pt-3 pb-3.5 border-t border-luxury-charcoal-800/70 bg-luxury-charcoal-900/60 flex flex-col gap-2.5 relative z-10">

              {/* Quick Prompt Pills (only visible when not busy) */}
              {!isLoading && !chatError && (
                <div className="relative w-full overflow-hidden">
                  <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none snap-x select-none" style={{ maskImage: 'linear-gradient(to right, white 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, white 85%, transparent 100%)' }}>
                    {COPILOT_SUGGESTIONS.map((pill, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePillClick(pill)}
                        className="flex-shrink-0 snap-center px-3 py-1.5 rounded-full border border-luxury-charcoal-800 bg-luxury-charcoal-800/40 text-[10px] text-luxury-charcoal-350 hover:text-luxury-gold-400 hover:border-luxury-gold-500/20 hover:bg-luxury-charcoal-800/80 transition-all duration-200"
                      >
                        {pill}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input Text Area & Send button */}
              <div className="relative flex items-center">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Copilot about HOS limits..."
                  rows={1}
                  disabled={isLoading}
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-luxury-charcoal-700/60 bg-luxury-charcoal-950/90 text-[11px] text-white placeholder-luxury-charcoal-550/75 focus:outline-none focus:border-luxury-gold-500/40 focus:ring-1 focus:ring-luxury-gold-500/20 resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
                  style={{ maxHeight: '72px' }}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputValue.trim()}
                  className="absolute right-3 bottom-2.5 p-2 rounded-lg bg-luxury-gold-500 text-luxury-charcoal-950 hover:bg-luxury-gold-400 active:scale-95 transition-all duration-150 disabled:opacity-25 disabled:hover:bg-luxury-gold-500 disabled:cursor-not-allowed shadow-md"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>

              {/* Footer text */}
              <div className="flex items-center justify-between text-[8px] text-luxury-charcoal-500 uppercase tracking-widest px-0.5">
                <span>FMCSA AUDITOR • 2026</span>
                <span className="flex items-center gap-1 font-semibold text-luxury-gold-500/70">
                  <Info className="h-2.5 w-2.5" /> Domain Locked
                </span>
              </div>
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
