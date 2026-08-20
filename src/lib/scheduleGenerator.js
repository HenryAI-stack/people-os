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

function makeAssignment(dateStr, center, person, we, hol) {
  return {
    date: dateStr, center: center.id,
    personId: person.id, personName: person.name,
    isWeekend: we, isHoliday: !!hol, holidayName: hol || '',
    dayOffGranted: we || !!hol, cleared: false, comment: '',
  }
}

/**
 * Rules:
 * - Weekdays (Mon–Fri, non-holiday): minimum 2 people per center per day
 * - Weekends & national holidays: exactly 1 person per center per day
 * - Each person works 20–21 days total (160–168 h/month)
 * - Weekend / holiday burden balanced across months
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
    const n = pool.length

    // Target per person: 20–21 days
    const target = Math.min(21, Math.max(20, 20))

    // Per-person shift counter
    const used = Object.fromEntries(pool.map((p) => [p.id, 0]))

    // Sort by cumulative weekend burden (least first)
    const byFairness = [...pool].sort((a, b) =>
      (fairness[a.id]?.weekendTotal || 0) - (fairness[b.id]?.weekendTotal || 0)
    )

    // ── Step 1: weekends & national holidays — 1 person, round-robin ────────
    const specialDays = days.filter((d) => {
      const we  = isWeekend(d)
      const hol = getHoliday(d, center.country)
      return we || !!hol
    })

    specialDays.forEach((dateStr, i) => {
      const person = byFairness[i % n]
      const we     = isWeekend(dateStr)
      const hol    = getHoliday(dateStr, center.country)
      allAssignments.push(makeAssignment(dateStr, center, person, we, hol))
      used[person.id]++
    })

    // ── Step 2: weekdays — ensure MINIMUM 2 people per day ──────────────────
    // True weekdays = Mon–Fri that are NOT national holidays
    const trueWeekdays = weekdays.filter((d) => !getHoliday(d, center.country))

    // First pass: assign 1 person to every weekday (round-robin by fairness / used)
    for (const dateStr of trueWeekdays) {
      const sorted = [...pool].sort((a, b) => used[a.id] - used[b.id])
      // Pick the person with fewest shifts, not already on this day
      const already = new Set(allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId))
      const pick = sorted.find((p) => !already.has(p.id) && used[p.id] < target) || sorted.find((p) => !already.has(p.id))
      if (pick) { allAssignments.push(makeAssignment(dateStr, center, pick, false, null)); used[pick.id]++ }
    }

    // Second pass: add a second person to every weekday (ensuring min 2)
    for (const dateStr of trueWeekdays) {
      const alreadyOn = new Set(allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId))
      if (alreadyOn.size >= 2) continue  // already covered

      const sorted = [...pool].sort((a, b) => used[a.id] - used[b.id])
      const pick = sorted.find((p) => !alreadyOn.has(p.id) && used[p.id] < target) || sorted.find((p) => !alreadyOn.has(p.id))
      if (pick) { allAssignments.push(makeAssignment(dateStr, center, pick, false, null)); used[pick.id]++ }
    }

    // ── Step 3: top up under-target people with remaining weekday slots ──────
    for (const person of pool) {
      let shortage = target - used[person.id]
      if (shortage <= 0) continue

      // Find weekdays this person isn't already on, preferring spread across month
      const available = trueWeekdays.filter((d) =>
        !allAssignments.find((a) => a.date === d && a.center === center.id && a.personId === person.id)
      )

      const step = Math.max(1, Math.floor(available.length / shortage))
      for (let i = 0; i < available.length && shortage > 0; i += step) {
        allAssignments.push(makeAssignment(available[i], center, person, false, null))
        used[person.id]++
        shortage--
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
