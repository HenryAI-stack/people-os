/**
 * National public holidays for Poland (PL), India (IN), Mexico (MX), United States (US).
 * US is shown on the Dashboard only — there's no US support center, so the schedule
 * generator never looks it up.
 * Format: 'YYYY-MM-DD': 'Holiday Name'
 */

export const HOLIDAYS = {

  // ── POLAND ────────────────────────────────────────────────────────────────
  PL: {
    // 2024
    '2024-01-01': 'New Year', '2024-01-06': 'Epiphany',
    '2024-04-01': 'Easter Monday', '2024-05-01': 'Labour Day',
    '2024-05-03': 'Constitution Day', '2024-05-30': 'Corpus Christi',
    '2024-08-15': 'Assumption', '2024-11-01': 'All Saints Day',
    '2024-11-11': 'Independence Day', '2024-12-25': 'Christmas Day',
    '2024-12-26': 'Second Christmas Day',
    // 2025
    '2025-01-01': 'New Year', '2025-01-06': 'Epiphany',
    '2025-04-21': 'Easter Monday', '2025-05-01': 'Labour Day',
    '2025-05-03': 'Constitution Day', '2025-06-19': 'Corpus Christi',
    '2025-08-15': 'Assumption', '2025-11-01': 'All Saints Day',
    '2025-11-11': 'Independence Day', '2025-12-25': 'Christmas Day',
    '2025-12-26': 'Second Christmas Day',
    // 2026
    '2026-01-01': 'New Year', '2026-01-06': 'Epiphany',
    '2026-04-06': 'Easter Monday', '2026-05-01': 'Labour Day',
    '2026-05-03': 'Constitution Day', '2026-06-04': 'Corpus Christi',
    '2026-08-15': 'Assumption', '2026-11-01': 'All Saints Day',
    '2026-11-11': 'Independence Day', '2026-12-25': 'Christmas Day',
    '2026-12-26': 'Second Christmas Day',
    // 2027
    '2027-01-01': 'New Year', '2027-01-06': 'Epiphany',
    '2027-03-29': 'Easter Monday', '2027-05-01': 'Labour Day',
    '2027-05-03': 'Constitution Day', '2027-05-27': 'Corpus Christi',
    '2027-08-15': 'Assumption', '2027-11-01': 'All Saints Day',
    '2027-11-11': 'Independence Day', '2027-12-25': 'Christmas Day',
    '2027-12-26': 'Second Christmas Day',
  },

  // ── INDIA ─────────────────────────────────────────────────────────────────
  // From 2026 on, this table is the Bangalore center's OFFICIAL COMPANY holiday
  // calendar: the intranet "Holiday Calendar" entries for "India" (company-wide)
  // PLUS "India - Bangalore" (location holidays) — not a generic national or
  // Karnataka-government list. When a new year is published, copy both lists.
  // 2024–2025 are the older generic list, kept so past schedules don't change.
  IN: {
    // 2024
    '2024-01-26': 'Republic Day', '2024-03-25': 'Holi',
    '2024-03-29': 'Good Friday', '2024-04-14': 'Ambedkar Jayanti',
    '2024-08-15': 'Independence Day', '2024-10-02': 'Gandhi Jayanti',
    '2024-10-12': 'Dussehra', '2024-11-01': 'Diwali',
    '2024-11-15': 'Guru Nanak Jayanti', '2024-12-25': 'Christmas Day',
    // 2025
    '2025-01-26': 'Republic Day', '2025-03-14': 'Holi',
    '2025-04-18': 'Good Friday', '2025-04-14': 'Ambedkar Jayanti',
    '2025-08-15': 'Independence Day', '2025-10-02': 'Gandhi Jayanti / Dussehra',
    '2025-10-20': 'Diwali',
    '2025-11-05': 'Guru Nanak Jayanti', '2025-12-25': 'Christmas Day',
    // 2026 — company calendar (India + India - Bangalore)
    '2026-01-01': 'New Year', '2026-01-15': 'Sankranthi',
    '2026-01-26': 'Republic Day', '2026-03-19': 'Ugadi / Gudi Padwa',
    '2026-05-01': 'May Day', '2026-05-28': 'Bakrid',
    '2026-08-15': 'Independence Day', '2026-09-14': 'Varasiddhi Vinayaka Vrata',
    '2026-10-02': 'Mahatma Gandhi Jayanti', '2026-10-21': 'Vijayadashami',
    '2026-11-01': 'Rajyotsava / Haryana Day', '2026-11-09': 'Diwali / Deepavali',
    '2026-11-10': 'Diwali / Deepavali', '2026-12-25': 'Christmas Day',
    // 2027 — PROVISIONAL (old generic list): replace with the company calendar
    // once 2027 is published on the intranet.
    '2027-01-26': 'Republic Day', '2027-03-22': 'Holi',
    '2027-03-26': 'Good Friday', '2027-04-14': 'Ambedkar Jayanti',
    '2027-08-15': 'Independence Day', '2027-10-02': 'Gandhi Jayanti',
    '2027-10-10': 'Dussehra', '2027-10-29': 'Diwali',
    '2027-11-01': 'Haryana Day / Karnataka Rajyotsava',
    '2027-11-14': 'Guru Nanak Jayanti', '2027-12-25': 'Christmas Day',
  },

  // ── MEXICO ────────────────────────────────────────────────────────────────
  // Federal rest days per LFT Art. 74, plus Día de Muertos (Nov 2) from 2026 on.
  // Nov 2 is NOT an Art. 74 day — it's a company day off granted to the Mexico
  // City center, so it's treated like a holiday for staffing/rest rules.
  MX: {
    // 2024
    '2024-01-01': 'New Year', '2024-02-05': 'Constitution Day',
    '2024-03-18': 'Benito Juárez Birthday', '2024-05-01': 'Labour Day',
    '2024-09-16': 'Independence Day', '2024-11-18': 'Revolution Day',
    '2024-12-25': 'Christmas Day',
    // 2025
    '2025-01-01': 'New Year', '2025-02-03': 'Constitution Day',
    '2025-03-17': 'Benito Juárez Birthday', '2025-05-01': 'Labour Day',
    '2025-09-16': 'Independence Day', '2025-11-17': 'Revolution Day',
    '2025-12-25': 'Christmas Day',
    // 2026
    '2026-01-01': 'New Year', '2026-02-02': 'Constitution Day',
    '2026-03-16': 'Benito Juárez Birthday', '2026-05-01': 'Labour Day',
    '2026-09-16': 'Independence Day', '2026-11-02': 'Día de Muertos',
    '2026-11-16': 'Revolution Day', '2026-12-25': 'Christmas Day',
    // 2027
    '2027-01-01': 'New Year', '2027-02-01': 'Constitution Day',
    '2027-03-15': 'Benito Juárez Birthday', '2027-05-01': 'Labour Day',
    '2027-09-16': 'Independence Day', '2027-11-02': 'Día de Muertos',
    '2027-11-15': 'Revolution Day', '2027-12-25': 'Christmas Day',
  },

  // ── UNITED STATES ─────────────────────────────────────────────────────────
  // The 11 federal holidays (5 U.S.C. 6103) on their OBSERVED dates: a Saturday holiday is
  // observed the Friday before, a Sunday one the Monday after (so New Year 2028 → Fri
  // 2027-12-31). Names match the other tables where it's the same holiday, so e.g. Christmas
  // merges into one Dashboard row.
  US: {
    // 2024
    '2024-01-01': 'New Year', '2024-01-15': 'Martin Luther King Jr. Day',
    '2024-02-19': "Washington's Birthday", '2024-05-27': 'Memorial Day',
    '2024-06-19': 'Juneteenth', '2024-07-04': 'Independence Day',
    '2024-09-02': 'Labor Day', '2024-10-14': 'Columbus Day',
    '2024-11-11': 'Veterans Day', '2024-11-28': 'Thanksgiving Day',
    '2024-12-25': 'Christmas Day',
    // 2025
    '2025-01-01': 'New Year', '2025-01-20': 'Martin Luther King Jr. Day',
    '2025-02-17': "Washington's Birthday", '2025-05-26': 'Memorial Day',
    '2025-06-19': 'Juneteenth', '2025-07-04': 'Independence Day',
    '2025-09-01': 'Labor Day', '2025-10-13': 'Columbus Day',
    '2025-11-11': 'Veterans Day', '2025-11-27': 'Thanksgiving Day',
    '2025-12-25': 'Christmas Day',
    // 2026
    '2026-01-01': 'New Year', '2026-01-19': 'Martin Luther King Jr. Day',
    '2026-02-16': "Washington's Birthday", '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day (observed)',
    '2026-09-07': 'Labor Day', '2026-10-12': 'Columbus Day',
    '2026-11-11': 'Veterans Day', '2026-11-26': 'Thanksgiving Day',
    '2026-12-25': 'Christmas Day',
    // 2027
    '2027-01-01': 'New Year', '2027-01-18': 'Martin Luther King Jr. Day',
    '2027-02-15': "Washington's Birthday", '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Juneteenth (observed)', '2027-07-05': 'Independence Day (observed)',
    '2027-09-06': 'Labor Day', '2027-10-11': 'Columbus Day',
    '2027-11-11': 'Veterans Day', '2027-11-25': 'Thanksgiving Day',
    '2027-12-24': 'Christmas Day (observed)', '2027-12-31': 'New Year (observed)',
  },
}

