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

// Cheap, fast, reliable. Alternatives: 'google/gemini-2.0-flash-001',
// 'anthropic/claude-3.5-haiku', 'openai/gpt-4.1-mini'. Browse slugs at
// https://openrouter.ai/models.
export const MODEL = 'openai/gpt-4o-mini'

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
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from AI — try again.')
  return text
}
