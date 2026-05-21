import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.VITE_API_PORT || '8001'
  const apiTarget = `http://127.0.0.1:${apiPort}`
  const wsTarget = `ws://127.0.0.1:${apiPort}`

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Avoid IPv6 localhost vs 127.0.0.1 mismatches with the proxy target.
      host: '127.0.0.1',
      port: 5173,
      // If 5173 is taken, fail fast instead of switching to 5174 (easy to open the wrong URL).
      strictPort: true,
      proxy: {
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          // Default proxy timeouts can drop the socket during long graph runs.
          timeout: 0,
          proxyTimeout: 0,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
