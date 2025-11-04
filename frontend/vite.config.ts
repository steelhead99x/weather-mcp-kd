import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from root directory
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const isProd = mode === 'production'

  return {
    plugins: [
      react({
        // Enable Fast Refresh for better DX
        fastRefresh: true,
        // Optimize JSX runtime
        jsxRuntime: 'automatic',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    // Expose VITE_ prefixed variables from root .env
    define: {
      'import.meta.env.VITE_MASTRA_API_HOST': JSON.stringify(env.VITE_MASTRA_API_HOST),
      'import.meta.env.VITE_WEATHER_AGENT_ID': JSON.stringify(env.VITE_WEATHER_AGENT_ID),
      'import.meta.env.VITE_MUX_ASSET_ID': JSON.stringify(env.VITE_MUX_ASSET_ID),
      'import.meta.env.VITE_MUX_DEFAULT_ASSET_ID': JSON.stringify(env.VITE_MUX_DEFAULT_ASSET_ID),
      'import.meta.env.VITE_MUX_KEY_SERVER_URL': JSON.stringify(env.VITE_MUX_KEY_SERVER_URL),
    },
    server: {
      port: 3000,
      host: true, // Listen on all addresses
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: isProd ? false : true, // Disable sourcemaps in production for smaller bundles
      minify: 'esbuild', // Fast minification with esbuild
      target: 'es2020', // Modern target for better performance
      cssMinify: true,
      cssCodeSplit: true, // Split CSS for better caching
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          // Better chunking strategy for optimal caching
          manualChunks: (id) => {
            // Core vendor dependencies
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react'
              }
              if (id.includes('@mux')) {
                return 'vendor-mux'
              }
              if (id.includes('@mastra')) {
                return 'vendor-mastra'
              }
              // All other node_modules go to vendor
              return 'vendor'
            }
          },
          // Optimized file naming for better caching
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      chunkSizeWarningLimit: 1000,
      // Better tree shaking
      assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['react', 'react-dom', '@mux/mux-player-react', '@mastra/client-js'],
      exclude: [],
    },
    // Performance optimizations
    esbuild: {
      logOverride: { 'this-is-undefined-in-esm': 'silent' },
      legalComments: 'none', // Remove comments in production
      treeShaking: true,
    },
    // CSS optimization
    css: {
      devSourcemap: !isProd,
      postcss: {
        plugins: [],
      },
    },
  }
})