/** Returns holiday name for a given YYYY-MM-DD and country code, or null. */
export function getHoliday(dateStr, countryCode) {
  return HOLIDAYS[countryCode]?.[dateStr] || null
}

/**
 * Returns true if the date is a weekend (Sat or Sun).
 * Uses Date.UTC + getUTCDay rather than `new Date(dateStr).getDay()`: a plain
 * 'YYYY-MM-DD' string parses as UTC midnight, but .getDay() reads it back in
 * the browser's LOCAL timezone — in any negative-UTC-offset timezone that
 * rolls the date back to the previous day, silently misclassifying weekends.
 */
export function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 || day === 6
}

/**
 * Returns all days in a given YYYY-MM month as 'YYYY-MM-DD' strings.
 * Built from pure string/number arithmetic — no Date/ISO round-trip — because
 * `new Date(y, m-1, 1)` (LOCAL midnight) followed by `.toISOString()` (UTC)
 * shifts every date back by a day in any positive-UTC-offset timezone (e.g.
 * CET): local midnight Oct 1 is still Sep 30 in UTC. That bug produced a
 * month that visibly ran "30 Sep – 30 Oct" instead of "1–31 Oct".
 */
export function getDaysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this one
  const days = []
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

/** Display names for the HOLIDAYS country codes. */
export const COUNTRY_NAMES = { PL: 'Poland', IN: 'India', MX: 'Mexico', US: 'USA' }

