import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use environment variable for base path:
  // - Standalone Render: '/' (default)
  // - GameBuddies proxy: '/cluescale/'
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
})
