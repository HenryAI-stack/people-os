import CryptoJS from 'crypto-js'

const SECRET = import.meta.env.VITE_ENCRYPTION_SECRET

if (!SECRET || SECRET.length < 16) {
  // Fail loudly in dev rather than silently writing weak/unencrypted data.
  console.warn(
    '[PeopleOS] VITE_ENCRYPTION_SECRET is missing or too short. ' +
    'Set a 32+ character secret as a GitHub Actions secret before deploying.'
  )
}

/** Encrypts a JS object into an AES-256 ciphertext string for storage. */
export function encrypt(data) {
  const json = JSON.stringify(data)
  return CryptoJS.AES.encrypt(json, SECRET).toString()
}

/** Decrypts a ciphertext string back into the original JS object. */
export function decrypt(ciphertext) {
  if (!ciphertext) return null
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET)
    const json = bytes.toString(CryptoJS.enc.Utf8)
    if (!json) throw new Error('empty')
    return JSON.parse(json)
  } catch (err) {
    console.error('Decryption failed. Wrong secret, or corrupted data.', err)
    return null
  }
}
