// Shared by the sidebar World Clock widget (App.jsx) and the clocks table in
// WorldMapModal.jsx, so both list the same cities with the same formatting.
export const CLOCKS = [
  { city: 'Warsaw',      country: 'PL', tz: 'Europe/Warsaw',       offset: null    },
  { city: 'Chicago',     country: 'US', tz: 'America/Chicago',     offset: '−7h'   },
  { city: 'Bangalore',   country: 'IN', tz: 'Asia/Kolkata',        offset: '+3.5h' },
  { city: 'Mexico City', country: 'MX', tz: 'America/Mexico_City', offset: '−8h'   },
]

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
