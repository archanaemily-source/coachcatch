/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0E1116',
        panel: '#1C222B',
        border: '#2A3038',
        text: '#F2F0EB',
        muted: '#9BA1A8',
        rep: '#FF5C1F',
        heart: '#3EC9A7',
        error: '#FF3B57',
        success: '#58C24E',
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
