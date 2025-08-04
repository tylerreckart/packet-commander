/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{html,js,ts}"],
  theme: {
    extend: {
      colors: {
        // Deep black theme
        'deep': {
          50: '#18181b',   // zinc-900
          100: '#09090b',  // zinc-950
          200: '#000000',  // pure black
        },
        // Bright contrast colors based on #0738FF
        'electric': {
          50: '#f0f4ff',   // Very light blue
          100: '#e1eaff',  // Light blue
          200: '#c3d5ff',  // Lighter blue
          300: '#94b8ff',  // Medium light blue
          400: '#5a92ff',  // Medium blue
          500: '#0738ff',  // Primary blue #0738FF
          600: '#0629cc',  // Darker blue
          700: '#051f99',  // Dark blue
          800: '#041866',  // Very dark blue
          900: '#031133',  // Darkest blue
        },
        'accent': {
          50: '#fef2f2',   // red-50
          100: '#fee2e2',  // red-100
          200: '#fecaca',  // red-200
          300: '#fca5a5',  // red-300
          400: '#f87171',  // red-400
          500: '#ef4444',  // red-500
          600: '#dc2626',  // red-600
          700: '#b91c1c',  // red-700
          800: '#991b1b',  // red-800
          900: '#7f1d1d',  // red-900
        },
        'success': {
          500: '#10b981',  // emerald-500
          600: '#059669',  // emerald-600
          700: '#047857',  // emerald-700
        },
        'warning': {
          500: '#f59e0b',  // amber-500
          600: '#d97706',  // amber-600
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}