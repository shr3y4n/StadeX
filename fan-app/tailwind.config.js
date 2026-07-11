/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stadium: {
          bg: '#0B0F19',
          card: '#151D30',
          cardLight: '#1E293B',
          accent: '#06B6D4', // Neon Cyan
          accentGlow: '#0891B2',
          green: '#10B981', // Neon Green
          red: '#EF4444', // Alert Rose/Red
          yellow: '#F59E0B' // Amber
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
