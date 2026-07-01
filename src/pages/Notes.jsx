import React, { useEffect, useMemo, useState } from 'react'
import { notesStore } from '../lib/dataStore'

const EMPTY = { title: '', body: '', pinned: false }

export default function Notes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    setItems(await notesStore.list())
    setLoading(false)
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
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note?')) return
    await notesStore.remove(id)
    load()
  }

  async function togglePin(note) {
    await notesStore.upsert({ ...note, pinned: !note.pinned })
    load()
  }

  return (
    <>
      <div className="page-header">
        <h1>Notes</h1>
        <p>A scratchpad for anything that doesn't fit elsewhere — ideas, reminders, context.</p>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ New note</button>
      </div>

      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">📝</div>
          No notes yet. Jot something down.
        </div>
      )}

      <div className="grid cols-2">
        {filtered.map((n) => (
          <div className="card" key={n.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div className="row-title">{n.pinned ? '📌 ' : ''}{n.title || '(untitled)'}</div>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', margin: '8px 0 14px' }}>
              {n.body}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" onClick={() => togglePin(n)}>{n.pinned ? 'Unpin' : 'Pin'}</button>
              <button className="btn ghost" onClick={() => setEditing(n)}>Edit</button>
              <button className="btn ghost danger" onClick={() => handleDelete(n.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <NoteForm initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </>
  )
}

function NoteForm({ initial, onCancel, onSave }) {
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
        <h2>{isNew ? 'New note' : 'Edit note'}</h2>
        <div className="field">
          <label>Title</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="field">
          <label>Body</label>
          <textarea
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            style={{ minHeight: 160 }}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
