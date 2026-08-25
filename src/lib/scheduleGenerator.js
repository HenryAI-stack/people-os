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
 * 2. Weekends & holidays: minimum 1, can be 2 if capacity allows
 * 3. If someone works Sunday OR a national holiday → they are BLOCKED the next calendar day
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
    const n      = pool.length
    const target = 20  // 160h standard; topped to 21 in step 4 if needed

    // Sort by fairness (least weekend burden first)
    const byFairness = [...pool].sort((a, b) =>
      (fairness[a.id]?.weekendTotal || 0) - (fairness[b.id]?.weekendTotal || 0)
    )

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
    // At least 1 person per day; add 2nd if capacity available
    const specialDays = days.filter((d) => isWeekend(d) || !!getHoliday(d, center.country))

    for (let i = 0; i < specialDays.length; i++) {
      const dateStr = specialDays[i]
      // Pick 1st person: round-robin by fairness, not blocked, under target
      const first = byFairness.find((p) => !isBlocked(p.id, dateStr) && used[p.id] < target + 1)
                 || byFairness.find((p) => !isBlocked(p.id, dateStr))
                 || byFairness[i % n]
      assign(dateStr, first)

      // Add 2nd person if someone still has capacity (double weekend assignment)
      const second = byFairness.find((p) =>
        p.id !== first.id &&
        !isBlocked(p.id, dateStr) &&
        used[p.id] < target + 1
      )
      if (second) assign(dateStr, second)
    }

    // ── Step 2: weekdays (Mon–Fri, non-holiday), min 2 per day ────────────
    const trueWeekdays = days.filter((d) => !isWeekend(d) && !getHoliday(d, center.country))

    // Pass A: first person on each weekday
    for (const dateStr of trueWeekdays) {
      const alreadyOn = new Set(
        allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId)
      )
      const sorted = [...pool].sort((a, b) => used[a.id] - used[b.id])
      const pick = sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr) && used[p.id] <= target)
               || sorted.find((p) => !alreadyOn.has(p.id) && !isBlocked(p.id, dateStr))
               || sorted.find((p) => !alreadyOn.has(p.id))
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
               || sorted.find((p) => !alreadyOn.has(p.id))
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
