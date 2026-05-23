import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Truck } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const location = useLocation();
  const activePath = location.pathname;

  const navLinks = [
    { name: 'Intelligent HOS', path: '/' },
    { name: 'Trip Planner', path: '/planner' },
  ];

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-4 pointer-events-none"
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3 rounded-full border border-luxury-ivory-200/40 dark:border-luxury-charcoal-700/50 bg-white/70 dark:bg-luxury-charcoal-800/70 backdrop-blur-md shadow-premium-light dark:shadow-premium-dark pointer-events-auto transition-all duration-300">
        
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="p-1.5 rounded-lg bg-luxury-gold-500/10 dark:bg-luxury-gold-500/20 text-luxury-gold-600 dark:text-luxury-gold-400 group-hover:scale-105 transition-transform duration-300">
            <Truck className="h-5 w-5" />
          </div>
          <span className="font-sans font-semibold tracking-wider text-sm uppercase text-luxury-charcoal-900 dark:text-white">
            AURA <span className="text-luxury-gold-500 font-light">HOS</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <div className="hidden sm:flex items-center gap-8 text-sm">
          {navLinks.map((link) => {
            const isActive = activePath === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className="relative py-1.5 px-3 font-medium text-luxury-charcoal-600 dark:text-luxury-charcoal-300 hover:text-luxury-gold-600 dark:hover:text-luxury-gold-400 transition-colors duration-300"
              >
                {isActive && (
                  <motion.span
                    layoutId="activeNavDot"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-luxury-gold-500"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            to="/planner"
            className="hidden sm:inline-flex px-5 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-luxury-charcoal-900 text-white dark:bg-luxury-gold-500 dark:text-luxury-charcoal-950 hover:bg-luxury-gold-600 dark:hover:bg-luxury-gold-400 transition-all duration-300 shadow-premium-light dark:shadow-glow hover:scale-[1.02] active:scale-[0.98]"
          >
            Launch Planner
          </Link>
          
          {/* Mobile menu link indicator */}
          <Link
            to={activePath === '/' ? '/planner' : '/'}
            className="sm:hidden text-xs font-semibold tracking-wider uppercase text-luxury-gold-600 dark:text-luxury-gold-400 py-1.5 px-3 rounded-full border border-luxury-gold-500/20"
          >
            {activePath === '/' ? 'Planner' : 'Home'}
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}
