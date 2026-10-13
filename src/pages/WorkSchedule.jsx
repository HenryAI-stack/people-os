import React, { useEffect, useMemo, useRef, useState } from 'react'
import { directReportsStore, schedulesStore } from '../lib/dataStore'
import { Avatar } from './DirectReports.jsx'
import { CENTERS, getCenter, generateSchedule, weekStart, SHIFT_HOURS, MAX_WEEKLY_HOURS } from '../lib/scheduleGenerator.js'
import { downloadScheduleExcel, buildScheduleExcelFile, scheduleFileName } from '../lib/scheduleExcel.js'
import { uploadFileToSharePoint, checkMembersAccess, findSharePointFile, syncOnDutyCalendar } from '../lib/msGraph.js'
import { buildOnDutyEntries, calendarMarker } from '../lib/onDutyCalendar.js'
import { getDaysInMonth, isWeekend, getHoliday } from '../lib/holidays.js'
import { flagUrl } from '../lib/locationFlag.js'
import { isBirthdayOn } from '../lib/birthdays.js'
import { sendScheduleEmailNow, SCHEDULE_ACTIONS_URL } from '../lib/githubActions.js'
import { DraggableModal } from '../components/DraggableModal.jsx'

const TEAM_NAME = '24/7 Core Operations'
// "Upload to SharePoint" target: this site's default document library (Shared Documents) → "Work schedule" folder.
const SHAREPOINT_SITE   = 'https://ul.sharepoint.com/sites/GRPGlobal247CoreOperations'
const SHAREPOINT_FOLDER = 'Work schedule'
// The team's On-duty calendar page on that site; its calendar is updated on every upload too.
const ONDUTY_CALENDAR_PAGE = 'On-Duty-Calendar.aspx'

