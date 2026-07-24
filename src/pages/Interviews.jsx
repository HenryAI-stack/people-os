import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DraggableModal } from '../components/DraggableModal.jsx'
import { interviewsStore, directReportsStore } from '../lib/dataStore'
import { generateTags, generateTakeaways } from '../lib/autoTags.js'

const EMPTY = {
  title: '', type: '1:1', personId: '', person: '', date: '',
  summary: '', takeaways: '', tags: '',
}

const TYPE_LABEL = {
  '1:1': '1:1',
  skip_level: 'Skip-level',
  hiring: 'Hiring interview',
  exit: 'Exit interview',
  performance: 'Performance review',
  team_meeting: 'Team meeting',
}

export default function Interviews() {
  const [items,      setItems]      = useState([])
  const [reports,    setReports]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [query,      setQuery]      = useState('')
  const [editing,    setEditing]    = useState(null)
  const [expanded,   setExpanded]   = useState(null)
  const [page,       setPage]       = useState(1)
  const PAGE_SIZE = 20
  const location = useLocation()

  async function load() {
    setLoading(true)
    try {
      const [i, r] = await Promise.all([interviewsStore.list(), directReportsStore.list()])
      setItems(i); setReports(r)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-expand interview passed via navigation state (e.g. from Dashboard)
  useEffect(() => {
    const expandId = location.state?.expandInterview
    if (!expandId || items.length === 0) return
    setExpanded(expandId)
    // Jump to the correct page
    const idx = filtered.findIndex((i) => i.id === expandId)
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1)
    // Scroll to the expanded item after render
    setTimeout(() => {
      document.getElementById(`interview-${expandId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [location.state, items])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return items
      .filter((i) => filterType === 'all' || i.type === filterType)
      .filter((i) => !q || [i.title, i.person, i.summary, i.takeaways, i.tags]
        .join(' ').toLowerCase().includes(q))
  }, [items, filterType, query])

  // Reset to page 1 whenever filter/query changes
  useEffect(() => { setPage(1) }, [filterType, query])

  async function handleSave(record) {
    await interviewsStore.upsert(record)
    setEditing(null); load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return
    await interviewsStore.remove(id); load()
  }

  return (
    <>
      <div className="page-header">
        <h1>Interviews</h1>
        <p>1:1s, skip-levels, and hiring conversations — captured so the knowledge isn't lost.</p>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input
          className="search-input"
          placeholder="Search title, person, summary…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select className="search-input" style={{ width: 'auto' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ Log entry</button>
      </div>

      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">🗣️</div>
          {query ? `No interviews matching "${query}".` : 'No entries yet. Log your first 1:1 or interview.'}
        </div>
      )}

      {/* Pagination info */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ fontSize:13, color:'var(--text-dim)', marginBottom:12 }}>
          Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length} interviews
        </div>
      )}

      <div className="list">
        {filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map((it) => (
          <div className="row-card" key={it.id} id={`interview-${it.id}`}
            style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
            onClick={() => setExpanded(expanded === it.id ? null : it.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="row-main">
                <div>
                  <div className="row-title">{it.title || '(untitled)'}</div>
                  <div className="row-sub">{it.person ? `${it.person} · ` : ''}{it.date || 'no date'}</div>
                  {it.tags && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                      {it.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span className="badge" key={t} style={{ fontSize:10.5, padding:'2px 7px' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge">{TYPE_LABEL[it.type] || it.type}</span>
                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setEditing({ ...it }) }}>Edit</button>
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

      {/* Pagination controls */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:24 }}>
          <button className="btn ghost" onClick={() => setPage(1)} disabled={page===1} style={{ fontSize:12, padding:'6px 10px' }}>«</button>
          <button className="btn ghost" onClick={() => setPage(p=>p-1)} disabled={page===1} style={{ fontSize:12, padding:'6px 12px' }}>‹ Prev</button>
          {Array.from({ length: Math.ceil(filtered.length/PAGE_SIZE) }, (_,i) => i+1)
            .filter(p => p===1 || p===Math.ceil(filtered.length/PAGE_SIZE) || Math.abs(p-page)<=2)
            .reduce((acc, p, i, arr) => {
              if (i>0 && p-arr[i-1]>1) acc.push('...')
              acc.push(p)
              return acc
            }, [])
            .map((p, i) => p==='...'
              ? <span key={`dots-${i}`} style={{ color:'var(--text-faint)', padding:'0 4px' }}>…</span>
              : <button key={p} className={`btn ${p===page?'primary':'ghost'}`} onClick={() => setPage(p)} style={{ fontSize:12, padding:'6px 12px', minWidth:36 }}>{p}</button>
            )
          }
          <button className="btn ghost" onClick={() => setPage(p=>p+1)} disabled={page===Math.ceil(filtered.length/PAGE_SIZE)} style={{ fontSize:12, padding:'6px 12px' }}>Next ›</button>
          <button className="btn ghost" onClick={() => setPage(Math.ceil(filtered.length/PAGE_SIZE))} disabled={page===Math.ceil(filtered.length/PAGE_SIZE)} style={{ fontSize:12, padding:'6px 10px' }}>»</button>
        </div>
      )}

      {editing && (
        <InterviewForm
          key={editing.id || 'new'}
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
  const [form,        setForm]        = useState({ ...initial })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [genTags,     setGenTags]     = useState(false)
  const [genTakeaways, setGenTakeaways] = useState(false)
  const isNew = !initial.id

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })) }

  async function handleGenerateTakeaways() {
    if (!form.summary) return
    setGenTakeaways(true); setError('')
    try {
      const takeaways = await generateTakeaways(form.summary)
      if (takeaways) setForm((f) => ({ ...f, takeaways }))
    } catch (err) {
      setError('Takeaways: ' + (err.message || 'Generation failed.'))
    } finally { setGenTakeaways(false) }
  }

  async function handleGenerateTags() {
    if (!form.summary && !form.takeaways) return
    setGenTags(true); setError('')
    try {
      const tags = await generateTags(form.summary, form.takeaways)
      if (tags) setForm((f) => ({ ...f, tags }))
    } catch (err) {
      setError('Tags: ' + (err.message || 'Generation failed.'))
    } finally { setGenTags(false) }
  }

  function handlePersonSelect(e) {
    const val = e.target.value
    if (val === '__other__') {
      setForm((f) => ({ ...f, personId: '__other__', person: '' }))
    } else if (val === '') {
      setForm((f) => ({ ...f, personId: '', person: '' }))
    } else {
      const found = reports.find((r) => r.id === val)
      setForm((f) => ({ ...f, personId: val, person: found?.name || '' }))
    }
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try { await onSave(form) }
    catch (err) { setError(err.message || 'Save failed.'); setSaving(false) }
  }

  const isOther = form.personId === '__other__'
  const selectValue = form.personId ||
    (form.person && reports.find((r) => r.name.trim().toLowerCase() === form.person.trim().toLowerCase())?.id) ||
    (form.person ? '__other__' : '')

  return (
    <DraggableModal title={isNew ? 'Log new entry' : 'Edit entry'} onClose={onCancel}>
      <form onSubmit={submit}>

        {error && (
          <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 14, padding: '10px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}

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
          <select value={selectValue} onChange={handlePersonSelect}>
            <option value="">— Select direct report —</option>
            {reports.map((r) => <option key={r.id} value={r.id}>{r.name}{r.role ? ` (${r.role})` : ''}</option>)}
            <option value="__other__">Other / external person…</option>
          </select>
        </div>
        {isOther && (
          <div className="field">
            <label>Name</label>
            <input required value={form.person} onChange={(e) => set('person', e.target.value)} placeholder="Enter name" autoFocus />
          </div>
        )}
        <div className="field">
          <label>Date</label>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Summary</label>
          <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What was discussed?" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Key takeaways
            <button type="button" onClick={handleGenerateTakeaways} disabled={genTakeaways || !form.summary}
              style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', opacity: !form.summary ? 0.45 : 1 }}>
              {genTakeaways ? '⏳ Generating…' : '✦ Generate'}
            </button>
          </label>
          <textarea value={form.takeaways} onChange={(e) => set('takeaways', e.target.value)} placeholder="Action items, follow-ups, decisions…" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Tags (comma-separated)
            <button type="button" onClick={handleGenerateTags} disabled={genTags || (!form.summary && !form.takeaways)}
              style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', opacity: (!form.summary && !form.takeaways) ? 0.45 : 1 }}>
              {genTags ? '⏳ Generating…' : '✦ Generate tags'}
            </button>
          </label>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Click ✦ Generate tags or type manually" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}