// All holidays across every HOLIDAYS table, the same holiday on the same date in several
// countries (e.g. Christmas Day) merged into one entry. Sorted by date, then name.
// Returns [{ date, name, countries: ['PL', …] }] (countries in table order).
function mergedHolidays() {
  const byKey = new Map()
  for (const [country, table] of Object.entries(HOLIDAYS)) {
    for (const [date, name] of Object.entries(table)) {
      const key = `${date}|${name.toLowerCase()}`
      if (byKey.has(key)) byKey.get(key).countries.push(country)
      else byKey.set(key, { date, name, countries: [country] })
    }
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

/**
 * The next `count` holidays across all countries, starting at `fromDateStr` ('YYYY-MM-DD',
 * inclusive, so a holiday today counts as upcoming). A holiday shared by several countries
 * takes one slot. Pure string comparison — 'YYYY-MM-DD' sorts correctly, no Date/timezone shift.
 */
export function upcomingHolidays(fromDateStr, count = 5) {
  return mergedHolidays().filter((h) => h.date >= fromDateStr).slice(0, count)
}

/**
 * The most recent holiday date strictly before `fromDateStr`. If several different holidays
 * fall on that date (in different countries), they're all returned. [] if none.
 */
export function lastHolidays(fromDateStr) {
  const past = mergedHolidays().filter((h) => h.date < fromDateStr)
  if (past.length === 0) return []
  const lastDate = past[past.length - 1].date
  return past.filter((h) => h.date === lastDate)
}
