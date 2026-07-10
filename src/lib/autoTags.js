const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

async function callOpenRouter(prompt, maxTokens = 80) {
  if (!API_KEY) throw new Error('VITE_OPENROUTER_API_KEY is not set.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

  let res
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://henryai-stack.github.io/people-os/',
        'X-Title': 'PeopleOS',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Try again.')
    throw new Error('Network error — check your connection.')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    let msg = `API error (${res.status})`
    try {
      const body = await res.json()
      msg = body?.error?.message || msg
    } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from AI — try again.')
  return text
}

function sanitiseTags(raw) {
  if (!raw) return ''
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 30 && t.split(/\s+/).length <= 3)
    .map((t) =>
      t.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    )
    .filter((t) => t.length >= 2 && t.length <= 25)
    .slice(0, 6)
    .join(', ')
}

export async function generateTags(summary, takeaways) {
  const text = [summary, takeaways].filter(Boolean).join('\n')
  const prompt =
    `Extract 4 to 6 short topic tags from this interview note. ` +
    `Reply with ONLY a comma-separated list like: growth, feedback, blockers, promotion\n` +
    `Do NOT include any explanation or extra text.\n\n` +
    `Interview note:\n${text}`

  const raw = await callOpenRouter(prompt, 60)
  const tags = sanitiseTags(raw)
  if (!tags) throw new Error('Could not extract tags — try again.')
  return tags
}

export async function generateTakeaways(summary) {
  if (!summary || summary.length < 20) throw new Error('Summary is too short to generate takeaways.')

  const prompt =
    `Based on this interview summary, write 3 to 5 concise key takeaways as a bullet list. ` +
    `Each bullet should be one short sentence starting with "•". ` +
    `Reply with ONLY the bullet points, no intro text.\n\n` +
    `Summary:\n${summary}`

  const raw = await callOpenRouter(prompt, 200)
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*•]\s*/, '• '))
    .join('\n')
}
