// PWA glue: service-worker registration + update detection, and the "Install app" prompt.
// The service worker itself is generated at build time by the `serviceWorker()` plugin in
// vite.config.js (from src/sw-template.js) — it is never registered in `npm run dev`.

const listeners = new Set()
const state = { updateReady: false, installPrompt: null }
let waitingWorker = null

function emit() { for (const fn of listeners) fn({ ...state }) }

/** Subscribe to `{ updateReady, installPrompt }` changes. Returns an unsubscribe function. */
export function subscribePwa(fn) {
  listeners.add(fn)
  fn({ ...state })
  return () => listeners.delete(fn)
}

/** True when running as an installed app (home-screen icon) rather than in a browser tab. */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as a Mac
}

// Chrome/Edge/Samsung Internet fire this once the app is installable; keep it for the Settings
// page's "Install app" button. It can fire before any page mounts, hence capturing it here.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  state.installPrompt = e
  emit()
})
window.addEventListener('appinstalled', () => { state.installPrompt = null; emit() })

export async function promptInstall() {
  const p = state.installPrompt
  if (!p) return false
  p.prompt()
  const { outcome } = await p.userChoice
  state.installPrompt = null
  emit()
  return outcome === 'accepted'
}

function markWaiting(worker) {
  waitingWorker = worker
  state.updateReady = true
  emit()
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
      // A new deploy installs alongside the running version and waits; we surface a banner
      // instead of swapping code out from under an open form.
      if (reg.waiting && navigator.serviceWorker.controller) markWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) markWaiting(nw)
        })
      })
      // An installed app can stay open for days — check for a new deploy whenever it's foregrounded.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch (err) {
      console.warn('Service worker registration failed', err)
    }
  })
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !state.updateReady) return
    reloading = true
    window.location.reload()
  })
}

/** Activate the waiting service worker; the controllerchange handler then reloads the page. */
export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  else window.location.reload()
}
