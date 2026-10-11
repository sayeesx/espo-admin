import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.png', 'epso-logo-transparent.png'],
      manifest: {
        name: 'Epso Production Admin',
        short_name: 'Epso Admin',
        description: 'Epso Production & Inventory Remote Owner Dashboard',
        theme_color: '#C6382B',
        background_color: '#141212',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
