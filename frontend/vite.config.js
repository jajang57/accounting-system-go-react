import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bukubesar': 'http://localhost:8080',
      '/compare': 'http://localhost:8080',
      '/sheets': 'http://localhost:8080',
      '/sheet': 'http://localhost:8080',
      '/export': 'http://localhost:8080',
      '/auth': 'http://localhost:8080'
    }
  }
})
