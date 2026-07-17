import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages base path — empty for local dev, '/ABET_Dashboard/' for production
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/ABET_Dashboard/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
