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

function dow(dateStr) { return new Date(dateStr).getDay() } // 0=Sun … 6=Sat

function groupByWeek(days) {
  const weeks = []
  let week = []
  for (const d of days) {
    const day = dow(d)
    if (day === 1 && week.length) { weeks.push(week); week = [] }
    week.push(d)
    if (day === 0) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push(week)
  return weeks
}

/**
 * Calculate each person's target shift count for the month.
 *
 * Full-time = 40 h/week = 5 days/week.
 * A month contains N calendar weeks (partial included).
 * Target = number of Mon–Fri weekdays in the month (each person covers
 * their fair share of those), bounded to max 21 days (168 h).
 *
 * Example: month has 23 weekdays, pool has 2 people → target = 23/2 ≈ 11–12 days each.
 * If pool has 1 person → target = min(23, 21) = 21 days (168 h cap).
 */
function calcTargets(days, pool) {
  const weekdays = days.filter((d) => dow(d) !== 0 && dow(d) !== 6).length
  const weekends = days.length - weekdays
  const n = pool.length
  if (n === 0) return {}

  // Distribute weekdays as evenly as possible
  const baseWd  = Math.floor(weekdays / n)
  const extraWd = weekdays % n  // first `extraWd` people get one more weekday

  // Distribute weekend days evenly (sorted by fairness history externally)
  const baseWe  = Math.floor(weekends / n)
  const extraWe = weekends % n

  const targets = {}
  for (let i = 0; i < n; i++) {
    const wd = baseWd + (i < extraWd ? 1 : 0)
    const we = baseWe + (i < extraWe ? 1 : 0)
    targets[pool[i].id] = Math.min(wd + we, 21) // hard cap: 168 h/month
  }
  return targets
}

export function generateSchedule(yearMonth, people, fairness = {}) {
  const days  = getDaysInMonth(yearMonth)
  const weeks = groupByWeek(days)

  const byCenter = {}
  for (const c of CENTERS) byCenter[c.id] = []
  for (const p of people) {
    const cid = getCenter(p)
    if (cid) byCenter[cid].push(p)
  }

  const allAssignments = []

  for (const center of CENTERS) {
    // Sort pool by cumulative weekend burden (least first) for fair baseline
    const pool = [...(byCenter[center.id] || [])].sort((a, b) => {
      const fa = (fairness[a.id]?.weekendTotal || 0)
      const fb = (fairness[b.id]?.weekendTotal || 0)
      return fa - fb
    })
    if (!pool.length) continue

    // ── Targets ───────────────────────────────────────────────────────────
    const targets   = calcTargets(days, pool)  // personId → max shifts this month
    const monthUsed = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const weekUsed  = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const weUsed    = Object.fromEntries(pool.map((p) => [p.id, 0]))  // weekend shifts
    const holUsed   = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const dayOffQ   = Object.fromEntries(pool.map((p) => [p.id, 0])) // day-off credits

    const WEEK_CAP = 5  // 40 h/week hard limit

    function pick(candidates, isSpecial) {
      // Sort: respect target ceiling, then week cap, then balance by shifts used
      return [...candidates].sort((a, b) => {
        const atCap_a = monthUsed[a.id] >= targets[a.id]
        const atCap_b = monthUsed[b.id] >= targets[b.id]
        if (atCap_a !== atCap_b) return atCap_a ? 1 : -1  // push capped people last

        const wkFull_a = weekUsed[a.id] >= WEEK_CAP
        const wkFull_b = weekUsed[b.id] >= WEEK_CAP
        if (wkFull_a !== wkFull_b) return wkFull_a ? 1 : -1

        if (isSpecial) {
          // Prefer fewer weekend shifts (this month + history)
          const w_a = weUsed[a.id] + (fairness[a.id]?.weekendTotal || 0)
          const w_b = weUsed[b.id] + (fairness[b.id]?.weekendTotal || 0)
          if (w_a !== w_b) return w_a - w_b
        }

        // Balance total monthly shifts
        return monthUsed[a.id] - monthUsed[b.id]
      })[0]
    }

    for (let wi = 0; wi < weeks.length; wi++) {
      const week = weeks[wi]

      // Reset weekly counters at start of each week
      for (const p of pool) weekUsed[p.id] = 0

      const weekdays    = week.filter((d) => dow(d) !== 0 && dow(d) !== 6)
      const weekendDays = week.filter((d) => dow(d) === 0 || dow(d) === 6)

      // ── Weekdays ────────────────────────────────────────────────────────
      for (const dateStr of weekdays) {
        const holiday     = getHoliday(dateStr, center.country)
        const isHoliday   = !!holiday
        const isSpecial   = isHoliday

        let assigned = null

        // Check day-off credits first — give eligible person the day off
        const sortedPool = [...pool].sort((a, b) => monthUsed[a.id] - monthUsed[b.id])
        for (const candidate of sortedPool) {
          if (dayOffQ[candidate.id] > 0 &&
              weekUsed[candidate.id] < WEEK_CAP &&
              monthUsed[candidate.id] < targets[candidate.id] &&
              !isSpecial) {
            // Try to find someone else to cover this day
            const others = sortedPool.filter((x) => x.id !== candidate.id &&
              weekUsed[x.id] < WEEK_CAP &&
              monthUsed[x.id] < targets[x.id])
            if (others.length > 0) {
              dayOffQ[candidate.id]--
              continue
            }
          }
          if (weekUsed[candidate.id] < WEEK_CAP) {
            assigned = candidate
            break
          }
        }
        if (!assigned) assigned = pick(pool, isSpecial) || pool[0]

        weekUsed[assigned.id]++
        monthUsed[assigned.id]++
        if (isHoliday) { holUsed[assigned.id]++; weUsed[assigned.id]++; dayOffQ[assigned.id]++ }

        allAssignments.push({
          date: dateStr, center: center.id,
          personId: assigned.id, personName: assigned.name,
          isWeekend: false, isHoliday, holidayName: holiday || '',
          dayOffGranted: isHoliday, comment: '',
        })
      }

      // ── Weekend days ─────────────────────────────────────────────────────
      for (const dateStr of weekendDays) {
        const holiday   = getHoliday(dateStr, center.country)
        const isHoliday = !!holiday
        const isSun     = dow(dateStr) === 0

        const assigned = pick(pool, true) || pool[0]

        weekUsed[assigned.id]++
        monthUsed[assigned.id]++
        weUsed[assigned.id]++
        if (isHoliday) holUsed[assigned.id]++
        dayOffQ[assigned.id]++  // weekend always earns day-off credit

        allAssignments.push({
          date: dateStr, center: center.id,
          personId: assigned.id, personName: assigned.name,
          isWeekend: true, isHoliday, holidayName: holiday || '',
          dayOffGranted: true, comment: '',
        })
      }
    }
  }

  // ── Fairness snapshot for next month ─────────────────────────────────────
  const fairnessSnapshot = {}
  for (const p of people) {
    const prev = fairness[p.id] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
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
