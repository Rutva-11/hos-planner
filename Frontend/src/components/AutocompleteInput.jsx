import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { fetchAutocompleteSuggestions } from '../services/api';

export default function AutocompleteInput({
  label,
  value,
  onChange,
  onSelectSuggestion,
  onClearErrors,
  placeholder,
  disabled,
  error,
  icon: Icon = MapPin,
  iconColorClass = 'text-luxury-gold-500',
  rateLimitCountdown,
  onRateLimit,
  queryCache,
  isSubmitting,
  presets = []
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  
  const lastConfirmedValue = useRef(value || '');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Sync internal value with parent controlled value
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value || '');
      lastConfirmedValue.current = value || '';
    }
  }, [value]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search logic
  useEffect(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    // Skip calling API if it's already one of the presets or identical to the selected/confirmed value
    const isPreset = presets.some(p => p.toLowerCase() === trimmed.toLowerCase());
    if (isPreset || trimmed.toLowerCase() === lastConfirmedValue.current.toLowerCase()) {
      setSuggestions([]);
      return;
    }

    // Check shared/ref queryCache
    if (queryCache && queryCache.current[trimmed]) {
      setSuggestions(queryCache.current[trimmed]);
      return;
    }

    setIsFetching(true);
    const handler = setTimeout(async () => {
      try {
        const results = await fetchAutocompleteSuggestions(trimmed);
        if (isMountedRef.current) {
          if (queryCache) {
            queryCache.current[trimmed] = results;
          }
          setSuggestions(results);
        }
      } catch (err) {
        if (isMountedRef.current) {
          if ((err.status === 429 || err.code === 'rate_limited') && onRateLimit) {
            onRateLimit();
          }
          setSuggestions([]);
        }
      } finally {
        if (isMountedRef.current) {
          setIsFetching(false);
        }
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(handler);
  }, [inputValue, value, presets, queryCache, onRateLimit]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    setIsOpen(true);
    setActiveIndex(-1);
    if (onClearErrors) onClearErrors();
  };

  const handleSelect = (suggestion) => {
    lastConfirmedValue.current = suggestion.name;
    setInputValue(suggestion.name);
    onChange(suggestion.name);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    }
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || (suggestions.length === 0 && !isFetching)) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelect(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const shakeVariants = {
    shake: {
      x: [0, -6, 6, -6, 6, 0],
      transition: { duration: 0.4 }
    },
    idle: { x: 0 }
  };

  const handleBlur = (e) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
      setIsOpen(false);
      
      const trimmed = inputValue.trim().toLowerCase();
      const isPreset = presets.some(p => p.toLowerCase() === trimmed);
      const isConfirmed = trimmed === lastConfirmedValue.current.trim().toLowerCase();
      
      if (trimmed !== "" && !isPreset && !isConfirmed) {
        // Revert to last confirmed value if current typing is unverified
        setInputValue(lastConfirmedValue.current);
        onChange(lastConfirmedValue.current);
      } else if (trimmed === "") {
        // Clear value if empty
        lastConfirmedValue.current = "";
        onChange("");
      }
    }
  };

  // Determine if the current input value matches a valid selected/preset location.
  const isValidated = presets.some(p => p.toLowerCase() === inputValue.trim().toLowerCase()) || 
                      inputValue.trim().toLowerCase() === lastConfirmedValue.current.trim().toLowerCase();

  return (
    <div ref={containerRef} onBlur={handleBlur} className="space-y-1.5 relative w-full">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-luxury-charcoal-400 dark:text-luxury-ivory-400 font-semibold flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${iconColorClass}`} />
          <span>{label}</span>
        </label>
        {inputValue.trim().length >= 3 && !isFetching && (
          <span className={`text-[9px] lowercase tracking-wide font-normal transition-opacity duration-300 ${
            isValidated ? 'text-emerald-500' : 'text-amber-500'
          }`}>
            {isValidated ? '● validated location' : '● select a suggestion'}
          </span>
        )}
      </div>
      
      <motion.div
        animate={error ? "shake" : "idle"}
        variants={shakeVariants}
        className="relative"
      >
        <input
          type="text"
          disabled={disabled || isSubmitting}
          value={inputValue}
          onChange={handleTextChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full py-3.5 pl-4 pr-10 rounded-xl bg-white/60 dark:bg-luxury-charcoal-900/60 border ${
            error ? 'border-red-500 dark:border-red-500/80 focus:ring-red-400' : 'border-luxury-ivory-200 dark:border-luxury-charcoal-700 focus:border-luxury-gold-500'
          } text-sm text-luxury-charcoal-900 dark:text-white placeholder-luxury-charcoal-400 focus:outline-none focus:ring-1 focus:ring-luxury-gold-500 transition-all duration-300 ${
            disabled || isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        />
        <Icon className={`absolute right-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-luxury-charcoal-400 pointer-events-none`} />
      </motion.div>

      <AnimatePresence>
        {isOpen && (isFetching || suggestions.length > 0 || (inputValue.trim().length >= 3 && suggestions.length === 0)) && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden glass-panel-heavy shadow-xl max-h-60 overflow-y-auto border border-luxury-ivory-200/50 dark:border-luxury-charcoal-750/70"
          >
            {isFetching ? (
              <div className="flex items-center gap-2 p-4 text-xs text-luxury-charcoal-450 dark:text-luxury-charcoal-400 bg-white/90 dark:bg-luxury-charcoal-900/95 backdrop-blur-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-luxury-gold-500" />
                <span>Searching global dispatch databases...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="py-1 bg-white/95 dark:bg-luxury-charcoal-900/95 backdrop-blur-md">
                {suggestions.map((suggestion, index) => {
                  const isHovered = index === activeIndex;
                  const name = suggestion.name || '';
                  const commaIndex = name.indexOf(',');
                  let primary = name;
                  let secondary = '';
                  if (commaIndex !== -1) {
                    primary = name.substring(0, commaIndex);
                    secondary = name.substring(commaIndex);
                  }

                  return (
                    <button
                      key={index}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevents input blur before selection
                        handleSelect(suggestion);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`w-full text-left px-4 py-3 text-xs transition-colors border-b border-luxury-ivory-200/40 dark:border-luxury-charcoal-800/45 last:border-b-0 flex items-center gap-2 ${
                        isHovered 
                          ? 'bg-luxury-gold-500/15' 
                          : 'hover:bg-luxury-gold-500/10'
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5 text-luxury-gold-500/70 flex-shrink-0" />
                      <span className="truncate">
                        <span className={`font-semibold ${isHovered ? 'text-luxury-gold-600 dark:text-luxury-gold-400' : 'text-luxury-charcoal-900 dark:text-white'}`}>
                          {primary}
                        </span>
                        {secondary && (
                          <span className={`text-[10px] ${isHovered ? 'text-luxury-gold-500/80 dark:text-luxury-gold-400/80' : 'text-luxury-charcoal-450 dark:text-luxury-charcoal-400'} font-normal`}>
                            {secondary}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-xs text-center text-luxury-charcoal-450 dark:text-luxury-charcoal-400 bg-white/90 dark:bg-luxury-charcoal-900/95 backdrop-blur-md">
                No matching locations found
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            className="text-[11px] text-red-500 flex items-center gap-1 mt-1 font-light"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span>{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
