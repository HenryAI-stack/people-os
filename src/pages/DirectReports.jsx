import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { directReportsStore } from '../lib/dataStore'
import { resizeImage } from '../lib/imageUtils'
import { getLocationFlag } from '../lib/locationFlag.js'

const EMPTY = {
  name: '', role: '', team: '', startDate: '', level: '',
  location: '', status: 'active', email: '', notes: '', photo: '',
}

export default function DirectReports() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [query,   setQuery]   = useState('')
  const [editing, setEditing] = useState(null)
  const navigate = useNavigate()

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

  // Flat filtered list
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return items.filter((i) =>
      [i.name, i.role, i.team, i.location].join(' ').toLowerCase().includes(q)
    )
  }, [items, query])

  // Grouped by team, sorted alphabetically; no-team group goes last
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach((p) => {
      const key = p.team?.trim() || ''
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    const teams = Object.keys(map).sort((a, b) => {
      if (!a) return 1   // no-team always last
      if (!b) return -1
      return a.localeCompare(b)
    })
    return teams.map((team) => ({ team, members: map[team] }))
  }, [filtered])

  async function handleSave(record) {
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

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && !error && (
        <div className="empty-state">
          <div className="icon">👥</div>
          No direct reports yet. Add your first team member to get started.
        </div>
      )}

      {grouped.map(({ team, members }) => (
        <div key={team || '__none__'} style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            {team || 'No team assigned'}
            <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="list">
            {members.map((p) => (
              <div
                className="row-card"
                key={p.id}
                onClick={() => navigate(`/direct-reports/${p.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="row-main">
                  <Avatar photo={p.photo} name={p.name} size={38} />
                  <div>
                    <div className="row-title">{p.name}</div>
                    <div className="row-sub">
                      {p.role}{p.location ? ` · ${p.location}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge ${p.status === 'active' ? 'good' : 'warn'}`}>{p.status}</span>
                  <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setEditing({ ...p }) }}>Edit</button>
                  <button className="btn ghost danger" onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

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

/* ── Avatar component ─────────────────────────────────── */
export function Avatar({ photo, name, size = 30 }) {
  const initials = (name || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={{
          width: size, height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid var(--border)',
        }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36,
      fontWeight: 700,
      flexShrink: 0,
      border: '1px solid var(--border)',
      userSelect: 'none',
    }}>
      {initials}
    </div>
  )
}

/* ── Photo picker inside the form ─────────────────────── */
function PhotoPicker({ value, onChange }) {
  const inputRef = useRef(null)
  const [processing, setProcessing] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    try {
      const dataUrl = await resizeImage(file, 200, 0.82)
      onChange(dataUrl)
    } catch {
      alert('Could not process image. Please try a different file.')
    } finally {
      setProcessing(false)
      e.target.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
      {/* Preview */}
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: 72, height: 72,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px dashed var(--border)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg)',
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        {value
          ? <img src={value} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 26, opacity: 0.4 }}>📷</span>
        }
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12.5, padding: '6px 12px' }}
          onClick={() => inputRef.current?.click()}
          disabled={processing}
        >
          {processing ? 'Processing…' : value ? 'Change photo' : 'Upload photo'}
        </button>
        {value && (
          <button
            type="button"
            className="btn ghost danger"
            style={{ fontSize: 12.5, padding: '6px 12px' }}
            onClick={() => onChange('')}
          >
            Remove
          </button>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
          JPG, PNG, WebP — auto-cropped square
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  )
}

/* ── Form ─────────────────────────────────────────────── */
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

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <PhotoPicker value={form.photo} onChange={(v) => set('photo', v)} />

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

function ErrorBanner({ children }) {
  return (
    <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 14, padding: '10px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
      ⚠️ {children}
    </div>
  )
}
