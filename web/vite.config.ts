import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, the browser talks only to Vite (port 5173). Requests to /api are forwarded to the
    // API (`npm run api` or `npm run dev` in the root, port 3000), so there are no CORS issues.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
