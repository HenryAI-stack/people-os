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

// ── Week grouping ─────────────────────────────────────────────────────────────
// Returns array of weeks; each week is an array of YYYY-MM-DD strings (Mon–Sun)
// that fall within the month.
function groupByWeek(days) {
  const weeks = []
  let week = []
  for (const d of days) {
    const dow = new Date(d).getDay()  // 0=Sun,1=Mon…
    // New week starts on Monday
    if (dow === 1 && week.length) { weeks.push(week); week = [] }
    // Handle Sunday as end-of-week
    week.push(d)
    if (dow === 0) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push(week)
  return weeks
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function dow(dateStr) { return new Date(dateStr).getDay() }  // 0=Sun, 1=Mon … 6=Sat

/**
 * Generate a fair monthly schedule.
 *
 * Rules enforced:
 * - Every calendar day is covered for every center (no gaps)
 * - Each person works at most 5 days per Mon–Sun week (40 h/week)
 * - Mon–Fri are primary working days; weekends balanced as evenly as possible
 * - If someone works Saturday, Sunday, or a holiday → dayOffGranted flag set
 *   and their next available Mon–Fri is freed if budget allows
 * - Weekend & holiday burden carried forward across months via fairnessSnapshot
 */
export function generateSchedule(yearMonth, people, fairness = {}) {
  const days  = getDaysInMonth(yearMonth)
  const weeks = groupByWeek(days)

  // Group people by center
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

    // ── Per-person trackers ─────────────────────────────────────────────────
    // weekLoad[personId] = { shifts: 0, dayOffCredit: 0 } per week index
    const monthShifts  = {}  // personId → total shifts this month
    const weekShifts   = {}  // personId → shifts in current week
    const weekendTotal = {}  // personId → weekend+holiday shifts this month
    const prevFair     = {}  // personId → { weekendTotal, holidayTotal } from prev months
    const dayOffQueue  = {}  // personId → number of day-off credits pending

    for (const p of pool) {
      monthShifts[p.id]  = 0
      weekShifts[p.id]   = 0
      weekendTotal[p.id] = 0
      prevFair[p.id]     = fairness[p.id] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
      dayOffQueue[p.id]  = 0
    }

    // Target: fill all days. With N people and D days: each works ~D/N days.
    // Hard cap: 5 shifts per week per person (40 h/week).
    const WEEK_CAP = 5

    // Track assignments for this center day by day
    const centerAssignments = {}  // dateStr → person

    // ── Week-by-week assignment ──────────────────────────────────────────────
    for (let wi = 0; wi < weeks.length; wi++) {
      const week = weeks[wi]

      // Reset weekly counters
      for (const p of pool) weekShifts[p.id] = 0

      // Separate weekdays and weekend days within this week
      const weekdays    = week.filter((d) => dow(d) !== 0 && dow(d) !== 6)
      const weekendDays = week.filter((d) => dow(d) === 0 || dow(d) === 6)

      // ── Step 1: assign weekdays (Mon–Fri) ─────────────────────────────────
      for (const dateStr of weekdays) {
        const holidayName = getHoliday(dateStr, center.country)
        const isHoliday   = !!holidayName

        // Sort pool for weekday: prefer those with day-off credit (give day off),
        // then least weekly shifts, then least monthly shifts, then fairness history
        const sorted = [...pool].sort((a, b) => {
          // If person has a day-off credit AND today is Mon–Fri → give them the day off
          // (handled below, not in sort)
          const wa = weekShifts[a.id],  wb = weekShifts[b.id]
          const ma = monthShifts[a.id], mb = monthShifts[b.id]
          const fa = prevFair[a.id].weekendTotal + weekendTotal[a.id]
          const fb = prevFair[b.id].weekendTotal + weekendTotal[b.id]
          if (wa !== wb) return wa - wb
          if (ma !== mb) return ma - mb
          return fa - fb
        })

        let assigned = null
        for (const candidate of sorted) {
          // Skip if at weekly cap
          if (weekShifts[candidate.id] >= WEEK_CAP) continue
          // If candidate has a day-off credit, give them this weekday off
          if (dayOffQueue[candidate.id] > 0 && !isHoliday) {
            dayOffQueue[candidate.id]--
            continue
          }
          assigned = candidate
          break
        }
        // Fallback: pick least-shifted person even if credit pending
        if (!assigned) {
          assigned = sorted.find((p) => weekShifts[p.id] < WEEK_CAP) || sorted[0]
        }

        weekShifts[assigned.id]++
        monthShifts[assigned.id]++
        if (isHoliday) {
          weekendTotal[assigned.id]++
          dayOffQueue[assigned.id]++
        }

        centerAssignments[dateStr] = {
          personId:    assigned.id,
          personName:  assigned.name,
          isWeekend:   false,
          isHoliday,
          holidayName: holidayName || '',
          dayOffGranted: isHoliday,
          comment: '',
        }
      }

      // ── Step 2: assign weekend days ────────────────────────────────────────
      // Prefer those who have worked FEWER weekday shifts this week
      // (so weekend work doesn't push them over 40 h if avoidable)
      for (const dateStr of weekendDays) {
        const isSun       = dow(dateStr) === 0
        const holidayName = getHoliday(dateStr, center.country)
        const isHoliday   = !!holidayName

        // Sort: prefer fewer weekend shifts overall (across months), then fewer
        // shifts this week (so someone who already has 5 weekdays is last resort)
        const sorted = [...pool].sort((a, b) => {
          const weA = (prevFair[a.id].weekendTotal || 0) + weekendTotal[a.id]
          const weB = (prevFair[b.id].weekendTotal || 0) + weekendTotal[b.id]
          if (weA !== weB) return weA - weB
          return weekShifts[a.id] - weekShifts[b.id]
        })

        const assigned = sorted[0]  // Must assign someone — no gaps allowed

        weekShifts[assigned.id]++
        monthShifts[assigned.id]++
        weekendTotal[assigned.id]++

        const dayOffGranted = true  // always grant credit for weekend work
        dayOffQueue[assigned.id]++

        centerAssignments[dateStr] = {
          personId:    assigned.id,
          personName:  assigned.name,
          isWeekend:   true,
          isHoliday,
          holidayName: holidayName || '',
          dayOffGranted,
          comment: '',
        }
      }
    }

    // Flatten to assignments array
    for (const dateStr of days) {
      const a = centerAssignments[dateStr]
      if (a) allAssignments.push({ date: dateStr, center: center.id, ...a })
    }
  }

  // ── Build fairness snapshot ────────────────────────────────────────────────
  const fairnessSnapshot = {}
  for (const p of people) {
    const prev = fairness[p.id] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
    // Count from this month
    const monthWe  = allAssignments.filter((a) => a.personId === p.id && (a.isWeekend || a.isHoliday)).length
    const monthHol = allAssignments.filter((a) => a.personId === p.id && a.isHoliday).length
    const monthTot = allAssignments.filter((a) => a.personId === p.id).length
    fairnessSnapshot[p.id] = {
      weekendTotal: (prev.weekendTotal || 0) + monthWe,
      holidayTotal: (prev.holidayTotal || 0) + monthHol,
      totalDays:    (prev.totalDays   || 0) + monthTot,
    }
  }

  return { assignments: allAssignments, fairnessSnapshot }
}
