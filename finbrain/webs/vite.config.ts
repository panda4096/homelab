import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// finbrain P0 frontend. The Go backend (finbrain/servers) listens on :8000;
// in dev we proxy /api and /healthz to it so the relative fetch paths work.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/healthz': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
