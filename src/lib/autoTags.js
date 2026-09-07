import { chat } from './ai.js'

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

  const raw = await chat(prompt, { maxTokens: 60 })
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

  const raw = await chat(prompt, { maxTokens: 200 })

  // Strip any model preamble/reasoning — only keep lines that are actual bullets.
  // Some models leak "thinking" text before the bullet points.
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // Find where the bullets actually start
  const bulletStart = lines.findIndex((l) => /^[-*•]/.test(l))
  const bulletLines = bulletStart >= 0 ? lines.slice(bulletStart) : lines

  // Keep only bullet lines (drop any trailing prose the model may add)
  const bullets = bulletLines
    .filter((l) => /^[-*•]/.test(l))
    .map((l) => l.replace(/^[-*•]\s*/, '• '))

  if (bullets.length === 0) throw new Error('No bullet points found in response — try again.')
  return bullets.join('\n')
}


export async function generateFollowUpTopics(personName, previousInterviews) {
  if (!previousInterviews.length) throw new Error('No previous interviews found.')

  const interviewText = previousInterviews.slice(0, 10).map((iv, i) =>
    `[${i+1}] ${iv.title || 'Untitled'} | ${iv.type} | ${iv.date || 'no date'}\n` +
    (iv.summary   ? `Summary: ${iv.summary}\n`     : '') +
    (iv.takeaways ? `Takeaways: ${iv.takeaways}\n` : '') +
    (iv.tags      ? `Tags: ${iv.tags}\n`           : '')
  ).join('\n')

  const prompt =
    `You are a People Leader's assistant. Based on the previous interviews with ${personName}, ` +
    `suggest 6-8 specific follow-up topics for the next conversation.\n` +
    `Focus on: unresolved action items, recurring themes, growth areas, open decisions, and wellbeing.\n\n` +
    `Previous interviews:\n${interviewText}\n\n` +
    `Reply with ONLY a bullet list. Each line starts with • and is one concise sentence. No intro text.`

  const raw = await chat(prompt, { maxTokens: 400 })
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const bulletStart = lines.findIndex(l => /^[•\-\*]/.test(l))
  const bullets = (bulletStart >= 0 ? lines.slice(bulletStart) : lines)
    .filter(l => /^[•\-\*]/.test(l))
    .map(l => l.replace(/^[•\-\*]\s*/, ''))
  if (!bullets.length) throw new Error('No suggestions returned — try again.')
  return bullets
}
