import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1320px",
      },
    },
    extend: {
      colors: {
        // Primary palette — the paper & ink
        paper: "hsl(var(--paper))",
        "paper-alt": "hsl(var(--paper-alt))",
        "paper-sunk": "hsl(var(--paper-sunk))",
        ink: "hsl(var(--ink))",
        "ink-muted": "hsl(var(--ink-muted))",
        "ink-subtle": "hsl(var(--ink-subtle))",
        hairline: "hsl(var(--hairline))",
        "hairline-soft": "hsl(var(--hairline-soft))",

        // The accent
        seal: "hsl(var(--seal))",
        "seal-hover": "hsl(var(--seal-hover))",
        "seal-soft": "hsl(var(--seal-soft))",
        gold: "hsl(var(--gold))",

        // shadcn-consumed tokens (mapped)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        xl: "0.375rem",
        lg: "0.25rem",
        md: "0.1875rem",
        sm: "0.125rem",
      },
      fontFamily: {
        serif: [
          "Fraunces",
          "ui-serif",
          "Iowan Old Style",
          "Georgia",
          "serif",
        ],
        sans: [
          "Instrument Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        italic: ["Instrument Serif", "ui-serif", "Georgia", "serif"],
      },
      fontSize: {
        // Scaled for older-user readability
        xs: ["12px", "1.4"],
        sm: ["14px", "1.5"],
        base: ["17px", "1.55"],
        lg: ["19px", "1.55"],
        xl: ["22px", "1.4"],
        "2xl": ["28px", "1.25"],
        "3xl": ["36px", "1.15"],
        "4xl": ["48px", "1.05"],
        "5xl": ["64px", "0.98"],
        "6xl": ["80px", "0.95"],
        "7xl": ["104px", "0.92"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
