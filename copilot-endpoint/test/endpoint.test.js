// Run with: npm test   (Node 20+, no network needed)
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import CryptoJS from 'crypto-js'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose'
import { handle } from '../src/index.js'
import { clearCache } from '../src/data.js'
import { COPILOT_TOKEN_STORE_CLIENT_ID } from '../src/auth.js'

const TENANT = '11111111-2222-3333-4444-555555555555'
const ME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const SOMEONE_ELSE = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee'
const API_CLIENT_ID = '99999999-8888-7777-6666-555555555555'
const SECRET = 'test-secret-that-is-at-least-32-characters-long'

const ENV = {
  ENTRA_TENANT_ID: TENANT,
  ENTRA_API_AUDIENCES: `${API_CLIENT_ID},api://auth-xyz/${API_CLIENT_ID}`,
  ALLOWED_USER_OID: ME,
  GH_OWNER: 'HenryAI-stack',
  GH_DATA_REPO: 'people-os-data',
  GH_TOKEN: 'gh-test-token',
  ENCRYPTION_SECRET: SECRET,
}

// ── Fixture data, encrypted exactly the way src/lib/crypto.js does it ────────
const DATA = {
  'direct-reports.json': [
    { id: 'p1', name: 'Ana Kowalska', role: 'Support Engineer', team: 'Warsaw', status: 'active', photo: 'data:image/png;base64,AAAA', email: 'ana@example.com' },
    { id: 'p2', name: 'Ravi Kumar', role: 'Team Lead', team: 'Bangalore', status: 'active' },
    { id: 'p3', name: 'Old Leaver', status: 'inactive' },
  ],
  'interviews.json': [
    { id: 'i1', personId: 'p1', person: 'Ana Kowalska', type: '1:1', date: '2026-10-20', title: 'Weekly', summary: 'Discussed career growth' },
    { id: 'i2', personId: 'p1', person: 'Ana Kowalska', type: '1:1', date: '2026-09-01', title: 'Weekly', summary: 'Onboarding check' },
    { id: 'i3', personId: 'p2', person: 'Ravi Kumar', type: 'skip_level', date: '2026-10-25', title: 'Skip', summary: 'Team morale' },
  ],
  'follow-ups.json': [
    { id: 'f1', personId: 'p1', personName: 'Ana Kowalska', text: 'Send training link', dueDate: '2026-11-10', done: false, msTaskId: 'secret-graph-id' },
    { id: 'f2', personId: 'p2', personName: 'Ravi Kumar', text: 'Done thing', done: true },
  ],
  'accomplishments.json': [
    { id: 'a1', month: '2026-10', date: '2026-10-12', text: 'Closed 40 tickets', assigneeType: 'person', personId: 'p1', personName: 'Ana Kowalska' },
  ],
  'notes.json': [
    { id: 'n1', title: 'Budget', body: 'Q1 headcount', pinned: true },
    { id: 'n2', title: 'Old', body: 'archived stuff', archived: true },
  ],
}

let githubCalls = []
function fakeGitHub(url, init) {
  githubCalls.push({ url, init })
  const name = new URL(url).pathname.split('/').pop()
  if (!DATA[name]) return Promise.resolve(new Response('', { status: 404 }))
  const cipher = CryptoJS.AES.encrypt(JSON.stringify(DATA[name]), SECRET).toString()
  const content = Buffer.from(cipher, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n')
  return Promise.resolve(new Response(JSON.stringify({ content, sha: 'x' }), { status: 200 }))
}

// ── Token minting ────────────────────────────────────────────────────────────
const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwks = createLocalJWKSet({ keys: [jwk] })
const { privateKey: attackerKey } = await generateKeyPair('RS256')

async function token(overrides = {}, { key = privateKey, kid = 'k1' } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    tid: TENANT, oid: ME, scp: 'PeopleOS.Read', azp: COPILOT_TOKEN_STORE_CLIENT_ID, ver: '2.0',
    iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, aud: API_CLIENT_ID,
    iat: now, nbf: now, exp: now + 3600,
    ...overrides,
  }
  for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k]
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid }).sign(key)
}

async function call(path, { tok, method = 'GET', env = ENV } = {}) {
  const headers = tok === undefined ? {} : { Authorization: `Bearer ${tok}` }
  const res = await handle(new Request(`https://w.example${path}`, { method, headers }), env, { jwks, fetch: fakeGitHub })
  return { status: res.status, body: await res.json(), headers: res.headers }
}

beforeEach(() => { clearCache(); githubCalls = [] })

// ── Who gets in ──────────────────────────────────────────────────────────────
test('my token gets data', async () => {
  const r = await call('/v1/people', { tok: await token() })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.items.map((p) => p.name), ['Ana Kowalska', 'Ravi Kumar'])
})

test('v1-format token (sts.windows.net issuer, appid, api:// audience) also works', async () => {
  const r = await call('/v1/people', { tok: await token({
    iss: `https://sts.windows.net/${TENANT}/`, aud: `api://auth-xyz/${API_CLIENT_ID}`,
    azp: undefined, appid: COPILOT_TOKEN_STORE_CLIENT_ID, ver: '1.0',
  }) })
  assert.equal(r.status, 200)
})

