/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "highlight-fade": {
          "0%": { backgroundColor: "rgba(16, 185, 129, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "highlight-fade": "highlight-fade 2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
