import { getDaysInMonth, isWeekend, getHoliday } from './holidays.js'
import { isBirthdayOn } from './birthdays.js'
import { isWinterTime } from './worldClock.js'
import { leaveMap } from './leave.js'

// `hours` are local to each center's own `tz` (used by onDuty.js for the Dashboard's 24/7 view).
// `winterHours` (Warsaw only) apply while that zone is on winter time: Poland is the only one of
// the three that changes clocks, so Warsaw starts an hour earlier in winter to keep the
// follow-the-sun chain seamless. Read hours via centerHours()/centerHoursForMonth(), not `.hours`.
// Array order = display order everywhere (Work Schedule tabs/default tab, print view, Excel sheets,
// PDF pages) — Bangalore → Warsaw → Mexico City, i.e. the follow-the-sun shift sequence.
export const CENTERS = [
  { id: 'Bangalore',   label: 'Bangalore, India',     country: 'IN', tz: 'Asia/Kolkata',        hours: '07:00 – 15:00', locationKeys: ['bangalore', 'bengaluru', 'india'] },
  { id: 'Warsaw',      label: 'Warsaw, Poland',      country: 'PL', tz: 'Europe/Warsaw',       hours: '11:30 – 19:30', winterHours: '10:30 – 18:30', locationKeys: ['warsaw', 'poland'] },
  { id: 'Mexico City', label: 'Mexico City, Mexico',  country: 'MX', tz: 'America/Mexico_City', hours: '11:30 – 19:30', locationKeys: ['mexico', 'guadalajara'] },
]

/** Local shift hours ('HH:MM – HH:MM') of `center` on calendar day 'YYYY-MM-DD'. */
export function centerHours(center, date) {
  return center.winterHours && isWinterTime(center.tz, date) ? center.winterHours : center.hours
}

/**
 * Shift hours for a whole month 'YYYY-MM' → { label, mixed }. `mixed` when a clock change falls
 * inside the month, e.g. October: "11:30 – 19:30, from 25 Oct 10:30 – 18:30".
 */
