// Builds the SharePoint "On-duty calendar" entries for one month of the work schedule:
// one entry per center per day, e.g. "Bangalore: Ravi Kumar, Priya Sharma", spanning that
// center's shift (its own local hours → absolute UTC instants, so the calendar shows it in
// every viewer's own time zone). The Graph writing lives in msGraph.js (syncOnDutyCalendar);
// this module stays pure so it's easy to test.
import { CENTERS, centerHours } from './scheduleGenerator.js'
import { shiftWindow } from './onDuty.js'

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
