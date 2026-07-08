import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#f6f8fb",
        line: "#d9e0ea",
        sea: "#087f7a",
        coral: "#d95d55",
        grape: "#6b5dd3"
      },
      maxWidth: {
        app: "1440px"
      }
    }
  },
  plugins: []
};

export default config;
