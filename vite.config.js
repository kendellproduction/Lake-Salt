import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Gzip compression for production
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Brotli compression (better compression ratio)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'react-vendor': ['react', 'react-dom'],
          'animation': ['framer-motion'],
          'swiper': ['swiper'],
        },
      },
    },
    // Enable minification with esbuild (faster, built-in)
    minify: 'esbuild',
    // Generate source maps for debugging (optional, can disable for smaller builds)
    sourcemap: false,
    // Target modern browsers for smaller bundle
    target: 'es2020',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'swiper'],
  },
})
