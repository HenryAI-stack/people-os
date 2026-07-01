import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'

// All values are injected at build time from GitHub Actions secrets.
// See INSTALLATION.md, Step 2 + 5.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
const provider = new GoogleAuthProvider()

export function signInWithGoogle() {
  return signInWithPopup(auth, provider)
}

export function signOut() {
  return firebaseSignOut(auth)
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

// Optional: restrict logins to your company's Google Workspace domain.
// Set VITE_ALLOWED_DOMAIN (e.g. "yourcompany.com") to enforce this.
export function isAllowedUser(user) {
  const allowedDomain = import.meta.env.VITE_ALLOWED_DOMAIN
  if (!allowedDomain) return true
  return user?.email?.endsWith(`@${allowedDomain}`)
}
