import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const proxy = {
  '/api': {
    target: process.env.RIPE_ATLAS_API_URL ?? 'http://127.0.0.1:8000',
    timeout: 240000,
    proxyTimeout: 240000,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', proxy },
  test: {
    environment: 'jsdom',
    env: { TZ: 'America/Sao_Paulo' },
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
