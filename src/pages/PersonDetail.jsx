import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { directReportsStore, interviewsStore, followUpsStore } from '../lib/dataStore'
import { Avatar, ReportForm } from './DirectReports.jsx'
import { urgencyLabel } from './FollowUps.jsx'
import { getCountryCode, flagUrl } from '../lib/locationFlag.js'
import { generateTags, generateTakeaways } from '../lib/autoTags.js'
import { DraggableModal } from '../components/DraggableModal.jsx'

const INTERVIEW_TYPES = {
  '1:1': '1:1', skip_level: 'Skip-level', hiring: 'Hiring interview',
  exit: 'Exit interview', performance: 'Performance review', team_meeting: 'Team meeting',
}

const EMPTY_INTERVIEW = { title:'', type:'1:1', person:'', date:'', summary:'', takeaways:'', tags:'' }

// ── Anniversary helper ───────────────────────────────────────────────────────
function getNextAnniversary(startDateStr) {
  if (!startDateStr) return null
  const start = new Date(startDateStr)
  if (isNaN(start.getTime())) return null
  const today = new Date(); today.setHours(0,0,0,0)
  let next = new Date(today.getFullYear(), start.getMonth(), start.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate())
  const years = next.getFullYear() - start.getFullYear()
  const days  = Math.round((next - today) / 86400000)
  const ordinals = ['th','st','nd','rd']; const v = years % 100
  const ord = ordinals[(v-20)%10] || ordinals[v] || ordinals[0]
  const label = days === 0 ? '🎉 Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`
  return { years, ord, days, label }
}

