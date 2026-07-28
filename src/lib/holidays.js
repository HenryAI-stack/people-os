/**
 * National public holidays for Poland (PL), India (IN), Mexico (MX).
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
    '2025-08-15': 'Independence Day', '2025-10-02': 'Gandhi Jayanti',
    '2025-10-02': 'Dussehra', '2025-10-20': 'Diwali',
    '2025-11-05': 'Guru Nanak Jayanti', '2025-12-25': 'Christmas Day',
    // 2026
    '2026-01-26': 'Republic Day', '2026-03-03': 'Holi',
    '2026-04-03': 'Good Friday', '2026-04-14': 'Ambedkar Jayanti',
    '2026-08-15': 'Independence Day', '2026-10-02': 'Gandhi Jayanti',
    '2026-10-21': 'Dussehra', '2026-11-08': 'Diwali',
    '2026-11-24': 'Guru Nanak Jayanti', '2026-12-25': 'Christmas Day',
    // 2027
    '2027-01-26': 'Republic Day', '2027-03-22': 'Holi',
    '2027-03-26': 'Good Friday', '2027-04-14': 'Ambedkar Jayanti',
    '2027-08-15': 'Independence Day', '2027-10-02': 'Gandhi Jayanti',
    '2027-10-10': 'Dussehra', '2027-10-29': 'Diwali',
    '2027-11-14': 'Guru Nanak Jayanti', '2027-12-25': 'Christmas Day',
  },

  // ── MEXICO ────────────────────────────────────────────────────────────────
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
    '2026-09-16': 'Independence Day', '2026-11-16': 'Revolution Day',
    '2026-12-25': 'Christmas Day',
    // 2027
    '2027-01-01': 'New Year', '2027-02-01': 'Constitution Day',
    '2027-03-15': 'Benito Juárez Birthday', '2027-05-01': 'Labour Day',
    '2027-09-16': 'Independence Day', '2027-11-15': 'Revolution Day',
    '2027-12-25': 'Christmas Day',
  },
}

/** Returns holiday name for a given YYYY-MM-DD and country code, or null. */
export function getHoliday(dateStr, countryCode) {
  return HOLIDAYS[countryCode]?.[dateStr] || null
}

/** Returns true if the date is a weekend (Sat or Sun). */
export function isWeekend(dateStr) {
  const d = new Date(dateStr)
  return d.getDay() === 0 || d.getDay() === 6
}

/** Returns all days in a given YYYY-MM month as 'YYYY-MM-DD' strings. */
export function getDaysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const days = []
  const date = new Date(y, m - 1, 1)
  while (date.getMonth() === m - 1) {
    days.push(date.toISOString().slice(0, 10))
    date.setDate(date.getDate() + 1)
  }
  return days
}
