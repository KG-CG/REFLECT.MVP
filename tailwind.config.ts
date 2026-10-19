import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#07060f", panel: "#0f0d1b", line: "#241f3a", accent: "#8b7bff", neon: "#c4b5fd", win: "#34f5a4", loss: "#ff5c7a" },
      boxShadow: { glow: "0 0 40px -10px rgba(139,123,255,0.45)" },
    },
  },
} satisfies Config;
