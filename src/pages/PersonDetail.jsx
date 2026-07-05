import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { directReportsStore, interviewsStore } from '../lib/dataStore'
import { Avatar } from './DirectReports.jsx'

const INTERVIEW_TYPES = {
  '1:1': '1:1', skip_level: 'Skip-level', hiring: 'Hiring interview',
  exit: 'Exit interview', performance: 'Performance review',
}

const EMPTY_INTERVIEW = {
  title: '', type: '1:1', person: '', date: '', summary: '', takeaways: '', tags: '',
}

// ── Anthropic API call ──────────────────────────────────────────────────────
async function generateAISummary(person, interviews) {
  if (interviews.length === 0) throw new Error('No interviews to summarise yet.')

  const interviewText = interviews.map((iv, i) =>
    `--- Interview ${i + 1}: ${iv.title} (${iv.type}, ${iv.date || 'no date'}) ---\n` +
    (iv.summary   ? `Summary: ${iv.summary}\n`   : '') +
    (iv.takeaways ? `Takeaways: ${iv.takeaways}\n` : '') +
    (iv.tags      ? `Tags: ${iv.tags}\n`           : '')
  ).join('\n')

  const prompt =
    `You are a People Leader's assistant. Below are all logged interviews and 1:1 notes for ${person.name} ` +
    `(${person.role || 'team member'}${person.team ? ', ' + person.team : ''}).\n\n` +
    `${interviewText}\n\n` +
    `Write a concise professional summary (4–6 short paragraphs) covering:\n` +
    `1. Key recurring themes across all conversations\n` +
    `2. Strengths and achievements observed\n` +
    `3. Growth areas and development opportunities\n` +
    `4. Outstanding action items or follow-ups\n` +
    `5. Overall assessment and recommended next steps for the leader\n\n` +
    `Be specific, reference actual content from the notes, and keep it actionable.`

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) throw new Error('VITE_OPENROUTER_API_KEY secret is not set. Add it in GitHub → Settings → Secrets.')

  // Uses OpenRouter free tier — no billing required.
  // Free model: meta-llama/llama-3.1-8b-instruct:free
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://henryai-stack.github.io/people-os/',
      'X-Title': 'PeopleOS',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `AI request failed (${res.status})`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PersonDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [person,      setPerson]      = useState(null)
  const [interviews,  setInterviews]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [expanded,    setExpanded]    = useState(null)
  const [addingIv,    setAddingIv]    = useState(false)
  const [genSummary,  setGenSummary]  = useState(false)
  const [summaryErr,  setSummaryErr]  = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [people, allIvs] = await Promise.all([
        directReportsStore.list(),
        interviewsStore.list(),
      ])
      const found = people.find((p) => p.id === id)
      if (!found) { setError('Person not found.'); setLoading(false); return }
      setPerson(found)
      setInterviews(allIvs.filter((iv) => {
        const nameMatch = iv.person?.trim().toLowerCase() === found.name?.trim().toLowerCase()
        const idMatch   = iv.personId === found.id
        return nameMatch || idMatch
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleSaveInterview(record) {
    await interviewsStore.upsert({ ...record, person: person.name, personId: person.id })
    setAddingIv(false)
    load()
  }

  async function handleDeleteInterview(ivId) {
    if (!confirm('Delete this interview entry?')) return
    await interviewsStore.remove(ivId)
    load()
  }

  async function handleGenerateSummary() {
    setGenSummary(true)
    setSummaryErr('')
    try {
      const summary = await generateAISummary(person, interviews)
      const updated = {
        ...person,
        aiSummary: summary,
        aiSummaryDate: new Date().toISOString(),
      }
      await directReportsStore.upsert(updated)
      setPerson(updated)
    } catch (e) {
      setSummaryErr(e.message)
    } finally {
      setGenSummary(false)
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>
  if (error)   return (
    <div>
      <button className="btn ghost" onClick={() => navigate('/direct-reports')} style={{ marginBottom: 20 }}>
        ← Back
      </button>
      <div style={{ color: 'var(--bad)' }}>⚠️ {error}</div>
    </div>
  )

  const summaryDate = person.aiSummaryDate
    ? new Date(person.aiSummaryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <>
      {/* Back */}
      <button className="btn ghost" onClick={() => navigate('/direct-reports')}
        style={{ marginBottom: 20, paddingLeft: 0 }}>
        ← Direct Reports
      </button>

      {/* ── Person header ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
        <Avatar photo={person.photo} name={person.name} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            {person.name}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 10 }}>
            {[person.role, person.team, person.location].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {person.level    && <Chip label="Level"  value={person.level} />}
            {person.email    && <Chip label="Email"  value={person.email} />}
            {person.startDate && <Chip label="Since" value={person.startDate} />}
            <span className={`badge ${person.status === 'active' ? 'good' : 'warn'}`} style={{ alignSelf: 'center' }}>
              {person.status}
            </span>
          </div>
        </div>
        <button className="btn ghost" onClick={() => navigate('/direct-reports', { state: { editId: person.id } })}
          style={{ alignSelf: 'flex-start' }}>
          Edit profile
        </button>
      </div>

      {/* ── AI Summary ── */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-title" style={{ margin: 0 }}>🤖 AI Summary</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {summaryDate && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Last updated {summaryDate}</span>
          )}
          <button
            className="btn"
            style={{ fontSize: 12.5, padding: '6px 14px' }}
            onClick={handleGenerateSummary}
            disabled={genSummary || interviews.length === 0}
          >
            {genSummary ? '⏳ Generating…' : person.aiSummary ? '↻ Regenerate' : '✦ Generate summary'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        {summaryErr && (
          <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>
            ⚠️ {summaryErr}
          </div>
        )}
        {genSummary && (
          <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Analysing {interviews.length} interview{interviews.length !== 1 ? 's' : ''}…</div>
        )}
        {!genSummary && person.aiSummary && (
          <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {person.aiSummary}
          </div>
        )}
        {!genSummary && !person.aiSummary && !summaryErr && (
          <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>
            {interviews.length === 0
              ? 'Add at least one interview below, then generate a summary.'
              : `Click "Generate summary" to get an AI analysis of ${interviews.length} interview${interviews.length !== 1 ? 's' : ''}.`}
          </div>
        )}
      </div>

      {/* ── Interviews ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>🗣️ Interviews & 1:1s ({interviews.length})</div>
        <button className="btn primary" style={{ fontSize: 13, padding: '7px 14px' }} onClick={() => setAddingIv(true)}>
          + Add interview
        </button>
      </div>

      {interviews.length === 0 && (
        <div className="empty-state" style={{ padding: '28px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No interviews logged yet for {person.name}.</div>
        </div>
      )}

      <div className="list" style={{ marginBottom: 40 }}>
        {interviews.map((iv) => (
          <div className="row-card" key={iv.id}
            style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
            onClick={() => setExpanded(expanded === iv.id ? null : iv.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="row-main">
                <div>
                  <div className="row-title">{iv.title || '(untitled)'}</div>
                  <div className="row-sub">{iv.date || 'no date'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge">{INTERVIEW_TYPES[iv.type] || iv.type}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>{expanded === iv.id ? '▲' : '▼'}</span>
                <button className="btn ghost danger" style={{ fontSize: 12, padding: '4px 8px' }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteInterview(iv.id) }}>
                  Delete
                </button>
              </div>
            </div>
            {expanded === iv.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13.5, lineHeight: 1.65 }}>
                {iv.summary && (
                  <>
                    <div style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 11.5, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Summary</div>
                    <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{iv.summary}</p>
                  </>
                )}
                {iv.takeaways && (
                  <>
                    <div style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 11.5, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Key Takeaways</div>
                    <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{iv.takeaways}</p>
                  </>
                )}
                {iv.tags && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {iv.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span className="badge" key={t}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Add Interview Modal ── */}
      {addingIv && (
        <InterviewForm
          initial={{ ...EMPTY_INTERVIEW, person: person.name }}
          onCancel={() => setAddingIv(false)}
          onSave={handleSaveInterview}
        />
      )}
    </>
  )
}

function Chip({ label, value }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}: </span>{value}
    </div>
  )
}

function InterviewForm({ initial, onCancel, onSave }) {
  const [form,   setForm]   = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try { await onSave(form) }
    catch (err) { setError(err.message || 'Save failed.'); setSaving(false) }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit}>
        <h2>Log interview</h2>
        {error && (
          <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(217,113,106,0.1)', borderRadius: 8 }}>⚠️ {error}</div>
        )}
        <div className="field"><label>Title</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Q3 1:1 — career growth chat" />
        </div>
        <div className="field"><label>Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(INTERVIEW_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>Date</label>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field"><label>Summary</label>
          <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What was discussed?" />
        </div>
        <div className="field"><label>Key takeaways</label>
          <textarea value={form.takeaways} onChange={(e) => set('takeaways', e.target.value)} placeholder="Action items, follow-ups, decisions…" />
        </div>
        <div className="field"><label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="growth, promotion, blockers" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
