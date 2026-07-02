import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './DirectReports.jsx'
import { directReportsStore, interviewsStore, notesStore } from '../lib/dataStore'

// Given a startDate string, returns the next upcoming anniversary date
// and how many years it will be.
function nextAnniversary(startDateStr) {
  if (!startDateStr) return null
  const start = new Date(startDateStr)
  if (isNaN(start.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Try this calendar year's anniversary first
  let candidate = new Date(today.getFullYear(), start.getMonth(), start.getDate())
  // If it already passed this year, use next year
  if (candidate < today) {
    candidate = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate())
  }

  const years = candidate.getFullYear() - start.getFullYear()
  const daysUntil = Math.round((candidate - today) / 86400000)

  return { date: candidate, years, daysUntil }
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function daysLabel(d) {
  if (d === 0) return 'Today 🎉'
  if (d === 1) return 'Tomorrow'
  if (d <= 14) return `In ${d} days`
  if (d <= 60) return `In ${Math.round(d / 7)} weeks`
  return `In ${Math.round(d / 30)} months`
}

function urgencyClass(days) {
  if (days <= 7)  return 'bad'
  if (days <= 30) return 'warn'
  return ''
}

export default function Dashboard() {
  const [reports,    setReports]    = useState([])
  const [interviews, setInterviews] = useState([])
  const [notes,      setNotes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [r, i, n] = await Promise.all([
          directReportsStore.list(),
          interviewsStore.list(),
          notesStore.list(),
        ])
        setReports(r)
        setInterviews(i)
        setNotes(n)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const activeCount      = reports.filter((r) => r.status === 'active').length
  const last30           = interviews.filter((i) => isWithinDays(i.date, 30)).length
  const recentInterviews = interviews.slice(0, 5)

  // Next 3 upcoming anniversaries
  const upcomingAnniversaries = reports
    .filter((r) => r.startDate)
    .map((r) => ({ ...r, ann: nextAnniversary(r.startDate) }))
    .filter((r) => r.ann !== null)
    .sort((a, b) => a.ann.daysUntil - b.ann.daysUntil)
    .slice(0, 3)

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your team, at a glance.</p>
      </div>

      {error && (
        <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 20, padding: '10px 14px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
          Couldn't load data — check your GitHub token and repo settings. ({error})
        </div>
      )}

      {/* Stats */}
      <div className="grid cols-3">
        <div className="card stat-card">
          <div className="label">Direct reports</div>
          <div className="value">{loading ? '–' : reports.length}</div>
          <div className="sub">{loading ? '' : `${activeCount} active`}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Logged conversations</div>
          <div className="value">{loading ? '–' : interviews.length}</div>
          <div className="sub">{loading ? '' : `${last30} in the last 30 days`}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Notes saved</div>
          <div className="value">{loading ? '–' : notes.length}</div>
          <div className="sub">{loading ? '' : `${notes.filter((n) => n.pinned).length} pinned`}</div>
        </div>
      </div>

      {/* Upcoming anniversaries */}
      <div className="section-title">🎂 Upcoming anniversaries</div>
      {!loading && upcomingAnniversaries.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            No anniversaries to show — add start dates to your{' '}
            <Link to="/direct-reports">direct reports</Link>.
          </div>
        </div>
      )}
      {!loading && upcomingAnniversaries.length > 0 && (
        <div className="list">
          {upcomingAnniversaries.map((r) => (
            <div className="row-card" key={r.id}>
              <div className="row-main">
                <Avatar photo={r.photo} name={r.name} size={34} />
                <div>
                  <div className="row-title">{r.name}</div>
                  <div className="row-sub">
                    {ordinal(r.ann.years)} anniversary · {formatDate(r.ann.date)}
                  </div>
                </div>
              </div>
              <span className={`badge ${urgencyClass(r.ann.daysUntil)}`}>
                {daysLabel(r.ann.daysUntil)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent conversations */}
      <div className="section-title">Recent conversations</div>
      {!loading && recentInterviews.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            No conversations logged yet.{' '}
            <Link to="/interviews">Log your first one →</Link>
          </div>
        </div>
      )}
      <div className="list">
        {recentInterviews.map((it) => (
          <div className="row-card" key={it.id}>
            <div className="row-main">
              <div>
                <div className="row-title">{it.title}</div>
                <div className="row-sub">
                  {it.person ? `${it.person} · ` : ''}{it.date}
                </div>
              </div>
            </div>
            <span className="badge">{it.type}</span>
          </div>
        ))}
      </div>

      {/* Team list */}
      <div className="section-title">Your team</div>
      {!loading && reports.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            No direct reports added yet.{' '}
            <Link to="/direct-reports">Add your first one →</Link>
          </div>
        </div>
      )}
      <div className="list">
        {reports.slice(0, 6).map((p) => (
          <div className="row-card" key={p.id}>
            <div className="row-main">
              <Avatar photo={p.photo} name={p.name} size={34} />
              <div>
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{p.role}</div>
              </div>
            </div>
            <span className={`badge ${p.status === 'active' ? 'good' : 'warn'}`}>
              {p.status}
            </span>
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
