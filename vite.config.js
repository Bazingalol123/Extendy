import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // FIXED: Added sidebar entry point
        sidebar: resolve(__dirname, 'index.html'),
        // popup: resolve(__dirname, 'popup.html'), 
        options: resolve(__dirname, 'options.html')
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name][extname]`
      }
    }
  }
})