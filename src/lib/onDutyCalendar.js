// Builds the SharePoint "On-duty calendar" entries for one month of the work schedule:
// one entry per center per day, e.g. "Bangalore: Ravi Kumar, Priya Sharma", spanning that
// center's shift (its own local hours → absolute UTC instants, so the calendar shows it in
// every viewer's own time zone). The Graph writing lives in msGraph.js (syncOnDutyCalendar);
// this module stays pure so it's easy to test.
import { CENTERS, centerHours } from './scheduleGenerator.js'
import { shiftWindow } from './onDuty.js'
import { localDateStr } from './worldClock.js'

/**
 * Tag written into each entry's description so a re-upload can find and replace exactly the
 * entries PeopleOS created for that month — and never touch entries people added by hand.
 */
export function calendarMarker(month) { return `[PeopleOS ${month}]` }

/** → [{ center, date, title, start, end (ISO UTC), location, description }], by date then center. */
export function buildOnDutyEntries(month, schedule) {
  const names = {}
  for (const a of schedule?.assignments || []) {
    if (a.cleared || !a.date?.startsWith(month)) continue
    ;(names[`${a.date}|${a.center}`] ||= []).push(a.personName)
  }
  const dates = [...new Set(Object.keys(names).map((k) => k.split('|')[0]))].sort()
  const entries = []
  for (const date of dates) {
    for (const center of CENTERS) {
      const people = names[`${date}|${center.id}`]
      const win = people?.length && shiftWindow(center, date)
      if (!win) continue
      entries.push({
        center: center.id,
        date,
        title: `${center.id}: ${people.join(', ')}`,
        start: new Date(win.start).toISOString(),
        end: new Date(win.end).toISOString(),
        location: center.label,
        description: `24/7 on duty, ${centerHours(center, date)} ${center.label} local time. ${calendarMarker(month)} Created by PeopleOS from the uploaded work schedule.`,
      })
    }
  }
  return entries
}

/**
 * Plans an update-only-what-changed sync. `existing` = this month's PeopleOS entries already in the
 * calendar: [{ id, title, start, end?, location? }] with start/end as epoch ms (end/location left
 * undefined when the calendar has no such column). Entries are matched by center (title prefix) +
 * that center's local calendar day of `start`, so a day whose hours changed is updated, not
 * re-created. Unchanged days aren't touched at all: on a group calendar every write emails the
 * members who follow the group in their inbox.
 * → { creates: [entry], updates: [{ id, entry }], deletes: [id], unchanged: number }
 */
export function planCalendarDiff(entries, existing) {
  const byKey = {}
  const deletes = []
  for (const ev of existing) {
    const center = CENTERS.find((c) => String(ev.title || '').startsWith(`${c.id}: `))
    if (!center || !Number.isFinite(ev.start)) { deletes.push(ev.id); continue }
    const key = `${center.id}|${localDateStr(center.tz, new Date(ev.start))}`
    if (byKey[key]) deletes.push(ev.id) // a duplicate, e.g. left by an interrupted earlier upload
    else byKey[key] = ev
  }
  const creates = [], updates = []
  let unchanged = 0
  for (const e of entries) {
    const key = `${e.center}|${e.date}`
    const ev = byKey[key]
    if (!ev) { creates.push(e); continue }
    delete byKey[key]
    const same = ev.title === e.title && ev.start === Date.parse(e.start)
      && (ev.end === undefined || ev.end === Date.parse(e.end))
      && (ev.location === undefined || ev.location === e.location)
    if (same) unchanged++
    else updates.push({ id: ev.id, entry: e })
  }
  deletes.push(...Object.values(byKey).map((ev) => ev.id)) // days no longer in the schedule
  return { creates, updates, deletes, unchanged }
}
