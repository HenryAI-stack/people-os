import React, { useEffect, useMemo, useState } from 'react'
import { notesStore } from '../lib/dataStore'
import { DraggableModal } from '../components/DraggableModal.jsx'

const EMPTY = { title: '', body: '', pinned: false }

export default function Notes() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [query,   setQuery]   = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try { setItems(await notesStore.list()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    const list = items.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q))
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  }, [items, query])

  async function handleSave(record) {
    await notesStore.upsert(record)
    setEditing(null)
    await load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note?')) return
    setError('')
    try { await notesStore.remove(id); await load() }
    catch (e) { setError('Delete failed: ' + e.message) }
  }

  async function togglePin(note) {
    try { await notesStore.upsert({ ...note, pinned: !note.pinned }); await load() }
    catch (e) { setError('Could not update note: ' + e.message) }
  }

  return (
    <>
      <div className="page-header"><h1>Notes</h1><p>A scratchpad for anything that doesn't fit elsewhere.</p></div>
      <div className="toolbar">
        <input className="search-input" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ New note</button>
      </div>
      {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:16, padding:'10px 14px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && filtered.length === 0 && !error && <div className="empty-state"><div className="icon">📝</div>No notes yet.</div>}
      <div className="grid cols-2">
        {filtered.map((n) => (
          <div className="card" key={n.id}>
            <div className="row-title">{n.pinned ? '📌 ' : ''}{n.title || '(untitled)'}</div>
            <p style={{ fontSize:13.5, color:'var(--text-dim)', whiteSpace:'pre-wrap', margin:'8px 0 14px' }}>{n.body}</p>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn ghost" onClick={() => togglePin(n)}>{n.pinned ? 'Unpin' : 'Pin'}</button>
              <button className="btn ghost" onClick={() => setEditing({ ...n })}>Edit</button>
              <button className="btn ghost danger" onClick={() => handleDelete(n.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing !== null && (
        <NoteForm key={editing.id || 'new'} initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </>
  )
}

function NoteForm({ initial, onCancel, onSave }) {
  const [form,   setForm]   = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isNew = !initial.id

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })) }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try { await onSave(form) }
    catch (err) { setError(err.message || 'Save failed.'); setSaving(false) }
  }

  return (
    <DraggableModal title={isNew ? 'New note' : 'Edit note'} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:14, padding:'10px 12px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
        <div className="field"><label>Title</label><input required value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field"><label>Body</label><textarea value={form.body} onChange={(e) => set('body', e.target.value)} style={{ minHeight:160 }} /></div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}
