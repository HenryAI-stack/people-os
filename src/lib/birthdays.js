/**
 * Birthdays are stored as a single string on the direct report record:
 * 'MM-DD' when only the day/month are known (the common case — most people
 * don't share their birth year with their manager), or 'YYYY-MM-DD' when the
 * year is known too. One field avoids three separate persisted fields for
 * what's usually a 2-part value, while still supporting an exact age when the
 * year is available.
 *
 * Unlike nextAnniversary()/getNextAnniversary() (duplicated across
 * Dashboard.jsx/PersonDetail.jsx with slightly different shapes — a known
 * quirk documented in CLAUDE.md), this is written once here and imported by
 * both, rather than repeating that duplication for a brand-new feature.
 */

export function parseBirthday(str) {
  if (!str) return null
  const parts = str.split('-').map(Number)
  if (parts.length === 2) {
    const [month, day] = parts
    if (!month || !day) return null
    return { month, day, year: null }
  }
  if (parts.length === 3) {
    const [year, month, day] = parts
    if (!year || !month || !day) return null
    return { month, day, year }
  }
  return null
}

export function formatBirthdayValue({ month, day, year }) {
  if (!month || !day) return ''
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return year ? `${year}-${mm}-${dd}` : `${mm}-${dd}`
}

/**
 * Next occurrence from `today` (local calendar day, matching nextAnniversary's
 * own convention). month/day/year here are already plain numbers pulled from
 * the stored string — never round-tripped through a Date-string constructor —
 * so there's no local-vs-UTC parsing hazard to guard against here.
 */
export function nextBirthday(birthdayStr, today = new Date()) {
  const parsed = parseBirthday(birthdayStr)
  if (!parsed) return null
  const { month, day, year } = parsed
  const t = new Date(today); t.setHours(0, 0, 0, 0)
  let candidate = new Date(t.getFullYear(), month - 1, day)
  if (candidate < t) candidate = new Date(t.getFullYear() + 1, month - 1, day)
  const daysUntil = Math.round((candidate - t) / 86400000)
  const turningAge = year != null ? candidate.getFullYear() - year : null
  return { date: candidate, daysUntil, turningAge }
}

/** e.g. "5 Oct" or "5 Oct 1990" — year only shown when known. */
export function fmtBirthdayLabel(birthdayStr) {
  const parsed = parseBirthday(birthdayStr)
  if (!parsed) return ''
  const { month, day, year } = parsed
  const d = new Date(2000, month - 1, day) // dummy leap year so Feb 29 is valid; day/month only ever shown
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return year ? `${label} ${year}` : label
}
