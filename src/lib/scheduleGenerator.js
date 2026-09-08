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
function isSunday(d) { return dow(d) === 0 }
function addOneDay(dateStr) {
  const d = new Date(dateStr); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function prevDay(dateStr) {
  const d = new Date(dateStr); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

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
 * 1. Weekdays (Mon–Fri, non-holiday): minimum 2 people per day
 * 2. Weekends & holidays: exactly 1 person per day — kept to the minimum
 *    on purpose, to reduce time worked on weekends/holidays
 * 2a. Special days rotate: each one goes to whoever has the lightest
 *    weekend/holiday load (cross-month history + what they've already taken
 *    this month), so no single person carries every weekend.
 * 2b. Soft "no back-to-back" preference: someone who worked the day before
 *    (e.g. Saturday) is skipped for the next special day (Sunday) unless
 *    they're the only one available.
 * 3. If someone works Sunday OR a national holiday → they are BLOCKED the next
 *    calendar day. This is a hard rule: if every remaining candidate is
 *    blocked, the day is left short-staffed rather than breaking the rule.
 * 4. Each person works 20–21 days (160–168 h/month)
 * 5. Weekend/holiday burden balanced across months
 */
export function generateSchedule(yearMonth, people, fairness = {}) {
  const days    = getDaysInMonth(yearMonth)
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
    const target = 20  // 160h standard; topped to 21 in step 4 if needed

    const used     = Object.fromEntries(pool.map((p) => [p.id, 0]))
    // blockedOn[dateStr] = Set of personIds who CANNOT work that day
    const blockedOn = {}

    function isBlocked(personId, dateStr) {
      return blockedOn[dateStr]?.has(personId) || false
    }

    function blockNextDay(personId, dateStr) {
      const next = addOneDay(dateStr)
      if (!blockedOn[next]) blockedOn[next] = new Set()
      blockedOn[next].add(personId)
    }

    function assign(dateStr, person) {
      const we  = isWeekend(dateStr)
      const hol = getHoliday(dateStr, center.country)
      allAssignments.push(makeAssignment(dateStr, center, person, we, hol))
      used[person.id]++
      // Rule 3: block next day after Sunday or holiday
      if (isSunday(dateStr) || !!hol) blockNextDay(person.id, dateStr)
    }

    // ── Step 1: special days (weekends + holidays) ────────────────────────
    // Exactly 1 person per day (Rule 2) — no 2nd person is added even if
    // capacity allows, so weekend/holiday coverage stays at the minimum.
    // Each day is re-ranked (Rule 2a) so the load rotates instead of landing
    // on one person; Rule 2b skips whoever worked the day before. Rule 3
    // still takes priority: if everyone is hard-blocked, the day is left
    // unassigned rather than broken.
    const specialUsed = Object.fromEntries(pool.map((p) => [p.id, 0]))

    function workedDayBefore(personId, dateStr) {
      const prev = prevDay(dateStr)
      return allAssignments.some(
        (a) => a.date === prev && a.center === center.id && a.personId === personId
      )
    }

    const specialDays = days.filter((d) => isWeekend(d) || !!getHoliday(d, center.country))

    for (const dateStr of specialDays) {
      const ranked = [...pool].sort((a, b) => {
        const la = (fairness[a.id]?.weekendTotal || 0) + specialUsed[a.id]
        const lb = (fairness[b.id]?.weekendTotal || 0) + specialUsed[b.id]
        return la - lb || used[a.id] - used[b.id]
      })
      const free = ranked.filter((p) => !isBlocked(p.id, dateStr))
      const pick =
        free.find((p) => !workedDayBefore(p.id, dateStr)) // rotate + no back-to-back
        || free[0]                                        // back-to-back only if nobody else is free
        // else: everyone hard-blocked (Rule 3) → leave the day unassigned
      if (pick) {
        assign(dateStr, pick)
        specialUsed[pick.id]++
      }
    }

    // ── Step 2: weekdays (Mon–Fri, non-holiday), min 2 per day ────────────
    const trueWeekdays = days.filter((d) => !isWeekend(d) && !getHoliday(d, center.country))

    // Pass A: first person on each weekday
    // (Rule 3 priority: no unconditional fallback that ignores isBlocked —
    // if everyone available is blocked, the slot is left open rather than
    // assigning someone who just earned a day off.)
    for (const dateStr of trueWeekdays) {
      const alreadyOn = new Set(
        allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId)
      )
      const sorted = [...pool].sort((a, b) => used[a.id] - used[b.id])
      const pick = sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr) && used[p.id] <= target)
               || sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr))
      if (pick) { assign(dateStr, pick) }
    }

    // Pass B: second person on each weekday (enforce min 2)
    for (const dateStr of trueWeekdays) {
      const alreadyOn = new Set(
        allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId)
      )
      if (alreadyOn.size >= 2) continue
      const sorted = [...pool].sort((a, b) => used[a.id] - used[b.id])
      const pick = sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr) && used[p.id] <= target)
               || sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr))
      if (pick) { assign(dateStr, pick) }
    }

    // ── Step 3: top up under-target people ────────────────────────────────
    for (const person of pool) {
      let gap = (target + 1) - used[person.id]  // allow up to 21 days
      if (gap <= 0) continue
      const available = trueWeekdays.filter((d) =>
        !isBlocked(person.id, d) &&
        !allAssignments.find((a) => a.date === d && a.center === center.id && a.personId === person.id)
      )
      const step = Math.max(1, Math.floor(available.length / gap))
      for (let i = 0; i < available.length && gap > 0; i += step) {
        assign(available[i], person)
        gap--
      }
    }
  }

  // ── Fairness snapshot ──────────────────────────────────────────────────
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
