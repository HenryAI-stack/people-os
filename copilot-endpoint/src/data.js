/**
 * Read-only access to the PeopleOS data repo, server-side.
 *
 * Mirrors src/lib/dataStore.js + src/lib/crypto.js (GitHub Contents API → base64 →
 * CryptoJS.AES passphrase decrypt). If the storage format, encryption or file layout
 * changes in the app, update this file too — same rule as the two email scripts.
 *
 * There is deliberately no write path in this module.
 */
import CryptoJS from 'crypto-js'

export const COLLECTIONS = {
  people: 'direct-reports.json',
  interviews: 'interviews.json',
  notes: 'notes.json',
  followUps: 'follow-ups.json',
  accomplishments: 'accomplishments.json',
}

const REQUIRED_ENV = ['GH_OWNER', 'GH_DATA_REPO', 'GH_TOKEN', 'ENCRYPTION_SECRET']

export function assertDataConfig(env) {
  for (const k of REQUIRED_ENV) {
    if (!env[k] || !String(env[k]).trim()) throw new Error(`Missing config: ${k}`)
  }
}

// Per-isolate cache, same 60s TTL as the app's dataStore.
const CACHE_TTL = 60_000
const _cache = new Map()

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function decryptRecords(ciphertext, secret) {
  if (!ciphertext) return []
  const json = CryptoJS.AES.decrypt(ciphertext, secret).toString(CryptoJS.enc.Utf8)
  if (!json) throw new Error('Decryption failed — wrong ENCRYPTION_SECRET?')
  const data = JSON.parse(json)
  return Array.isArray(data) ? data : []
}

export async function readCollection(env, filename, fetchImpl = fetch) {
  const hit = _cache.get(filename)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.items

  const branch = env.GH_DATA_BRANCH || 'main'
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_DATA_REPO}/contents/${filename}?ref=${encodeURIComponent(branch)}`
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PeopleOS-Copilot-Endpoint', // GitHub rejects requests without one
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (res.status === 404) { _cache.set(filename, { items: [], ts: Date.now() }); return [] }
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}) for ${filename}`)

  const file = await res.json()
  const items = decryptRecords(base64ToUtf8(file.content || ''), env.ENCRYPTION_SECRET)
  _cache.set(filename, { items, ts: Date.now() })
  return items
}

export function clearCache() { _cache.clear() }

// ── Output shaping ────────────────────────────────────────────────────────────
// Only fields Copilot needs leave the Worker. Photos (base64 data URLs), Microsoft
// To Do sync IDs and other internal bookkeeping are dropped.
const MAX_TEXT = 4000

function clip(v) {
  if (typeof v !== 'string') return v
  if (v.startsWith('data:')) return undefined
  return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}… [truncated]` : v
}

function pick(record, fields) {
  const out = {}
  for (const f of fields) {
    const v = clip(record[f])
    if (v !== undefined && v !== '' && v !== null) out[f] = v
  }
  return out
}

export const shape = {
  person: (r) => pick(r, ['id', 'name', 'role', 'team', 'level', 'location', 'status', 'startDate', 'birthday', 'email', 'notes', 'updatedAt']),
  interview: (r) => pick(r, ['id', 'title', 'type', 'personId', 'person', 'date', 'summary', 'takeaways', 'tags', 'faceToFace', 'updatedAt']),
  note: (r) => pick(r, ['id', 'title', 'body', 'pinned', 'archived', 'updatedAt']),
  followUp: (r) => pick(r, ['id', 'text', 'dueDate', 'done', 'personId', 'personName', 'sourceType', 'sourceTitle', 'updatedAt']),
  accomplishment: (r) => pick(r, ['id', 'month', 'date', 'text', 'assigneeType', 'personId', 'personName', 'team', 'updatedAt']),
}
