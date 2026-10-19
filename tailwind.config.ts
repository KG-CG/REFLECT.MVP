import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#0e1116", panel: "#161b22", line: "#262d38", accent: "#e8b45a", win: "#6fcf97", loss: "#eb6f6f" } } },
} satisfies Config;
