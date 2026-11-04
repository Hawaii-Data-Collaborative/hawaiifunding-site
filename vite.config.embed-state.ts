import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/fed-funds-charts/',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-embed-state',
    lib: {
      entry: 'src/embed/main-state.tsx',
      name: 'hfp',
      formats: ['iife'],
      fileName: () => 'hfp-embed.js'
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'hfp-embed.[ext]'
      }
    }
  }
})
