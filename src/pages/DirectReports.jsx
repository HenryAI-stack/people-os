import React, { useEffect, useMemo, useState } from 'react'
import { directReportsStore } from '../lib/dataStore'

const EMPTY = {
  name: '', role: '', team: '', startDate: '', level: '',
  location: '', status: 'active', email: '', notes: '',
}

export default function DirectReports() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [query,   setQuery]   = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setItems(await directReportsStore.list())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return items.filter((i) =>
      [i.name, i.role, i.team, i.location].join(' ').toLowerCase().includes(q)
    )
  }, [items, query])

  async function handleSave(record) {
    // throws on failure — ReportForm catches and displays the error
    await directReportsStore.upsert(record)
    setEditing(null)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Remove this direct report? This cannot be undone.')) return
    setError('')
    try {
      await directReportsStore.remove(id)
      load()
    } catch (e) {
      setError('Delete failed: ' + e.message)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Direct Reports</h1>
        <p>The people on your team — roles, tenure, and quick context at a glance.</p>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name, role, or team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>
          + Add direct report
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
          ⚠️ {error}
        </div>
      )}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && !error && (
        <div className="empty-state">
          <div className="icon">👥</div>
          No direct reports yet. Add your first team member to get started.
        </div>
      )}

      <div className="list">
        {filtered.map((p) => (
          <div className="row-card" key={p.id}>
            <div className="row-main">
              <div className="avatar" />
              <div>
                <div className="row-title">{p.name}</div>
                <div className="row-sub">
                  {p.role}{p.team ? ` · ${p.team}` : ''}{p.location ? ` · ${p.location}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`badge ${p.status === 'active' ? 'good' : 'warn'}`}>{p.status}</span>
              <button className="btn ghost" onClick={() => setEditing({ ...p })}>Edit</button>
              <button className="btn ghost danger" onClick={() => handleDelete(p.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <ReportForm
          key={editing.id || 'new'}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function ReportForm({ initial, onCancel, onSave }) {
  const [form,   setForm]   = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isNew = !initial.id

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })) }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message || 'Save failed — check your GitHub token and try again.')
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit}>
        <h2>{isNew ? 'Add direct report' : 'Edit direct report'}</h2>

        {error && (
          <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 14, padding: '10px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}

        <div className="field">
          <label>Full name</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label>Role / title</label>
          <input value={form.role} onChange={(e) => set('role', e.target.value)} />
        </div>
        <div className="field">
          <label>Team</label>
          <input value={form.team} onChange={(e) => set('team', e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="field">
          <label>Level / seniority</label>
          <input value={form.level} onChange={(e) => set('level', e.target.value)} placeholder="e.g. Senior, L4, IC3" />
        </div>
        <div className="field">
          <label>Location</label>
          <input value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div className="field">
          <label>Start date</label>
          <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="leave">On leave</option>
            <option value="offboarding">Offboarding</option>
          </select>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Strengths, growth areas, context…" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
