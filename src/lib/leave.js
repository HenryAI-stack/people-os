// Vacation / sick / other leave, stored on each direct report as `leave`:
//   [{ id, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', type: 'vacation' | 'sick' | 'other', note }]
// `to` is inclusive. Pure string math only (no import.meta.env, no browser globals), so the
// schedule generator and the CI email script can import it too.

export const LEAVE_TYPES = {
  vacation: { label: 'Vacation',   icon: '🌴', code: 'V'  },
  sick:     { label: 'Sick leave', icon: '🤒', code: 'SL' },
  other:    { label: 'Other leave', icon: '📌', code: 'L' },
}
export const leaveType = (type) => LEAVE_TYPES[type] || LEAVE_TYPES.other

function shift(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export const nextDate = (d) => shift(d, 1)
export const prevDate = (d) => shift(d, -1)

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** A person's leave entries, valid ones only, sorted by start. */
export function leaveList(person) {
  return (Array.isArray(person?.leave) ? person.leave : [])
    .filter((l) => isDate(l?.from) && isDate(l?.to) && l.from <= l.to)
    .sort((a, b) => a.from.localeCompare(b.from))
}

/** The leave entry covering `dateStr`, or null. */
export function leaveOn(person, dateStr) {
  return leaveList(person).find((l) => l.from <= dateStr && dateStr <= l.to) || null
}

/** Every calendar date from `from` to `to` (inclusive). */
export function datesBetween(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 400; d = nextDate(d)) out.push(d)
  return out
}

/** { 'YYYY-MM-DD': entry } for one person over a list of dates (e.g. a month's days). */
export function leaveMap(person, dates) {
  const list = leaveList(person)
  const out = {}
  if (!list.length) return out
  for (const d of dates) {
    const l = list.find((x) => x.from <= d && d <= x.to)
    if (l) out[d] = l
  }
  return out
}

const newId = () => `leave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** New leave array with one range added (overlapping same-type ranges are merged). */
export function addLeave(person, { from, to, type = 'vacation', note = '' }) {
  if (!isDate(from) || !isDate(to)) return leaveList(person)
  if (to < from) [from, to] = [to, from]
  let entry = { id: newId(), from, to, type, note: note.trim() }
  const rest = []
  for (const l of leaveList(person)) {
    const touches = l.type === type && l.from <= nextDate(entry.to) && entry.from <= nextDate(l.to)
    if (touches) {
      entry = { ...entry, from: l.from < entry.from ? l.from : entry.from, to: l.to > entry.to ? l.to : entry.to,
        note: [l.note, entry.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') }
    } else rest.push(l)
  }
  return [...rest, entry].sort((a, b) => a.from.localeCompare(b.from))
}

/** New leave array without the entry `id`. */
export function removeLeave(person, id) {
  return leaveList(person).filter((l) => l.id !== id)
}

/** New leave array with one day taken out of whatever range covers it (a range may split in two). */
export function removeLeaveDay(person, dateStr) {
  const out = []
  for (const l of leaveList(person)) {
    if (dateStr < l.from || dateStr > l.to) { out.push(l); continue }
    if (l.from < dateStr) out.push({ ...l, to: prevDate(dateStr) })
    if (dateStr < l.to) out.push({ ...l, id: newId(), from: nextDate(dateStr) })
  }
  return out
}
