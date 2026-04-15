import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)" },
        gold: { DEFAULT: "var(--gold)", deep: "var(--gold-deep)" },
        charcoal: "var(--charcoal)",
        line: "var(--line)",
      },
      fontFamily: {
        sans: ["Work Sans", "sans-serif"],
        display: ["Cormorant Garamond", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
