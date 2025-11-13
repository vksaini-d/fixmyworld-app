import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <-- 1. ADD THIS IMPORT

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), // <-- You should already have this
    tailwindcss(), // <-- 2. ADD THIS LINE
  ],
})