export function centerHoursForMonth(center, month) {
  const days = getDaysInMonth(month)
  const first = centerHours(center, days[0])
  const switchDay = days.find((d) => centerHours(center, d) !== first)
  if (!switchDay) return { label: first, mixed: false }
  const day = new Date(`${switchDay}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return { label: `${first}, from ${day} ${centerHours(center, switchDay)}`, mixed: true }
}

export function getCenter(person) {
  if (!person.location) return null
  const loc = person.location.toLowerCase()
  return CENTERS.find((c) => c.locationKeys.some((k) => loc.includes(k)))?.id || null
}

/** The team whose members are preselected when generating a new schedule. */
export const SCHEDULE_TEAM = '24/7 Core Operations'

/**
 * People on a month's schedule: the ones ticked when it was generated (`memberIds`). Schedules
 * saved before that choice existed fall back to the whole 24/7 team, as they always did.
 */
export function scheduleMembers(allPeople, schedule) {
  if (Array.isArray(schedule?.memberIds)) {
    const ids = new Set(schedule.memberIds)
    return allPeople.filter((p) => ids.has(p.id))
  }
  return allPeople.filter((p) => p.team === SCHEDULE_TEAM)
}

/**
 * Who the "Select employees" step ticks by default: active people at a support center who are in
 * the 24/7 team, except anyone deliberately left out of `ref` (`excludedIds`), plus anyone from
 * another team who was ticked in `ref`. `ref` = this month's schedule when regenerating, else last
 * month's, so a person left out once stays out until ticked again, and new team members start ticked.
 * → array of person ids
 */
export function defaultScheduleSelection(allPeople, ref) {
  const excluded = new Set(ref?.excludedIds || [])
  const picked = new Set(ref?.memberIds || [])
  return allPeople
    .filter((p) => getCenter(p) && (p.status || 'active') === 'active'
      && (picked.has(p.id) || (p.team === SCHEDULE_TEAM && !excluded.has(p.id))))
    .map((p) => p.id)
}

// All UTC-based (Date.UTC in, getUTC*/.toISOString() out) so this never drifts
// a day in either direction depending on the browser's timezone offset — see
// getDaysInMonth in holidays.js for the bug this pattern used to cause.
function dow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun,1=Mon…6=Sat
}
function isSunday(d) { return dow(d) === 0 }
function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
function prevDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

// 40h/week cap: shifts are 8h, so at most 5 shifts per person per Mon–Sun week.
export const SHIFT_HOURS = 8
export const MAX_WEEKLY_HOURS = 40
const MAX_SHIFTS_PER_WEEK = MAX_WEEKLY_HOURS / SHIFT_HOURS

/** Monday ('YYYY-MM-DD') of the Mon–Sun week containing dateStr — UTC-based like the helpers above. */
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}

// ── Work history (Rule 7) ───────────────────────────────────────────────────
// Monthly day target: 21 days (168h) is the standard; a person's carry-over from earlier months
// moves it within [MIN_TARGET_DAYS, MAX_TARGET_DAYS]. The 40h/week cap still has the final say.
export const STANDARD_DAYS   = 21
export const MIN_TARGET_DAYS = 20 // never planned below 160h because of carry-over
export const MAX_TARGET_DAYS = 23 // catch up at most +2 days a month; the rest carries on
// A month in which someone worked less than this share of their center's average (joined mid-month,
// long leave) is a partial month and left out of their balance, so it doesn't turn into a debt.
export const PARTIAL_MONTH_SHARE = 0.5

const centerById = (id) => CENTERS.find((c) => c.id === id)
const isSpecialDay = (dateStr, center) => isWeekend(dateStr) || !!getHoliday(dateStr, center.country)

/** Leave of one person over `dates` at `center`: { map, workdays, days }. Workdays = Mon–Fri
 *  non-holidays at that center — those count as worked (a vacation weekday replaces a shift). */
function leaveAt(person, dates, center) {
  const map = person ? leaveMap(person, dates) : {}
  const leaveDates = Object.keys(map)
  return { map, days: leaveDates.length, workdays: leaveDates.filter((d) => !isSpecialDay(d, center)).length }
}

/**
 * Everyone's work history per center from every saved schedule *before* `beforeMonth` ('YYYY-MM').
 * Counts what's actually in the saved schedules (manual swaps/moves/removals included, cleared
 * shifts excluded); weekend/holiday come from the date and the center's country, not stored flags.
 * Leave (`people[].leave`, see leave.js) counts as worked: credited days = shifts + leave weekdays,
 * and the weekend/holiday share expected of someone shrinks with the days they were away.
 * Each center is compared only with itself: per month, a person's credited days and weekend/holiday
 * days are set against that center's full-month colleagues, and the differences add up.
 * → { [centerId]: { [personId]: { months, partialMonths, days, special, holidays, leaveDays,
 *      dayBalance, specialBalance, lastSpecial } } }
 *   dayBalance < 0 = worked fewer days than colleagues so far (owed days); > 0 = worked more.
 *   specialBalance likewise for weekend + holiday days. lastSpecial = last weekend/holiday date worked.
 */
export function computeWorkHistory(schedules, beforeMonth, people = []) {
  const out = {}
  const personById = new Map((people || []).map((p) => [p.id, p]))
  const row = (cid, pid) => ((out[cid] ||= {})[pid] ||= {
    months: 0, partialMonths: 0, days: 0, special: 0, holidays: 0, leaveDays: 0,
    dayBalance: 0, specialBalance: 0, lastSpecial: '',
  })
  const seen = new Set()
  const past = (schedules || [])
    .filter((s) => s?.month && s.month < beforeMonth && !seen.has(s.month) && seen.add(s.month))
    .sort((a, b) => a.month.localeCompare(b.month))
  for (const s of past) {
    const monthDays = getDaysInMonth(s.month)
    const month = {} // centerId → personId → { days, special, holidays, lastSpecial }
    for (const a of s.assignments || []) {
      const center = centerById(a.center)
      if (a.cleared || !center || !a.personId) continue
      const r = ((month[center.id] ||= {})[a.personId] ||= { days: 0, special: 0, holidays: 0, lastSpecial: '' })
      r.days++
      if (isSpecialDay(a.date, center)) {
        r.special++
        if (a.date > r.lastSpecial) r.lastSpecial = a.date
      }
      if (getHoliday(a.date, center.country)) r.holidays++
    }
    for (const [cid, rows] of Object.entries(month)) {
      const center = centerById(cid)
      const ids = Object.keys(rows)
      for (const id of ids) {
        const lv = leaveAt(personById.get(id), monthDays, center)
        rows[id].leaveDays = lv.workdays
        rows[id].credited = rows[id].days + lv.workdays
        rows[id].avail = (monthDays.length - lv.days) / monthDays.length
      }
      const mean = (list, key) => list.reduce((n, id) => n + rows[id][key], 0) / list.length
      const avgAll = mean(ids, 'credited')
      const full = ids.filter((id) => rows[id].credited >= avgAll * PARTIAL_MONTH_SHARE)
      const avgCredited = mean(full, 'credited')
      // Weekend/holiday days per available day, so someone away half the month owes half a share.
      const availSum = full.reduce((n, id) => n + rows[id].avail, 0)
      const specialRate = availSum > 0 ? full.reduce((n, id) => n + rows[id].special, 0) / availSum : 0
      for (const id of ids) {
        const m = rows[id], h = row(cid, id)
        h.days += m.days; h.special += m.special; h.holidays += m.holidays; h.leaveDays += m.leaveDays
        if (m.lastSpecial > h.lastSpecial) h.lastSpecial = m.lastSpecial
        if (!full.includes(id)) { h.partialMonths++; continue }
        h.months++
        h.dayBalance += m.credited - avgCredited
        h.specialBalance += m.special - specialRate * m.avail
      }
    }
  }
  return out
}

/** This month's day target for someone with `dayBalance` (see computeWorkHistory): owed days are added. */
export function targetDaysFor(dayBalance = 0) {
  const carry = Math.round(-dayBalance) || 0 // || 0 turns -0 into 0
  return Math.min(MAX_TARGET_DAYS, Math.max(MIN_TARGET_DAYS, STANDARD_DAYS + carry))
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
 * Rules (each center is planned on its own, against its own history only):
 * 1. Weekdays (Mon–Fri, non-holiday): minimum 2 people per day
 * 2. Weekends & holidays: exactly 1 person per day — kept to the minimum
 *    on purpose, to reduce time worked on weekends/holidays
 * 2a. Special days rotate: each one goes to whoever has the lightest weekend/holiday
 *    load — their balance against colleagues over every past month (Rule 7) plus what
 *    they've already taken this month. Ties go to whoever worked a weekend/holiday
 *    least recently, so nobody carries every weekend and the order keeps rotating.
 * 2b. Soft "no back-to-back" preference: someone who worked the day before
 *    (e.g. Saturday) is skipped for the next special day (Sunday) unless
 *    they're the only one available.
 * 3. If someone works Sunday OR a national holiday → they are BLOCKED the next
 *    calendar day. This is a hard rule: if every remaining candidate is
 *    blocked, the day is left short-staffed rather than broken.
 * 4. Day target per person: 21 days (168h), moved by the carry-over from Rule 7 —
 *    someone who worked fewer days than colleagues gets more this month (up to 23),
 *    someone who worked more gets fewer (never below 20 = 160h).
 * 4a. Hard cap of 40h (5 shifts) per person per Mon–Sun week. Weeks that straddle
 *    the month boundary also count the previous month's shifts (`prevAssignments`).
 *    Like Rule 3, a day is left short-staffed rather than breaking the cap.
 * 4b. Weekday shifts rotate: each slot goes to whoever is furthest behind their own
 *    target (days worked ÷ target), then whoever worked least recently — so shifts
 *    spread through the month and nobody is favoured by their position in the list.
 * 5. Weekend/holiday burden balanced across months (via Rule 7)
 * 6. Nobody is scheduled on their own birthday (direct report's `birthday`, 'MM-DD' or
 *    'YYYY-MM-DD'). A strong preference rather than a hard block: the birthday person is
 *    only used as a last resort when nobody else can cover the day (so coverage never drops
 *    because of it), and the top-up step never adds a shift on a birthday. The Work Schedule
 *    page flags any birthday shift with 🎂 so it can be swapped by hand.
 * 7. Work history: `pastSchedules` (every saved schedule) → computeWorkHistory(). Days and
 *    weekend/holiday days are compared with colleagues at the same center, month by month,
 *    and the differences carry over until they're evened out. Without `pastSchedules` the
 *    old chained `fairness` snapshot is used for weekend balance only.
 * 8. Leave (`leave` on the direct report: vacation / sick / other, see leave.js) is a hard block.
 *    Leave weekdays count as worked: someone with 5 vacation weekdays and a 21-day target gets
 *    16 shifts. Their weekend/holiday share shrinks with the days they're away (a weekend shift
 *    weighs 1 ÷ share-of-month-present when ranking). Past months credit leave the same way, so
 *    leave never turns into owed days.
 *
 * → { assignments, fairnessSnapshot, balances }
 *   balances[personId] = { center, targetDays (credited: shifts + leave weekdays), shiftTarget,
 *   leaveDays, dayBalance, specialBalance, months } — the
 *   history this schedule was planned with (shown on the Work Schedule stat chips).
 */
export function generateSchedule(yearMonth, people, fairness = {}, prevAssignments = [], pastSchedules = null, allPeople = people) {
  const days    = getDaysInMonth(yearMonth)
  // allPeople (everyone, not just this month's members) only matters for colleagues' past leave.
  const history = pastSchedules ? computeWorkHistory(pastSchedules, yearMonth, allPeople) : null
  const byCenter = {}
  for (const c of CENTERS) byCenter[c.id] = []
  for (const p of people) {
    const cid = getCenter(p)
    if (cid) byCenter[cid].push(p)
  }

  const allAssignments = []
  const balances = {}

  for (const center of CENTERS) {
    const pool = byCenter[center.id]
    if (!pool.length) continue

    // Rule 7: this center's history. Fallback (no pastSchedules): weekend totals from the old
    // snapshot, made relative to this center's pool so they work the same way.
    let hist
    if (history) {
      hist = (id) => history[center.id]?.[id] || {}
    } else {
      const avgWe = pool.reduce((n, p) => n + (fairness[p.id]?.weekendTotal || 0), 0) / pool.length
      hist = (id) => ({ specialBalance: (fairness[id]?.weekendTotal || 0) - avgWe })
    }
    // Rule 8: leave. creditTarget = days to be credited (shifts + leave weekdays); target = shifts.
    const leave = Object.fromEntries(pool.map((p) => [p.id, leaveAt(p, days, center)]))
    const creditTarget = Object.fromEntries(pool.map((p) => [p.id, targetDaysFor(hist(p.id).dayBalance)]))
    const target = Object.fromEntries(pool.map((p) => [p.id, Math.max(0, creditTarget[p.id] - leave[p.id].workdays)]))
    // Share of the month someone is around (for their fair share of weekends/holidays)
    const avail = Object.fromEntries(pool.map((p) => [p.id, (days.length - leave[p.id].days) / days.length]))
    for (const p of pool) {
      const h = hist(p.id)
      balances[p.id] = {
        center: center.id,
        targetDays: creditTarget[p.id],
        shiftTarget: target[p.id],
        leaveDays: leave[p.id].workdays,
        dayBalance: Math.round((h.dayBalance || 0) * 10) / 10,
        specialBalance: Math.round((h.specialBalance || 0) * 10) / 10,
        months: h.months || 0,
      }
    }

    const used     = Object.fromEntries(pool.map((p) => [p.id, 0]))
    // Last date each person worked here (any shift / a weekend-holiday shift) — rotation tie-breaks.
    const lastWorked  = Object.fromEntries(pool.map((p) => [p.id, '']))
    const lastSpecial = Object.fromEntries(pool.map((p) => [p.id, hist(p.id).lastSpecial || '']))
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

    // Rule 4a: shifts per person per week, seeded with last month's shifts in a straddling week.
    // Last month's shifts also seed the rest rule (a Sunday/holiday on the last day blocks day 1)
    // and the rotation (who worked most recently).
    const weekCount = {}
    const wk = (personId, dateStr) => `${personId}|${weekStart(dateStr)}`
    const inPool = new Set(pool.map((p) => p.id))
    for (const a of prevAssignments) {
      if (a.cleared || !inPool.has(a.personId)) continue
      weekCount[wk(a.personId, a.date)] = (weekCount[wk(a.personId, a.date)] || 0) + 1
      if (a.center === center.id) {
        if (a.date > lastWorked[a.personId]) lastWorked[a.personId] = a.date
        if (isSunday(a.date) || getHoliday(a.date, center.country)) blockNextDay(a.personId, a.date)
      }
    }
    // Rule 6: birthday = avoid (last resort only)
    const onBirthday = (person, dateStr) => isBirthdayOn(person.birthday, dateStr)
    function canWork(personId, dateStr) {
      return !isBlocked(personId, dateStr) && !leave[personId].map[dateStr] && (weekCount[wk(personId, dateStr)] || 0) < MAX_SHIFTS_PER_WEEK
    }

    function assign(dateStr, person) {
      const we  = isWeekend(dateStr)
      const hol = getHoliday(dateStr, center.country)
      allAssignments.push(makeAssignment(dateStr, center, person, we, hol))
      used[person.id]++
      lastWorked[person.id] = dateStr
      if (we || hol) lastSpecial[person.id] = dateStr
      weekCount[wk(person.id, dateStr)] = (weekCount[wk(person.id, dateStr)] || 0) + 1
      // Rule 3: block next day after Sunday or holiday
      if (isSunday(dateStr) || !!hol) blockNextDay(person.id, dateStr)
    }

    const byName = (a, b) => (a.name || '').localeCompare(b.name || '') || String(a.id).localeCompare(String(b.id))
    const onDay = (personId, d) => allAssignments.some((a) => a.date === d && a.center === center.id && a.personId === personId)

    // ── Step 1: special days (weekends + holidays) ────────────────────────
    // Exactly 1 person per day (Rule 2) — no 2nd person is added even if
    // capacity allows, so weekend/holiday coverage stays at the minimum.
    // Each day is re-ranked (Rule 2a) so the load rotates instead of landing
    // on one person; Rule 2b skips whoever worked the day before. Rule 3
    // still takes priority: if everyone is hard-blocked, the day is left
    // unassigned rather than broken.
    const progress = (p) => target[p.id] > 0 ? used[p.id] / target[p.id] : Infinity
    const specialUsed = Object.fromEntries(pool.map((p) => [p.id, 0]))
    const specialLoad = (p) => (hist(p.id).specialBalance || 0) + specialUsed[p.id] / Math.max(avail[p.id], 0.1)
    const specialDays = days.filter((d) => isSpecialDay(d, center))

    // A Sunday/holiday costs the next day off (Rule 3), which can stop someone reaching a raised
    // target. So among equally loaded people, Sundays/holidays go to whoever is owed the fewest
    // days and Saturdays to whoever is owed the most.
    const owed = (p) => creditTarget[p.id] - STANDARD_DAYS
    for (const dateStr of specialDays) {
      const costsRestDay = isSunday(dateStr) || !!getHoliday(dateStr, center.country)
      const ranked = [...pool].sort((a, b) =>
        (specialLoad(a) - specialLoad(b))
        || (costsRestDay ? owed(a) - owed(b) : owed(b) - owed(a))
        || lastSpecial[a.id].localeCompare(lastSpecial[b.id]) // longest since last weekend/holiday first
        || (progress(a) - progress(b))
        || byName(a, b))
      const free = ranked.filter((p) => canWork(p.id, dateStr))
      const workedDayBefore = (p) => onDay(p.id, prevDay(dateStr))
      const pick =
        free.find((p) => !onBirthday(p, dateStr) && !workedDayBefore(p)) // rotate + no back-to-back
        || free.find((p) => !onBirthday(p, dateStr))      // back-to-back only if nobody else is free
        || free.find((p) => !workedDayBefore(p))          // birthday only as a last resort (Rule 6)
        || free[0]
        // else: everyone hard-blocked (Rule 3) or at 40h (Rule 4a) → leave the day unassigned
      if (pick) {
        assign(dateStr, pick)
        specialUsed[pick.id]++
      }
    }

    // ── Step 2: weekdays (Mon–Fri, non-holiday), min 2 per day ────────────
    // Rule 4b: ranked by progress towards each person's own target, then by who worked least
    // recently. (Rule 3 priority: no fallback ignores isBlocked/the cap — a slot is left open
    // rather than assigning someone who just earned a day off.)
    const trueWeekdays = days.filter((d) => !isSpecialDay(d, center))
    const weekdayRank = (a, b) =>
      (progress(a) - progress(b))
      || lastWorked[a.id].localeCompare(lastWorked[b.id])
      || ((hist(a.id).dayBalance || 0) - (hist(b.id).dayBalance || 0)) // owed days first
      || byName(a, b)

    function fillWeekday(dateStr) {
      const alreadyOn = new Set(
        allAssignments.filter((a) => a.date === dateStr && a.center === center.id).map((a) => a.personId)
      )
      const sorted = [...pool].sort(weekdayRank)
      const ok = (p) => !alreadyOn.has(p.id) && canWork(p.id, dateStr)
      const pick = sorted.find((p) => ok(p) && !onBirthday(p, dateStr) && used[p.id] < target[p.id])
               || sorted.find((p) => ok(p) && !onBirthday(p, dateStr))
               || sorted.find(ok) // birthday only as a last resort (Rule 6)
      if (pick) assign(dateStr, pick)
    }

    // Pass A: first person on each weekday; Pass B: second person (enforce min 2)
    for (const dateStr of trueWeekdays) fillWeekday(dateStr)
    for (const dateStr of trueWeekdays) {
      if (allAssignments.filter((a) => a.date === dateStr && a.center === center.id).length < 2) fillWeekday(dateStr)
    }

    // ── Step 3: top up anyone still under their target ────────────────────
    // Biggest gap first (people owed days get first go). Extra shifts go on the weekdays with the
    // fewest people, spread across the month.
    const byGap = [...pool].sort((a, b) => (target[b.id] - used[b.id]) - (target[a.id] - used[a.id]) || byName(a, b))
    const staffOn = (d) => allAssignments.filter((a) => a.date === d && a.center === center.id).length
    for (const person of byGap) {
      let gap = target[person.id] - used[person.id]
      if (gap <= 0) continue
      // Never top up onto a birthday (Rule 6) — these are extra shifts, not needed coverage.
      const available = trueWeekdays.filter((d) => canWork(person.id, d) && !onDay(person.id, d) && !onBirthday(person, d))
      // Re-check the week cap at assignment time — earlier top-ups in this loop can fill a week.
      const tryAssign = (d) => { if (gap > 0 && canWork(person.id, d) && !onDay(person.id, d)) { assign(d, person); gap-- } }
      const step = Math.max(1, Math.floor(available.length / gap))
      const spread = []
      for (let i = 0; i < available.length; i += step) spread.push(available[i])
      for (const d of spread.sort((a, b) => staffOn(a) - staffOn(b) || a.localeCompare(b))) tryAssign(d)
      for (const d of available) tryAssign(d) // fill whatever the spread pass had to skip
    }
  }

  // ── Fairness snapshot (cumulative totals; kept for older readers) ─────────
  // With pastSchedules the totals come straight from the saved schedules, so they're correct even
  // when a month in between is missing or was edited by hand.
  const fairnessSnapshot = {}
  for (const p of people) {
    let prev = fairness[p.id] || { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
    if (history) {
      prev = { weekendTotal: 0, holidayTotal: 0, totalDays: 0 }
      for (const rows of Object.values(history)) {
        const h = rows[p.id]
        if (!h) continue
        prev.weekendTotal += h.special; prev.holidayTotal += h.holidays; prev.totalDays += h.days
      }
    }
    const mWe  = allAssignments.filter((a) => a.personId === p.id && (a.isWeekend || a.isHoliday)).length
    const mHol = allAssignments.filter((a) => a.personId === p.id && a.isHoliday).length
    const mTot = allAssignments.filter((a) => a.personId === p.id).length
    fairnessSnapshot[p.id] = {
      weekendTotal: (prev.weekendTotal || 0) + mWe,
      holidayTotal: (prev.holidayTotal || 0) + mHol,
      totalDays:    (prev.totalDays   || 0) + mTot,
    }
  }

  return { assignments: allAssignments, fairnessSnapshot, balances }
}
