import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // California agriculture inspired palette
        norcal: {
          // Greens of Central Valley fields and orchards
          pine: '#2a4f2b',   // field green
          moss: '#3f6b34',   // orchard green
          fern: '#7aa36a',   // young leaf
          // Air and light over the valley
          fog: '#eae6d9',    // valley haze
          sky: '#8ecae6',    // clear sky
          dusk: '#2b3a42',   // coastal range at dusk
          // Harvest accent
          gold: '#d4a373',   // harvest gold
          // Additional accents (optional)
          soil: '#7b5e3b',   // loam soil
          vineyard: '#6b2d5c', // grape tones
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'Noto Sans',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 10px 25px rgba(42, 79, 43, 0.22)',
      }
    },
  },
  plugins: [],
} satisfies Config
