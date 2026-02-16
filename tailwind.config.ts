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
      boxShadow: {
        'apple': '0 2px 20px rgba(0, 0, 0, 0.3)',
        'apple-hover': '0 4px 30px rgba(196, 30, 58, 0.15)',
        'apple-gold': '0 4px 30px rgba(212, 175, 55, 0.15)',
      },
    },
  },
  plugins: [],
} satisfies Config;
