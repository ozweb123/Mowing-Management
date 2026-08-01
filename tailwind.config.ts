import type { Config } from "tailwindcss";

/**
 * John Deere–inspired theme tokens for Miles Mowing Management.
 * Green + yellow primary; high-contrast for bright outdoor phone use.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        jd: {
          green: "#367C2B",
          "green-dark": "#1F4D1A",
          "green-deep": "#0F2E0C",
          yellow: "#FFDE00",
          "yellow-dark": "#E6C800",
          soil: "#3D2914",
          grass: "#4A9C3A",
          cream: "#F7F4E8",
          steel: "#2C2C2C",
          danger: "#C0392B",
          warn: "#E67E22",
          ok: "#27AE60",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        tap: "0 4px 0 0 #1F4D1A",
        "tap-active": "0 1px 0 0 #1F4D1A",
      },
      minHeight: {
        tap: "48px", // Apple HIG minimum touch target
      },
    },
  },
  plugins: [],
};

export default config;
