/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#000000",
          secondary: "#4CFC0F",
          gray: "#D8D8D8",
          light: "#F4F4F4",
          white: "#FFFFFF",
        },
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(0,0,0,0.15)",
      },
    },
  },
  plugins: [],
};