// ── Helpers ──────────────────────────────────────────────────────────────────
// dateStr is a plain 'YYYY-MM-DD' calendar date with no timezone of its own.
// `new Date(dateStr)` parses it as UTC midnight, so every read-back below
// passes timeZone:'UTC' (or avoids Date entirely) rather than using the
// browser's local getters/formatting — otherwise the displayed day can shift
// by one depending on the viewer's UTC offset.
function fmtDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' })
}
function fmtDay(dateStr) {
  return Number(dateStr.split('-')[2])
}
function fmtWeekday(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday:'short', timeZone:'UTC' })
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
  const [shiftModal,  setShiftModal]  = useState(null)  // { date, center, personId } — click-to-swap/remove
  const [exportingExcel, setExportingExcel] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [uploadingSp, setUploadingSp] = useState(false)
  const [replaceAsk,  setReplaceAsk]  = useState(null)  // existing SharePoint file → "Replace it?" modal
  const [teamsPost,   setTeamsPost]   = useState(null)  // after an upload: { text, html, webUrl, name, replaced, access, copied }
  const [toast, setToast] = useState(null)  // { msg, href?, linkLabel?, tone?: 'warn' }

  function showToast(msg, opts) {
    setToast({ msg, ...opts })
    setTimeout(() => setToast(null), opts?.tone === 'warn' ? 15000 : opts?.href ? 9000 : 4000)
  }

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

      // Last month's shifts let the 40h/week cap see weeks that straddle the month boundary.
      const { assignments, fairnessSnapshot } = generateSchedule(month, people, fairness, prev?.assignments || [])
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

  // Replace one person's shift with another person (same date + center). Any *cleared* entry the
  // replacement already had on that day is dropped, so they don't end up listed twice.
  function swapAssignment(date, center, fromId, toPerson) {
    setSchedule((prev) => ({
      ...prev,
      assignments: prev.assignments
        .filter((a) => !(a.date === date && a.center === center && a.personId === toPerson.id && a.cleared))
        .map((a) =>
          a.date === date && a.center === center && a.personId === fromId
            ? { ...a, personId: toPerson.id, personName: toPerson.name, cleared: false }
            : a
        ),
    }))
  }

  // Add a person to a day (empty day, or an extra person on a short-staffed one). Same fields
  // the generator's makeAssignment writes; drops any cleared entry they had that day.
  function addAssignment(date, center, person) {
    const hol = getHoliday(date, CENTERS.find((x) => x.id === center)?.country || '')
    const we  = isWeekend(date)
    setSchedule((prev) => ({
      ...prev,
      assignments: [
        ...prev.assignments.filter((a) => !(a.date === date && a.center === center && a.personId === person.id && a.cleared)),
        { date, center, personId: person.id, personName: person.name, isWeekend: we, isHoliday: !!hol,
          holidayName: hol || '', dayOffGranted: we || !!hol, cleared: false, comment: '' },
      ],
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

  // ── Excel export ─────────────────────────────────────────────────────────
  async function handleExportExcel() {
    setExportingExcel(true); setError('')
    try { await downloadScheduleExcel(month, people, schedule) }
    catch (e) { setError(e.message) }
    finally { setExportingExcel(false) }
  }

  // ── Send via Email ───────────────────────────────────────────────────────
  // Fires schedule-email.yml (GitHub Actions), which rebuilds the same PDF +
  // Excel server-side (from the saved schedule) and emails both as attachments
  // via Resend — the actual send always happens server-side so no mail key
  // ships in the browser bundle. See src/lib/githubActions.js.
  async function handleSendEmail() {
    setSendingEmail(true); setError('')
    try {
      await sendScheduleEmailNow(month)
      showToast(`📧 Schedule email for ${month} queued — check your inbox in a minute.`, { href: SCHEDULE_ACTIONS_URL, linkLabel: 'View run →' })
    } catch (e) { setError(e.message) }
    finally { setSendingEmail(false) }
  }

  // ── Upload to SharePoint ─────────────────────────────────────────────────
  // Builds the same .xlsx as "Export Excel" and PUTs it into the 24/7 site's Shared Documents
  // via Microsoft Graph (token from the Settings page). Re-uploading a month replaces the file;
  // SharePoint keeps the previous one in its version history.
  // If that month's file is already on SharePoint, ask before replacing it (ReplaceScheduleModal);
  // otherwise upload straight away.
  async function handleUploadSharePoint() {
    setUploadingSp(true); setError(''); setToast(null)
    try {
      const existing = await findSharePointFile({ siteUrl: SHAREPOINT_SITE, folder: SHAREPOINT_FOLDER, filename: scheduleFileName(month) })
      if (existing) { setReplaceAsk(existing); return }
      await uploadToSharePoint()
    } catch (e) { setError(e.message) }
    finally { setUploadingSp(false) }
  }

  async function confirmReplace() {
    setReplaceAsk(null); setUploadingSp(true); setError('')
    try { await uploadToSharePoint() }
    catch (e) { setError(e.message) }
    finally { setUploadingSp(false) }
  }

  async function uploadToSharePoint() {
    const { buffer, filename, mimeType } = await buildScheduleExcelFile(month, people, schedule)
    const res = await uploadFileToSharePoint({ siteUrl: SHAREPOINT_SITE, folder: SHAREPOINT_FOLDER, filename, data: buffer, contentType: mimeType })
    // Members should only be able to view: that comes from the folder's own permissions (one-time
    // setup, see INSTALLATION.md) — here we just verify it and warn if it isn't so.
    const access = await checkMembersAccess(res)
    // On-duty calendar: replace this month's PeopleOS entries (one per center per day). Never fails
    // the upload — the result (or the reason it didn't work) is shown in the Teams modal.
    let calendar
    try {
      const entries = buildOnDutyEntries(month, schedule)
      calendar = { ok: true, ...(await syncOnDutyCalendar({ siteUrl: SHAREPOINT_SITE, pageName: ONDUTY_CALENDAR_PAGE, month, marker: calendarMarker(month), entries })) }
    } catch (e) { calendar = { ok: false, error: e.message } }
    // Ready-to-paste Teams announcement → clipboard. Copying can be refused this long after the
    // click (Safari/iOS especially); the "Share in Teams" modal then offers a Copy button.
    const msg = teamsMessage(month, res, calendar.ok && calendar.created > 0)
    const copied = await copyRichText(msg.html, msg.text)
    setTeamsPost({ ...msg, webUrl: res.webUrl, name: res.name, replaced: res.replaced, access: access.status, calendar, copied })
  }

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
      if (!s[a.personId]) s[a.personId] = { total:0, weekend:0, holiday:0, weeks:{} }
      s[a.personId].total++
      const w = weekStart(a.date)
      s[a.personId].weeks[w] = (s[a.personId].weeks[w] || 0) + 1
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
        <p>Monthly scheduling for all OPS centers. Click a name to swap or remove, click an empty day or + to assign, drag to move, click 💬 to comment.</p>
      </div>

      {/* ── Controls ── */}
      <div className="ws-controls no-print">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="btn ghost" onClick={() => setMonth(prevMonth(month))}>‹</button>
          <span style={{ fontWeight:600, fontSize:15, minWidth:90, textAlign:'center' }}>
            {new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}
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
          {schedule && (
            <button className="btn" onClick={handleExportExcel} disabled={exportingExcel} style={{ fontSize:13 }}>
              {exportingExcel ? '⏳ Exporting…' : '📊 Export Excel'}
            </button>
          )}
          {schedule && (
            <button className="btn" onClick={handleSendEmail} disabled={sendingEmail} style={{ fontSize:13 }}
              title={`Email the ${month} schedule (PDF + Excel) — recipient set by SCHEDULE_EMAIL_TO in schedule-email.yml`}>
              {sendingEmail ? '⏳ Queuing…' : '📧 Send via Email'}
            </button>
          )}
          {schedule && (
            <button className="btn" onClick={handleUploadSharePoint} disabled={uploadingSp} style={{ fontSize:13 }}
              title="Upload this month's Excel file to the 24/7 Core Operations SharePoint (Shared Documents › Work schedule)">
              {uploadingSp ? '⏳ Uploading…' : '☁️ Upload to SharePoint'}
            </button>
          )}
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
                <img className="ws-tab-flag" src={flagUrl(c.country)} alt={c.country} />
                {c.label}
                <span style={{ fontSize:11, marginLeft:6, opacity:0.7 }}>{c.hours}</span>
              </button>
            ))}
          </div>

          {/* ── Stats row ── */}
          <div className="ws-stats no-print">
            {(centerPeople[activeCenter]||[]).map((p) => {
              const s = stats[p.id] || { total:0, weekend:0, holiday:0, weeks:{} }
              const prev = schedule.fairnessSnapshot?.[p.id]
              const hrs  = s.total * SHIFT_HOURS
              const maxWeek = Math.max(0, ...Object.values(s.weeks)) * SHIFT_HOURS
              const over = maxWeek > MAX_WEEKLY_HOURS
              const weekTitle = Object.entries(s.weeks).sort().map(([w, n]) => `Week of ${w}: ${n * SHIFT_HOURS}h`).join('\n')
              return (
                <div key={p.id} className="ws-stat-chip" style={{ borderColor: over ? 'var(--bad)' : undefined }}>
                  <Avatar photo={p.photo} name={p.name} size={22} />
                  <strong>{p.name}</strong>
                  <span title={`${s.total} days × ${SHIFT_HOURS}h`}>{hrs}h</span>
                  <span style={{ color: over ? 'var(--bad)' : 'var(--text-faint)', fontSize:11 }} title={weekTitle || 'No shifts'}>
                    {over ? '⚠ ' : ''}max {maxWeek}h/wk
                  </span>
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
                <h2><img className="ws-tab-flag" src={flagUrl(c.country)} alt={c.country} /> {c.label} — {c.hours}</h2>
                <p>{new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}</p>
              </div>

              <div className="ws-calendar">
                {/* Week header */}
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                  <div key={d} className="ws-day-header">{d}</div>
                ))}

                {/* Empty cells before first day */}
                {Array.from({ length: (new Date(days[0]).getUTCDay()+6)%7 }).map((_,i) => (
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
                        <span className="ws-day-wd">{fmtWeekday(dateStr)}</span>
                        {fmtDay(dateStr)}
                        {hol && <span className="ws-hol-label" title={hol}>🗓️</span>}
                        {hol && <span className="ws-hol-name">{hol}</span>}
                        <button className="ws-add-btn no-print" title="Assign someone to this day"
                          onClick={() => setShiftModal({ date: dateStr, center: c.id, personId: null })}>+</button>
                      </div>
                      {(() => {
                        const dayAssignments = assignmentMap[`${dateStr}|${c.id}`] || []
                        if (dayAssignments.length === 0) return (
                          <div className="ws-chip ws-chip-empty" style={{ cursor:'pointer' }} title="Click to assign someone"
                            onClick={() => setShiftModal({ date: dateStr, center: c.id, personId: null })}>—</div>
                        )
                        return dayAssignments.map((a) => a.cleared ? (
                          <div key={a.personId} className="ws-chip ws-chip-cleared"
                            onClick={() => restoreAssignment(dateStr, c.id, a.personId)}>
                            <span style={{ fontSize:10 }}>🚫 {a.personName.split(' ')[0]}</span>
                            <button className="ws-clear-btn" onClick={(e) => { e.stopPropagation(); restoreAssignment(dateStr, c.id, a.personId) }}>↩</button>
                          </div>
                        ) : (
                          <div key={a.personId} className="ws-chip"
                            draggable
                            onDragStart={() => onDragStart(dateStr, c.id, a.personId)}
                            onClick={() => setShiftModal({ date: dateStr, center: c.id, personId: a.personId })}
                            title="Click to swap or remove · drag to move">
                            <Avatar photo={peopleById[a.personId]?.photo} name={a.personName} size={18} />
                            <span className="ws-chip-name" title={a.personName}>{a.personName}</span>
                            <div className="ws-chip-actions">
                              {isBirthdayOn(peopleById[a.personId]?.birthday, dateStr) && <span title={`${a.personName}'s birthday — consider swapping`}>🎂</span>}
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
                <span className="ws-legend-item">🎂 Birthday shift (avoided — consider swapping)</span>
                <span className="ws-legend-item" style={{ color:'var(--text-faint)' }}>Click a name to swap or remove · click an empty day or + to assign · drag to move</span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Swap / remove modal ── */}
      {shiftModal && (
        <ShiftModal
          shift={shiftModal}
          center={CENTERS.find((x) => x.id === shiftModal.center)}
          candidates={centerPeople[shiftModal.center] || []}
          assignments={schedule?.assignments || []}
          stats={stats}
          onClose={() => setShiftModal(null)}
          onSwap={(toPerson) => {
            if (shiftModal.personId) swapAssignment(shiftModal.date, shiftModal.center, shiftModal.personId, toPerson)
            else addAssignment(shiftModal.date, shiftModal.center, toPerson)
            setShiftModal(null)
          }}
          onRemove={() => { clearAssignment(shiftModal.date, shiftModal.center, shiftModal.personId); setShiftModal(null) }}
        />
      )}

      {/* ── Comment modal ── */}
      {replaceAsk && (
        <ReplaceScheduleModal existing={replaceAsk} month={month} onReplace={confirmReplace} onCancel={() => setReplaceAsk(null)} />
      )}

      {teamsPost && (
        <TeamsPostModal post={teamsPost} folder={SHAREPOINT_FOLDER}
          onCopy={async () => { const ok = await copyRichText(teamsPost.html, teamsPost.text); setTeamsPost((p) => ({ ...p, copied: ok, copyFailed: !ok })) }}
          onClose={() => setTeamsPost(null)} />
      )}

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

      {toast && (
        <div className="no-print" style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', border: `1px solid ${toast.tone === 'warn' ? 'var(--warn)' : 'var(--good)'}`, color: toast.tone === 'warn' ? 'var(--warn)' : 'var(--good)', borderRadius: 10, padding: '11px 20px', fontSize: 13.5, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 100, maxWidth: '90vw' }}>
          {toast.msg}{' '}
          {toast.href && <a href={toast.href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{toast.linkLabel}</a>}
        </div>
      )}
    </div>
  )
}

// ── Swap / remove modal ──────────────────────────────────────────────────────
function prevDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

const daysLabel = (n) => `${n} ${n === 1 ? 'day' : 'days'} this month`

function ShiftModal({ shift, center, candidates, assignments, stats, onClose, onSwap, onRemove }) {
  const [toId, setToId] = useState('')
  // personId null = assign mode (empty day or "+"): no current person, no remove button.
  const current = shift.personId
    ? assignments.find((a) => a.date === shift.date && a.center === shift.center && a.personId === shift.personId)
    : null
  if ((shift.personId && !current) || !center) return null

  const sameDay = (a) => a.date === shift.date && a.center === shift.center && !a.cleared
  const onThisDay = new Set(assignments.filter(sameDay).map((a) => a.personId))

  // Mirrors the generator's rest rule: working a Sunday or public holiday earns the next day off.
  const prev = prevDateStr(shift.date)
  const [py, pm, pd] = prev.split('-').map(Number)
  const prevWasSunday  = new Date(Date.UTC(py, pm - 1, pd)).getUTCDay() === 0
  const prevHoliday    = getHoliday(prev, center.country)
  const restDay = new Set(
    prevWasSunday || prevHoliday
      ? assignments.filter((a) => a.date === prev && a.center === shift.center && !a.cleared).map((a) => a.personId)
      : []
  )

  const options  = candidates.filter((p) => p.id !== shift.personId)
  const toPerson = options.find((p) => p.id === toId)
  const hol = getHoliday(shift.date, center.country)
  const tag = hol ? `🗓️ ${hol}` : isWeekend(shift.date) ? 'Weekend' : null

  return (
    <DraggableModal title={current ? 'Change shift' : 'Assign shift'} onClose={onClose} maxWidth={440}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--text-dim)', marginBottom:14, flexWrap:'wrap' }}>
        <img className="ws-tab-flag" src={flagUrl(center.country)} alt={center.country} />
        <strong style={{ color:'var(--text)' }}>{center.label}</strong>
        <span>· {fmtDate(shift.date)} · {center.hours}</span>
        {tag && <span className="badge warn" style={{ fontSize:11 }}>{tag}</span>}
      </div>

      {current && <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, marginBottom:16 }}>
        <Avatar photo={candidates.find((p) => p.id === current.personId)?.photo} name={current.personName} size={32} />
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>{current.personName}</div>
          <div style={{ fontSize:12, color:'var(--text-faint)' }}>Currently on this shift · {daysLabel(stats[current.personId]?.total || 0)}</div>
        </div>
      </div>}

      <div className="field">
        <label>{current ? 'Swap with' : 'Assign'}</label>
        {options.length === 0
          ? <div style={{ fontSize:13, color:'var(--text-faint)' }}>No {current ? 'other ' : ''}team members at this center.</div>
          : (
            <select value={toId} onChange={(e) => setToId(e.target.value)} autoFocus>
              <option value="">{current ? '— Select a replacement —' : '— Select a person —'}</option>
              {options.map((p) => {
                const busy = onThisDay.has(p.id)
                return (
                  <option key={p.id} value={p.id} disabled={busy}>
                    {p.name}{busy ? ' (already on this day)' : restDay.has(p.id) ? ' ⚠ rest day' : ''}{!busy && isBirthdayOn(p.birthday, shift.date) ? ' 🎂 birthday' : ''}
                  </option>
                )
              })}
            </select>
          )}
        {toPerson && restDay.has(toPerson.id) && (
          <div style={{ fontSize:12, color:'var(--warn)', marginTop:6 }}>
            ⚠ {toPerson.name} worked the {prevHoliday ? `holiday (${prevHoliday})` : 'Sunday'} before — the schedule rules give them this day off. You can still swap.
          </div>
        )}
        {toPerson && isBirthdayOn(toPerson.birthday, shift.date) && (
          <div style={{ fontSize:12, color:'var(--warn)', marginTop:6 }}>
            🎂 It's {toPerson.name}'s birthday — the schedule avoids giving people a shift that day. You can still {current ? 'swap' : 'assign'}.
          </div>
        )}
      </div>

      <div className="modal-actions" style={{ justifyContent: current ? 'space-between' : 'flex-end' }}>
        {current && <button className="btn ghost danger" onClick={onRemove} title="Mark as removed — can be restored with ↩">🚫 Remove from this day</button>}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!toPerson} onClick={() => onSwap(toPerson)}>{current ? 'Swap' : 'Assign'}</button>
        </div>
      </div>
    </DraggableModal>
  )
}

// ── Teams announcement after "Upload to SharePoint" ─────────────────────────────
function monthLabel(month) {
  return new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/** Short channel post: plain text (any app) + HTML (Teams keeps the bold title and the link). */
function teamsMessage(month, { webUrl, replaced }, calendarUpdated = false) {
  const m = monthLabel(month)
  const title = replaced ? `📅 24/7 work schedule updated: ${m}` : `📅 New 24/7 work schedule published: ${m}`
  const cal = calendarUpdated ? ' The On-duty calendar is updated as well.' : ''
  const body = replaced
    ? `The work schedule for ${m} has been updated on SharePoint.${cal} Please check the latest version:`
    : `The work schedule for ${m} is now available on SharePoint.${cal} Open it here:`
  return {
    text: `${title}\n${body}\n${webUrl}`,
    html: `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(body)} <a href="${escapeHtml(webUrl)}">Open the ${escapeHtml(m)} schedule</a></p>`,
  }
}

/** Copies HTML + plain text where supported, plain text otherwise. Resolves true/false, never throws. */
async function copyRichText(html, text) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      return true
    }
  } catch { /* fall through to plain text */ }
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function TeamsPostModal({ post, folder, onCopy, onClose }) {
  const statusLine = post.access === 'readOnly' ? <span style={{ color: 'var(--good)' }}>Members can view only ✓</span>
    : post.access === 'canEdit' ? <span style={{ color: 'var(--warn)' }}>⚠ Site Members can still edit this file. Make the "{folder}" folder view-only for Members (one-time, see INSTALLATION.md).</span>
    : <span style={{ color: 'var(--text-faint)' }}>Couldn't verify Members' permissions.</span>
  const [title, ...rest] = post.text.split('\n')
  return (
    <DraggableModal title="📣 Share in Teams" onClose={onClose} maxWidth={500}>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        ☁️ <strong style={{ color: 'var(--text)' }}>{post.name}</strong> {post.replaced ? 'updated' : 'uploaded'} on SharePoint.<br />{statusLine}
        {post.calendar && <><br />{post.calendar.ok
          ? <span style={{ color: post.calendar.failed ? 'var(--warn)' : 'var(--good)' }}>
              📅 On-duty calendar updated: {post.calendar.created} {post.calendar.created === 1 ? 'entry' : 'entries'} in “{post.calendar.listName}”
              {post.calendar.deleted > 0 && <> (replaced {post.calendar.deleted} old)</>}{post.calendar.failed > 0 && <>, {post.calendar.failed} failed</>}{!post.calendar.failed && ' ✓'}
            </span>
          : <span style={{ color: 'var(--warn)' }}>⚠ On-duty calendar not updated: {post.calendar.error}</span>}</>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: post.copied ? 'var(--good)' : 'var(--text-dim)' }}>
        {post.copied ? '✓ Teams message copied: paste it into your channel (Ctrl+V / ⌘V).'
          : post.copyFailed ? 'Copying was blocked by the browser. Select the text below and copy it manually.'
          : 'Click "Copy message", then paste it into your Teams channel.'}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg)', fontSize: 13.5, lineHeight: 1.55, userSelect: 'text', overflowWrap: 'anywhere' }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div>{rest[0]}</div>
        <a href={post.webUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 12.5 }}>{rest[1]}</a>
      </div>
      <div className="modal-actions">
        <a className="btn ghost" href={post.webUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open file</a>
        <button className="btn" onClick={onCopy}>{post.copied ? '✓ Copied: copy again' : '📋 Copy message'}</button>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </DraggableModal>
  )
}

// Asked before "Upload to SharePoint" replaces a month that's already there.
function ReplaceScheduleModal({ existing, month, onReplace, onCancel }) {
  const when = existing.lastModified?.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <DraggableModal title="Replace existing schedule?" onClose={onCancel} maxWidth={460}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 10px' }}>
        A work schedule for <strong>{monthLabel(month)}</strong> is already on SharePoint:{' '}
        <a href={existing.webUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{existing.name}</a>
        {when && <> — last changed {when}{existing.lastModifiedBy && <> by {existing.lastModifiedBy}</>}</>}.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)', margin: 0 }}>
        Replacing it uploads the current version from PeopleOS. The previous file stays in SharePoint's
        version history, where it can be restored.
      </p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={onReplace} autoFocus>Replace</button>
      </div>
    </DraggableModal>
  )
}
