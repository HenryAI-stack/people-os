import React, { useEffect, useMemo, useState } from 'react'
import { interviewsStore, directReportsStore } from '../lib/dataStore'

const EMPTY = {
  title: '', type: '1:1', person: '', date: '', summary: '', takeaways: '', tags: '',
}

const TYPE_LABEL = {
  '1:1': '1:1',
  skip_level: 'Skip-level',
  hiring: 'Hiring interview',
  exit: 'Exit interview',
  performance: 'Performance review',
}

export default function Interviews() {
  const [items, setItems] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true)
    const [i, r] = await Promise.all([interviewsStore.list(), directReportsStore.list()])
    setItems(i)
    setReports(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (filterType === 'all') return items
    return items.filter((i) => i.type === filterType)
  }, [items, filterType])

  async function handleSave(record) {
    await interviewsStore.upsert(record)
    setEditing(null)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return
    await interviewsStore.remove(id)
    load()
  }

  return (
    <>
      <div className="page-header">
        <h1>Interviews</h1>
        <p>1:1s, skip-levels, and hiring conversations — captured so the knowledge isn't lost.</p>
      </div>

      <div className="toolbar">
        <select className="search-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ Log entry</button>
      </div>

      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">🗣️</div>
          No entries yet. Log your first 1:1 or interview to build a knowledge base.
        </div>
      )}

      <div className="list">
        {filtered.map((it) => (
          <div className="row-card" key={it.id} style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
               onClick={() => setExpanded(expanded === it.id ? null : it.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="row-main">
                <div>
                  <div className="row-title">{it.title || '(untitled)'}</div>
                  <div className="row-sub">
                    {it.person ? `${it.person} · ` : ''}{it.date || 'no date'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge">{TYPE_LABEL[it.type] || it.type}</span>
                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setEditing(it) }}>Edit</button>
                <button className="btn ghost danger" onClick={(e) => { e.stopPropagation(); handleDelete(it.id) }}>Delete</button>
              </div>
            </div>
            {expanded === it.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13.5, lineHeight: 1.6 }}>
                {it.summary && <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{it.summary}</p>}
                {it.takeaways && (
                  <>
                    <div style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>KEY TAKEAWAYS</div>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{it.takeaways}</p>
                  </>
                )}
                {it.tags && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {it.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span className="badge" key={t}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <InterviewForm
          initial={editing}
          reports={reports}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function InterviewForm({ initial, reports, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const isNew = !initial.id

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })) }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit}>
        <h2>{isNew ? 'Log new entry' : 'Edit entry'}</h2>

        <div className="field">
          <label>Title</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Q3 1:1 — career growth chat" />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Person</label>
          <input
            list="reports-list"
            value={form.person}
            onChange={(e) => set('person', e.target.value)}
            placeholder="Direct report or candidate name"
          />
          <datalist id="reports-list">
            {reports.map((r) => <option key={r.id} value={r.name} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Summary</label>
          <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What was discussed?" />
        </div>
        <div className="field">
          <label>Key takeaways</label>
          <textarea value={form.takeaways} onChange={(e) => set('takeaways', e.target.value)} placeholder="Action items, follow-ups, decisions…" />
        </div>
        <div className="field">
          <label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="growth, promotion, blockers" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
