// Shared by the sidebar World Clock widget (App.jsx) and the clocks table + time converter in
// WorldMapModal.jsx, so both list the same cities with the same formatting. `region` is the
// label the converter's dropdown uses (USA = Chicago, the US city on the clock).
// The first entry (Warsaw) is the reference city: the others show their offset from it, computed
// live by fmtOffsetFrom() — never hardcode it, it changes with DST (EU and US switch on different
// dates, India/Mexico City don't switch at all).
export const CLOCKS = [
  { city: 'Warsaw',      country: 'PL', region: 'Poland', tz: 'Europe/Warsaw'       },
  { city: 'Chicago',     country: 'US', region: 'USA',    tz: 'America/Chicago'     },
  { city: 'Bangalore',   country: 'IN', region: 'India',  tz: 'Asia/Kolkata'        },
  { city: 'Mexico City', country: 'MX', region: 'Mexico', tz: 'America/Mexico_City' },
]

// ── Wall-clock ↔ instant conversion via Intl (no timezone library; DST-correct) ──
// Also used by onDuty.js for the Dashboard's 24/7 shift instants.
function tzOffsetMs(tz, date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((x) => [x.type, x.value])
  )
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()
}

/** Wall-clock time in `tz` → epoch ms. Second pass corrects for an offset change in between. */
export function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - tzOffsetMs(tz, new Date(guess))
  return guess - tzOffsetMs(tz, new Date(first))
}

/**
 * True when `tz` is on its standard ("winter") time on calendar day 'YYYY-MM-DD', i.e. its offset
 * that day is below the year's daylight-saving offset. Always false for zones without DST
 * (India, Mexico City since 2022). Checked at 12:00 UTC, after the EU's 01:00 UTC switch.
 */
export function isWinterTime(tz, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const offsetOn = (mm, dd) => tzOffsetMs(tz, new Date(Date.UTC(y, mm - 1, dd, 12)))
  return offsetOn(m, d) < Math.max(offsetOn(1, 1), offsetOn(7, 1))
}

/** 'YYYY-MM-DD' calendar date of `date` in `tz`. */
export function localDateStr(tz, date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** 'HH:MM' wall-clock time of `date` in `tz` (24h). */
export function localTimeStr(tz, date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

/**
 * Current offset of `tz` relative to `baseTz` as a short label, e.g. '−6h', '+4.5h', '±0h'.
 * DST-correct for `now`, since both offsets come from Intl.
 */
export function fmtOffsetFrom(now, baseTz, tz) {
  const mins = Math.round((tzOffsetMs(tz, now) - tzOffsetMs(baseTz, now)) / 60000)
  if (mins === 0) return '±0h'
  const sign = mins > 0 ? '+' : '−'
  const h = Math.abs(mins) / 60
  return `${sign}${Number.isInteger(h) ? h : +h.toFixed(2)}h`
}

export function fmtTime(now, tz) {
  return now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
}

export function fmtDate(now, tz) {
  return now.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtTzAbbr(now, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || ''
}

export function fmtTzFull(now, tz) {
  // Use Intl long name, with override for common browser inconsistencies
  const overrides = { 'India Standard Time': 'Indian Standard Time' }
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || ''
  return overrides[raw] || raw
}
