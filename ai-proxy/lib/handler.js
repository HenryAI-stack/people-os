/**
 * PeopleOS AI proxy — forwards chat completions to OpenRouter.
 *
 * Why it exists: some networks (e.g. the company laptop) block openrouter.ai,
 * and the browser bundle shouldn't carry the OpenRouter key. The app calls this
 * function instead; the key lives here as a Vercel environment variable.
 *
 * Who may call it: only a signed-in PeopleOS user. The app sends its Firebase
 * ID token as `Authorization: Bearer …`; we verify it against Google's public
 * keys (issuer/audience = the Firebase project) and require the token's email
 * to equal ALLOWED_EMAIL — the same single-account rule as src/lib/auth.js.
 * Browser requests are also limited to ALLOWED_ORIGINS via CORS.
 *
 * createHandler() takes its dependencies so the tests can inject a local key
 * set and a fake upstream; api/chat.js uses the defaults.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const DEFAULT_ORIGINS = [
  'https://henryai-stack.github.io',
  'https://cloudplay.at',
  'https://www.cloudplay.at',
  'http://localhost:5173',
  'http://localhost:4173',
]
const DEFAULT_MODEL = 'google/gemini-2.5-flash'
const MAX_TOKENS_CAP = 4000          // no PeopleOS prompt asks for more than ~1000
const MAX_BODY_BYTES = 200_000       // a long interview's notes fit easily
const UPSTREAM_TIMEOUT_MS = 55_000   // under vercel.json's maxDuration (60s)

function listEnv(value, fallback) {
  const items = (value || '').split(',').map((s) => s.trim()).filter(Boolean)
  return items.length ? items : fallback
}

export function createHandler({
  env = process.env,
  jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
  fetchImpl = fetch,
} = {}) {
  return async function handler(req, res) {
    const allowedOrigins = listEnv(env.ALLOWED_ORIGINS, DEFAULT_ORIGINS)
    const origin = req.headers.origin

    // CORS: echo the origin only when it's on the list. Requests without an
    // Origin header (curl, server-to-server) skip CORS but still need a valid token.
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Max-Age', '86400')
    }

    const fail = (status, message, code) =>
      res.status(status).json({ error: { message, code } })

    if (origin && !allowedOrigins.includes(origin)) {
      return fail(403, `Origin ${origin} is not allowed (ALLOWED_ORIGINS on the proxy).`, 'origin')
    }
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return fail(405, 'Use POST.', 'method')

    const projectId = env.FIREBASE_PROJECT_ID
    const allowedEmail = (env.ALLOWED_EMAIL || '').trim().toLowerCase()
    const apiKey = env.OPENROUTER_API_KEY
    if (!projectId || !allowedEmail || !apiKey) {
      return fail(500,
        'AI proxy is not configured — set FIREBASE_PROJECT_ID, ALLOWED_EMAIL and OPENROUTER_API_KEY in Vercel.',
        'config')
    }

    // ---- Who's calling? ----------------------------------------------------
    const auth = req.headers.authorization || ''
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!idToken) return fail(401, 'Missing sign-in token.', 'auth')

    let claims
    try {
      ;({ payload: claims } = await jwtVerify(idToken, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      }))
    } catch {
      return fail(401, 'Sign-in token is invalid or expired — reload PeopleOS and try again.', 'auth')
    }
    if (!claims.email_verified || String(claims.email || '').toLowerCase() !== allowedEmail) {
      return fail(403, 'This account may not use the AI proxy.', 'auth')
    }

    // ---- What are they asking? ---------------------------------------------
    let body = req.body
    if (typeof body === 'string') {
      if (body.length > MAX_BODY_BYTES) return fail(413, 'Request too large.', 'size')
      try { body = JSON.parse(body) } catch { return fail(400, 'Body must be JSON.', 'body') }
    }
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return fail(400, 'Body needs a non-empty "messages" array.', 'body')
    }
    if (JSON.stringify(body.messages).length > MAX_BODY_BYTES) {
      return fail(413, 'Request too large.', 'size')
    }

    // Only pass on what PeopleOS uses — the proxy is not a general OpenRouter relay.
    const upstreamBody = {
      model: env.OPENROUTER_MODEL || body.model || DEFAULT_MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 400, MAX_TOKENS_CAP),
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    }

    // ---- Forward ------------------------------------------------------------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    let upstream
    try {
      upstream = await fetchImpl(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': env.APP_URL || 'https://henryai-stack.github.io/people-os/',
          'X-Title': 'PeopleOS',
        },
        body: JSON.stringify(upstreamBody),
      })
    } catch (err) {
      if (err?.name === 'AbortError') return fail(504, 'OpenRouter took too long to answer.', 'timeout')
      return fail(502, 'The proxy could not reach OpenRouter.', 'upstream')
    } finally {
      clearTimeout(timer)
    }

    // OpenRouter's 401 means *our* key is wrong — don't let the app read it as
    // "your sign-in failed".
    if (upstream.status === 401) {
      return fail(502, 'OpenRouter rejected the proxy’s key — check OPENROUTER_API_KEY in Vercel.', 'upstream_auth')
    }

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(text)
  }
}
