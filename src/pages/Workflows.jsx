import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { workflowsStore, workflowRunsStore } from '../lib/dataStore'
import { DraggableModal } from '../components/DraggableModal.jsx'

// Workflows = reusable checklist templates (workflows.json) + runs started from them
// (workflow-runs.json). A run copies the template's items when it starts, so editing a template
// later never changes a run that's already under way or done.
//
// Item shape (template and run): { id, type: 'step' | 'section', title, notes }
// Run items add { done, doneAt } on steps.

const CHANNEL = 'peopleos-workflows'   // BroadcastChannel: keeps the main window and pop-outs in sync

function newId() { return crypto.randomUUID() }
function stepsOf(items = []) { return items.filter((i) => i.type !== 'section') }
function progress(items) {
  const steps = stepsOf(items)
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}
function monthLabel(offset = 0) {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + offset, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function fmtStamp(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtDay(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
function openChannel() {
  return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null
}

/** Opens a run's checklist in its own small browser window (one window per run). */
export function popOutRun(id) {
  const url = `${location.origin}${location.pathname}#/checklist/${id}`
  const w = window.open(url, `peopleos-checklist-${id}`, 'popup,width=460,height=820')
  if (w) w.focus()
}

// Plain-text notes with http(s) links made clickable.
function Notes({ text }) {
  if (!text) return null
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <div className="wf-notes">
      {parts.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p}</a>
        : <React.Fragment key={i}>{p}</React.Fragment>)}
    </div>
  )
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="wf-progress" title={`${done} of ${total} steps done`}>
      <div className={`wf-progress-fill${total && done === total ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ErrorBox({ children }) {
  return <div style={{ color:'var(--bad)', fontSize:13, marginBottom:16, padding:'10px 14px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {children}</div>
}

// ══════════════════════════════════════════════════════════════════════════════
// List page: templates + runs
// ══════════════════════════════════════════════════════════════════════════════
export default function Workflows() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [runs,      setRuns]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [editing,   setEditing]   = useState(null)   // template being edited
  const [starting,  setStarting]  = useState(null)   // template a run is being started from
  const [showDone,  setShowDone]  = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [t, r] = await Promise.all([workflowsStore.list(), workflowRunsStore.list({ fresh: true })])
      setTemplates([...t].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setRuns(r)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Ticks made in a pop-out window show up here straight away.
  useEffect(() => {
    const ch = openChannel()
    if (!ch) return
    ch.onmessage = ({ data }) => {
      if (data?.type === 'run') setRuns((rs) => rs.map((r) => (r.id === data.run.id ? data.run : r)))
    }
    return () => ch.close()
  }, [])

  const activeRuns = runs.filter((r) => !r.completedAt)
  const doneRuns   = runs.filter((r) => r.completedAt)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))

  async function saveTemplate(t) {
    await workflowsStore.upsert(t)
    setEditing(null)
    await load()
  }

  async function deleteTemplate(t) {
    if (!confirm(`Delete the workflow "${t.name}"?\nRuns already started from it are kept.`)) return
    setError('')
    try { await workflowsStore.remove(t.id); await load() }
    catch (e) { setError('Delete failed: ' + e.message) }
  }

  async function startRun(template, name, popOut) {
    const run = await workflowRunsStore.upsert({
      workflowId: template.id,
      workflowName: template.name,
      name,
      items: template.items.map((i) => (i.type === 'section'
        ? { ...i }
        : { ...i, done: false, doneAt: null })),
      completedAt: null,
    })
    setStarting(null)
    if (popOut) { popOutRun(run.id); await load() }
    else navigate(`/workflows/run/${run.id}`)
  }

  async function deleteRun(r) {
    if (!confirm(`Delete the run "${r.name}"?`)) return
    setError('')
    try { await workflowRunsStore.remove(r.id); await load() }
    catch (e) { setError('Delete failed: ' + e.message) }
  }

  return (
    <>
      <div className="page-header"><h1>Workflows</h1><p>Checklist templates for recurring processes — start a run each time you go through one.</p></div>
      <div className="toolbar">
        <div />
        <button className="btn primary" onClick={() => setEditing({ name: '', description: '', items: [] })}>+ New workflow</button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>In progress</div>
          {activeRuns.length === 0
            ? <div className="wf-hint">Nothing in progress. Start a run from one of the workflows below.</div>
            : <div className="list">{activeRuns.map((r) => (
                <RunRow key={r.id} run={r} onDelete={() => deleteRun(r)} />
              ))}</div>}

          <div className="section-title">Workflows</div>
          {templates.length === 0 ? (
            <div className="empty-state" style={{ padding: '36px 20px' }}>
              <div className="icon">✅</div>
              No workflows yet. Create one with “+ New workflow”.
            </div>
          ) : (
            <div className="grid cols-2">
              {templates.map((t) => {
                const n = stepsOf(t.items).length
                const s = (t.items || []).length - n
                return (
                  <div className="card wf-tpl" key={t.id}>
                    <div className="row-title">{t.name}</div>
                    {t.description && <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                    <div className="wf-meta">{n} step{n === 1 ? '' : 's'}{s ? ` · ${s} section${s === 1 ? '' : 's'}` : ''}</div>
                    <div className="row-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                      <button className="btn primary" disabled={!n} onClick={() => setStarting(t)}>▶ Start run</button>
                      <button className="btn ghost" onClick={() => setEditing(structuredClone(t))}>Edit</button>
                      <button className="btn ghost danger" onClick={() => deleteTemplate(t)}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {doneRuns.length > 0 && (
            <>
              <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                Completed <span className="badge good">{doneRuns.length}</span>
                <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 12, textTransform: 'none', letterSpacing: 0 }} onClick={() => setShowDone((v) => !v)}>
                  {showDone ? 'Hide' : 'Show'}
                </button>
              </div>
              {showDone && <div className="list">{doneRuns.map((r) => (
                <RunRow key={r.id} run={r} onDelete={() => deleteRun(r)} />
              ))}</div>}
            </>
          )}
        </>
      )}

      {editing && (
        <TemplateForm key={editing.id || 'new'} initial={editing} onCancel={() => setEditing(null)} onSave={saveTemplate} />
      )}
      {starting && (
        <StartRunModal template={starting} onCancel={() => setStarting(null)} onStart={startRun} />
      )}
    </>
  )
}

function RunRow({ run, onDelete }) {
  const { done, total } = progress(run.items)
  return (
    <div className="row-card wf-run-row">
      <Link to={`/workflows/run/${run.id}`} className="row-main" style={{ textDecoration: 'none', flex: 1, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="row-title">{run.name}</span>
          {run.completedAt
            ? <span className="badge good">✓ Done {fmtDay(run.completedAt)}</span>
            : <span className="badge">{done}/{total}</span>}
        </div>
        <div className="row-sub">{run.workflowName} · started {fmtDay(run.createdAt)}</div>
        {!run.completedAt && <ProgressBar done={done} total={total} />}
      </Link>
      <div className="row-actions" style={{ display: 'flex', gap: 6 }}>
        <button className="btn ghost" title="Open in a separate window" onClick={() => popOutRun(run.id)}>⧉ Pop out</button>
        <button className="btn ghost danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

function StartRunModal({ template, onCancel, onStart }) {
  const [name, setName]     = useState(`${template.name} – ${monthLabel(0)}`)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function go(popOut) {
    if (!name.trim()) return
    setSaving(true); setError('')
    try { await onStart(template, name.trim(), popOut) }
    catch (e) { setError(e.message || 'Could not start the run.'); setSaving(false) }
  }

  return (
    <DraggableModal title="Start run" onClose={onCancel} maxWidth={460}>
      <form onSubmit={(e) => { e.preventDefault(); go(false) }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="field">
          <label>Name</label>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
          <div className="wf-chips">
            {[0, 1].map((o) => (
              <button type="button" key={o} className="wf-chip" onClick={() => setName(`${template.name} – ${monthLabel(o)}`)}>
                {o === 0 ? 'This month' : 'Next month'}: {monthLabel(o)}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn" onClick={() => go(true)} disabled={saving}>⧉ Start in new window</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Starting…' : '▶ Start'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Template editor
// ══════════════════════════════════════════════════════════════════════════════
function TemplateForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    items: (initial.items || []).map((i) => ({ ...i, _notesOpen: !!i.notes })),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const inputs = useRef({})
  const [focusId, setFocusId] = useState(null)
  const isNew = !initial.id

  useEffect(() => {
    if (focusId && inputs.current[focusId]) { inputs.current[focusId].focus(); setFocusId(null) }
  }, [focusId, form.items])

  function setItems(fn) { setForm((f) => ({ ...f, items: fn(f.items) })) }
  function patch(id, changes) { setItems((items) => items.map((i) => (i.id === id ? { ...i, ...changes } : i))) }
  function add(type, afterId) {
    const item = { id: newId(), type, title: '', notes: '' }
    setItems((items) => {
      const idx = afterId ? items.findIndex((i) => i.id === afterId) : -1
      if (idx < 0) return [...items, item]
      return [...items.slice(0, idx + 1), item, ...items.slice(idx + 1)]
    })
    setFocusId(item.id)
  }
  function move(id, dir) {
    setItems((items) => {
      const i = items.findIndex((x) => x.id === id), j = i + dir
      if (j < 0 || j >= items.length) return items
      const next = [...items];[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function removeItem(id) { setItems((items) => items.filter((i) => i.id !== id)) }

  async function submit(e) {
    e.preventDefault()
    const items = form.items
      .filter((i) => i.title.trim())
      .map(({ _notesOpen, ...i }) => ({ ...i, title: i.title.trim(), notes: (i.notes || '').trim() }))
    if (!stepsOf(items).length) { setError('Add at least one step.'); return }
    setSaving(true); setError('')
    try { await onSave({ ...form, name: form.name.trim(), description: (form.description || '').trim(), items }) }
    catch (err) { setError(err.message || 'Save failed.'); setSaving(false) }
  }

  let stepNo = 0
  return (
    <DraggableModal title={isNew ? 'New workflow' : 'Edit workflow'} onClose={onCancel} maxWidth={680}>
      <form onSubmit={submit}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="field"><label>Name</label>
          <input required autoFocus={isNew} placeholder="e.g. Work schedule" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="field"><label>Description <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional)</span></label>
          <textarea style={{ minHeight: 56 }} value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="field" style={{ marginBottom: 6 }}><label>Steps</label></div>
        {form.items.length === 0 && <div className="wf-hint" style={{ marginBottom: 10 }}>No steps yet — add a step or a section heading below.</div>}
        <div className="wf-edit-list">
          {form.items.map((it, idx) => {
            const isSection = it.type === 'section'
            if (!isSection) stepNo++
            return (
              <div key={it.id} className={`wf-edit-row${isSection ? ' section' : ''}`}>
                <div className="wf-edit-main">
                  <span className="wf-edit-no">{isSection ? '§' : `${stepNo}.`}</span>
                  <input
                    ref={(el) => { inputs.current[it.id] = el }}
                    className="wf-edit-title"
                    placeholder={isSection ? 'Section heading' : 'Step'}
                    value={it.title}
                    onChange={(e) => patch(it.id, { title: e.target.value })}
                    onKeyDown={(e) => {
                      // Enter adds the next step right below — fast typing of a whole list
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add('step', it.id) }
                    }}
                  />
                  <div className="wf-edit-ctrls">
                    {!isSection && (
                      <button type="button" className={`wf-icon-btn${it._notesOpen ? ' on' : ''}`} title="Notes / instructions"
                        onClick={() => patch(it.id, { _notesOpen: !it._notesOpen })}>📝</button>
                    )}
                    <button type="button" className="wf-icon-btn" title="Move up" disabled={idx === 0} onClick={() => move(it.id, -1)}>↑</button>
                    <button type="button" className="wf-icon-btn" title="Move down" disabled={idx === form.items.length - 1} onClick={() => move(it.id, 1)}>↓</button>
                    <button type="button" className="wf-icon-btn danger" title="Remove" onClick={() => removeItem(it.id)}>✕</button>
                  </div>
                </div>
                {!isSection && it._notesOpen && (
                  <textarea className="wf-edit-notes" placeholder="Notes or instructions for this step (links become clickable)"
                    value={it.notes || ''} onChange={(e) => patch(it.id, { notes: e.target.value })} />
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => add('step')}>+ Step</button>
          <button type="button" className="btn ghost" onClick={() => add('section')}>+ Section</button>
        </div>
        {!isNew && <div className="wf-hint" style={{ marginTop: 12 }}>Changes apply to new runs. Runs already started keep their steps.</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// A run's checklist — in the app (/workflows/run/:id) or as a pop-out (/checklist/:id)
// ══════════════════════════════════════════════════════════════════════════════
export function WorkflowRun({ popout = false }) {
  const { id } = useParams()
  const [run, setRun]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved | error
  const [hideDone, setHideDone]   = useState(false)

  // Saves are serialised: ticking several boxes quickly while a GitHub write is in flight
  // queues one more write of the latest state instead of racing (409s, lost ticks).
  const latest = useRef(null)
  const saving = useRef(false)
  const dirty  = useRef(false)
  const channel = useRef(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    workflowRunsStore.list({ fresh: true })
      .then((runs) => {
        if (!alive) return
        const r = runs.find((x) => x.id === id)
        // Another window may hold newer, not-yet-saved ticks: let it send them (below).
        if (r && !latest.current) { latest.current = r; setRun(r) }
        if (!r && !latest.current) setError('This checklist no longer exists.')
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))

    const ch = openChannel()
    channel.current = ch
    if (ch) {
      ch.onmessage = ({ data }) => {
        if (data?.type === 'run' && data.run.id === id) { latest.current = data.run; setRun(data.run); setLoading(false) }
        if (data?.type === 'hello' && data.id === id && latest.current) ch.postMessage({ type: 'run', run: latest.current })
      }
      ch.postMessage({ type: 'hello', id })
    }
    return () => { alive = false; ch?.close(); channel.current = null }
  }, [id])

  useEffect(() => { if (run) document.title = popout ? `☑ ${run.name}` : `${run.name} · PeopleOS` }, [run?.name, popout])
  useEffect(() => () => { document.title = 'PeopleOS' }, [])

  useEffect(() => {
    function warn(e) { if (saving.current || dirty.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function flush() {
    if (saving.current) { dirty.current = true; return }
    saving.current = true
    setSaveState('saving')
    try {
      do {
        dirty.current = false
        try { await workflowRunsStore.upsert(latest.current) }
        catch { await workflowRunsStore.upsert(latest.current) }   // one retry (e.g. a 409 from the other window's write)
      } while (dirty.current)
      setSaveState('saved')
    } catch (e) {
      setSaveState('error'); setError('Not saved: ' + e.message)
    } finally { saving.current = false }
  }

  function commit(next) {
    latest.current = next
    setRun(next)
    channel.current?.postMessage({ type: 'run', run: next })
    setError('')
    flush()
  }

  function toggle(itemId) {
    const now = new Date().toISOString()
    const items = run.items.map((i) => (i.id === itemId
      ? { ...i, done: !i.done, doneAt: i.done ? null : now }
      : i))
    const p = progress(items)
    const completedAt = p.total && p.done === p.total ? (run.completedAt || now) : null
    commit({ ...run, items, completedAt })
  }

  const { done, total } = run ? progress(run.items) : { done: 0, total: 0 }

  // Group items under their sections for per-section counts.
  const groups = useMemo(() => {
    if (!run) return []
    const out = [{ section: null, steps: [] }]
    for (const it of run.items) {
      if (it.type === 'section') out.push({ section: it, steps: [] })
      else out[out.length - 1].steps.push(it)
    }
    return out.filter((g) => g.section || g.steps.length)
  }, [run])

  const Saved = (
    <span className={`wf-save ${saveState}`}>
      {saveState === 'saving' && 'Saving…'}
      {saveState === 'saved' && 'Saved ✓'}
      {saveState === 'error' && <button className="btn ghost danger" style={{ padding: '2px 8px' }} onClick={flush}>⚠ Retry save</button>}
    </span>
  )

  if (loading && !run) return <div className="empty-state">Loading…</div>
  if (!run) return (
    <>
      {!popout && <Link to="/workflows" className="wf-back">← Workflows</Link>}
      <ErrorBox>{error || 'Checklist not found.'}</ErrorBox>
    </>
  )

  let stepNo = 0
  return (
    <div className={popout ? 'wf-run popout' : 'wf-run'}>
      {!popout && <Link to="/workflows" className="wf-back">← Workflows</Link>}
      <div className="wf-run-top">
      <div className="wf-run-head">
        <div className="wf-run-titles">
          <h1>{run.name}</h1>
          <div className="row-sub">{run.workflowName} · started {fmtDay(run.createdAt)}</div>
        </div>
        <div className="wf-run-actions">
          {Saved}
          {!popout && <button className="btn" onClick={() => popOutRun(run.id)}>⧉ Open in separate window</button>}
        </div>
      </div>
      <div className="wf-run-progress">
        <ProgressBar done={done} total={total} />
        <span className="wf-run-count">{done}/{total}</span>
        <label className="wf-hide-done">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done
        </label>
      </div>
      </div>
      {run.completedAt && <div className="wf-complete">🎉 All steps done — completed {fmtStamp(run.completedAt)}</div>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="wf-checklist">
        {groups.map((g, gi) => {
          const gd = g.steps.filter((s) => s.done).length
          const visible = hideDone ? g.steps.filter((s) => !s.done) : g.steps
          return (
            <div key={g.section?.id || `g${gi}`} className="wf-group">
              {g.section && (
                <div className={`wf-section-head${g.steps.length && gd === g.steps.length ? ' complete' : ''}`}>
                  <span>{g.section.title}</span>
                  {g.steps.length > 0 && <span className="wf-section-count">{gd}/{g.steps.length}</span>}
                </div>
              )}
              {g.steps.map((s) => {
                stepNo++
                if (!visible.includes(s)) return null
                return (
                  <label key={s.id} className={`wf-check${s.done ? ' done' : ''}`}>
                    <input type="checkbox" checked={!!s.done} onChange={() => toggle(s.id)} />
                    <span className="wf-box" aria-hidden="true">{s.done ? '✓' : ''}</span>
                    <span className="wf-check-body">
                      <span className="wf-check-title"><span className="wf-check-no">{stepNo}.</span>{s.title}</span>
                      <Notes text={s.notes} />
                      {s.done && s.doneAt && <span className="wf-done-at">✓ {fmtStamp(s.doneAt)}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
