import { CENTERS } from './scheduleGenerator.js'

// Turns saved work schedules into real-time shift instances so the Dashboard can show
// who is on duty now, who was before, and who is next. Each center's `hours` are local
// to its own `tz`, so every shift is converted to an absolute instant via Intl — no
// timezone library, and correct across DST changes in Warsaw.

function tzOffsetMs(tz, date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((x) => [x.type, x.value])
  )
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()
}

// Wall-clock time in `tz` → epoch ms. Second pass corrects for an offset change in between.
function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - tzOffsetMs(tz, new Date(guess))
  return guess - tzOffsetMs(tz, new Date(first))
}

function localDateStr(tz, date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

function parseHours(hours) {
  const m = /(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/.exec(hours || '')
  return m ? m.slice(1).map(Number) : null
}

/**
 * @returns {{ current: Shift[], previous: Shift|null, next: Shift|null, hasSchedule: boolean }}
 * Shift = { center, date, start, end, people: [{ personId, personName }] }
 * `current` is an array because shifts can briefly overlap (or be empty during a coverage gap).
 */
export function getShiftTimeline(schedules, now = new Date()) {
  const byKey = {}
  for (const s of schedules || []) {
    for (const a of s.assignments || []) {
      if (a.cleared) continue
      ;(byKey[`${a.date}|${a.center}`] ||= []).push({ personId: a.personId, personName: a.personName })
    }
  }

  const shifts = []
  for (const center of CENTERS) {
    const hrs = parseHours(center.hours)
    if (!hrs || !center.tz) continue
    const [sh, sm, eh, em] = hrs
    const today = localDateStr(center.tz, now)
    for (const delta of [-1, 0, 1]) {
      const date = shiftDate(today, delta)
      const [y, m, d] = date.split('-').map(Number)
      const start = zonedToUtc(y, m, d, sh, sm, center.tz)
      let end = zonedToUtc(y, m, d, eh, em, center.tz)
      if (end <= start) end += 86400000
      shifts.push({ center, date, start, end, people: byKey[`${date}|${center.id}`] || [] })
    }
  }

  const t = now.getTime()
  const current = shifts.filter((s) => s.start <= t && t < s.end).sort((a, b) => a.start - b.start)
  const previous = shifts.filter((s) => s.end <= t).sort((a, b) => b.end - a.end)[0] || null
  const next = shifts.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0] || null
  return { current, previous, next, hasSchedule: Object.keys(byKey).length > 0 }
}

export function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
