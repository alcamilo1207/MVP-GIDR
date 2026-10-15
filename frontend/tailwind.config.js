/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef4fb', 100: '#d9e6f5', 500: '#2f6db5', 600: '#245a9a', 700: '#1c4a80', 900: '#0f2a4a' },
      },
    },
  },
  plugins: [],
}
