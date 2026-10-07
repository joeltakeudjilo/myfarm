import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
//import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   manifest: {
    //     name: 'Suivi de bandes',
    //     short_name: 'Bandes',
    //     description: 'Suivi partagé des bandes de poulets',
    //     lang: 'fr',
    //     start_url: '/',
    //     display: 'standalone',
    //     background_color: '#1E2923',
    //     theme_color: '#1E2923',
    //     icons: [
    //       { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    //       { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    //       { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    //     ],
    //   },
    // }),
  ],
})
