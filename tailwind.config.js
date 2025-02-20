/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "highlight-fade": {
          "0%": { backgroundColor: "rgba(16, 185, 129, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(-1rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "highlight-fade": "highlight-fade 2s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwind-scrollbar")({ nocompatible: true })],
};
