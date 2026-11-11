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
  // The company's US holiday calendar (intranet "Holiday Calendar" → USA), NOT the federal
  // list: no Juneteenth / Washington's Birthday / Columbus Day / Veterans Day, but the Day
  // after Thanksgiving and Christmas Eve. Like IN, always add a new year from that company
  // calendar (ask the user for it). "New Year" / "Christmas Day" are named like the other
  // tables so they merge into one Dashboard row.
  US: {
    // 2026 — company calendar
    '2026-01-01': 'New Year', '2026-01-19': 'Martin Luther King Jr. Birthday',
    '2026-05-25': 'Memorial Day', '2026-07-03': 'Independence Day',
    '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day',
    '2026-11-27': 'Day after Thanksgiving', '2026-12-24': 'Christmas Eve',
    '2026-12-25': 'Christmas Day',
    // 2027 — PROVISIONAL (same holidays as 2026, dates by rule; Jul 4 is a Sunday →
    // Mon Jul 5): replace with the company calendar once 2027 is published.
    '2027-01-01': 'New Year', '2027-01-18': 'Martin Luther King Jr. Birthday',
    '2027-05-31': 'Memorial Day', '2027-07-05': 'Independence Day',
    '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving Day',
    '2027-11-26': 'Day after Thanksgiving', '2027-12-24': 'Christmas Eve',
    '2027-12-25': 'Christmas Day',
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

const COUNTRY_ORDER = Object.keys(HOLIDAYS)
const byCountryOrder = (a, b) => COUNTRY_ORDER.indexOf(a) - COUNTRY_ORDER.indexOf(b)

// Spelling variants of the same holiday across the tables, so they merge on a shared date:
// "New Year's Day" = "New Year", "Labor Day" = "Labour Day", and May 1 "May Day" (IN) is the
// same Workers' Day as "Labour Day" (PL/MX). Only used to *match* names; the label shown is the
// spelling most countries use.
function holidayKey(name) {
  return name.toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/\blabor\b/g, 'labour')
    .replace(/^may day$/, 'labour day')
    .replace(/^new year( day)?$/, 'new year')
    .replace(/^christmas$/, 'christmas day')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Every holiday across all HOLIDAYS tables, grouped **per date**: one entry per day, with
 * `items` = the distinct holidays that day (the same holiday in several countries — by
 * `holidayKey` — is one item with all its countries, most countries first) and `countries` =
 * every country with a holiday that day, in table order. Sorted by date.
 * Returns [{ date, countries: ['PL', …], items: [{ name, countries }] }].
 */
function holidaysByDate() {
  const days = new Map()
  for (const [country, table] of Object.entries(HOLIDAYS)) {
    for (const [date, name] of Object.entries(table)) {
      if (!days.has(date)) days.set(date, new Map())
      const items = days.get(date)
      const key = holidayKey(name)
      if (!items.has(key)) items.set(key, { names: {}, countries: [] })
      const item = items.get(key)
      item.countries.push(country)
      item.names[name] = (item.names[name] || 0) + 1
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const list = [...items.values()].map((it) => ({
        // Most-used spelling; on a tie, the one from the first country in table order.
        name: Object.entries(it.names).sort((a, b) => b[1] - a[1])[0][0],
        countries: it.countries.sort(byCountryOrder),
      })).sort((a, b) => b.countries.length - a.countries.length || byCountryOrder(a.countries[0], b.countries[0]))
      const countries = [...new Set(list.flatMap((it) => it.countries))].sort(byCountryOrder)
      return { date, countries, items: list }
    })
}

/**
 * The next `count` holiday **days** across all countries, starting at `fromDateStr`
 * ('YYYY-MM-DD', inclusive, so a holiday today counts as upcoming). Everything on the same
 * date shares one slot. Pure string comparison — no Date/timezone shift.
 */
export function upcomingHolidays(fromDateStr, count = 6) {
  return holidaysByDate().filter((h) => h.date >= fromDateStr).slice(0, count)
}

/** The most recent holiday day strictly before `fromDateStr` (same shape), or null. */
export function lastHoliday(fromDateStr) {
  const past = holidaysByDate().filter((h) => h.date < fromDateStr)
  return past.length ? past[past.length - 1] : null
}
