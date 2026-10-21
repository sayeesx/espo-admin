/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        epso: {
          red: '#C6382B',
          'red-hover': '#B02A1F',
          'red-light': '#FDF2F2',
          amber: '#F59E0B',
          'amber-hover': '#D97706',
          orange: '#EA580C',
        },
        brand: {
          50: '#FDF2F2',
          100: '#FDE8E8',
          200: '#FBD5D5',
          300: '#F8B4B4',
          400: '#F05252',
          500: '#E02424',
          600: '#C6382B',
          700: '#B02A1F',
          800: '#902017',
          900: '#771D1D',
          DEFAULT: '#C6382B',
        },
        accent: {
          light: '#FDE68A',
          DEFAULT: '#F59E0B',
          dark: '#D97706',
        },
        canvas: {
          DEFAULT: '#F8F9FA',
          muted: '#F1F2F4',
          card: '#FFFFFF',
          dark: '#141212',
          'card-dark': '#1E1B1B',
          'surface-dark': '#242020',
        },
        charcoal: {
          DEFAULT: '#141212',
          muted: '#6B7280',
          subtle: '#9CA3AF',
          border: '#E5E7EB',
          'border-dark': '#2E2828',
          'text-dark': '#FFFFFF',
          'muted-dark': '#A39E9B',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        malayalam: ['"Anek Malayalam"', '"Manjari"', '"Noto Sans Malayalam"', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      boxShadow: {
        'apple-card': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'apple-card-dark': '0 4px 20px rgba(0, 0, 0, 0.4)',
        'apple-modal': '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-snap': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
