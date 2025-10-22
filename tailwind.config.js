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
        brand: {
          DEFAULT: "#0078d7",
          light: "#4da6ff",
          dark: "#004f9e",
        },
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
}
