/**
 * GitHub Models — the single place PeopleOS talks to an LLM.
 *
 * OpenAI-compatible chat completions, hosted by GitHub. Auth is a
 * fine-grained PAT with the account-level "Models" permission set to
 * "Read-only" (nothing else) — VITE_GITHUB_MODELS_TOKEN. Like the other
 * tokens it ships in the client bundle, so keep its scope to models:read.
 *
 * Every AI feature in the app goes through chat(), so switching provider
 * later (Azure OpenAI, OpenRouter, a local proxy, …) is a change to this
 * file alone.
 */

const ENDPOINT = 'https://models.github.ai/inference/chat/completions'
const TOKEN    = import.meta.env.VITE_GITHUB_MODELS_TOKEN

// Cheap, fast, and on GitHub Models' most generous rate-limit tier.
// Swap for 'openai/gpt-4.1-mini', 'openai/gpt-4.1', 'openai/gpt-5', etc.
// See https://github.com/marketplace/models for the catalogue.
export const MODEL = 'openai/gpt-4o-mini'

/**
 * Send a single user-message prompt and return the assistant's text.
 * Throws Error with a user-facing message on any failure.
 *
 * @param {string} prompt
 * @param {{ maxTokens?: number, timeoutMs?: number }} [opts]
 */
export async function chat(prompt, { maxTokens = 400, timeoutMs = 30000 } = {}) {
  if (!TOKEN) throw new Error('VITE_GITHUB_MODELS_TOKEN is not set.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(ENDPOINT, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
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
    if (res.status === 401) msg = 'GitHub Models token is missing or invalid.'
    else if (res.status === 403) msg = 'Token lacks the "Models" read permission, or access to this model is denied.'
    else if (res.status === 429) msg = 'Rate limit hit — wait a minute and try again.'
    else {
      try {
        const body = await res.json()
        msg = body?.error?.message || body?.error || msg
      } catch {}
    }
    throw new Error(msg)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from AI — try again.')
  return text
}
