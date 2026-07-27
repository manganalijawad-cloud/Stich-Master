/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.html',
    './auth/**/*.html',
    './*.js',
    './auth/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        brand: {
          sidebar: '#0F172A',
          active: '#1E293B',
          sky: '#38BDF8',
          bg: '#F8FAFC',
        },
      },
    },
  },
  plugins: [],
}
