/**
 * Generates comma-separated tags from interview summary + takeaways
 * using OpenRouter's free model. Called automatically when both fields
 * have enough content and the tags field is still empty.
 */
export async function generateTags(summary, takeaways) {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) return null

  const prompt =
    `Based on the following interview notes, generate 4–6 short, lowercase comma-separated tags ` +
    `that capture the key topics, themes, and action types discussed. ` +
    `Examples of good tags: growth, promotion, blockers, feedback, career-plan, performance, wellbeing, team-dynamics, recognition, conflict.\n\n` +
    `Summary: ${summary}\n` +
    `Takeaways: ${takeaways}\n\n` +
    `Reply with ONLY the comma-separated tags, nothing else. No explanation, no punctuation other than commas.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://henryai-stack.github.io/people-os/',
      'X-Title': 'PeopleOS',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content?.trim() || ''
  // Sanitise: lowercase, strip quotes/periods, max 6 tags
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
    .slice(0, 6)
    .join(', ')
}
