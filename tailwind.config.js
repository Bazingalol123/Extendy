/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./options.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],  // ← Support both
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
        medium: "0 4px 16px rgba(0,0,0,0.12)",
        strong: "0 8px 24px rgba(0,0,0,0.16)",
      },
    },
  },
  plugins: [],
}