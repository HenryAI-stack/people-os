import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
const provider = new GoogleAuthProvider()

export function signInWithGoogle() {
  return signInWithRedirect(auth, provider)
}

export function handleRedirectResult() {
  return getRedirectResult(auth)
}

export function signOut() {
  return firebaseSignOut(auth)
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

export function isAllowedUser(user) {
  const allowedDomain = import.meta.env.VITE_ALLOWED_DOMAIN
  if (!allowedDomain) return true
  return user?.email?.endsWith(`@${allowedDomain}`)
}
