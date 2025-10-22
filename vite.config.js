import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'


export default defineConfig({
plugins: [react()],
build: {
rollupOptions: {
input: {
popup: resolve(__dirname, 'index.html'),
options: resolve(__dirname, 'options.html')
},
output: {
// keep file names simple
entryFileNames: `assets/[name].js`,
chunkFileNames: `assets/[name].js`,
assetFileNames: `assets/[name][extname]`
}
}
}
})