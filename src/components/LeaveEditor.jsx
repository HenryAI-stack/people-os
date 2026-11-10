import React, { useEffect, useMemo, useState } from 'react'
import { directReportsStore } from '../lib/dataStore'
import { CENTERS, getCenter, SCHEDULE_TEAM } from '../lib/scheduleGenerator.js'
import { getHoliday, isWeekend } from '../lib/holidays.js'
import { LEAVE_TYPES, leaveType, leaveList, leaveOn, addLeave, removeLeave, datesBetween, nextDate } from '../lib/leave.js'

// Dates are plain 'YYYY-MM-DD' strings; formatting reads them as UTC so the day never shifts.
const fmt = (d, withYear) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB',
  { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
export function fmtLeaveRange(l) {
  if (l.from === l.to) return fmt(l.from, true)
  return `${fmt(l.from, l.from.slice(0, 4) !== l.to.slice(0, 4))} – ${fmt(l.to, true)}`
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isSpecial = (d, center) => isWeekend(d) || (center && !!getHoliday(d, center.country))
/** Leave weekdays in a range — the days that count as worked on the work schedule. */
export function leaveWorkdays(l, center) {
  return datesBetween(l.from, l.to).filter((d) => !isSpecial(d, center)).length
}

/** "23–24 Dec, 29 Dec" from sorted dates (consecutive dates joined). */
function compactDates(dates) {
  const groups = []
  for (const d of dates) {
    const last = groups[groups.length - 1]
    if (last && nextDate(last.to) === d) last.to = d
    else groups.push({ from: d, to: d })
  }
  const shown = groups.slice(0, 4).map((g) => g.from === g.to ? fmt(g.from) : `${fmt(g.from)}–${fmt(g.to)}`)
  return shown.join(', ') + (groups.length > 4 ? ` +${groups.length - 4} more` : '')
}

/**
 * "Vacation & sick days" section of the direct-report form. Edits `value` (the person's `leave`
 * array) through onChange; nothing is saved until the form is. While picking dates it warns when
 * the person's support center would drop below the work schedule's minimum staffing (2 on
 * weekdays, 1 on weekends/holidays), counting active 24/7 colleagues not already on leave.
 */
export function LeaveEditor({ person, value, onChange }) {
  const [type, setType] = useState('vacation')
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [note, setNote] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [colleagues, setColleagues] = useState(null)

  const center = CENTERS.find((c) => c.id === getCenter(person))
  const entries = leaveList({ leave: value })
  const today = todayStr()
  const cutoff = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` // older than a year → collapsed
  const old = entries.filter((l) => l.to < cutoff)
  const shown = showOld ? entries : entries.filter((l) => l.to >= cutoff)

  useEffect(() => {
    if (!center) return
    let alive = true
    directReportsStore.list().then((all) => alive && setColleagues(
      all.filter((p) => p.id !== person.id && getCenter(p) === center.id
        && (p.status || 'active') === 'active' && p.team === SCHEDULE_TEAM)
    )).catch(() => alive && setColleagues([]))
    return () => { alive = false }
  }, [center?.id, person.id])

  const rangeTo = to && to >= from ? to : from
  const valid = !!from && (!to || to >= from)

  // Days in the picked range where the center would be short-staffed with this person away.
  const shortDays = useMemo(() => {
    if (!valid || !center || !colleagues) return []
    return datesBetween(from, rangeTo).filter((d) => {
      const others = colleagues.filter((p) => !leaveOn(p, d)).length
      return others < (isSpecial(d, center) ? 1 : 2)
    })
  }, [valid, from, rangeTo, center, colleagues])

  function add() {
    if (!valid) return
    onChange(addLeave({ leave: value }, { from, to: rangeTo, type, note }))
    setFrom(''); setTo(''); setNote('')
  }

  return (
    <div className="field leave-editor">
      <label>Vacation &amp; sick days</label>
      {shown.length === 0 && !old.length && (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 8 }}>None recorded.</div>
      )}
      {shown.map((l) => {
        const t = leaveType(l.type)
        const n = leaveWorkdays(l, center)
        return (
          <div key={l.id} className={`leave-row ${l.to < today ? 'is-past' : ''}`}>
            <span title={t.label}>{t.icon}</span>
            <span className="leave-range">{fmtLeaveRange(l)}</span>
            <span className="leave-meta">{n} workday{n === 1 ? '' : 's'}{l.note ? ` · ${l.note}` : ''}</span>
            <button type="button" className="ws-clear-btn" title="Remove" onClick={() => onChange(removeLeave({ leave: value }, l.id))}>✕</button>
          </div>
        )
      })}
      {old.length > 0 && (
        <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '3px 8px', marginBottom: 6 }}
          onClick={() => setShowOld((v) => !v)}>
          {showOld ? 'Hide older entries' : `Show ${old.length} older ${old.length === 1 ? 'entry' : 'entries'}`}
        </button>
      )}

      <div className="leave-add">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          {Object.entries(LEAVE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
        </select>
        <input type="date" value={from} aria-label="From"
          onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value) }} />
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>to</span>
        <input type="date" value={to} min={from || undefined} aria-label="To" onChange={(e) => setTo(e.target.value)} />
        <input value={note} placeholder="Note (optional)" aria-label="Note" onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn" disabled={!valid} onClick={add}>+ Add</button>
      </div>
      {valid && center && shortDays.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6 }}>
          ⚠ {center.id} would be short-staffed on {compactDates(shortDays)}: other 24/7 colleagues there are
          away too (weekdays need 2, weekends/holidays 1). You can still add it.
        </div>
      )}
      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
        {center
          ? 'The work schedule keeps these days free; weekdays count as worked days.'
          : 'Set a Bangalore, Warsaw or Mexico City location for these to affect the work schedule.'}
        {' '}Saved with the form.
      </span>
    </div>
  )
}
