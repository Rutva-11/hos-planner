import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2.5 rounded-full glass-panel hover:border-luxury-gold-400/50 dark:hover:border-luxury-gold-500/50 transition-colors duration-300 text-luxury-charcoal-500 dark:text-luxury-charcoal-300 focus:outline-none focus:ring-1 focus:ring-luxury-gold-500 overflow-hidden"
      aria-label="Toggle Color Scheme"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: 20, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -20, opacity: 0, rotate: 40 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="flex items-center justify-center"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-luxury-gold-400" />
          ) : (
            <Moon className="h-5 w-5 text-luxury-gold-600" />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
