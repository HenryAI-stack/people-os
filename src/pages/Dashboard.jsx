import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { directReportsStore, interviewsStore, notesStore, followUpsStore, schedulesStore } from '../lib/dataStore'
import { getShiftTimeline, fmtDuration } from '../lib/onDuty.js'
import { Avatar } from './DirectReports.jsx'
import { urgencyLabel } from './FollowUps.jsx'
import { getCountryCode, flagUrl } from '../lib/locationFlag.js'
import { nextBirthday, lastBirthday } from '../lib/birthdays.js'
import { lastOneOnOne, cadenceBadge, isOverdue, CADENCE_DAYS } from '../lib/cadence.js'

function nextAnniversary(startDateStr) {
  if (!startDateStr) return null
  const start = new Date(startDateStr)
  if (isNaN(start.getTime())) return null
  const today = new Date(); today.setHours(0,0,0,0)
  let candidate = new Date(today.getFullYear(), start.getMonth(), start.getDate())
  if (candidate < today) candidate = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate())
  const years = candidate.getFullYear() - start.getFullYear()
  const daysUntil = Math.round((candidate - today) / 86400000)
  return { date: candidate, years, daysUntil }
}

// Most recent anniversary strictly before today. Splits the 'YYYY-MM-DD' string rather than
// parsing it with new Date(str), which reads it as UTC midnight.
function prevAnniversary(startDateStr) {
  const [y, m, d] = (startDateStr || '').split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date(); today.setHours(0,0,0,0)
  let candidate = new Date(today.getFullYear(), m - 1, d)
  if (candidate >= today) candidate = new Date(today.getFullYear() - 1, m - 1, d)
  const years = candidate.getFullYear() - y
  if (years < 1) return null
  const daysAgo = Math.round((today - candidate) / 86400000)
  return { date: candidate, years, daysAgo }
}

function pastLabel(d) {
  if (d === 1) return 'Yesterday'
  if (d <= 14) return `${d} days ago`
  if (d <= 60) return `${Math.round(d/7)} weeks ago`
  return `${Math.round(d/30)} months ago`
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

function daysLabel(d) {
  if (d === 0) return 'Today 🎉'
  if (d === 1) return 'Tomorrow'
  if (d <= 14) return `In ${d} days`
  if (d <= 60) return `In ${Math.round(d/7)} weeks`
  return `In ${Math.round(d/30)} months`
}

function urgencyClass(days) {
  if (days <= 7)  return 'bad'
  if (days <= 30) return 'warn'
  return ''
}

function FlagImg({ location }) {
  const c = getCountryCode(location)
  if (!c) return null
  return <img src={flagUrl(c)} alt={c} style={{ width:20, height:15, objectFit:'cover', borderRadius:2, verticalAlign:'middle', marginLeft:4 }} />
}

const COLUMN_HEADING = { fontSize:12.5, fontWeight:600, color:'var(--text-dim)', marginBottom:8 }

// Shared row for the anniversaries/birthdays columns. `past` = the greyed-out "most recent" row.
// Half-width columns are tight, so location shows as just the flag next to the name.
function EventRow({ person, sub, badge, badgeCls = '', past = false, onClick }) {
  return (
    <div className="row-card" onClick={onClick} style={{ cursor:'pointer', opacity: past ? 0.5 : 1 }}
      title={past ? 'Most recent — already passed' : undefined}>
      <div className="row-main" style={{ minWidth:0 }}>
        <Avatar photo={person.photo} name={person.name} size={34} />
        <div style={{ minWidth:0 }}>
          <div className="row-title">{person.name}<FlagImg location={person.location} /></div>
          <div className="row-sub">{sub}</div>
        </div>
      </div>
      <span className={`badge ${badgeCls}`} style={{ flexShrink:0, whiteSpace:'nowrap' }}>{badge}</span>
    </div>
  )
}

function fmtShiftDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' })
}

function fmtViewerTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
}

