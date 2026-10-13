import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // The Vercel–Supabase integration provides NEXT_PUBLIC_* names; only public values use that prefix
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Drawn by scripts/makeIcons.ts
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/badge-96.png'],
      manifest: {
        name: 'ScoreLeader',
        short_name: 'ScoreLeader',
        description: 'Weekly 5v5 football session manager',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // A phone may cut this one to its own shape; the mark sits inside the part always kept
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
} as Parameters<typeof defineConfig>[0])
