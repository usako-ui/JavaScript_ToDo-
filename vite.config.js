import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist'
  },
  preview: {
    allowedHosts: [
      'javascript-todoapuri.onrender.com'
    ]
  }
})