function ShiftBlock({ shift, now, kind, photoById }) {
  const rel = kind === 'now'      ? `ends in ${fmtDuration(shift.end - now)}`
            : kind === 'previous' ? `ended ${fmtDuration(now - shift.end)} ago`
            :                       `starts in ${fmtDuration(shift.start - now)}`
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:14 }}>
        <img src={flagUrl(shift.center.country)} alt={shift.center.country} style={{ width:20, height:15, objectFit:'cover', borderRadius:2 }} />
        {shift.center.id}
      </div>
      <div style={{ fontSize:12, color:'var(--text-dim)', margin:'3px 0 8px' }}>
        <div>{fmtShiftDay(shift.date)} · {shift.center.hours} local</div>
        <div style={{ color:'var(--text-faint)' }}>{fmtViewerTime(shift.start)}–{fmtViewerTime(shift.end)} your time · {rel}</div>
      </div>
      {shift.people.length === 0
        ? <div style={{ fontSize:13, color:'var(--bad)' }}>No one scheduled</div>
        : shift.people.map((p) => (
            <div key={p.personId} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <Avatar photo={photoById[p.personId]} name={p.personName} size={26} />
              <span style={{ fontSize:13.5 }}>{p.personName}</span>
            </div>
          ))}
    </div>
  )
}

const DUTY_LABEL = { previous:'Before', now:'On duty now', next:'Up next' }

function ShiftCard({ kind, shifts, now, photoById, nextShift, onClick }) {
  const isNow = kind === 'now'
  return (
    <div className="card" onClick={onClick}
      style={{ cursor:'pointer', opacity: kind === 'previous' ? 0.55 : 1, borderColor: isNow ? 'var(--accent)' : undefined }}>
      <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:'0.5px', textTransform:'uppercase', color: isNow ? 'var(--accent)' : 'var(--text-faint)' }}>
        {isNow && shifts.length > 0 && '● '}{DUTY_LABEL[kind]}
      </div>
      {shifts.length > 0
        ? shifts.map((s) => <ShiftBlock key={`${s.center.id}|${s.date}`} shift={s} now={now} kind={kind} photoById={photoById} />)
        : <div style={{ fontSize:13, color:'var(--text-dim)', marginTop:8 }}>
            {isNow
              ? <>No shift running right now — a gap in coverage.{nextShift && <> {nextShift.center.id} starts in {fmtDuration(nextShift.start - now)}.</>}</>
              : '—'}
          </div>}
    </div>
  )
}

