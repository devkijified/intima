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
        gold: '#C9A84C',
      },
      fontFamily: {
        // One pairing: Figtree for UI text, Inter for display. The CSS
        // variables are set on <html> by next/font in app/layout.tsx.
        // serif stays as an alias of display: older screens use
        // font-serif for headings and big numbers.
        sans: ['var(--font-figtree)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Soft, layered, slightly warm — the house elevation scale.
        soft: '0 1px 2px rgba(26,26,26,0.04), 0 8px 24px rgba(26,26,26,0.06)',
        lift: '0 2px 4px rgba(26,26,26,0.05), 0 16px 40px rgba(26,26,26,0.10)',
        sheet: '0 -8px 40px rgba(26,26,26,0.22)',
        cta: '0 8px 24px rgba(172,36,77,0.32), 0 2px 6px rgba(172,36,77,0.22)',
        gold: '0 6px 20px rgba(201,168,76,0.35)',
        pin: '0 4px 14px rgba(0,0,0,0.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
export default config
