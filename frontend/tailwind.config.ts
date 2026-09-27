import type { Config } from 'tailwindcss';

// Design tokens approximate Snowflake's product UI (Snowsight) look & feel:
// signature "Snowflake Blue" brand color, cool neutral grays, generous
// rounded corners, and Inter as the closest freely-licensed match to
// Snowflake's proprietary product typeface. See frontend/README.md for the
// full rationale.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backed by CSS variables (see globals.css :root / .dark) so every
        // existing component gets correct dark-mode colors automatically --
        // no per-component `dark:` classes needed for these core tokens.
        sf: {
          blue: '#29B5E8', // Snowflake Blue -- primary brand/action color, same in both themes
          'blue-dark': '#11567F', // hover/active state
          'blue-tint': 'var(--sf-blue-tint)', // light selected/hover backgrounds
          midnight: 'var(--sf-midnight)', // headings
          ink: 'var(--sf-ink)', // primary body text
          slate: 'var(--sf-slate)', // secondary/muted text
          mist: 'var(--sf-mist)', // page background
          line: 'var(--sf-line)', // borders/dividers
          surface: 'var(--sf-surface)', // card/panel background (replaces hardcoded bg-white)
        },
        severity: {
          critical: '#D6246B',
          high: '#E8862B',
          medium: '#D9A400',
          low: '#5B8DEF',
        },
        risk: {
          low: '#2FB170',
          mid: '#D9A400',
          high: '#E8862B',
          extreme: '#D6246B',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,18,32,0.06), 0 1px 8px rgba(11,18,32,0.04)',
        'card-hover': '0 4px 16px rgba(11,18,32,0.10)',
      },
    },
  },
  plugins: [],
};

export default config;
