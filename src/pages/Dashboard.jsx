import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { directReportsStore, interviewsStore, notesStore } from '../lib/dataStore'

export default function Dashboard() {
  const [reports, setReports] = useState([])
  const [interviews, setInterviews] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
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

  const activeCount = reports.filter((r) => r.status === 'active').length
  const last30 = interviews.filter((i) => isWithinDays(i.date, 30)).length
  const recentInterviews = interviews.slice(0, 5)

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your team, at a glance.</p>
      </div>

      {error && (
        <div className="login-error" style={{ marginBottom: 20 }}>
          Couldn't load data — check your GitHub token and repo settings. ({error})
        </div>
      )}

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

      <div className="section-title">Recent conversations</div>
      {!loading && recentInterviews.length === 0 && (
        <div className="empty-state">
          <div className="icon">🗣️</div>
          No conversations logged yet. <Link to="/interviews">Log your first one →</Link>
        </div>
      )}
      <div className="list">
        {recentInterviews.map((it) => (
          <div className="row-card" key={it.id}>
            <div className="row-main">
              <div>
                <div className="row-title">{it.title}</div>
                <div className="row-sub">{it.person ? `${it.person} · ` : ''}{it.date}</div>
              </div>
            </div>
            <span className="badge">{it.type}</span>
          </div>
        ))}
      </div>

      <div className="section-title">Your team</div>
      {!loading && reports.length === 0 && (
        <div className="empty-state">
          <div className="icon">👥</div>
          No direct reports added yet. <Link to="/direct-reports">Add your first one →</Link>
        </div>
      )}
      <div className="list">
        {reports.slice(0, 6).map((p) => (
          <div className="row-card" key={p.id}>
            <div className="row-main">
              <div className="avatar" />
              <div>
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{p.role}</div>
              </div>
            </div>
            <span className={`badge ${p.status === 'active' ? 'good' : 'warn'}`}>{p.status}</span>
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
