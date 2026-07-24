import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { directReportsStore, interviewsStore, notesStore, followUpsStore } from '../lib/dataStore'
import { Avatar } from './DirectReports.jsx'
import { urgencyLabel } from './FollowUps.jsx'
import { getCountryCode, flagUrl } from '../lib/locationFlag.js'

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

export default function Dashboard() {
  const [reports,    setReports]    = useState([])
  const [interviews, setInterviews] = useState([])
  const [notes,      setNotes]      = useState([])
  const [followUps,  setFollowUps]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    ;(async () => {
      try {
        const [r, i, n, f] = await Promise.all([
          directReportsStore.list(), interviewsStore.list(),
          notesStore.list(), followUpsStore.list(),
        ])
        setReports(r); setInterviews(i); setNotes(n); setFollowUps(f)
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [])

  const activeCount      = reports.filter((r) => r.status === 'active').length
  const last30           = interviews.filter((i) => isWithinDays(i.date, 30)).length
  const recentInterviews = interviews.slice(0, 5)

  const upcomingAnniversaries = reports
    .filter((r) => r.startDate)
    .map((r) => ({ ...r, ann: nextAnniversary(r.startDate) }))
    .filter((r) => r.ann !== null)
    .sort((a, b) => a.ann.daysUntil - b.ann.daysUntil)
    .slice(0, 3)

  return (
    <>
      <div className="page-header"><h1>Dashboard</h1><p>Your team, at a glance.</p></div>

      {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:20, padding:'10px 14px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>Couldn't load data — {error}</div>}

      <div className="grid cols-3">
        <div className="card stat-card"><div className="label">Direct reports</div><div className="value">{loading ? '–' : reports.length}</div><div className="sub">{loading ? '' : `${activeCount} active`}</div></div>
        <div className="card stat-card"><div className="label">Logged conversations</div><div className="value">{loading ? '–' : interviews.length}</div><div className="sub">{loading ? '' : `${last30} in the last 30 days`}</div></div>
        <div className="card stat-card"><div className="label">Notes saved</div><div className="value">{loading ? '–' : notes.length}</div><div className="sub">{loading ? '' : `${notes.filter((n) => n.pinned).length} pinned`}</div></div>
      </div>

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

      <div className="section-title">🎂 Upcoming anniversaries</div>
      {!loading && upcomingAnniversaries.length === 0 && <div style={{ fontSize:13, color:'var(--text-faint)', padding:'12px 0' }}>No anniversaries — add start dates to your <Link to="/direct-reports">direct reports</Link>.</div>}
      <div className="list">
        {upcomingAnniversaries.map((r) => (
          <div className="row-card" key={r.id} onClick={() => navigate(`/direct-reports/${r.id}`)} style={{ cursor:'pointer' }}>
            <div className="row-main">
              <Avatar photo={r.photo} name={r.name} size={34} />
              <div>
                <div className="row-title">{r.name}</div>
                <div className="row-sub">{ordinal(r.ann.years)} anniversary · {formatDate(r.ann.date)}{r.location && <> · {r.location}<FlagImg location={r.location} /></>}</div>
              </div>
            </div>
            <span className={`badge ${urgencyClass(r.ann.daysUntil)}`}>{daysLabel(r.ann.daysUntil)}</span>
          </div>
        ))}
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
            <span className="badge">{it.type}</span>
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
