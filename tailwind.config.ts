import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        'team-red': '#EF4444',
        'team-blue': '#3B82F6',
        'team-yellow': '#EAB308',
      },
    },
  },
  plugins: [],
} satisfies Config
