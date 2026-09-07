/**
 * OpenRouter — the single place PeopleOS talks to an LLM.
 *
 * OpenAI-compatible chat completions. Auth is an OpenRouter API key
 * (VITE_OPENROUTER_API_KEY); like the other tokens it ships in the client
 * bundle, so keep it on a dedicated key you can rotate.
 *
 * IMPORTANT: use a real, paid model slug (below) and put at least $10 of
 * credit on the OpenRouter account. The old `openrouter/free` slug + the
 * free tier's 20 req/min / ~50 req/day cap were the cause of the constant
 * failures.
 *
 * Every AI feature goes through chat(), so switching provider later (Azure
 * AI Foundry, a local proxy, …) is a change to this file alone.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const API_KEY  = import.meta.env.VITE_OPENROUTER_API_KEY

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
  if (!API_KEY) throw new Error('VITE_OPENROUTER_API_KEY is not set.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(ENDPOINT, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': APP_URL,
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Try again.')
    throw new Error('Network error — check your connection.')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    let msg = `AI error (${res.status})`
    if (res.status === 401) msg = 'OpenRouter API key is missing or invalid.'
    else if (res.status === 402) msg = 'OpenRouter account is out of credit — top it up.'
    else if (res.status === 429) msg = 'Rate limit hit — wait a minute and try again.'
    else {
      try {
        const body = await res.json()
        msg = body?.error?.message || msg
      } catch {}
    }
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
