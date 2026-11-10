// node --test test/  — exercises the handler with a local key set and a fake OpenRouter.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose'
import { createHandler } from '../lib/handler.js'

const PROJECT = 'people-os-test'
const EMAIL = 'max@example.com'
const ORIGIN = 'https://henryai-stack.github.io'

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
const jwks = createLocalJWKSet({ keys: [jwk] })
const other = await generateKeyPair('RS256')

async function token(claims = {}, { key = privateKey, exp = '1h', aud = PROJECT } = {}) {
  return new SignJWT({ email: EMAIL, email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key)
}

const env = {
  FIREBASE_PROJECT_ID: PROJECT,
  ALLOWED_EMAIL: 'Max@Example.com', // case-insensitive, like Google emails
  OPENROUTER_API_KEY: 'sk-or-secret',
}

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: undefined }
  r.status = (c) => { r.statusCode = c; return r }
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v }
  r.json = (o) => { r.body = o; return r }
  r.send = (t) => { r.body = JSON.parse(t); return r }
  r.end = () => r
  return r
}

function upstreamOk(seen) {
  return async (url, init) => {
    seen.push({ url, init, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
}

async function call({ method = 'POST', origin = ORIGIN, auth, body, envOver = {}, fetchImpl } = {}) {
  const seen = []
  const handler = createHandler({ env: { ...env, ...envOver }, jwks, fetchImpl: fetchImpl || upstreamOk(seen) })
  const headers = {}
  if (origin) headers.origin = origin
  if (auth) headers.authorization = auth
  const res = fakeRes()
  await handler({ method, headers, body }, res)
  return { res, seen }
}

const msg = { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 100, model: 'x/y' }

test('valid token forwards to OpenRouter with the server key', async () => {
  const { res, seen } = await call({ auth: `Bearer ${await token()}`, body: msg })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.choices[0].message.content, 'hi')
  assert.equal(res.headers['access-control-allow-origin'], ORIGIN)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].init.headers.Authorization, 'Bearer sk-or-secret')
  assert.deepEqual(seen[0].body, { model: 'x/y', max_tokens: 100, messages: [{ role: 'user', content: 'Hello' }] })
})

test('OPENROUTER_MODEL on the proxy overrides the app’s model; max_tokens is capped', async () => {
  const { seen } = await call({
    auth: `Bearer ${await token()}`,
    body: { ...msg, max_tokens: 999999 },
    envOver: { OPENROUTER_MODEL: 'server/model' },
  })
  assert.equal(seen[0].body.model, 'server/model')
  assert.equal(seen[0].body.max_tokens, 4000)
})

test('string bodies are parsed', async () => {
  const { res } = await call({ auth: `Bearer ${await token()}`, body: JSON.stringify(msg) })
  assert.equal(res.statusCode, 200)
})

test('preflight from an allowed origin gets 204 + CORS headers', async () => {
  const { res, seen } = await call({ method: 'OPTIONS' })
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['access-control-allow-headers'], 'Authorization, Content-Type')
  assert.equal(seen.length, 0)
})

test('unknown origin is refused', async () => {
  const { res, seen } = await call({ origin: 'https://evil.example', auth: `Bearer ${await token()}`, body: msg })
  assert.equal(res.statusCode, 403)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
  assert.equal(seen.length, 0)
})

for (const [name, makeAuth, status] of [
  ['missing token', async () => undefined, 401],
  ['token signed by another key', async () => `Bearer ${await token({}, { key: other.privateKey })}`, 401],
  ['expired token', async () => `Bearer ${await token({}, { exp: Math.floor(Date.now() / 1000) - 60 })}`, 401],
  ['token for another Firebase project', async () => `Bearer ${await token({}, { aud: 'someone-else' })}`, 401],
  ['different account', async () => `Bearer ${await token({ email: 'other@example.com' })}`, 403],
  ['unverified email', async () => `Bearer ${await token({ email_verified: false })}`, 403],
]) {
  test(`${name} → ${status}, nothing forwarded`, async () => {
    const { res, seen } = await call({ auth: await makeAuth(), body: msg })
    assert.equal(res.statusCode, status)
    assert.equal(seen.length, 0)
  })
}

test('missing configuration → 500 with a clear message', async () => {
  const { res } = await call({ auth: `Bearer ${await token()}`, body: msg, envOver: { OPENROUTER_API_KEY: '' } })
  assert.equal(res.statusCode, 500)
  assert.match(res.body.error.message, /OPENROUTER_API_KEY/)
})

test('bad body → 400', async () => {
  const { res } = await call({ auth: `Bearer ${await token()}`, body: { messages: [] } })
  assert.equal(res.statusCode, 400)
})

test('OpenRouter 401 becomes 502 (proxy key problem, not the user’s sign-in)', async () => {
  const fetchImpl = async () => new Response('{"error":{"message":"No auth"}}', { status: 401 })
  const { res } = await call({ auth: `Bearer ${await token()}`, body: msg, fetchImpl })
  assert.equal(res.statusCode, 502)
  assert.match(res.body.error.message, /OPENROUTER_API_KEY/)
})

test('other upstream statuses pass through (e.g. 402 out of credit)', async () => {
  const fetchImpl = async () => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 })
  const { res } = await call({ auth: `Bearer ${await token()}`, body: msg, fetchImpl })
  assert.equal(res.statusCode, 402)
  assert.equal(res.body.error.message, 'Insufficient credits')
})

test('upstream unreachable → 502', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed') }
  const { res } = await call({ auth: `Bearer ${await token()}`, body: msg, fetchImpl })
  assert.equal(res.statusCode, 502)
})
