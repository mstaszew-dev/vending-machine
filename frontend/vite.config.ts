import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The same frontend serves either backend: the Java one on 8080 by default, or the NestJS
// one on 8081 when VITE_API_TARGET points there.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.VITE_API_TARGET ?? 'http://localhost:8080',
      },
    },
  }
})
