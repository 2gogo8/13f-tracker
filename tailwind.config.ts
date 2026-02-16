import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#ffffff",
        primary: "#C41E3A",      // Deep red (Cartier)
        secondary: "#0A0A0A",    // Card background
        accent: "#D4AF37",       // Gold
        border: "#1A1A1A",       // Subtle border
      },
    },
  },
  plugins: [],
} satisfies Config;
