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
        primary: {
          DEFAULT: '#AC244D',
          dark: '#8F1D40',
          light: '#D43A6B',
          muted: '#FCE8EE',
        },
        secondary: {
          DEFAULT: '#C9A84C',
          light: '#E8D49E',
          muted: '#F8F0E0',
        },
        cream: '#FDF9F6',
        charcoal: '#1A1A1A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        cormorant: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
export default config
