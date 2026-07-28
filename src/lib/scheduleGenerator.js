import { getDaysInMonth, isWeekend, getHoliday } from './holidays.js'

export const CENTERS = [
  { id: 'Warsaw',      label: 'Warsaw, Poland',       country: 'PL', hours: '11:30 – 19:30', locationKeys: ['warsaw', 'poland'] },
  { id: 'Bangalore',   label: 'Bangalore, India',      country: 'IN', hours: '07:00 – 15:00', locationKeys: ['bangalore', 'bengaluru', 'india'] },
  { id: 'Mexico City', label: 'Mexico City, Mexico',   country: 'MX', hours: '11:30 – 19:30', locationKeys: ['mexico', 'guadalajara'] },
]

/** Match a direct report's location to a center id. */
export function getCenter(person) {
  if (!person.location) return null
  const loc = person.location.toLowerCase()
  return CENTERS.find((c) => c.locationKeys.some((k) => loc.includes(k)))?.id || null
}

/**
 * Auto-generate a fair monthly schedule.
 *
 * @param {string} yearMonth  'YYYY-MM'
 * @param {Array}  people     direct reports (filtered to OPS team)
 * @param {Object} fairness   { [personId]: { weekendTotal, holidayTotal, totalDays } }
 *                            from previous months — used to balance burden
 * @returns {Array} assignments array
 */
export function generateSchedule(yearMonth, people, fairness = {}) {
  const days = getDaysInMonth(yearMonth)
  const assignments = []

  // Group people by center
  const byCenterMap = {}
  for (const c of CENTERS) byCenterMap[c.id] = []
  for (const p of people) {
    const cid = getCenter(p)
    if (cid) byCenterMap[cid].push(p)
  }

  // Per-person counters for this month
  const monthCount = {}     // { [personId]: { total, weekend, holiday } }
  const dayOffCredit = {}   // { [personId]: number } — pending day-off credits

  function getCount(personId) {
    if (!monthCount[personId]) monthCount[personId] = { total: 0, weekend: 0, holiday: 0 }
    return monthCount[personId]
  }

  function getFairness(personId) {
    return fairness[personId] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
  }

  // Track who worked yesterday (for day-off logic)
  const workedOn = {}  // { [personId]: Set of dateStr }

  // Generate per center independently
  for (const center of CENTERS) {
    const pool = byCenterMap[center.id]
    if (pool.length === 0) continue

    // Days off tracking for this center
    const daysOff = new Set()  // dateStr → personId pairs where day off is granted

    // First pass: identify all day-off days (Mon after Sun work, day after holiday)
    // We'll handle this during assignment

    let prevAssigned = null  // person assigned the previous day

    for (const dateStr of days) {
      const weekend = isWeekend(dateStr)
      const holidayName = getHoliday(dateStr, center.country)
      const isHoliday = !!holidayName
      const isSpecial = weekend || isHoliday  // needs fairness consideration

      // Sort pool: person with fewest total shifts first; break ties by fairness history
      const sorted = [...pool].sort((a, b) => {
        const ca = getCount(a.id), cb = getCount(b.id)
        const fa = getFairness(a.id), fb = getFairness(b.id)

        // If special day, prioritise those with fewer weekend/holiday credits overall
        if (isSpecial) {
          const wDiff = (ca.weekend + fa.weekendTotal + ca.holiday + fa.holidayTotal)
                      - (cb.weekend + fb.weekendTotal + cb.holiday + fb.holidayTotal)
          if (wDiff !== 0) return wDiff
        }

        // Otherwise balance total shifts
        return ca.total - cb.total
      })

      // Skip if this person has a pending day-off credit for today
      // (granted after working Sunday/holiday)
      let assigned = null
      for (const candidate of sorted) {
        const credit = dayOffCredit[candidate.id] || 0
        if (credit > 0 && !isSpecial) {
          // Give them the day off — skip to next candidate
          continue
        }
        assigned = candidate
        break
      }
      // Fallback: if everyone has day-off credit, pick least-worked
      if (!assigned) assigned = sorted[0]

      // Apply day-off credit if used
      const d = new Date(dateStr)
      const isMon = d.getDay() === 1
      if (isMon && prevAssigned && dayOffCredit[prevAssigned.id] > 0) {
        dayOffCredit[prevAssigned.id] = Math.max(0, dayOffCredit[prevAssigned.id] - 1)
      }

      // Record assignment
      const count = getCount(assigned.id)
      count.total++
      if (isHoliday) count.holiday++
      if (d.getDay() === 0 || d.getDay() === 6) count.weekend++

      // Grant day-off credit if worked Sunday or holiday
      const isSunday = d.getDay() === 0
      let dayOffGranted = false
      if (isSunday || isHoliday) {
        dayOffCredit[assigned.id] = (dayOffCredit[assigned.id] || 0) + 1
        dayOffGranted = true
      }

      assignments.push({
        date:         dateStr,
        center:       center.id,
        personId:     assigned.id,
        personName:   assigned.name,
        isWeekend:    weekend,
        isHoliday,
        holidayName:  holidayName || '',
        dayOffGranted,
        comment:      '',
      })

      prevAssigned = assigned
    }
  }

  // Build updated fairness snapshot
  const fairnessSnapshot = {}
  for (const p of people) {
    const prev = getFairness(p.id)
    const cur  = getCount(p.id)
    fairnessSnapshot[p.id] = {
      weekendTotal: (prev.weekendTotal || 0) + (cur?.weekend || 0),
      holidayTotal: (prev.holidayTotal || 0) + (cur?.holiday || 0),
      totalDays:    (prev.totalDays   || 0) + (cur?.total   || 0),
    }
  }

  return { assignments, fairnessSnapshot }
}
