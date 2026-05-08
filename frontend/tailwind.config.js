/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0a0a0a',
        card:    '#111111',
        card2:   '#161616',
        border:  '#1e1e1e',
        accent:  '#f97316',
        buy:     '#22c55e',
        sell:    '#ef4444',
        hold:    '#f59e0b'
      }
    }
  },
  plugins: []
};
