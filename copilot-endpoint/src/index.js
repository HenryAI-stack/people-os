/**
 * PeopleOS → Microsoft 365 Copilot endpoint (Cloudflare Worker).
 *
 * Read-only JSON API over the encrypted PeopleOS data repo, callable only with an
 * Entra ID token belonging to ONE user (see auth.js). There are no write routes, no
 * CORS headers (Copilot calls server-to-server; browsers get nothing), and every
 * response is marked no-store.
 */
import { authenticate, AuthError } from './auth.js'
import { readCollection, assertDataConfig, COLLECTIONS, shape } from './data.js'

const BASE = '/v1'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

// ── Query helpers ────────────────────────────────────────────────────────────
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}$/

function limitOf(params) {
  const n = parseInt(params.get('limit') || '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT
}
function dateParam(params, name) {
  const v = params.get(name)
  if (v == null || v === '') return null
  if (!DATE.test(v)) throw new BadRequest(`${name} must be YYYY-MM-DD`)
  return v
}
function textMatch(needle, ...haystack) {
  if (!needle) return true
  const n = needle.toLowerCase()
  return haystack.some((h) => typeof h === 'string' && h.toLowerCase().includes(n))
}
function page(items, limit) {
  return { total: items.length, count: Math.min(items.length, limit), items: items.slice(0, limit) }
}
const byDateDesc = (field) => (a, b) => String(b[field] || '').localeCompare(String(a[field] || ''))

class BadRequest extends Error {}

/** Resolves ?personId= or ?person=<name fragment> into a predicate over linked records. */
async function personFilter(env, params, deps) {
  const personId = params.get('personId')
  const person = params.get('person')
  if (personId) return (r) => r.personId === personId
  if (!person) return () => true
  const people = await readCollection(env, COLLECTIONS.people, deps.fetch)
  const ids = new Set(people.filter((p) => textMatch(person, p.name)).map((p) => p.id))
  return (r) => ids.has(r.personId) || textMatch(person, r.person, r.personName)
}

// ── Routes (GET only) ────────────────────────────────────────────────────────
async function listPeople(env, params, deps) {
  const status = params.get('status') || 'active'
  const q = params.get('q')
  const items = (await readCollection(env, COLLECTIONS.people, deps.fetch))
    .filter((p) => status === 'all' || (p.status || 'active') === status)
    .filter((p) => textMatch(q, p.name, p.role, p.team, p.location, p.level))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map(shape.person)
  return page(items, limitOf(params))
}

async function getPerson(env, id, deps) {
  const people = await readCollection(env, COLLECTIONS.people, deps.fetch)
  const p = people.find((x) => x.id === id)
  if (!p) return null
  const [interviews, followUps, accomplishments] = await Promise.all([
    readCollection(env, COLLECTIONS.interviews, deps.fetch),
    readCollection(env, COLLECTIONS.followUps, deps.fetch),
    readCollection(env, COLLECTIONS.accomplishments, deps.fetch),
  ])
  return {
    person: shape.person(p),
    recentInterviews: interviews.filter((i) => i.personId === id).sort(byDateDesc('date')).slice(0, 5).map(shape.interview),
    openFollowUps: followUps.filter((f) => f.personId === id && !f.done).sort(byDateDesc('dueDate')).map(shape.followUp),
    recentAccomplishments: accomplishments.filter((a) => a.personId === id).sort(byDateDesc('date')).slice(0, 12).map(shape.accomplishment),
  }
}

async function listInterviews(env, params, deps) {
  const since = dateParam(params, 'since')
  const until = dateParam(params, 'until')
  const type = params.get('type')
  const q = params.get('q')
  const forPerson = await personFilter(env, params, deps)
  const items = (await readCollection(env, COLLECTIONS.interviews, deps.fetch))
    .filter(forPerson)
    .filter((i) => !type || i.type === type)
    .filter((i) => !since || String(i.date || '') >= since)
    .filter((i) => !until || String(i.date || '') <= until)
    .filter((i) => textMatch(q, i.title, i.summary, i.takeaways, i.tags))
    .sort(byDateDesc('date'))
    .map(shape.interview)
  return page(items, limitOf(params))
}

async function listFollowUps(env, params, deps) {
  const status = params.get('status') || 'open'
  const dueBefore = dateParam(params, 'dueBefore')
  const forPerson = await personFilter(env, params, deps)
  const items = (await readCollection(env, COLLECTIONS.followUps, deps.fetch))
    .filter(forPerson)
    .filter((f) => status === 'all' || (status === 'done' ? !!f.done : !f.done))
    .filter((f) => !dueBefore || (f.dueDate && f.dueDate <= dueBefore))
    // Soonest due first; undated items last.
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
    .map(shape.followUp)
  return page(items, limitOf(params))
}

async function listAccomplishments(env, params, deps) {
  const month = params.get('month')
  if (month && !MONTH.test(month)) throw new BadRequest('month must be YYYY-MM')
  const since = dateParam(params, 'since')
  const until = dateParam(params, 'until')
  const team = params.get('team')
  const forPerson = await personFilter(env, params, deps)
  const items = (await readCollection(env, COLLECTIONS.accomplishments, deps.fetch))
    .filter(forPerson)
    .filter((a) => !month || a.month === month)
    .filter((a) => !since || String(a.date || '') >= since)
    .filter((a) => !until || String(a.date || '') <= until)
    .filter((a) => !team || textMatch(team, a.team))
    .sort(byDateDesc('date'))
    .map(shape.accomplishment)
  return page(items, limitOf(params))
}

async function listNotes(env, params, deps) {
  const q = params.get('q')
  const includeArchived = params.get('includeArchived') === 'true'
  const items = (await readCollection(env, COLLECTIONS.notes, deps.fetch))
    .filter((n) => includeArchived || !n.archived)
    .filter((n) => textMatch(q, n.title, n.body))
    .sort((a, b) => (b.pinned === true) - (a.pinned === true) || byDateDesc('updatedAt')(a, b))
    .map(shape.note)
  return page(items, limitOf(params))
}

async function route(path, params, env, deps) {
  switch (path) {
    case `${BASE}/people`: return listPeople(env, params, deps)
    case `${BASE}/interviews`: return listInterviews(env, params, deps)
    case `${BASE}/follow-ups`: return listFollowUps(env, params, deps)
    case `${BASE}/accomplishments`: return listAccomplishments(env, params, deps)
    case `${BASE}/notes`: return listNotes(env, params, deps)
  }
  const m = new RegExp(`^${BASE}/people/([A-Za-z0-9_-]{1,64})$`).exec(path)
  if (m) return getPerson(env, m[1], deps)
  return undefined
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function handle(request, env, deps = {}) {
  const url = new URL(request.url)
  const log = (status, reason = '') => console.log(`${request.method} ${url.pathname} → ${status}${reason ? ` (${reason})` : ''}`)

  // Config is checked before anything else: a half-configured Worker serves nothing.
  try {
    assertDataConfig(env)
  } catch (e) {
    log(500, 'misconfigured')
    return json(500, { error: 'Endpoint is not configured.' })
  }

  // Authenticate BEFORE routing, so unauthenticated callers can't even learn
  // which paths exist (every unknown path is also a 401 for them).
  try {
    await authenticate(request, env, { jwks: deps.jwks })
  } catch (e) {
    if (e instanceof AuthError) {
      log(e.status, e.code)
      return e.status === 401
        ? json(401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
        : json(403, { error: 'Forbidden' })
    }
    log(500, 'auth_config')
    return json(500, { error: 'Endpoint is not configured.' })
  }

  if (request.method !== 'GET') {
    log(405)
    return json(405, { error: 'Read-only endpoint.' }, { Allow: 'GET' })
  }

  try {
    const result = await route(url.pathname, url.searchParams, env, deps)
    if (result === undefined) { log(404); return json(404, { error: 'Not found' }) }
    if (result === null) { log(404, 'no_such_person'); return json(404, { error: 'No person with that id' }) }
    log(200)
    return json(200, result)
  } catch (e) {
    if (e instanceof BadRequest) { log(400); return json(400, { error: e.message }) }
    log(502, 'upstream')
    console.error(e.message)
    return json(502, { error: 'Could not read PeopleOS data.' })
  }
}

export default {
  fetch: (request, env) => handle(request, env),
}
