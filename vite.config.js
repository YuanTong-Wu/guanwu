import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
})
