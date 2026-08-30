import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Gestão de Vendas',
        short_name: 'Gestão de Vendas',
        description: 'Painel de gestão de vendas, metas e conquistas.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#070814',
        theme_color: '#0d1428',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never let the service worker cache Supabase API/auth calls — sales,
        // goals, and login all need to hit the network, not a stale cache.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
        // A new deploy would otherwise sit "waiting" until every open tab/PWA
        // instance is fully closed before it takes over — users kept seeing
        // stale UI/logic for days after a fix shipped. skipWaiting + clientsClaim
        // let the new service worker activate and take control immediately;
        // paired with the periodic update check registered in main.tsx.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
