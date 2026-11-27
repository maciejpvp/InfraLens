import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export const viteConfig = defineConfig({
  plugins: [react(), tailwindcss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    license: { fileName: 'licenses.md' },
    lib: {
      entry: 'src/main.tsx',
      name: 'LaytraceViewer',
      formats: ['iife'],
      fileName: () => 'viewer.js',
      cssFileName: 'viewer',
    },
  },
})
