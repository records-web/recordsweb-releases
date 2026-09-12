import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)

export default defineConfig({
  define: {
    __RECORDSWEB_APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
