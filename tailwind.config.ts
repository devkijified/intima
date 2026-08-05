import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#AC244D',
          dark: '#8F1D40',
          light: '#D43A6B',
          muted: '#FCE8EE',
        },
      },
    },
  },
  plugins: [],
}
export default config
