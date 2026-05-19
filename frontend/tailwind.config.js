/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#1E3A8A",
          secondary: "#3B82F6",
          accent: "#10B981",
          dark: "#0F172A",
        },
      },
    },
  },
  plugins: [],
};
