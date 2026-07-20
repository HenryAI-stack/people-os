import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { followUpsStore, directReportsStore } from '../lib/dataStore'
import { DraggableModal } from '../components/DraggableModal.jsx'

const EMPTY = { text: '', dueDate: '', personId: '', personName: '', sourceType: 'manual', sourceId: '', sourceTitle: '', done: false }

export function urgencyLabel(dueDate, done) {
  if (done) return { label: 'Done', cls: 'good' }
  if (!dueDate) return { label: 'No date', cls: '' }
  const diff = Math.ceil((new Date(dueDate) - new Date().setHours(0,0,0,0)) / 86400000)
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, cls: 'bad' }
  if (diff === 0) return { label: 'Due today', cls: 'warn' }
  if (diff <= 7)  return { label: `Due in ${diff}d`, cls: 'warn' }
  return { label: new Date(dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'short' }), cls: '' }
}

export default function FollowUps() {
  const [items,   setItems]   = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('open')
  const [editing, setEditing] = useState(null)
  const [error,   setError]   = useState('')
  const [toast,   setToast]   = useState('')
  const navigate = useNavigate()

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    setLoading(true); setError('')
    try {
      const [f, r] = await Promise.all([followUpsStore.list(), directReportsStore.list()])
      setItems(f); setReports(r)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const today = new Date().setHours(0,0,0,0)
    return items
      .filter((f) => {
        if (filter === 'open')    return !f.done
        if (filter === 'overdue') return !f.done && f.dueDate && new Date(f.dueDate) < today
        if (filter === 'done')    return f.done
        return true
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate) - new Date(b.dueDate)
      })
  }, [items, filter])

  const overdueCount = items.filter((f) => !f.done && f.dueDate && new Date(f.dueDate) < new Date().setHours(0,0,0,0)).length

  async function handleSave(record) { await followUpsStore.upsert(record); setEditing(null); load() }
  async function handleDelete(id) { await followUpsStore.remove(id); load() }
  async function toggleDone(item) {
    const nowDone = !item.done
    await followUpsStore.upsert({ ...item, done: nowDone })
    if (nowDone) showToast(`✅ "${item.text.length > 45 ? item.text.slice(0,45)+'…' : item.text}" marked as done`)
    load()
  }

  return (
    <>
      <div className="page-header"><h1>Follow-ups</h1><p>Action items and reminders — so nothing slips through the cracks.</p></div>
      <div className="toolbar">
        <div style={{ display:'flex', gap:6 }}>
          {[['open','Open'],['overdue','Overdue'],['done','Done'],['all','All']].map(([v,l]) => (
            <button key={v} className={`btn ${filter===v?'primary':'ghost'}`} style={{ fontSize:13, padding:'6px 14px' }} onClick={() => setFilter(v)}>
              {l}{v==='overdue'&&overdueCount>0&&<span style={{ marginLeft:6, background:'var(--bad)', color:'#fff', borderRadius:100, fontSize:11, padding:'1px 6px' }}>{overdueCount}</span>}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ Add follow-up</button>
      </div>
      {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:16, padding:'10px 14px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">{filter==='done'?'✅':'📋'}</div>
          {filter==='open'&&'No open follow-ups. You\'re all caught up!'}
          {filter==='overdue'&&'No overdue items. Great work!'}
          {filter==='done'&&'No completed follow-ups yet.'}
          {filter==='all'&&'No follow-ups yet.'}
        </div>
      )}
      <div className="list">
        {filtered.map((f) => {
          const urg = urgencyLabel(f.dueDate, f.done)
          return (
            <div className="row-card" key={f.id} style={{ opacity:f.done?0.6:1 }}>
              <input type="checkbox" checked={!!f.done} onChange={() => toggleDone(f)}
                style={{ width:17, height:17, flexShrink:0, cursor:'pointer', accentColor:'var(--accent)' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div className="row-title" style={{ textDecoration:f.done?'line-through':'none' }}>{f.text}</div>
                <div className="row-sub">
                  {f.personName && (
                    <span style={{ marginRight:8 }}>👤 {f.personId
                      ? <span onClick={(e) => { e.stopPropagation(); navigate(`/direct-reports/${f.personId}`) }}
                          style={{ cursor:'pointer', color:'var(--accent)', textDecoration:'underline', textDecorationStyle:'dotted' }}>{f.personName}</span>
                      : f.personName}
                    </span>
                  )}
                  {f.sourceTitle && <span style={{ color:'var(--text-faint)' }}>↳ {f.sourceTitle}</span>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                {urg.label && <span className={`badge ${urg.cls}`}>{urg.label}</span>}
                <button className="btn ghost" style={{ fontSize:12, padding:'4px 8px' }} onClick={() => setEditing({ ...f })}>Edit</button>
                <button className="btn ghost danger" style={{ fontSize:12, padding:'4px 8px' }} onClick={() => handleDelete(f.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
      {editing && (
        <FollowUpForm key={editing.id||'new'} initial={editing} reports={reports} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
      {toast && (
        <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', background:'var(--bg-card)', border:'1px solid var(--good)', color:'var(--good)', borderRadius:10, padding:'11px 20px', fontSize:13.5, fontWeight:500, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', zIndex:100, whiteSpace:'nowrap', maxWidth:'90vw', overflow:'hidden', textOverflow:'ellipsis', animation:'fadeInUp 0.2s ease' }}>
          {toast}
        </div>
      )}
    </>
  )
}

function FollowUpForm({ initial, reports, onCancel, onSave }) {
  const [form,   setForm]   = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isNew = !initial.id

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }
  function handlePersonChange(e) {
    const r = reports.find((r) => r.id === e.target.value)
    setForm((f) => ({ ...f, personId: r?.id||'', personName: r?.name||'' }))
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try { await onSave(form) }
    catch (err) { setError(err.message||'Save failed.'); setSaving(false) }
  }

  return (
    <DraggableModal title={isNew ? 'Add follow-up' : 'Edit follow-up'} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:14, padding:'10px 12px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
        <div className="field"><label>Follow-up</label><textarea required value={form.text} onChange={(e) => set('text', e.target.value)} placeholder="What needs to happen?" style={{ minHeight:80 }} /></div>
        <div className="field"><label>Due date</label><input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>
        <div className="field">
          <label>Person (optional)</label>
          <select value={form.personId} onChange={handlePersonChange}>
            <option value="">— Not linked to a person —</option>
            {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving…':'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}
