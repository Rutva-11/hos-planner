/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        luxury: {
          gold: {
            50: '#fbf9f4',
            100: '#f5efe0',
            200: '#e6dbbe',
            300: '#d2c093',
            400: '#bda26b',
            500: '#ab894d', // Luxury Gold accent
            600: '#94723e',
            700: '#7b5b32',
            800: '#64482a',
            900: '#523a23',
            950: '#2f1f12',
          },
          ivory: {
            50: '#fbfaf7', // Warm base background
            100: '#f6f4ed', // Card background (light mode)
            200: '#ede8dc', // Light borders
            300: '#dfd7c3',
            400: '#cbbea3',
            500: '#b4a282',
            600: '#9d8868',
            700: '#826f54',
            800: '#6b5c46',
            900: '#584c3b',
            950: '#2e271e',
          },
          charcoal: {
            50: '#f4f4f5',
            100: '#e4e4e7',
            200: '#d4d4d8',
            300: '#a1a1aa',
            400: '#71717a',
            500: '#3f3f46',
            600: '#27272a',
            700: '#18181b', // Cards background (dark mode)
            800: '#0f0f11', // Main page background (dark mode)
            900: '#09090b',
            950: '#030303',
          }
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'premium-light': '0 4px 30px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'premium-dark': '0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)',
        'glow': '0 0 15px rgba(171, 137, 77, 0.15)',
        'glow-strong': '0 0 25px rgba(171, 137, 77, 0.3)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
