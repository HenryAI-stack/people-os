import { getDaysInMonth, isWeekend, getHoliday } from './holidays.js'

export const CENTERS = [
  { id: 'Warsaw',      label: 'Warsaw, Poland',      country: 'PL', hours: '11:30 – 19:30', locationKeys: ['warsaw', 'poland'] },
  { id: 'Bangalore',   label: 'Bangalore, India',     country: 'IN', hours: '07:00 – 15:00', locationKeys: ['bangalore', 'bengaluru', 'india'] },
  { id: 'Mexico City', label: 'Mexico City, Mexico',  country: 'MX', hours: '11:30 – 19:30', locationKeys: ['mexico', 'guadalajara'] },
]

export function getCenter(person) {
  if (!person.location) return null
  const loc = person.location.toLowerCase()
  return CENTERS.find((c) => c.locationKeys.some((k) => loc.includes(k)))?.id || null
}

function dow(d) { return new Date(d).getDay() }

/**
 * Generate schedule where:
 * - Every weekend day is covered (at least one person per center)
 * - Every person works exactly target days (20–21) = 160–168 h
 * - Weekend duty distributed fairly; remaining days filled with weekdays
 */
export function generateSchedule(yearMonth, people, fairness = {}) {
  const days     = getDaysInMonth(yearMonth)
  const weekdays = days.filter((d) => dow(d) !== 0 && dow(d) !== 6)
  const weekend  = days.filter((d) => dow(d) === 0 || dow(d) === 6)

  const byCenter = {}
  for (const c of CENTERS) byCenter[c.id] = []
  for (const p of people) {
    const cid = getCenter(p)
    if (cid) byCenter[cid].push(p)
  }

  const allAssignments = []

  for (const center of CENTERS) {
    const pool = byCenter[center.id]
    if (!pool.length) continue

    const n      = pool.length
    const target = Math.min(21, Math.max(20, Math.round(weekdays.length * 0.9)))

    // Sort by cumulative weekend burden — least loaded gets fewest weekends this month
    const sorted = [...pool].sort((a, b) =>
      (fairness[a.id]?.weekendTotal || 0) - (fairness[b.id]?.weekendTotal || 0)
    )

    // ── Step 1: distribute ALL weekend days across pool ────────────────────
    // Round-robin starting from the person with least weekend history.
    // Each person may get multiple weekend days.
    const personWeDays = Object.fromEntries(pool.map((p) => [p.id, []]))
    weekend.forEach((dateStr, i) => {
      const person = sorted[i % n]
      personWeDays[person.id].push(dateStr)
    })

    // ── Step 2: for each person, fill remaining slots with weekdays ─────────
    // Spread weekday picks evenly across the full month (no front-loading).
    const usedWeekdays = new Set()  // track which weekday indices are taken per person

    for (const person of sorted) {
      const myWeekends    = personWeDays[person.id]
      const weekdayNeeded = Math.max(0, target - myWeekends.length)

      // Pick weekdays spread across the month (every Nth slot)
      const step       = weekdays.length / Math.max(weekdayNeeded, 1)
      const myWeekdays = []

      for (let slot = 0; slot < weekdayNeeded; slot++) {
        let idx = Math.round(slot * step)
        // Find next unused weekday index (wrapping around)
        let tries = 0
        while (usedWeekdays.has(`${person.id}:${idx}`) && tries < weekdays.length) {
          idx = (idx + 1) % weekdays.length
          tries++
        }
        usedWeekdays.add(`${person.id}:${idx}`)
        if (weekdays[idx]) myWeekdays.push(weekdays[idx])
      }

      // ── Emit assignments ─────────────────────────────────────────────────
      const allDays = [...myWeekdays, ...myWeekends]
      for (const dateStr of allDays) {
        const we      = isWeekend(dateStr)
        const holiday = getHoliday(dateStr, center.country)
        const isHol   = !!holiday
        allAssignments.push({
          date:         dateStr,
          center:       center.id,
          personId:     person.id,
          personName:   person.name,
          isWeekend:    we,
          isHoliday:    isHol,
          holidayName:  holiday || '',
          dayOffGranted: we || isHol,
          cleared:      false,
          comment:      '',
        })
      }
    }
  }

  // ── Fairness snapshot ─────────────────────────────────────────────────────
  const fairnessSnapshot = {}
  for (const p of people) {
    const prev = fairness[p.id] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
    const mWe  = allAssignments.filter((a) => a.personId === p.id && (a.isWeekend || a.isHoliday)).length
    const mHol = allAssignments.filter((a) => a.personId === p.id && a.isHoliday).length
    const mTot = allAssignments.filter((a) => a.personId === p.id).length
    fairnessSnapshot[p.id] = {
      weekendTotal: (prev.weekendTotal || 0) + mWe,
      holidayTotal: (prev.holidayTotal || 0) + mHol,
      totalDays:    (prev.totalDays   || 0) + mTot,
    }
  }

  return { assignments: allAssignments, fairnessSnapshot }
}
