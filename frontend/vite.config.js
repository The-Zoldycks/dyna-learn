import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache static assets (CSS/JS handled automatically by Workbox)
      includeAssets: ['dyna-learn-doc-icon.png', 'dyna-learn-logo-blue.png', 'mahoraga-wheel.png'],
      manifest: {
        id: '/',
        name: 'Dyna-learn — Interactive AI Tutor',
        short_name: 'Dyna-learn',
        description: 'Adaptive visual knowledge diagrams and interactive AI tutoring.',
        theme_color: '#7c3aed',
        background_color: '#fafafa',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        scope: '/',
        start_url: '/',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/dyna-learn-doc-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/dyna-learn-doc-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/dyna-learn-doc-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [],
        shortcuts: [
          {
            name: 'New Session',
            short_name: 'New',
            description: 'Start a fresh study session',
            url: '/?new=1'
          }
        ]
      },
      workbox: {
        // Precache everything built by Vite
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

        // SPA offline fallback — serve index.html for any navigate request not in precache
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Don't intercept API calls or Supabase auth redirects
          /^\/api\//,
          /^\/auth\//,
        ],

        runtimeCaching: [
          // Supabase API — always network, never cache (auth tokens, live data)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly'
          },
          // Render backend — network only (AI responses must be live)
          {
            urlPattern: /^https:\/\/.*\.onrender\.com\/.*/i,
            handler: 'NetworkOnly'
          },
          // Google Fonts (if ever added) — cache first
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('@xyflow/react') || id.includes('dagre')) return 'vendor-flow';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('sonner')) return 'vendor-toast';
            return 'vendor-other';
          }
        },
      },
    },
  },
})