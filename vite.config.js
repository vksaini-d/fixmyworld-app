import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // This fixes the "import.meta" warnings by setting a modern build target
    target: 'esnext'
  }
})