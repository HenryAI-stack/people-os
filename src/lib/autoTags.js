const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

async function callOpenRouter(prompt, maxTokens = 80) {
  if (!API_KEY) return null
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
  if (!res.ok) return null
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}

/** Cleans model output into valid short tags. Filters out any garbage sentences. */
function sanitiseTags(raw) {
  if (!raw) return ''
  return raw
    .split(',')
    .map((t) => t.trim())
    // Drop anything that looks like a sentence fragment (too long or too many words)
    .filter((t) => t.length > 0 && t.length <= 30 && t.split(/\s+/).length <= 3)
    .map((t) =>
      t.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')   // keep letters, digits, spaces, hyphens
        .replace(/\s+/g, '-')            // spaces → hyphens
        .replace(/-+/g, '-')             // collapse double hyphens
        .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
    )
    .filter((t) => t.length >= 2 && t.length <= 25)  // drop empties and still-long ones
    .slice(0, 6)
    .join(', ')
}

/**
 * Generates 4–6 short tags from interview summary + takeaways.
 * Returns a comma-separated string, or null on failure.
 */
export async function generateTags(summary, takeaways) {
  const text = [summary, takeaways].filter(Boolean).join('\n')
  const prompt =
    `Extract 4 to 6 short topic tags from this interview note. ` +
    `Reply with ONLY a comma-separated list like: growth, feedback, blockers, promotion\n` +
    `Do NOT include any explanation or extra text.\n\n` +
    `Interview note:\n${text}`

  const raw = await callOpenRouter(prompt, 60)
  return sanitiseTags(raw)
}

/**
 * Generates key takeaways from an interview summary.
 * Returns a bullet-point string, or null on failure.
 */
export async function generateTakeaways(summary) {
  if (!summary || summary.length < 20) return null
  const prompt =
    `Based on this interview summary, write 3 to 5 concise key takeaways as a bullet list. ` +
    `Each bullet should be one short sentence starting with "•". ` +
    `Reply with ONLY the bullet points, no intro text.\n\n` +
    `Summary:\n${summary}`

  const raw = await callOpenRouter(prompt, 200)
  if (!raw) return null
  // Normalise bullets — model may use -, *, or • 
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*•]\s*/, '• '))
    .join('\n')
}
