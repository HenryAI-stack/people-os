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
      // Every JS/CSS file of this build, lazily-loaded chunks included (exceljs, ~270KB gz). An
      // installed app keeps running its cached version until the user taps "Reload", and each deploy
      // replaces all hashed files on GitHub Pages — so a chunk that isn't precached is gone by the
      // time the old version first asks for it ("Failed to fetch dynamically imported module").
      const files = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f)) // index.html is precached as './'
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
