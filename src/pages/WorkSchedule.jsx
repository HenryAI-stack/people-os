import React, { useEffect, useMemo, useRef, useState } from 'react'
import { directReportsStore, schedulesStore } from '../lib/dataStore'
import { Avatar } from './DirectReports.jsx'
import { CENTERS, getCenter, generateSchedule } from '../lib/scheduleGenerator.js'
import { getDaysInMonth, isWeekend, getHoliday } from '../lib/holidays.js'

const TEAM_NAME = '24/7 Core Operations'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
}
function fmtDay(dateStr) {
  return new Date(dateStr).getDate()
}
function fmtWeekday(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday:'short' })
}
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`
}
function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`
}
function todayMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkSchedule() {
  const [month,       setMonth]       = useState(todayMonth())
  const [people,      setPeople]      = useState([])
  const [schedule,    setSchedule]    = useState(null)  // { id, month, assignments, fairnessSnapshot }
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [generating,  setGenerating]  = useState(false)
  const [activeCenter,setActiveCenter]= useState(CENTERS[0].id)
  const [error,       setError]       = useState('')
  const [autoSaved,   setAutoSaved]   = useState('')  // '' | 'saving' | 'saved'
  const autoSaveTimer = useRef(null)
  const [dragSrc,     setDragSrc]     = useState(null)  // { date, center }
  const [commentModal,setCommentModal]= useState(null)  // { date, center, text }

  // Auto-save 1.5s after any change to the schedule
  useEffect(() => {
    if (!schedule) return
    clearTimeout(autoSaveTimer.current)
    setAutoSaved('saving')
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await schedulesStore.upsert(schedule)
        setAutoSaved('saved')
        setTimeout(() => setAutoSaved(''), 2500)
      } catch { setAutoSaved('') }
    }, 1500)
    return () => clearTimeout(autoSaveTimer.current)
  }, [schedule])

  async function load() {
    setLoading(true); setError('')
    try {
      const all = await directReportsStore.list()
      const ops = all.filter((p) => p.team === TEAM_NAME)
      setPeople(ops)

      // Load schedule for this month
      const schedules = await schedulesStore.list()
      const found = schedules.find((s) => s.month === month)
      setSchedule(found || null)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [month])

  // ── Auto-generate ────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!confirm(`Generate a new schedule for ${month}? This will overwrite any existing schedule.`)) return
    setGenerating(true); setError('')
    try {
      // Load previous month's fairness snapshot
      const schedules = await schedulesStore.list()
      const prev = schedules.find((s) => s.month === prevMonth(month))
      const fairness = prev?.fairnessSnapshot || {}

      const { assignments, fairnessSnapshot } = generateSchedule(month, people, fairness)
      const record = {
        id:                `schedule-${month}`,
        month,
        assignments,
        fairnessSnapshot,
      }
      await schedulesStore.upsert(record)
      setSchedule(record)
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!schedule) return
    setSaving(true); setError('')
    try { await schedulesStore.upsert(schedule) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  function onDragStart(date, center, personId) { setDragSrc({ date, center, personId }) }

  function onDrop(tgtDate, tgtCenter) {
    if (!dragSrc || !schedule) return
    if (dragSrc.date === tgtDate && dragSrc.center === tgtCenter) { setDragSrc(null); return }

    setSchedule((prev) => {
      const next = prev.assignments.map((a) => {
        // Move the dragged person to the new date
        if (a.date === dragSrc.date && a.center === dragSrc.center && a.personId === dragSrc.personId) {
          const we = isWeekend(tgtDate)
          const hol = getHoliday(tgtDate, CENTERS.find(c=>c.id===tgtCenter)?.country||'')
          return { ...a, date: tgtDate, center: tgtCenter, isWeekend: we, isHoliday: !!hol, holidayName: hol||'', dayOffGranted: we || !!hol }
        }
        return a
      })
      return { ...prev, assignments: next }
    })
    setDragSrc(null)
  }

  // ── Comment ──────────────────────────────────────────────────────────────
  function clearAssignment(date, center, personId) {
    setSchedule((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.date === date && a.center === center && a.personId === personId
          ? { ...a, cleared: true }
          : a
      ),
    }))
  }

  function restoreAssignment(date, center, personId) {
    setSchedule((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.date === date && a.center === center && a.personId === personId
          ? { ...a, cleared: false }
          : a
      ),
    }))
  }

  function openComment(date, center, personId) {
    const a = schedule?.assignments.find((x) => x.date === date && x.center === center && x.personId === personId)
    setCommentModal({ date, center, personId, text: a?.comment || '' })
  }

  function saveComment() {
    if (!commentModal) return
    setSchedule((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.date === commentModal.date && a.center === commentModal.center && a.personId === commentModal.personId
          ? { ...a, comment: commentModal.text }
          : a
      ),
    }))
    setCommentModal(null)
  }

  // ── Delete schedule ──────────────────────────────────────────────────────
  async function handleDelete() {
    if (!schedule) return
    if (!confirm(`Delete the schedule for ${month}? This cannot be undone.`)) return
    setSaving(true); setError('')
    try {
      await schedulesStore.remove(schedule.id)
      setSchedule(null)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Print / PDF ───────────────────────────────────────────────────────────
  function handlePrint() { window.print() }

  // ── Derived data ─────────────────────────────────────────────────────────
  const days = useMemo(() => getDaysInMonth(month), [month])
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people])
  const centerPeople = useMemo(() => {
    const map = {}
    for (const c of CENTERS) map[c.id] = people.filter((p) => getCenter(p) === c.id)
    return map
  }, [people])

  const assignmentMap = useMemo(() => {
    const m = {}
    for (const a of (schedule?.assignments || [])) {
      const key = `${a.date}|${a.center}`
      if (!m[key]) m[key] = []
      m[key].push(a)
    }
    return m
  }, [schedule])

  // Summary stats per person for this month
  const stats = useMemo(() => {
    const s = {}
    for (const a of (schedule?.assignments || [])) {
      if (a.cleared) continue
      if (!s[a.personId]) s[a.personId] = { total:0, weekend:0, holiday:0 }
      s[a.personId].total++
      if (a.isWeekend) s[a.personId].weekend++
      if (a.isHoliday) s[a.personId].holiday++
    }
    return s
  }, [schedule])

  // ── Render ────────────────────────────────────────────────────────────────
  const center = CENTERS.find((c) => c.id === activeCenter)

  return (
    <div className="work-schedule-page">
      {/* ── Header ── */}
      <div className="page-header no-print">
        <h1>Work Schedule — {TEAM_NAME}</h1>
        <p>Monthly scheduling for all OPS centers. Drag to reassign, click 💬 to comment.</p>
      </div>

      {/* ── Controls ── */}
      <div className="ws-controls no-print">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="btn ghost" onClick={() => setMonth(prevMonth(month))}>‹</button>
          <span style={{ fontWeight:600, fontSize:15, minWidth:90, textAlign:'center' }}>
            {new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
          </span>
          <button className="btn ghost" onClick={() => setMonth(nextMonth(month))}>›</button>
          <button className="btn ghost" onClick={() => setMonth(todayMonth())} style={{ fontSize:12 }}>Today</button>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {error && <span style={{ color:'var(--bad)', fontSize:13, alignSelf:'center' }}>⚠️ {error}</span>}
          <button className="btn" onClick={handleGenerate} disabled={generating || loading || people.length===0}
            style={{ fontSize:13 }}>
            {generating ? '⏳ Generating…' : schedule ? '↻ Regenerate' : '✦ Generate schedule'}
          </button>
          {schedule && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {autoSaved === 'saving' && <span style={{ fontSize:12, color:'var(--text-faint)' }}>⏳ Auto-saving…</span>}
              {autoSaved === 'saved'  && <span style={{ fontSize:12, color:'var(--good)' }}>✓ Auto-saved</span>}
              <button className="btn primary" onClick={handleSave} disabled={saving} style={{ fontSize:13 }}>
                {saving ? 'Saving…' : '💾 Save'}
              </button>
            </div>
          )}
          {schedule && <button className="btn ghost danger" onClick={handleDelete} disabled={saving} style={{ fontSize:13 }}>🗑️ Delete</button>}
          {schedule && <button className="btn" onClick={handlePrint} style={{ fontSize:13 }}>🖨️ Print PDF</button>}
        </div>
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && people.length === 0 && (
        <div className="empty-state">
          <div className="icon">👥</div>
          No team members found in "{TEAM_NAME}". Make sure direct reports have their team set correctly.
        </div>
      )}
      {!loading && people.length > 0 && !schedule && (
        <div className="empty-state">
          <div className="icon">📅</div>
          No schedule for this month yet. Click "✦ Generate schedule" to create one automatically.
        </div>
      )}

      {schedule && (
        <>
          {/* ── Center tabs ── */}
          <div className="ws-tabs no-print">
            {CENTERS.map((c) => (
              <button key={c.id}
                className={`ws-tab ${activeCenter===c.id?'active':''}`}
                onClick={() => setActiveCenter(c.id)}>
                {c.label}
                <span style={{ fontSize:11, marginLeft:6, opacity:0.7 }}>{c.hours}</span>
              </button>
            ))}
          </div>

          {/* ── Stats row ── */}
          <div className="ws-stats no-print">
            {(centerPeople[activeCenter]||[]).map((p) => {
              const s = stats[p.id] || { total:0, weekend:0, holiday:0 }
              const prev = schedule.fairnessSnapshot?.[p.id]
              const hrs  = s.total * 8
              const over = hrs > 168
              return (
                <div key={p.id} className="ws-stat-chip" style={{ borderColor: over ? 'var(--bad)' : undefined }}>
                  <Avatar photo={p.photo} name={p.name} size={22} />
                  <strong>{p.name}</strong>
                  <span style={{ color: over ? 'var(--bad)' : undefined }} title={`${s.total} days × 8h`}>{hrs}h</span>
                  <span style={{ color:'var(--text-faint)', fontSize:11 }}>{s.total}d</span>
                  {s.weekend > 0 && <span style={{ color:'var(--warn)' }} title="Weekend days">🏖️{s.weekend}</span>}
                  {s.holiday > 0 && <span style={{ color:'var(--bad)' }} title="Holiday days">📅{s.holiday}</span>}
                  {prev && <span style={{ color:'var(--text-faint)', fontSize:10 }} title="Cumulative weekend days all months">∑{prev.weekendTotal}we</span>}
                </div>
              )
            })}
          </div>

          {/* ── Calendar grid ── */}
          {CENTERS.map((c) => (
            <div key={c.id} className={`ws-center-block ${activeCenter===c.id?'':'hidden-screen'}`}>
              {/* Print header per center */}
              <div className="print-only ws-print-header">
                <h2>{c.label} — {c.hours}</h2>
                <p>{new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</p>
              </div>

              <div className="ws-calendar">
                {/* Week header */}
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                  <div key={d} className="ws-day-header">{d}</div>
                ))}

                {/* Empty cells before first day */}
                {Array.from({ length: (new Date(days[0]).getDay()+6)%7 }).map((_,i) => (
                  <div key={`empty-${i}`} className="ws-day-cell ws-day-empty" />
                ))}

                {/* Day cells */}
                {days.map((dateStr) => {
                  const a    = assignmentMap[`${dateStr}|${c.id}`]
                  const we   = isWeekend(dateStr)
                  const hol  = getHoliday(dateStr, c.country)
                  const drag = dragSrc?.date===dateStr && dragSrc?.center===c.id

                  return (
                    <div key={dateStr}
                      className={`ws-day-cell ${we?'ws-weekend':''} ${hol?'ws-holiday':''} ${drag?'ws-dragging':''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(dateStr, c.id)}>
                      <div className="ws-day-num">
                        {fmtDay(dateStr)}
                        {hol && <span className="ws-hol-label" title={hol}>🗓️</span>}
                      </div>
                      {(() => {
                        const dayAssignments = assignmentMap[`${dateStr}|${c.id}`] || []
                        if (dayAssignments.length === 0) return <div className="ws-chip ws-chip-empty">—</div>
                        return dayAssignments.map((a) => a.cleared ? (
                          <div key={a.personId} className="ws-chip ws-chip-cleared"
                            onClick={() => restoreAssignment(dateStr, c.id, a.personId)}>
                            <span style={{ fontSize:10 }}>🚫 {a.personName.split(' ')[0]}</span>
                            <button className="ws-clear-btn" onClick={(e) => { e.stopPropagation(); restoreAssignment(dateStr, c.id, a.personId) }}>↩</button>
                          </div>
                        ) : (
                          <div key={a.personId} className="ws-chip"
                            draggable
                            onDragStart={() => onDragStart(dateStr, c.id, a.personId)}>
                            <Avatar photo={peopleById[a.personId]?.photo} name={a.personName} size={18} />
                            <span className="ws-chip-name">{a.personName}</span>
                            <div className="ws-chip-actions">
                              {a.dayOffGranted && <span title="Day-off credit">💤</span>}
                              <button className="ws-comment-btn"
                                onClick={(e) => { e.stopPropagation(); openComment(dateStr, c.id, a.personId) }}
                                title={a.comment || 'Add comment'}>
                                {a.comment ? '💬' : '○'}
                              </button>
                              <button className="ws-clear-btn"
                                onClick={(e) => { e.stopPropagation(); clearAssignment(dateStr, c.id, a.personId) }}
                                title="Remove from this day">✕</button>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="ws-legend no-print">
                <span className="ws-legend-item ws-weekend-sample">Weekend</span>
                <span className="ws-legend-item ws-holiday-sample">Public holiday</span>
                <span className="ws-legend-item">💤 Day-off credit</span>
                <span className="ws-legend-item">💬 Has comment</span>
                <span className="ws-legend-item" style={{ color:'var(--text-faint)' }}>Drag to swap</span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Comment modal ── */}
      {commentModal && (
        <div className="overlay no-print" onMouseDown={(e) => e.target===e.currentTarget&&setCommentModal(null)}>
          <div className="modal" style={{ maxWidth:400 }}>
            <h2>Comment — {fmtDate(commentModal.date)}</h2>
            <div className="field">
              <label>Note</label>
              <textarea value={commentModal.text}
                onChange={(e) => setCommentModal((m) => ({ ...m, text:e.target.value }))}
                placeholder="Leave-request, training, swap agreement…"
                style={{ minHeight:100 }} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setCommentModal(null)}>Cancel</button>
              <button className="btn primary" onClick={saveComment}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
