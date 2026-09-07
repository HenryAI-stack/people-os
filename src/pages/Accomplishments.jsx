import React, { useEffect, useMemo, useState } from 'react'
import { accomplishmentsStore, directReportsStore } from '../lib/dataStore'
import { DraggableModal } from '../components/DraggableModal.jsx'

const EMPTY = {
  month: '', date: '', text: '',
  assigneeType: 'person', personId: '', personName: '', team: '',
}

function todayMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function todayDate() {
  return new Date().toISOString().slice(0, 10)
}
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function Accomplishments() {
  const [month,   setMonth]   = useState(todayMonth())
  const [items,   setItems]   = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [editing, setEditing] = useState(null)
  const [groupBy, setGroupBy] = useState('assignee') // 'assignee' | 'date'

  async function load() {
    setLoading(true); setError('')
    try {
      const [a, r] = await Promise.all([accomplishmentsStore.list(), directReportsStore.list()])
      setItems(a); setReports(r)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const teamNames = useMemo(() => {
    const set = new Set()
    reports.forEach((r) => { if (r.team?.trim()) set.add(r.team.trim()) })
    return [...set].sort()
  }, [reports])

  const monthItems = useMemo(
    () => items.filter((i) => i.month === month)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [items, month]
  )

  const grouped = useMemo(() => {
    if (groupBy === 'date') {
      const map = {}
      monthItems.forEach((i) => { const key = i.date || 'No date'; (map[key] ||= []).push(i) })
      return Object.keys(map).sort((a, b) => b.localeCompare(a)).map((key) => ({ key, label: key === 'No date' ? key : fmtDate(key), items: map[key] }))
    }
    const map = {}
    monthItems.forEach((i) => {
      const key = i.assigneeType === 'team' ? `team:${i.team || 'Unassigned team'}` : `person:${i.personName || 'Unassigned'}`
      ;(map[key] ||= []).push(i)
    })
    const keys = Object.keys(map).sort((a, b) => {
      const la = a.startsWith('team:') ? `0${a}` : `1${a}`
      const lb = b.startsWith('team:') ? `0${b}` : `1${b}`
      return la.localeCompare(lb)
    })
    return keys.map((key) => ({
      key,
      label: key.startsWith('team:') ? `🏷️ ${key.slice(5)}` : `👤 ${key.slice(7)}`,
      items: map[key],
    }))
  }, [monthItems, groupBy])

  async function handleSave(record) { await accomplishmentsStore.upsert(record); setEditing(null); load() }
  async function handleDelete(id) { if (!confirm('Delete this accomplishment?')) return; await accomplishmentsStore.remove(id); load() }

  return (
    <>
      <div className="page-header">
        <h1>Accomplishments</h1>
        <p>Wins worth remembering — collected every month, sent to you as a summary on the last working Thursday.</p>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setMonth(prevMonth(month))}>◀</button>
          <div style={{ fontWeight: 700, fontSize: 15, minWidth: 150, textAlign: 'center' }}>{fmtMonth(month)}</div>
          <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setMonth(nextMonth(month))}>▶</button>
          {month !== todayMonth() && (
            <button className="btn ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setMonth(todayMonth())}>Today</button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['assignee', 'By person/team'], ['date', 'By date']].map(([v, l]) => (
              <button key={v} className={`btn ${groupBy === v ? 'primary' : 'ghost'}`} style={{ fontSize: 12.5, padding: '6px 12px' }} onClick={() => setGroupBy(v)}>{l}</button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setEditing({ ...EMPTY, month, date: todayDate() })}>+ Add accomplishment</button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>⚠️ {error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && monthItems.length === 0 && !error && (
        <div className="empty-state"><div className="icon">🏆</div>No accomplishments logged for {fmtMonth(month)} yet.</div>
      )}

      {!loading && grouped.map(({ key, label, items: groupItems }) => (
        <div key={key} style={{ marginBottom: 24 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            {label}
            <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
              {groupItems.length} {groupItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="list">
            {groupItems.map((a) => (
              <div className="row-card" key={a.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-title">{a.text}</div>
                  <div className="row-sub">
                    {a.date && <span style={{ marginRight: 8 }}>📅 {fmtDate(a.date)}</span>}
                    {groupBy === 'date' && (
                      a.assigneeType === 'team'
                        ? <span>🏷️ {a.team || 'Unassigned team'}</span>
                        : <span>👤 {a.personName || 'Unassigned'}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditing({ ...a })}>Edit</button>
                  <button className="btn ghost danger" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleDelete(a.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <AccomplishmentForm
          key={editing.id || 'new'}
          initial={editing}
          reports={reports}
          teamNames={teamNames}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function AccomplishmentForm({ initial, reports, teamNames, onCancel, onSave }) {
  const [form,   setForm]   = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isNew = !initial.id

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function handlePersonChange(e) {
    const r = reports.find((r) => r.id === e.target.value)
    setForm((f) => ({ ...f, personId: r?.id || '', personName: r?.name || '' }))
  }

  function handleDateChange(e) {
    const date = e.target.value
    setForm((f) => ({ ...f, date, month: date ? date.slice(0, 7) : f.month }))
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (form.assigneeType === 'person' && !form.personName.trim()) throw new Error('Pick a person, or switch to Team.')
      if (form.assigneeType === 'team' && !form.team.trim()) throw new Error('Enter a team name, or switch to Person.')
      await onSave(form)
    } catch (err) { setError(err.message || 'Save failed.'); setSaving(false) }
  }

  return (
    <DraggableModal title={isNew ? 'Add accomplishment' : 'Edit accomplishment'} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 14, padding: '10px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>⚠️ {error}</div>}
        <div className="field"><label>Accomplishment</label><textarea required value={form.text} onChange={(e) => set('text', e.target.value)} placeholder="What was achieved?" style={{ minHeight: 80 }} /></div>
        <div className="field"><label>Date</label><input type="date" required value={form.date} onChange={handleDateChange} /></div>

        <div className="field">
          <label>Assign to</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button type="button" className={`btn ${form.assigneeType === 'person' ? 'primary' : 'ghost'}`} style={{ fontSize: 12.5, padding: '6px 12px', flex: 1 }} onClick={() => set('assigneeType', 'person')}>👤 Person</button>
            <button type="button" className={`btn ${form.assigneeType === 'team' ? 'primary' : 'ghost'}`} style={{ fontSize: 12.5, padding: '6px 12px', flex: 1 }} onClick={() => set('assigneeType', 'team')}>🏷️ Team</button>
          </div>

          {form.assigneeType === 'person' ? (
            <select value={form.personId} onChange={handlePersonChange}>
              <option value="">— Select a person —</option>
              {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : (
            <>
              <input list="team-names" value={form.team} onChange={(e) => set('team', e.target.value)} placeholder="e.g. 24/7 Core Operations" />
              <datalist id="team-names">
                {teamNames.map((t) => <option key={t} value={t} />)}
              </datalist>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}
