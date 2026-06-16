import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 禅／ミニマルなトーン
        zen: {
          bg: "#f7f6f3",
          surface: "#ffffff",
          ink: "#2b2b29",
          sub: "#6b6a64",
          line: "#e7e5df",
          accent: "#3f7d6e", // 落ち着いた青緑
          accentSoft: "#e3efe9",
          gold: "#b08d57",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "system-ui",
          "Hiragino Kaku Gothic ProN",
          "Meiryo",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