export default function Dashboard() {
  const [reports,    setReports]    = useState([])
  const [interviews, setInterviews] = useState([])
  const [notes,      setNotes]      = useState([])
  const [followUps,  setFollowUps]  = useState([])
  const [schedules,  setSchedules]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [now,        setNow]        = useState(() => new Date())
  const navigate = useNavigate()

  useEffect(() => {
    ;(async () => {
      try {
        const [r, i, n, f, s] = await Promise.all([
          directReportsStore.list(), interviewsStore.list(),
          notesStore.list(), followUpsStore.list(), schedulesStore.list(),
        ])
        setReports([...r].sort((a, b) => a.name.localeCompare(b.name))); setInterviews(i); setNotes(n); setFollowUps(f); setSchedules(s)
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [])

  // Re-evaluate "on duty now" every minute so shift handovers show up without a reload.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const duty = getShiftTimeline(schedules, now)
  const photoById = Object.fromEntries(reports.map((r) => [r.id, r.photo]))

  const activeCount      = reports.filter((r) => r.status === 'active').length
  const last30           = interviews.filter((i) => isWithinDays(i.date, 30)).length
  // Newest *conducted* first: 'YYYY-MM-DD' strings sort correctly as plain strings (no Date
  // parsing). Same day → most recently logged first; undated entries go last.
  const recentInterviews = [...interviews]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5)

  const upcomingAnniversaries = reports
    .filter((r) => r.startDate)
    .map((r) => ({ ...r, ann: nextAnniversary(r.startDate) }))
    .filter((r) => r.ann !== null)
    .sort((a, b) => a.ann.daysUntil - b.ann.daysUntil)
    .slice(0, 3)

  const activeReports = reports.filter((r) => r.status === 'active')
  const overdueOneOnOnes = activeReports
    .map((r) => ({ ...r, last: lastOneOnOne(r, interviews) }))
    .filter((r) => isOverdue(r.last))
    .sort((a, b) => (b.last ? b.last.daysAgo : Infinity) - (a.last ? a.last.daysAgo : Infinity))
    .slice(0, 5)

  const upcomingBirthdays = reports
    .filter((r) => r.birthday)
    .map((r) => ({ ...r, bday: nextBirthday(r.birthday) }))
    .filter((r) => r.bday !== null)
    .sort((a, b) => a.bday.daysUntil - b.bday.daysUntil)
    .slice(0, 3)

  const mostRecent = (list, fn) => list
    .map((r) => ({ ...r, past: fn(r) }))
    .filter((r) => r.past)
    .sort((a, b) => a.past.daysAgo - b.past.daysAgo)[0] || null
  const lastAnn  = mostRecent(reports.filter((r) => r.startDate), (r) => prevAnniversary(r.startDate))
  const lastBday = mostRecent(reports.filter((r) => r.birthday),  (r) => lastBirthday(r.birthday))

  return (
    <>
      <div className="page-header"><h1>Dashboard</h1><p>Your team, at a glance.</p></div>

      {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:20, padding:'10px 14px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>Couldn't load data — {error}</div>}

      <div className="grid cols-3">
        <div className="card stat-card"><div className="label">Direct reports</div><div className="value">{loading ? '–' : reports.length}</div><div className="sub">{loading ? '' : `${activeCount} active`}</div></div>
        <div className="card stat-card"><div className="label">Logged conversations</div><div className="value">{loading ? '–' : interviews.length}</div><div className="sub">{loading ? '' : `${last30} in the last 30 days`}</div></div>
        <div className="card stat-card"><div className="label">Notes saved</div><div className="value">{loading ? '–' : notes.length}</div><div className="sub">{loading ? '' : `${notes.filter((n) => n.pinned).length} pinned`}</div></div>
      </div>

      <div className="section-title" style={{ display:'flex', justifyContent:'space-between' }}>
        🌍 24/7 on duty
        <Link to="/work-schedule" style={{ fontSize:12, fontWeight:400, color:'var(--accent)', textTransform:'none', letterSpacing:0 }}>Work schedule →</Link>
      </div>
      {!loading && !duty.hasSchedule
        ? <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>No work schedule saved yet — <Link to="/work-schedule">generate one</Link> to see who's on duty.</div>
        : (
          <div className="grid cols-3" style={{ alignItems:'start', marginBottom:28 }}>
            <ShiftCard kind="previous" shifts={duty.previous ? [duty.previous] : []} now={now} photoById={photoById} onClick={() => navigate('/work-schedule')} />
            <ShiftCard kind="now" shifts={duty.current} now={now} photoById={photoById} nextShift={duty.next} onClick={() => navigate('/work-schedule')} />
            <ShiftCard kind="next" shifts={duty.next ? [duty.next] : []} now={now} photoById={photoById} onClick={() => navigate('/work-schedule')} />
          </div>
        )}

      {/* Follow-ups alert */}
      {(() => {
        const today = new Date().setHours(0,0,0,0)
        const overdue = followUps.filter(f => !f.done && f.dueDate && new Date(f.dueDate) < today)
        const dueThisWeek = followUps.filter(f => !f.done && f.dueDate && new Date(f.dueDate) >= today && new Date(f.dueDate) <= today + 7*86400000)
        const urgent = [...overdue, ...dueThisWeek].sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate)).slice(0,4)
        if (urgent.length === 0) return null
        return (
          <>
            <div className="section-title" style={{ display:'flex', justifyContent:'space-between' }}>
              📋 Follow-ups due soon
              <Link to="/follow-ups" style={{ fontSize:12, fontWeight:400, color:'var(--accent)', textTransform:'none', letterSpacing:0 }}>View all →</Link>
            </div>
            <div className="list" style={{ marginBottom:28 }}>
              {urgent.map((f) => {
                const urg = urgencyLabel(f.dueDate, false)
                return (
                  <div className="row-card" key={f.id} onClick={() => navigate('/follow-ups')} style={{ cursor:'pointer' }}>
                    <div className="row-main"><div><div className="row-title">{f.text}</div><div className="row-sub">{f.personName && `👤 ${f.personName}`}</div></div></div>
                    <span className={`badge ${urg.cls}`}>{urg.label}</span>
                  </div>
                )
              })}
            </div>
          </>
        )
      })()}

      <div className="section-title">🎉 Anniversaries & birthdays</div>
      <div className="grid cols-2" style={{ alignItems:'start' }}>
        <div>
          <div style={COLUMN_HEADING}>🎂 Anniversaries</div>
          {!loading && !lastAnn && upcomingAnniversaries.length === 0 && <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>No anniversaries — add start dates to your <Link to="/direct-reports">direct reports</Link>.</div>}
          <div className="list">
            {lastAnn && (
              <EventRow person={lastAnn} past onClick={() => navigate(`/direct-reports/${lastAnn.id}`)}
                sub={`${ordinal(lastAnn.past.years)} anniversary · ${formatDate(lastAnn.past.date)}`}
                badge={pastLabel(lastAnn.past.daysAgo)} />
            )}
            {upcomingAnniversaries.map((r) => (
              <EventRow key={r.id} person={r} onClick={() => navigate(`/direct-reports/${r.id}`)}
                sub={`${ordinal(r.ann.years)} anniversary · ${formatDate(r.ann.date)}`}
                badge={daysLabel(r.ann.daysUntil)} badgeCls={urgencyClass(r.ann.daysUntil)} />
            ))}
          </div>
        </div>
        <div>
          <div style={COLUMN_HEADING}>🎈 Birthdays</div>
          {!loading && !lastBday && upcomingBirthdays.length === 0 && <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>No birthdays — add them on your <Link to="/direct-reports">direct reports</Link>.</div>}
          <div className="list">
            {lastBday && (
              <EventRow person={lastBday} past onClick={() => navigate(`/direct-reports/${lastBday.id}`)}
                sub={`${formatDate(lastBday.past.date)}${lastBday.past.age != null ? ` · turned ${lastBday.past.age}` : ''}`}
                badge={pastLabel(lastBday.past.daysAgo)} />
            )}
            {upcomingBirthdays.map((r) => (
              <EventRow key={r.id} person={r} onClick={() => navigate(`/direct-reports/${r.id}`)}
                sub={`${formatDate(r.bday.date)}${r.bday.turningAge != null ? ` · turning ${r.bday.turningAge}` : ''}`}
                badge={daysLabel(r.bday.daysUntil)} badgeCls={urgencyClass(r.bday.daysUntil)} />
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">🗣️ 1:1s overdue <span style={{ marginLeft:6, fontWeight:400, color:'var(--text-faint)', textTransform:'none', letterSpacing:0, fontSize:12 }}>no 1:1 in the last {CADENCE_DAYS} days</span></div>
      {!loading && activeReports.length > 0 && overdueOneOnOnes.length === 0 && <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>Everyone's had a 1:1 in the last {CADENCE_DAYS} days ✓</div>}
      <div className="list">
        {overdueOneOnOnes.map((r) => {
          const b = cadenceBadge(r.last)
          return (
            <div className="row-card" key={r.id} onClick={() => navigate(`/direct-reports/${r.id}`)} style={{ cursor:'pointer' }}>
              <div className="row-main">
                <Avatar photo={r.photo} name={r.name} size={34} />
                <div>
                  <div className="row-title">{r.name}</div>
                  <div className="row-sub">{r.last ? `Last 1:1 on ${r.last.date}` : 'No 1:1 logged yet'}{r.role && ` · ${r.role}`}</div>
                </div>
              </div>
              <span className={`badge ${b.cls}`}>{b.label}</span>
            </div>
          )
        })}
      </div>

      <div className="section-title">Recent conversations</div>
      {!loading && recentInterviews.length === 0 && <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>No conversations yet. <Link to="/interviews">Log your first one →</Link></div>}
      <div className="list">
        {recentInterviews.map((it) => (
          <div className="row-card" key={it.id}
            onClick={() => it.personId
              ? navigate(`/direct-reports/${it.personId}`, { state: { expandInterview: it.id } })
              : navigate('/interviews', { state: { expandInterview: it.id } })}
            style={{ cursor:'pointer' }}>
            <div className="row-main"><div>
              <div className="row-title">{it.title}</div>
              <div className="row-sub">{it.person ? `${it.person} · ` : ''}{it.date}</div>
              {it.tags && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                  {it.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span className="badge" key={t} style={{ fontSize:10.5, padding:'2px 7px' }}>{t}</span>
                  ))}
                </div>
              )}
            </div></div>
            <div className="row-actions" style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              {it.faceToFace && <span className="badge good" title="Face-to-face meeting">🤝 Face-to-face</span>}
              <span className="badge">{it.type}</span>
            </div>
          </div>
        ))}
      </div>

    </>
  )
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const diff = (Date.now() - d.getTime()) / 86400000
  return diff >= 0 && diff <= days
}