// ── AI summary ───────────────────────────────────────────────────────────────
async function generateAISummary(person, interviews) {
  if (interviews.length === 0) throw new Error('No interviews to summarise yet.')
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) throw new Error('VITE_OPENROUTER_API_KEY is not set.')

  const tenure = person.startDate
    ? `Started ${person.startDate} (${Math.floor((Date.now()-new Date(person.startDate))/(365.25*24*3600*1000)*10)/10} years)`
    : null

  const profileLines = [
    `Name: ${person.name}`,
    person.role     ? `Role: ${person.role}`           : null,
    person.team     ? `Team: ${person.team}`           : null,
    person.level    ? `Level: ${person.level}`         : null,
    person.location ? `Location: ${person.location}`   : null,
    tenure          ? `Tenure: ${tenure}`              : null,
    person.status   ? `Status: ${person.status}`       : null,
    person.notes    ? `Manager notes: ${person.notes}` : null,
  ].filter(Boolean).join('\n')

  const interviewText = interviews.map((iv, i) =>
    `[${i+1}] ${iv.title} | Type: ${iv.type} | Date: ${iv.date||'no date'}\n` +
    (iv.summary   ? `Summary: ${iv.summary}\n`     : '') +
    (iv.takeaways ? `Takeaways: ${iv.takeaways}\n` : '') +
    (iv.tags      ? `Tags: ${iv.tags}\n`           : '')
  ).join('\n')

  const prompt =
    `You are a Chief of Staff preparing an executive summary for a senior leader.` +
    ` Write a concise, polished executive summary for the following direct report.\n\n` +
    `=== DIRECT REPORT PROFILE ===\n${profileLines}\n\n` +
    `=== INTERVIEW & 1:1 NOTES (${interviews.length} entries) ===\n${interviewText}\n\n` +
    `Structure your response with these clearly labelled sections:\n` +
    `**Executive Overview** — 2–3 sentence snapshot suitable for a leadership briefing.\n` +
    `**Key Strengths** — bullet list of 3–5 observed strengths with evidence from notes.\n` +
    `**Development Areas** — bullet list of 2–4 growth opportunities, specific and constructive.\n` +
    `**Recurring Themes** — patterns or topics that appear across multiple conversations.\n` +
    `**Open Actions & Risks** — any unresolved commitments, blockers, or concerns.\n` +
    `**Recommended Next Steps** — 2–3 concrete actions for the people leader.\n\n` +
    `Tone: professional, direct, and evidence-based.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://henryai-stack.github.io/people-os/',
      'X-Title': 'PeopleOS',
    },
    body: JSON.stringify({ model:'openrouter/free', max_tokens:1000, messages:[{ role:'user', content:prompt }] }),
  })

  if (!res.ok) { const e = await res.json().catch(()=>{}); throw new Error(e?.error?.message||`AI error (${res.status})`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PersonDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [person,         setPerson]         = useState(null)
  const [interviews,     setInterviews]     = useState([])
  const [followUps,      setFollowUps]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [expanded,       setExpanded]       = useState(null)
  const [addingIv,       setAddingIv]       = useState(false)
  const [editingIv,      setEditingIv]      = useState(null)
  const [confirmDel,     setConfirmDel]     = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [addingFU,       setAddingFU]       = useState(null)
  const [genSummary,     setGenSummary]     = useState(false)
  const [summaryErr,     setSummaryErr]     = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [people, allIvs, allFUs] = await Promise.all([
        directReportsStore.list(), interviewsStore.list(), followUpsStore.list(),
      ])
      const found = people.find((p) => p.id === id)
      if (!found) { setError('Person not found.'); setLoading(false); return }
      setPerson(found)
      setFollowUps(allFUs.filter((f) => f.personId === id || f.personId === found?.id))
      setInterviews(allIvs.filter((iv) => {
        const nameMatch = iv.person?.trim().toLowerCase() === found.name?.trim().toLowerCase()
        const idMatch   = iv.personId === found.id
        return nameMatch || idMatch
      }))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function handleSaveInterview(record) {
    await interviewsStore.upsert({ ...record, person:person.name, personId:person.id })
    setAddingIv(false); setEditingIv(null); load()
  }

  async function handleDeleteInterview(ivId) { setConfirmDel(ivId) }

  async function confirmDelete() {
    if (!confirmDel) return
    await interviewsStore.remove(confirmDel); setConfirmDel(null); load()
  }

  async function handleGenerateSummary() {
    setGenSummary(true); setSummaryErr('')
    try {
      const summary = await generateAISummary(person, interviews)
      // Use id from URL param (not person state) to guarantee correct record update
      const updated = { ...person, id, aiSummary:summary, aiSummaryDate:new Date().toISOString() }
      await directReportsStore.upsert(updated); setPerson(updated)
    } catch (e) { setSummaryErr(e.message) }
    finally { setGenSummary(false) }
  }

  if (loading) return <div className="empty-state">Loading…</div>
  if (error)   return <div><button className="btn ghost" onClick={() => navigate('/direct-reports')} style={{ marginBottom:20 }}>← Back</button><div style={{ color:'var(--bad)' }}>⚠️ {error}</div></div>

  const summaryDate = person.aiSummaryDate
    ? new Date(person.aiSummaryDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : null

  const ann = getNextAnniversary(person.startDate)
  const fc  = getCountryCode(person.location)

  return (
    <>
      <button className="btn ghost" onClick={() => navigate('/direct-reports')} style={{ marginBottom:20, paddingLeft:0 }}>← Direct Reports</button>

      {/* Person header */}
      <div className="card" style={{ display:'flex', alignItems:'center', gap:20, marginBottom:24 }}>
        <Avatar photo={person.photo} name={person.name} size={64} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, marginBottom:4 }}>{person.name}</div>
          <div style={{ color:'var(--text-dim)', fontSize:14, marginBottom:10 }}>
            {[person.role, person.team].filter(Boolean).join(' · ')}
            {person.location && <> · {person.location}{fc && <img src={flagUrl(fc)} alt={fc} style={{ width:20, height:15, objectFit:'cover', borderRadius:2, verticalAlign:'middle', marginLeft:4 }} />}</>}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {person.level && <Chip label="Level" value={person.level} />}
            {person.email && <Chip label="Email" value={person.email} />}
            {person.startDate && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Chip label="Since" value={person.startDate} />
                {ann && (
                  <div style={{ fontSize:12, color:ann.days<=30?'var(--warn)':'var(--text-faint)', background:ann.days<=30?'rgba(217,178,94,0.12)':'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', whiteSpace:'nowrap' }}>
                    🎂 {ann.years}{ann.ord} ann. · {ann.label}
                  </div>
                )}
              </div>
            )}
            <span className={`badge ${person.status==='active'?'good':'warn'}`} style={{ alignSelf:'center' }}>{person.status}</span>
          </div>
        </div>
        <button className="btn ghost" onClick={() => setEditingProfile(true)} style={{ alignSelf:'flex-start' }}>Edit profile</button>
      </div>

      {/* AI Summary */}
      <div style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div className="section-title" style={{ margin:0 }}>🤖 AI Summary</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {summaryDate && <span style={{ fontSize:12, color:'var(--text-faint)' }}>Last updated {summaryDate}</span>}
          <button className="btn" style={{ fontSize:12.5, padding:'6px 14px' }} onClick={handleGenerateSummary} disabled={genSummary||interviews.length===0}>
            {genSummary ? '⏳ Generating…' : person.aiSummary ? '↻ Regenerate' : '✦ Generate summary'}
          </button>
        </div>
      </div>
      <div className="card" style={{ marginBottom:28 }}>
        {summaryErr && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:12, padding:'8px 12px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {summaryErr}</div>}
        {genSummary && <div style={{ color:'var(--text-faint)', fontSize:14 }}>Analysing {interviews.length} interview{interviews.length!==1?'s':''}…</div>}
        {!genSummary && person.aiSummary && <div style={{ fontSize:14, lineHeight:1.75, whiteSpace:'pre-wrap' }}>{person.aiSummary}</div>}
        {!genSummary && !person.aiSummary && !summaryErr && <div style={{ color:'var(--text-faint)', fontSize:14 }}>{interviews.length===0 ? 'Add at least one interview below, then generate a summary.' : `Click "Generate summary" to analyse ${interviews.length} interview${interviews.length!==1?'s':''}.`}</div>}
      </div>

      {/* Open follow-ups for this person */}
      {followUps.filter((f) => !f.done).length > 0 && (
        <>
          <div className="section-title" style={{ marginBottom:10 }}>📋 Open follow-ups ({followUps.filter(f=>!f.done).length})</div>
          <div className="list" style={{ marginBottom:24 }}>
            {followUps.filter((f) => !f.done)
              .sort((a,b) => !a.dueDate?1:!b.dueDate?-1:new Date(a.dueDate)-new Date(b.dueDate))
              .map((f) => {
                const urg = urgencyLabel(f.dueDate, f.done)
                return (
                  <div className="row-card" key={f.id} style={{ gap:12 }}>
                    <input type="checkbox" checked={false}
                      onChange={async () => { await followUpsStore.upsert({ ...f, done:true }); load() }}
                      style={{ width:16, height:16, flexShrink:0, cursor:'pointer', accentColor:'var(--accent)' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="row-title" style={{ fontSize:13.5 }}>{f.text}</div>
                      {f.sourceTitle && <div className="row-sub">↳ {f.sourceTitle}</div>}
                    </div>
                    {urg.label && <span className={`badge ${urg.cls}`}>{urg.label}</span>}
                  </div>
                )
              })}
          </div>
        </>
      )}

      {/* Interviews */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div className="section-title" style={{ margin:0 }}>🗣️ Interviews & 1:1s ({interviews.length})</div>
        <button className="btn primary" style={{ fontSize:13, padding:'7px 14px' }} onClick={() => setAddingIv(true)}>+ Add interview</button>
      </div>
      {interviews.length === 0 && <div className="empty-state" style={{ padding:'28px 20px' }}><div style={{ fontSize:13, color:'var(--text-faint)' }}>No interviews logged yet for {person.name}.</div></div>}
      <div className="list" style={{ marginBottom:40 }}>
        {interviews.map((iv) => (
          <div className="row-card" key={iv.id} style={{ flexDirection:'column', alignItems:'stretch', cursor:'pointer' }}
            onClick={() => setExpanded(expanded===iv.id?null:iv.id)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
              <div className="row-main"><div><div className="row-title">{iv.title||'(untitled)'}</div><div className="row-sub">{iv.date||'no date'}</div>{iv.tags && (<div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>{iv.tags.split(',').map((t)=>t.trim()).filter(Boolean).map((t)=><span className="badge" key={t} style={{ fontSize:10.5, padding:'2px 7px' }}>{t}</span>)}</div>)}</div></div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="badge">{INTERVIEW_TYPES[iv.type]||iv.type}</span>
                <span style={{ color:'var(--text-faint)', fontSize:13 }}>{expanded===iv.id?'▲':'▼'}</span>
                <button className="btn ghost" style={{ fontSize:12, padding:'4px 8px' }} onClick={(e) => { e.stopPropagation(); setAddingFU(iv) }}>+ Follow-up</button>
                <button className="btn ghost" style={{ fontSize:12, padding:'4px 8px' }} onClick={(e) => { e.stopPropagation(); setEditingIv({ ...iv }) }}>Edit</button>
                <button className="btn ghost danger" style={{ fontSize:12, padding:'4px 8px' }} onClick={(e) => { e.stopPropagation(); handleDeleteInterview(iv.id) }}>Delete</button>
              </div>
            </div>
            {expanded===iv.id && (
              <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:13.5, lineHeight:1.65 }}>
                {iv.summary && <><div style={{ color:'var(--text-dim)', fontWeight:600, fontSize:11.5, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>Summary</div><p style={{ margin:'0 0 12px', whiteSpace:'pre-wrap' }}>{iv.summary}</p></>}
                {iv.takeaways && <><div style={{ color:'var(--text-dim)', fontWeight:600, fontSize:11.5, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>Key Takeaways</div><p style={{ margin:'0 0 12px', whiteSpace:'pre-wrap' }}>{iv.takeaways}</p></>}
                {iv.tags && <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>{iv.tags.split(',').map((t)=>t.trim()).filter(Boolean).map((t)=><span className="badge" key={t}>{t}</span>)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit profile modal */}
      {editingProfile && (
        <ReportForm key={person.id} initial={person} onCancel={() => setEditingProfile(false)}
          onSave={async (record) => { await directReportsStore.upsert(record); setEditingProfile(false); load() }} />
      )}

      {/* Add interview modal */}
      {addingIv && <InterviewForm key="new" initial={{ ...EMPTY_INTERVIEW, person:person.name }} title="Log interview" onCancel={() => setAddingIv(false)} onSave={handleSaveInterview} />}

      {/* Edit interview modal */}
      {editingIv && <InterviewForm key={editingIv.id} initial={editingIv} title="Edit interview" onCancel={() => setEditingIv(null)} onSave={handleSaveInterview} />}

      {/* Quick follow-up modal */}
      {addingFU && <QuickFollowUpForm interview={addingFU} person={person} onCancel={() => setAddingFU(null)} onSave={async (record) => { await followUpsStore.upsert(record); setAddingFU(null); load() }} />}

      {/* Delete confirm modal */}
      {confirmDel && (
        <div className="overlay" onMouseDown={(e) => e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:380, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🗑️</div>
            <h2 style={{ marginBottom:8 }}>Delete interview?</h2>
            <p style={{ color:'var(--text-dim)', fontSize:14, margin:'0 0 24px' }}>This entry will be permanently removed.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn primary" style={{ background:'var(--bad)', borderColor:'var(--bad)' }} onClick={confirmDelete}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Chip({ label, value }) {
  return (
    <div style={{ fontSize:12, color:'var(--text-dim)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px' }}>
      <span style={{ color:'var(--text-faint)' }}>{label}: </span>{value}
    </div>
  )
}

function InterviewForm({ initial, onCancel, onSave, title='Log interview' }) {
  const [form,        setForm]        = useState({ ...initial })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [genTags,     setGenTags]     = useState(false)
  const [genTakeaways,setGenTakeaways]= useState(false)

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleGenerateTakeaways() {
    if (!form.summary) return
    setGenTakeaways(true); setError('')
    try { const t = await generateTakeaways(form.summary); if (t) setForm((f) => ({ ...f, takeaways:t })) }
    catch (err) { setError('Takeaways: ' + (err.message||'Generation failed.')) }
    finally { setGenTakeaways(false) }
  }

  async function handleGenerateTags() {
    if (!form.summary && !form.takeaways) return
    setGenTags(true); setError('')
    try { const t = await generateTags(form.summary, form.takeaways); if (t) setForm((f) => ({ ...f, tags:t })) }
    catch (err) { setError('Tags: ' + (err.message||'Generation failed.')) }
    finally { setGenTags(false) }
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try { await onSave(form) }
    catch (err) { setError(err.message||'Save failed.'); setSaving(false) }
  }

  return (
    <DraggableModal title={title} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:14, padding:'10px 12px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
        <div className="field"><label>Title</label><input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Q3 1:1 — career growth chat" /></div>
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(INTERVIEW_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>Date</label><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
        <div className="field"><label>Summary</label><textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What was discussed?" /></div>
        <div className="field">
          <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            Key takeaways
            <button type="button" onClick={handleGenerateTakeaways} disabled={genTakeaways||!form.summary}
              style={{ fontSize:11.5, fontWeight:600, padding:'2px 10px', borderRadius:6, border:'1px solid var(--accent)', background:'var(--accent-soft)', color:'var(--accent)', cursor:'pointer', opacity:!form.summary?0.45:1 }}>
              {genTakeaways?'⏳ Generating…':'✦ Generate'}
            </button>
          </label>
          <textarea value={form.takeaways} onChange={(e) => set('takeaways', e.target.value)} placeholder="Action items, follow-ups, decisions…" />
        </div>
        <div className="field">
          <label style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            Tags (comma-separated)
            <button type="button" onClick={handleGenerateTags} disabled={genTags||(!form.summary&&!form.takeaways)}
              style={{ fontSize:11.5, fontWeight:600, padding:'2px 10px', borderRadius:6, border:'1px solid var(--accent)', background:'var(--accent-soft)', color:'var(--accent)', cursor:'pointer', opacity:(!form.summary&&!form.takeaways)?0.45:1 }}>
              {genTags?'⏳ Generating…':'✦ Generate tags'}
            </button>
          </label>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Click ✦ Generate tags or type manually" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving…':'Save'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}

function QuickFollowUpForm({ interview, person, onCancel, onSave }) {
  const [text,    setText]    = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await onSave({ text, dueDate, personId:person.id, personName:person.name, sourceType:'interview', sourceId:interview.id, sourceTitle:interview.title||'(untitled)', done:false })
    } catch (err) { setError(err.message||'Save failed.'); setSaving(false) }
  }

  return (
    <DraggableModal title="Add follow-up" onClose={onCancel} maxWidth={440}>
      <form onSubmit={submit}>
        <div style={{ fontSize:13, color:'var(--text-faint)', marginBottom:16 }}>From: <strong style={{ color:'var(--text-dim)' }}>{interview.title||'(untitled)'}</strong></div>
        {error && <div style={{ color:'var(--bad)', fontSize:13, marginBottom:14, padding:'10px 12px', background:'rgba(217,113,106,0.1)', borderRadius:8 }}>⚠️ {error}</div>}
        <div className="field"><label>What needs to happen?</label><textarea required value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Share updated growth plan by end of month" style={{ minHeight:80 }} autoFocus /></div>
        <div className="field"><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving…':'Save follow-up'}</button>
        </div>
      </form>
    </DraggableModal>
  )
}
