import { initializeApp }          from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app      = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
const provider = new GoogleAuthProvider()

export const ALLOWED_EMAIL = import.meta.env.VITE_ALLOWED_EMAIL

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, provider)
  if (result.user.email !== ALLOWED_EMAIL) {
    await signOut(auth)
    throw new Error('ACCESS_DENIED')
  }
  return result.user
}

export async function logout() {
  await signOut(auth)
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback)
}
