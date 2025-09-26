import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3333,
    host: true,
    // Allow DigitalOcean App Platform (and your domain) to reach the dev server
    allowedHosts: ['ai.streamingportfolio.com', 'stage-ai.streamingportfolio.com'],
  },
  // Vite preview is used in production start; allow the same host header
  preview: {
    host: true,
    allowedHosts: ['ai.streamingportfolio.com', 'stage-ai.streamingportfolio.com'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'vendor-react': ['react', 'react-dom'],
          'vendor-mastra': ['@mastra/client-js'],
          'vendor-mux': ['@mux/mux-player-react'],
          'vendor-testing': ['@testing-library/react', '@testing-library/jest-dom', 'vitest'],
        },
        // Increase chunk size warning limit to 600kb
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Increase chunk size warning limit (Mux player is inherently large)
    chunkSizeWarningLimit: 1200,
    // Enable minification (uses esbuild by default)
    minify: true,
  },
})