const rejections = [
  ['no token at all', undefined, 401],
  ['garbage token', 'not.a.jwt', 401],
  ['another user in my tenant', { oid: SOMEONE_ELSE }, 403],
  ['my oid but another tenant (issuer mismatch)', { tid: '00000000-0000-0000-0000-000000000000', iss: 'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0' }, 401],
  ['right issuer, wrong tid claim', { tid: '00000000-0000-0000-0000-000000000000' }, 403],
  ['token for some other API (audience)', { aud: '12345678-1234-1234-1234-123456789012' }, 401],
  ['expired', { exp: Math.floor(Date.now() / 1000) - 600, iat: Math.floor(Date.now() / 1000) - 4200, nbf: Math.floor(Date.now() / 1000) - 4200 }, 401],
  ['missing PeopleOS.Read scope', { scp: 'User.Read' }, 403],
  ['app-only token (no scp)', { scp: undefined, roles: ['PeopleOS.Read'] }, 403],
  ['requested by a different client app (e.g. Graph Explorer)', { azp: 'de8bc8b5-d9f9-48b1-a8ad-b748da725064' }, 403],
  ['no oid claim', { oid: undefined }, 401],
]
for (const [name, claims, expected] of rejections) {
  test(`rejects: ${name}`, async () => {
    const tok = claims === undefined ? undefined : typeof claims === 'string' ? claims : await token(claims)
    const r = await call('/v1/people', { tok })
    assert.equal(r.status, expected)
    assert.equal(githubCalls.length, 0, 'must not touch the data repo')
    assert.ok(!JSON.stringify(r.body).includes('Ana'))
  })
}

test('rejects: token signed by a key not in the tenant JWKS', async () => {
  const r = await call('/v1/people', { tok: await token({}, { key: attackerKey }) })
  assert.equal(r.status, 401)
})

test('rejects: alg=none / HS256 tokens', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ tid: TENANT, oid: ME, scp: 'PeopleOS.Read', aud: API_CLIENT_ID })).toString('base64url')
  assert.equal((await call('/v1/people', { tok: `${header}.${body}.x` })).status, 401)
})

test('unauthenticated callers cannot discover routes', async () => {
  assert.equal((await call('/v1/does-not-exist')).status, 401)
})

test('fails closed when auth config is missing or uses a wildcard tenant', async () => {
  const tok = await token()
  assert.equal((await call('/v1/people', { tok, env: { ...ENV, ALLOWED_USER_OID: '' } })).status, 500)
  assert.equal((await call('/v1/people', { tok, env: { ...ENV, ENTRA_TENANT_ID: 'common' } })).status, 500)
  assert.equal((await call('/v1/people', { tok, env: { ...ENV, ENCRYPTION_SECRET: '' } })).status, 500)
  assert.equal(githubCalls.length, 0)
})

// ── Read-only + hygiene ──────────────────────────────────────────────────────
test('writes are refused even for me', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await call('/v1/people', { tok: await token(), method })).status, 405)
  }
  assert.equal(githubCalls.length, 0)
})

test('responses are no-store and carry no CORS headers', async () => {
  const r = await call('/v1/people', { tok: await token() })
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.equal(r.headers.get('access-control-allow-origin'), null)
})

test('photos and Graph sync IDs never leave the Worker', async () => {
  const tok = await token()
  const people = await call('/v1/people', { tok })
  assert.ok(!JSON.stringify(people.body).includes('data:image'))
  const fu = await call('/v1/follow-ups', { tok })
  assert.ok(!JSON.stringify(fu.body).includes('secret-graph-id'))
})

test('GitHub is called with the read token and a User-Agent', async () => {
  await call('/v1/people', { tok: await token() })
  const h = githubCalls[0].init.headers
  assert.equal(h.Authorization, 'Bearer gh-test-token')
  assert.ok(h['User-Agent'])
  assert.equal(githubCalls[0].init.method, undefined) // GET
})

// ── Data routes ──────────────────────────────────────────────────────────────
test('person detail bundles interviews, open follow-ups, accomplishments', async () => {
  const r = await call('/v1/people/p1', { tok: await token() })
  assert.equal(r.status, 200)
  assert.equal(r.body.person.name, 'Ana Kowalska')
  assert.deepEqual(r.body.recentInterviews.map((i) => i.id), ['i1', 'i2'])
  assert.deepEqual(r.body.openFollowUps.map((f) => f.id), ['f1'])
  assert.deepEqual(r.body.recentAccomplishments.map((a) => a.id), ['a1'])
  assert.equal((await call('/v1/people/nope', { tok: await token() })).status, 404)
})

test('interviews filter by person name, type and date range', async () => {
  const tok = await token()
  assert.deepEqual((await call('/v1/interviews?person=ana', { tok })).body.items.map((i) => i.id), ['i1', 'i2'])
  assert.deepEqual((await call('/v1/interviews?type=skip_level', { tok })).body.items.map((i) => i.id), ['i3'])
  assert.deepEqual((await call('/v1/interviews?since=2026-10-01', { tok })).body.items.map((i) => i.id), ['i3', 'i1'])
  assert.equal((await call('/v1/interviews?since=last-week', { tok })).status, 400)
})

test('follow-ups default to open; notes hide archived; accomplishments by month', async () => {
  const tok = await token()
  assert.deepEqual((await call('/v1/follow-ups', { tok })).body.items.map((f) => f.id), ['f1'])
  assert.deepEqual((await call('/v1/follow-ups?status=all', { tok })).body.items.length, 2)
  assert.deepEqual((await call('/v1/notes', { tok })).body.items.map((n) => n.id), ['n1'])
  assert.deepEqual((await call('/v1/accomplishments?month=2026-10', { tok })).body.items.map((a) => a.id), ['a1'])
  assert.equal((await call('/v1/accomplishments?month=October', { tok })).status, 400)
})

test('limit is capped at 50', async () => {
  const r = await call('/v1/people?limit=9999&status=all', { tok: await token() })
  assert.equal(r.body.count, 3)
})
