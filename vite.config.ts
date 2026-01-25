import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Sallii yhteydet muilta laitteilta
    port: 5173,
  },
})

