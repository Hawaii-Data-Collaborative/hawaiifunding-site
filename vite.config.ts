import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/fed-funds-charts/' : '/',
  server: {
    port: 3001,
    // Mirror what Cloudflare does in production, where hawaiifunding.org serves the
    // Squarespace pages but routes these paths through to the Bun server. Keeping the
    // same split locally means one origin for everything: events fired from the
    // embed-test pages land in the same store the dashboard reads, and BASE_URL-derived
    // links (invites, password resets) resolve without a second port.
    proxy: Object.fromEntries(
      ['/api', '/admin', '/signup', '/downloads'].map(path => [
        path,
        { target: 'http://localhost:3002', changeOrigin: true }
      ])
    )
  }
})
