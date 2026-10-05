import { initializeApp }          from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app      = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
const provider = new GoogleAuthProvider()

export const ALLOWED_EMAIL = import.meta.env.VITE_ALLOWED_EMAIL

// Popup errors that mean "this environment can't do popups" (some installed-PWA / in-app
// browser contexts) rather than "the user closed it" — fall back to a full-page redirect.
const REDIRECT_FLAG = 'peopleos-auth-redirect'
const POPUP_UNSUPPORTED = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

export async function loginWithGoogle() {
  let result
  try {
    result = await signInWithPopup(auth, provider)
  } catch (e) {
    if (POPUP_UNSUPPORTED.has(e?.code)) {
      try { sessionStorage.setItem(REDIRECT_FLAG, '1') } catch {}
      await signInWithRedirect(auth, provider) // navigates away; completeRedirectLogin() finishes it
      return null
    }
    throw e
  }
  if (result.user.email !== ALLOWED_EMAIL) {
    await signOut(auth)
    throw new Error('ACCESS_DENIED')
  }
  return result.user
}

/** Call once on startup: finishes a signInWithRedirect fallback and applies the same email check. */
export async function completeRedirectLogin() {
  // Only when we actually started a redirect — avoids Firebase's redirect round-trip on every launch.
  try {
    if (!sessionStorage.getItem(REDIRECT_FLAG)) return null
    sessionStorage.removeItem(REDIRECT_FLAG)
  } catch { return null }
  const result = await getRedirectResult(auth)
  if (result && result.user.email !== ALLOWED_EMAIL) {
    await signOut(auth)
    throw new Error('ACCESS_DENIED')
  }
  return result?.user || null
}

export async function logout() {
  await signOut(auth)
}

// Never hand a non-allowed account to the app, whichever sign-in path produced it (popup,
// redirect fallback, or a session persisted from before).
export function onAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user && user.email !== ALLOWED_EMAIL) { signOut(auth); callback(null); return }
    callback(user)
  })
}
