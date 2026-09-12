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
  // Relative assets allow the same build to run at a domain root (Vercel)
  // or a GitHub Pages project path such as /RecordsWeb/.
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
