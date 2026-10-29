// Interview tags are stored as one comma-separated string per interview (`tags`), written either
// by autoTags.js's generateTags() (lower-case, hyphenated) or typed by hand. These helpers are the
// one place that splits/normalises them, shared by the Dashboard tag cloud and the Interviews
// page's tag filter, so "Career Growth", "career growth" and "career-growth" count as one tag.

export function splitTags(tags) {
  return (tags || '').split(',').map((t) => t.trim()).filter(Boolean)
}

export function tagKey(tag) {
  return (tag || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
}

export function hasTag(interview, key) {
  return splitTags(interview.tags).some((t) => tagKey(t) === key)
}

// 'YYYY-MM-DD' for `days` days before today, local calendar (string compare, no ISO parsing).
function cutoffDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// → { tags: [{ key, label, count, weight }] (alphabetical), interviewCount, totalTags }
// `days` = null → all time. Counts conversations per tag (a tag listed twice on one interview
// counts once). Keeps the `limit` most frequent; `weight` (0–1) is log-scaled between the
// least and most frequent shown tag, so one dominant tag doesn't flatten the rest.
export function computeTagCloud(interviews, { days = null, limit = 40 } = {}) {
  const from = days ? cutoffDate(days) : null
  const byKey = new Map()
  let interviewCount = 0

  for (const iv of interviews) {
    if (from && (!iv.date || iv.date < from)) continue
    const seen = new Set()
    for (const raw of splitTags(iv.tags)) {
      const key = tagKey(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const entry = byKey.get(key) || { key, count: 0, spellings: new Map() }
      entry.count += 1
      entry.spellings.set(raw, (entry.spellings.get(raw) || 0) + 1)
      byKey.set(key, entry)
    }
    if (seen.size) interviewCount += 1
  }

  const top = [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit)
  if (!top.length) return { tags: [], interviewCount, totalTags: 0 }

  const max = Math.log(top[0].count)
  const min = Math.log(top[top.length - 1].count)
  const tags = top
    .map((e) => ({
      key: e.key,
      // Show the spelling used most often for this tag.
      label: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: e.count,
      weight: max === min ? 0.5 : (Math.log(e.count) - min) / (max - min),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return { tags, interviewCount, totalTags: byKey.size }
}
