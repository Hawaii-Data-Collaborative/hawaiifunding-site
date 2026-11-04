import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Program ID embed bundle — see src/embed/main-program.tsx for why it's separate from
// the federal bundle. Mirrors vite.config.embed-federal.ts otherwise.
export default defineConfig({
  plugins: [react()],
  base: '/fed-funds-charts/',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-embed-program',
    lib: {
      entry: 'src/embed/main-program.tsx',
      name: 'hfpProgram',
      formats: ['iife'],
      fileName: () => 'hfp-embed-program.js'
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'hfp-embed-program.[ext]'
      }
    }
  }
})
