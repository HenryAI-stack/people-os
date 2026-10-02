// 1:1 cadence — derived entirely from interviews.json (type '1:1'); nothing is stored.
// Matching mirrors PersonDetail.jsx: personId, or a case-insensitive name match for
// interviews logged before personId existed.

export const CADENCE_DAYS = 14

function daysSince(dateStr, today) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const t = new Date(today); t.setHours(0, 0, 0, 0)
  return Math.round((t - new Date(y, m - 1, d)) / 86400000)
}

export function lastOneOnOne(person, interviews, today = new Date()) {
  const name = person.name?.trim().toLowerCase()
  let latest = null
  for (const iv of interviews) {
    if (iv.type !== '1:1' || !iv.date) continue
    const matches = iv.personId === person.id || (name && iv.person?.trim().toLowerCase() === name)
    if (matches && (!latest || iv.date > latest)) latest = iv.date
  }
  return latest ? { date: latest, daysAgo: daysSince(latest, today) } : null
}

export function cadenceBadge(last) {
  if (!last) return { label: 'No 1:1 yet', cls: 'bad' }
  const d = last.daysAgo
  if (d < 0) return { label: '1:1 scheduled', cls: 'good' }
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`
  const cls = d <= CADENCE_DAYS ? 'good' : d <= CADENCE_DAYS * 2 ? 'warn' : 'bad'
  return { label: `1:1 ${when}`, cls }
}

export function isOverdue(last) {
  return !last || last.daysAgo > CADENCE_DAYS
}
