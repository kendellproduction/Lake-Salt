/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f9ff', // Sky 50
          100: '#e0f2fe', // Sky 100
          200: '#bae6fd', // Sky 200
          300: '#7dd3fc', // Sky 300
          400: '#38bdf8', // Sky 400
          500: '#0ea5e9', // Sky 500
          600: '#0284c7', // Sky 600
          700: '#0369a1', // Sky 700
          800: '#075985', // Sky 800
          900: '#0c4a6e', // Sky 900
        },
        cream: {
          50: '#f8fafc', // Slate 50
          100: '#f1f5f9', // Slate 100
          200: '#e2e8f0', // Slate 200
          300: '#cbd5e1', // Slate 300
          400: '#94a3b8', // Slate 400
          500: '#64748b', // Slate 500
          600: '#475569', // Slate 600
        },
        gold: {
          50: '#f0fdfa', // Teal 50
          100: '#ccfbf1', // Teal 100
          200: '#99f6e4', // Teal 200
          300: '#5eead4', // Teal 300
          400: '#2dd4bf', // Teal 400
          500: '#14b8a6', // Teal 500
          600: '#0d9488', // Teal 600
          700: '#0f766e', // Teal 700
          800: '#115e59', // Teal 800
          900: '#134e4a', // Teal 900
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-luxury': 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', // Dark Slate/Navy
        'gradient-gold': 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', // Teal gradient
        'gradient-cream': 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', // Sky gradient
        'gradient-shine': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
      },
      animation: {
        snowflake: 'snowflake 10s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'slide-up': 'slideUp 0.8s ease-out',
      },
      keyframes: {
        snowflake: {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(360deg)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(14, 165, 233, 0.3)' }, // Sky blue glow
          '50%': { boxShadow: '0 0 40px rgba(14, 165, 233, 0.6)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'luxury': '0 10px 40px rgba(0, 0, 0, 0.3)',
        'gold': '0 10px 30px rgba(212, 175, 55, 0.3)',
        'inner-glow': 'inset 0 0 30px rgba(212, 175, 55, 0.2)',
      },
    },
  },
}

