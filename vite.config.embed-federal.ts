import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/fed-funds-charts/',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-embed-federal',
    lib: {
      entry: 'src/embed/main-federal.tsx',
      name: 'hfpFederal',
      formats: ['iife'],
      fileName: () => 'hfp-embed-federal.js'
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'hfp-embed-federal.[ext]'
      }
    }
  }
})
