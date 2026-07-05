// Generic encrypted-JSON-file storage backed by the GitHub Contents API.
// Mirrors RecruitOS's pattern: no server, no database — just a private
// GitHub repo holding AES-256 encrypted JSON "collections".

import { encrypt, decrypt } from './crypto'

const OWNER = import.meta.env.VITE_GITHUB_OWNER
const REPO = import.meta.env.VITE_GITHUB_REPO
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'main'

const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
  }
}

// UTF-8 safe base64 helpers (GitHub Contents API requires base64 bodies)
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)))
}
function fromBase64(b64) {
  return decodeURIComponent(escape(atob(b64)))
}

/**
 * Reads a collection file (e.g. "direct-reports.json") from the private
 * data repo, decrypts it, and returns the parsed array. Returns an empty
 * array if the file doesn't exist yet.
 */
export async function readCollection(filename) {
  // Timestamp cache-buster prevents the browser returning a stale SHA,
  // which would cause a 409 conflict on the next write.
  const res = await fetch(`${API_BASE}/${filename}?ref=${BRANCH}&_=${Date.now()}`, {
    headers: headers(),
  })

  if (res.status === 404) {
    return { items: [], sha: null }
  }
  if (!res.ok) {
    throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)
  }

  const file = await res.json()
  const raw = fromBase64(file.content.replace(/\n/g, ''))
  const data = decrypt(raw)
  return { items: Array.isArray(data) ? data : [], sha: file.sha }
}

/**
 * Encrypts and writes a full collection array back to the data repo.
 * Uses the previously-fetched `sha` to avoid overwriting concurrent edits.
 */
export async function writeCollection(filename, items, sha, message) {
  const ciphertext = encrypt(items)
  const body = {
    message: message || `chore: update ${filename}`,
    content: toBase64(ciphertext),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  }

  const res = await fetch(`${API_BASE}/${filename}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`)
  }
  const result = await res.json()
  return result.content.sha
}

// --- Convenience wrappers for a single collection, with id-based CRUD ---

export function makeStore(filename) {
  return {
    async list() {
      const { items } = await readCollection(filename)
      return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    },

    async upsert(record) {
      const { items, sha } = await readCollection(filename)
      const now = new Date().toISOString()
      const id = record.id || crypto.randomUUID()
      const existingIdx = items.findIndex((i) => i.id === id)
      const next = { ...record, id, updatedAt: now, createdAt: record.createdAt || now }

      if (existingIdx >= 0) items[existingIdx] = next
      else items.push(next)

      await writeCollection(filename, items, sha, `chore: upsert ${id} in ${filename}`)
      return next
    },

    async remove(id) {
      const { items, sha } = await readCollection(filename)
      const next = items.filter((i) => i.id !== id)
      await writeCollection(filename, next, sha, `chore: remove ${id} from ${filename}`)
      return next
    },
  }
}

export const directReportsStore = makeStore('direct-reports.json')
export const interviewsStore    = makeStore('interviews.json')
export const notesStore         = makeStore('notes.json')
export const followUpsStore     = makeStore('follow-ups.json')
