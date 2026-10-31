import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts', 'testes/**/*.test.ts'], testTimeout: 60000 },
} as never)
