import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        surface: "#11141b",
        border: "#1f242e",
        muted: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
