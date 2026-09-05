import type {Config} from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6', // Electric violet
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        navy: {
          50:  '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0b192c',
        },
        midnight: {
          800: '#141824',
          900: '#0a0d14',
          950: '#05060a',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        }
      },
      boxShadow: {
        'card':         '0 2px 4px -1px rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.02)',
        'card-hover':   '0 10px 25px -3px rgb(0 0 0 / 0.08), 0 4px 10px -4px rgb(0 0 0 / 0.04)',
        'glow-emerald': '0 0 0 3px rgb(16 185 129 / 0.15)',
        'glow-amber':   '0 0 0 3px rgb(245 158 11 / 0.15)',
        'glow-brand':   '0 0 0 3px rgb(139 92 246 / 0.15)',
        'premium':      '0 0 40px -10px rgba(139, 92, 246, 0.15)',
      },
      animation: {
        'fade-in':    'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up':   'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':    'shimmer 1.8s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition:  '400px 0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;

