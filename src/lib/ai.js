/**
 * OpenRouter — the single place PeopleOS talks to an LLM.
 *
 * OpenAI-compatible chat completions, sent one of two ways:
 *
 * 1. Via the AI proxy (VITE_AI_PROXY_URL set — preferred): a Vercel function
 *    (`ai-proxy/` in this repo) that holds the OpenRouter key server-side and
 *    forwards the call. The app authenticates with the signed-in user's
 *    Firebase ID token. Exists because the company network blocks openrouter.ai,
 *    and it keeps the key out of the bundle.
 * 2. Directly to OpenRouter (no proxy URL): auth is VITE_OPENROUTER_API_KEY,
 *    which then ships in the client bundle like the other tokens.
 *
 * IMPORTANT: use a real, paid model slug (below) and put at least $10 of
 * credit on the OpenRouter account. The old `openrouter/free` slug + the
 * free tier's 20 req/min / ~50 req/day cap were the cause of the constant
 * failures.
 *
 * Every AI feature goes through chat(), so switching provider later (Azure
 * AI Foundry, …) is a change to this file alone.
 */
import { auth } from './auth.js'

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
export const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL || '').trim()
const PROXY_URL = AI_PROXY_URL
const API_KEY   = import.meta.env.VITE_OPENROUTER_API_KEY
const ENDPOINT  = PROXY_URL || OPENROUTER_ENDPOINT

function endpointHost() {
  try { return new URL(ENDPOINT).host } catch { return ENDPOINT }
}

// OpenRouter retires model slugs regularly, so this is overridable via
// VITE_OPENROUTER_MODEL without touching code. Default: fast, cheap, and
// (unlike Azure-served OpenAI models) not prone to content-filter blocks
// on HR / performance-review text. Check current slugs at
// https://openrouter.ai/models — a stale one fails with "No endpoints found".
export const MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.5-flash'

// Shown on OpenRouter's app-rankings dashboard; harmless if it doesn't
// match your fork's URL.
const APP_URL   = 'https://henryai-stack.github.io/people-os/'
const APP_TITLE = 'PeopleOS'

/**
 * Send a single user-message prompt and return the assistant's text.
 * Throws Error with a user-facing message on any failure.
 *
 * @param {string} prompt
 * @param {{ maxTokens?: number, timeoutMs?: number }} [opts]
 */
export async function chat(prompt, { maxTokens = 400, timeoutMs = 30000 } = {}) {
  let headers
  if (PROXY_URL) {
    const user = auth.currentUser
    if (!user) throw new Error('Not signed in — reload PeopleOS and try again.')
    // getIdToken() returns the cached token and refreshes it when it's near expiry.
    const idToken = await user.getIdToken()
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` }
  } else {
    if (!API_KEY) throw new Error('No AI configured — set VITE_AI_PROXY_URL (or VITE_OPENROUTER_API_KEY).')
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': APP_URL,
      'X-Title': APP_TITLE,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(ENDPOINT, {
      signal: controller.signal,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Try again.')
    // fetch() only throws (no response at all) when the request never got an
    // answer: offline, DNS failure, CORS, or a network filter blocking the host.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('You are offline — AI features need a connection.')
    }
    throw new Error(
      `Can't reach the AI service (${endpointHost()}). It may be blocked on this network — ` +
      'try from another network, e.g. your phone.'
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    let bodyMsg = ''
    try {
      const body = await res.json()
      bodyMsg = body?.error?.message || ''
    } catch {}
    let msg = bodyMsg || `AI error (${res.status})`
    // The proxy explains its own 401/403s (sign-in token, account) in the body;
    // direct to OpenRouter, a 401 means the bundled key is wrong.
    if (res.status === 401 && !PROXY_URL) msg = 'OpenRouter API key is missing or invalid.'
    else if (res.status === 402) msg = 'OpenRouter account is out of credit — top it up.'
    else if (res.status === 429) msg = 'Rate limit hit — wait a minute and try again.'
    throw new Error(msg)
  }

  const data = await res.json()

  // OpenRouter frequently returns HTTP 200 with an error object instead of
  // choices — out of credit, data-policy mismatch, provider/moderation error.
  if (data.error) {
    let m = data.error.message || `AI error: ${JSON.stringify(data.error)}`
    if (/no endpoints found/i.test(m)) {
      m += ` — the model slug (VITE_OPENROUTER_MODEL, currently "${MODEL}") is stale or unavailable; pick a current one at https://openrouter.ai/models.`
    }
    throw new Error(m)
  }

  const choice = data.choices?.[0]
  const text = choice?.message?.content?.trim()
  if (text) return text

  // 200 but no usable text — surface whatever the response says about why.
  const reason = choice?.finish_reason || choice?.native_finish_reason
  if (choice?.message?.refusal) {
    throw new Error(`Model refused the request: ${choice.message.refusal}`)
  }
  if (reason === 'content_filter') {
    throw new Error(
      "Blocked by the provider's content filter. Switch MODEL in src/lib/ai.js " +
      'to a non-Azure model, or rephrase the notes.'
    )
  }
  if (reason === 'length') {
    throw new Error('Hit the token limit before producing any text — raise maxTokens.')
  }
  throw new Error(
    `Empty response from AI${reason ? ` (finish_reason: ${reason})` : ''}. ` +
    'Check the chat/completions response in DevTools → Network for the raw error.'
  )
}
