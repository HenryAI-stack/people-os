/* PeopleOS service worker — TEMPLATE. Not imported by the app: the `serviceWorker()` plugin in
 * vite.config.js fills in the version + precache list at build time and emits it as dist/sw.js.
 *
 * Only the app shell (same-origin HTML/JS/CSS/icons) is cached. Data never is: GitHub API,
 * Firebase, OpenRouter, Graph etc. are cross-origin and pass straight through to the network,
 * so nothing decrypted or encrypted from the data repo is ever stored by this worker.
 */
const VERSION  = self.__SW_VERSION__
const PRECACHE = self.__SW_PRECACHE__
const CACHE    = `peopleos-${VERSION}`
const SCOPE    = self.registration.scope            // e.g. https://…/people-os/
const SHELL    = SCOPE                              // precached as './' (= index.html)

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // cache: 'reload' bypasses the browser's HTTP cache. GitHub Pages serves everything with
    // max-age=600, so a deploy within 10 minutes of the previous one could otherwise precache the
    // *previous* index.html next to this build's files. That shell points at hashed files the new
    // deploy already deleted, and the app launched to a blank page (seen on iPad, Nov 2026).
    await cache.addAll(PRECACHE.map((p) => new Request(new URL(p, SCOPE).href, { cache: 'reload' })))
    // Sanity check: every /assets/ file the cached shell loads must belong to this build. If not
    // (e.g. a half-finished deploy), fail the install: the current worker keeps serving a working
    // version and the browser retries on the next update check.
    const shell = await cache.match(SHELL)
    const html = shell ? await shell.text() : ''
    const refs = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"?#]+)"/g)].map((m) => m[1])
    const missing = refs.filter((r) => !PRECACHE.includes(r))
    if (!shell || missing.length) {
      await caches.delete(CACHE)
      throw new Error(`PeopleOS SW: shell doesn't match this build (${missing.join(', ') || 'no shell'})`)
    }
  })())
  // No skipWaiting() here: the page shows an "Update available" banner and sends SKIP_WAITING
  // when the user taps it, so a deploy never swaps code under an open form.
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('peopleos-') && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return

  // Standalone pages under public/tools/ (e.g. the Teams caption grabber) are not part of the
  // app shell: let the network serve them, or every navigation there would open PeopleOS instead.
  if (url.href.startsWith(SCOPE + 'tools/')) return

  // App navigations (HashRouter, so always …/people-os/ or …/index.html): serve the cached shell
  // for an instant, offline-capable launch; fall back to the network if it's somehow missing.
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(SHELL).then((hit) => hit || fetch(req)))
    return
  }

  // Everything else in scope (all precached; anything new still gets cached on first fetch):
  // cache-first, and cache what we fetch so it's there next time.
  event.respondWith((async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches.open(CACHE).then((cache) => cache.put(req, copy))
    }
    return res
  })())
})
