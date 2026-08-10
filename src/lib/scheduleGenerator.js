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

function dow(d) { return new Date(d).getDay() } // 0=Sun,1=Mon…6=Sat

/**
 * Each person works exactly their target days (20 or 21 per month = 160 or 168 h).
 * Multiple people may be scheduled on the same day — double/triple occupation is allowed.
 *
 * Strategy per person:
 *  1. Fill weekdays (Mon–Fri) first, rotating evenly across the month.
 *  2. If target > available weekdays, fill remaining slots with weekend days.
 *  3. Weekend / holiday days distributed fairly across team (least-burdened first).
 */
export function generateSchedule(yearMonth, people, fairness = {}) {
  const days     = getDaysInMonth(yearMonth)
  const weekdays = days.filter((d) => dow(d) !== 0 && dow(d) !== 6)
  const weekend  = days.filter((d) => dow(d) === 0 || dow(d) === 6)

  // Group by center
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

    // Sort pool by cumulative weekend burden — least loaded gets first pick of weekdays
    const sorted = [...pool].sort((a, b) =>
      (fairness[a.id]?.weekendTotal || 0) - (fairness[b.id]?.weekendTotal || 0)
    )

    // Target days per person: 20 standard, 21 if month has extra workdays
    // Standard months have 20–23 weekdays; cap each person at 21 days (168 h).
    const target = Math.min(21, Math.max(20, Math.ceil(weekdays.length / 1)))

    // Track how many weekend days each person is assigned this month
    const personWeekends = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const personHolidays = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const personTotal    = Object.fromEntries(pool.map((p) => [p.id, 0]))

    for (const person of sorted) {
      const remaining = target  // each person gets exactly `target` days
      let assigned    = 0

      // ── Step 1: assign weekdays evenly across the month ──────────────────
      // Spread picks across the full range so days aren't all at the start.
      // Pick every Nth weekday so the person is distributed across the month.
      const step = weekdays.length / Math.min(remaining, weekdays.length)
      const pickedWd = new Set()

      for (let i = 0; i < weekdays.length && assigned < remaining; i++) {
        const idx = Math.round(i * step)
        if (idx < weekdays.length && !pickedWd.has(idx)) {
          pickedWd.add(idx)
          const dateStr    = weekdays[idx]
          const holiday    = getHoliday(dateStr, center.country)
          const isHoliday  = !!holiday
          if (isHoliday) personHolidays[person.id]++
          personTotal[person.id]++
          allAssignments.push({
            date: dateStr, center: center.id,
            personId: person.id, personName: person.name,
            isWeekend: false, isHoliday, holidayName: holiday || '',
            dayOffGranted: isHoliday, cleared: false, comment: '',
          })
          assigned++
        }
      }

      // ── Step 2: if target > weekdays assigned, fill with weekend days ─────
      // Sort weekend days by how many people already have them (balance load)
      const weCount = {}
      for (const d of weekend) weCount[d] = allAssignments.filter((a) => a.date === d && a.center === center.id && a.personId !== person.id).length

      const sortedWe = [...weekend].sort((a, b) => {
        // Prefer Saturdays over Sundays, and less-occupied days first
        const isSunA = dow(a) === 0, isSunB = dow(b) === 0
        if (isSunA !== isSunB) return isSunA ? 1 : -1
        return weCount[a] - weCount[b]
      })

      for (const dateStr of sortedWe) {
        if (assigned >= remaining) break
        const holiday   = getHoliday(dateStr, center.country)
        const isHoliday = !!holiday
        personWeekends[person.id]++
        personTotal[person.id]++
        if (isHoliday) personHolidays[person.id]++
        allAssignments.push({
          date: dateStr, center: center.id,
          personId: person.id, personName: person.name,
          isWeekend: true, isHoliday, holidayName: holiday || '',
          dayOffGranted: true, cleared: false, comment: '',
        })
        assigned++
      }
    }
  }

  // ── Fairness snapshot ────────────────────────────────────────────────────
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
