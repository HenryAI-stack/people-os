import CryptoJS from 'crypto-js'

const SECRET = import.meta.env.VITE_ENCRYPTION_SECRET

export function encrypt(data) {
  const json = JSON.stringify(data)
  return CryptoJS.AES.encrypt(json, SECRET).toString()
}

export function decrypt(ciphertext) {
  if (!ciphertext) return null
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET)
    const json = bytes.toString(CryptoJS.enc.Utf8)
    if (!json) throw new Error('empty')
    return JSON.parse(json)
  } catch (err) {
    console.error('Decryption failed.', err)
    return null
  }
}
