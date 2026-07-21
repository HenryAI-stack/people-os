import { encrypt, decrypt } from './crypto'

const OWNER  = import.meta.env.VITE_GITHUB_OWNER
const REPO   = import.meta.env.VITE_GITHUB_REPO
const TOKEN  = import.meta.env.VITE_GITHUB_TOKEN
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'main'
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

// ── In-memory cache ───────────────────────────────────────────────────────────
// Avoids hitting the GitHub API on every navigation.
// TTL: 60 seconds. Writes always bypass cache for SHA fetch, then update it.
const _cache = {}
const CACHE_TTL = 60_000

function cacheGet(filename) {
  const e = _cache[filename]
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { delete _cache[filename]; return null }
  return e
}

function cacheSet(filename, items, sha) {
  _cache[filename] = { items, sha, ts: Date.now() }
}
// ─────────────────────────────────────────────────────────────────────────────

function headers() {
  return { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' }
}

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))) }
function fromBase64(b64) { return decodeURIComponent(escape(atob(b64))) }

export async function readCollection(filename, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cacheGet(filename)
    if (cached) return { items: cached.items, sha: cached.sha }
  }

  const res = await fetch(`${API_BASE}/${filename}?ref=${BRANCH}&_=${Date.now()}`, {
    headers: headers(),
  })

  if (res.status === 404) { cacheSet(filename, [], null); return { items: [], sha: null } }
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)

  const file  = await res.json()
  const raw   = fromBase64(file.content.replace(/\n/g, ''))
  const data  = decrypt(raw)
  const items = Array.isArray(data) ? data : []

  cacheSet(filename, items, file.sha)
  return { items, sha: file.sha }
}

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
  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`)

  const result = await res.json()
  const newSha = result.content.sha
  // Update cache immediately so next reads are instant
  cacheSet(filename, items, newSha)
  return newSha
}

export function makeStore(filename) {
  return {
    async list() {
      const { items } = await readCollection(filename)
      return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    },

    async upsert(record) {
      // Force fresh SHA from GitHub before every write to prevent 409 conflicts
      const { items, sha } = await readCollection(filename, true)
      const now  = new Date().toISOString()
      const id   = record.id || crypto.randomUUID()
      const next = { ...record, id, updatedAt: now, createdAt: record.createdAt || now }
      const deduped = items.filter((i) => i.id !== id)
      deduped.push(next)
      await writeCollection(filename, deduped, sha, `chore: upsert ${id} in ${filename}`)
      return next
    },

    async remove(id) {
      const { items, sha } = await readCollection(filename, true)
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
