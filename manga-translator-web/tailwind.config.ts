import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      fontFamily: {
        // We create three distinct font classes
        'action': ['var(--font-action-man)', 'sans-serif'], 
        'anime': ['var(--font-anime-ace)', 'sans-serif'], 
        'smack': ['var(--font-smack-attack)', 'sans-serif'], 
      },
    },
  },
  plugins: [],
};
export default config;