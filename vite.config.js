import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Emits dist/sw.js from src/sw-template.js with the build's own file list baked in, so the
// installed PWA precaches exactly this deploy's app shell. Hand-rolled instead of
// vite-plugin-pwa/workbox to keep the dependency list as small as the rest of the app.
function serviceWorker() {
  return {
    name: 'peopleos-service-worker',
    apply: 'build',
    enforce: 'post', // after vite:build-html, so index.html is in the bundle and feeds the version hash
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) =>
        /\.(js|css)$/.test(f) &&        // index.html is precached as './'
        !/exceljs/i.test(f)           // ~270KB gz, only for "Export Excel" — runtime-cached on first use
      )
      const icons = readdirSync('public/icons').map((f) => `icons/${f}`)
      const precache = ['./', ...files, 'manifest.webmanifest', ...icons].sort()
      const html = bundle['index.html']?.source ?? ''
      const version = createHash('sha256').update(precache.join('\n') + html).digest('hex').slice(0, 12)
      const source = readFileSync('src/sw-template.js', 'utf8')
        .replace('self.__SW_VERSION__', JSON.stringify(version))
        .replace('self.__SW_PRECACHE__', JSON.stringify(precache, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  base: '/people-os/',
})
