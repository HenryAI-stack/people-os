import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DraggableModal } from '../components/DraggableModal.jsx'
import { interviewsStore, directReportsStore } from '../lib/dataStore'
import { generateTags, generateTakeaways } from '../lib/autoTags.js'
import { splitTags, tagKey, hasTag } from '../lib/interviewTags.js'

const EMPTY = {
  title: '', type: '1:1', personId: '', person: '', date: '',
  summary: '', takeaways: '', tags: '', faceToFace: false,
}

// Seeded so the title autocomplete is useful on day one (before any history
// exists) — merged with whatever titles have actually been used, in
// InterviewForm's titleSuggestions below.
const DEFAULT_TITLE_SUGGESTIONS = ['Weekly']

function todayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TYPE_LABEL = {
  '1:1': '1:1',
  skip_level: 'Skip-level',
  hiring: 'Hiring interview',
  exit: 'Exit interview',
  performance: 'Performance review',
  team_meeting: 'Team meeting',
}

// ── Statistics helpers ──────────────────────────────────────────────
// Date math splits the 'YYYY-MM-DD' string and uses local Date construction
// (same approach as cadence.js) — no ISO-string parsing, so no timezone drift.
// Weeks run Monday–Sunday.

const STATS_PERIODS = [4, 8, 12, 26, 52]
const STATS_OPEN_KEY = 'peopleos.interviewStats.open'
const STATS_WEEKS_KEY = 'peopleos.interviewStats.weeks'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseLocalDate(str) {
  const [y, m, d] = (str || '').split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
  return d
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function fmtShort(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function isoWeekNumber(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)) // Thursday of this week
  const jan4 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) } catch { return fallback }
}
function writePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable — fine */ }
}

function computeStats(items, reports, weeks, today = new Date()) {
  const thisWeek = startOfWeek(today)
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1))
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(firstWeek, i * 7)
    return { start, end: addDays(start, 6), count: 0 }
  })

  // Person ranking: direct reports only (externals like hiring candidates would
  // flood the "fewest" list). Matching mirrors cadence.js: personId, or a
  // case-insensitive name match for older name-only interviews.
  const byId = new Map(reports.map((r) => [r.id, r]))
  const byName = new Map(reports.map((r) => [r.name?.trim().toLowerCase(), r]))
  const perPerson = new Map()
  let total = 0, external = 0

  for (const iv of items) {
    const d = parseLocalDate(iv.date)
    if (!d || d < firstWeek || d > todayMidnight) continue // future = scheduled, not conducted
    const idx = Math.floor(Math.round((d - firstWeek) / 86400000) / 7)
    if (idx < 0 || idx >= weeks) continue
    buckets[idx].count++
    total++

    const report = byId.get(iv.personId) || (iv.person && byName.get(iv.person.trim().toLowerCase()))
    if (!report) { if (iv.person) external++; continue }
    const entry = perPerson.get(report.id) || { report, count: 0, last: null }
    entry.count++
    if (!entry.last || iv.date > entry.last) entry.last = iv.date
    perPerson.set(report.id, entry)
  }

  // Active reports with zero interviews in the period belong in the ranking too —
  // they're exactly who "fewest" should surface.
  for (const r of reports) {
    if (r.status === 'active' && !perPerson.has(r.id)) perPerson.set(r.id, { report: r, count: 0, last: null })
  }

  const ranked = [...perPerson.values()]
  const most = [...ranked].sort((a, b) =>
    b.count - a.count || (b.last || '').localeCompare(a.last || '') || a.report.name.localeCompare(b.report.name))
  const fewest = [...ranked].sort((a, b) =>
    a.count - b.count || (a.last || '').localeCompare(b.last || '') || a.report.name.localeCompare(b.report.name))

  // Don't show the same person in both lists when the team is small.
  const topN = Math.min(5, Math.ceil(ranked.length / 2))
  const mostList = most.slice(0, topN)
  const shown = new Set(mostList.map((e) => e.report.id))
  const fewestList = fewest.filter((e) => !shown.has(e.report.id)).slice(0, 5)

  const activeCount = reports.filter((r) => r.status === 'active').length
  const covered = ranked.filter((e) => e.count > 0 && e.report.status === 'active').length

  return {
    buckets,
    total,
    external,
    thisWeekCount: buckets[weeks - 1].count,
    lastWeekCount: weeks > 1 ? buckets[weeks - 2].count : 0,
    avgPerWeek: total / weeks,
    busiest: buckets.reduce((best, b) => (b.count > (best?.count ?? -1) ? b : best), null),
    mostList,
    fewestList,
    maxPersonCount: most[0]?.count || 0,
    activeCount,
    covered,
  }
}

function InterviewStats({ items, reports, filterType }) {
  const [open,  setOpen]  = useState(() => readPref(STATS_OPEN_KEY, true))
  const [weeks, setWeeks] = useState(() => {
    const w = readPref(STATS_WEEKS_KEY, 12)
    return STATS_PERIODS.includes(w) ? w : 12
  })

  const scoped = useMemo(
    () => items.filter((i) => filterType === 'all' || i.type === filterType),
    [items, filterType],
  )
  const stats = useMemo(() => computeStats(scoped, reports, weeks), [scoped, reports, weeks])

  function toggle() { setOpen((o) => { writePref(STATS_OPEN_KEY, !o); return !o }) }
  function changeWeeks(w) { setWeeks(w); writePref(STATS_WEEKS_KEY, w) }

  const diff = stats.thisWeekCount - stats.lastWeekCount
  const diffLabel = diff === 0 ? 'same as last week' : `${diff > 0 ? '+' : ''}${diff} vs last week`
  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.count))
  const labelEvery = weeks <= 12 ? 1 : weeks <= 26 ? 2 : 4
  const showCounts = weeks <= 26
  const typeNote = filterType === 'all' ? 'All types' : `${TYPE_LABEL[filterType] || filterType} only`

  return (
    <div className="iv-stats">
      <div className="iv-stats-head">
        <button type="button" className="iv-stats-toggle" onClick={toggle} aria-expanded={open}>
          <span className={`iv-chevron${open ? ' open' : ''}`}>›</span>
          📊 Statistics
          <span className="iv-stats-scope">{typeNote}</span>
        </button>
        {open && (
          <select className="search-input iv-period" value={weeks} onChange={(e) => changeWeeks(Number(e.target.value))}>
            {STATS_PERIODS.map((w) => <option key={w} value={w}>Last {w} weeks</option>)}
          </select>
        )}
      </div>

      {open && (
        <>
          <div className="grid cols-3">
            <div className="card stat-card">
              <div className="label">This week</div>
              <div className="value">{stats.thisWeekCount}</div>
              <div className="sub">{diffLabel}</div>
            </div>
            <div className="card stat-card">
              <div className="label">Last {weeks} weeks</div>
              <div className="value">{stats.total}</div>
              <div className="sub">
                Ø {stats.avgPerWeek.toFixed(1)} / week
                {stats.busiest?.count > 0 && ` · peak ${stats.busiest.count} (wk of ${fmtShort(stats.busiest.start)})`}
              </div>
            </div>
            <div className="card stat-card">
              <div className="label">Active reports covered</div>
              <div className="value">{stats.covered}<span className="iv-of"> / {stats.activeCount}</span></div>
              <div className="sub">
                {stats.activeCount - stats.covered > 0
                  ? `${stats.activeCount - stats.covered} without an interview`
                  : stats.activeCount > 0 ? 'everyone covered' : 'no active reports'}
              </div>
            </div>
          </div>

          <div className="card iv-chart-card">
            <div className="iv-card-title">Interviews per week</div>
            <div className="iv-chart" role="img" aria-label={`Interviews per week over the last ${weeks} weeks`}>
              {stats.buckets.map((b, i) => {
                const current = i === stats.buckets.length - 1
                return (
                  <div className="iv-bar-col" key={i}
                    title={`${fmtShort(b.start)} – ${fmtShort(b.end)}: ${b.count} interview${b.count === 1 ? '' : 's'}`}>
                    <div className="iv-bar-count">{showCounts && b.count > 0 ? b.count : ''}</div>
                    <div className="iv-bar-track">
                      <div className={`iv-bar${current ? ' current' : ''}${b.count === 0 ? ' empty' : ''}`}
                        style={{ height: `${(b.count / maxBucket) * 100}%` }} />
                    </div>
                    <div className="iv-bar-label">
                      {(stats.buckets.length - 1 - i) % labelEvery === 0 ? `W${isoWeekNumber(b.start)}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="iv-chart-foot">
              {fmtShort(stats.buckets[0].start)} – {fmtShort(stats.buckets[stats.buckets.length - 1].end)}
              {stats.external > 0 && ` · includes ${stats.external} with external people`}
            </div>
          </div>

          <div className="grid cols-2 iv-rank-grid">
            <RankList title="🏆 Most interviews" entries={stats.mostList} max={stats.maxPersonCount} tone="good" />
            <RankList title="🔻 Fewest interviews" entries={stats.fewestList} max={stats.maxPersonCount} tone="bad" />
          </div>
        </>
      )}
    </div>
  )
}

function RankList({ title, entries, max, tone }) {
  return (
    <div className="card">
      <div className="iv-card-title">{title}</div>
      {entries.length === 0 && <div className="iv-rank-empty">No direct reports to rank yet.</div>}
      {entries.map((e) => {
        const last = parseLocalDate(e.last)
        return (
          <div className="iv-rank-row" key={e.report.id}>
            <div className="iv-rank-name">
              <span>{e.report.name}</span>
              <span className="iv-rank-sub">{last ? `last ${fmtShort(last)}` : 'none in period'}</span>
            </div>
            <div className="iv-rank-bar-track">
              <div className={`iv-rank-bar ${tone}`} style={{ width: max ? `${(e.count / max) * 100}%` : 0 }} />
            </div>
            <span className={`badge ${e.count === 0 ? 'bad' : ''}`}>{e.count}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Interviews() {
  const [items,      setItems]      = useState([])
  const [reports,    setReports]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [query,      setQuery]      = useState('')
  const [filterTag,  setFilterTag]  = useState(null) // normalised tag key (interviewTags.js), e.g. from the Dashboard tag cloud
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

  // Tag passed via navigation state (Dashboard tag cloud) → filter the list to that tag.
  useEffect(() => {
    if (location.state?.tag) { setFilterTag(location.state.tag); window.scrollTo(0, 0) }
  }, [location.state])

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
      .filter((i) => !filterTag || hasTag(i, filterTag))
      .filter((i) => !q || [i.title, i.person, i.summary, i.takeaways, i.tags]
        .join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [items, filterType, query, filterTag])

  // Reset to page 1 whenever filter/query changes
  useEffect(() => { setPage(1) }, [filterType, query, filterTag])

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
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY, date: todayDate() })}>+ Log entry</button>
      </div>

      {filterTag && (
        <div className="tag-filter-bar">
          Showing conversations tagged
          <button type="button" className="badge tag-filter-chip" onClick={() => setFilterTag(null)} title="Clear tag filter">
            🏷️ {filterTag} <span aria-hidden="true">✕</span>
          </button>
          <span style={{ color:'var(--text-faint)' }}>{filtered.length} found</span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <InterviewStats items={items} reports={reports} filterType={filterType} />
      )}

      {loading && <div className="empty-state">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon">🗣️</div>
          {filterTag || query
            ? `No interviews matching${filterTag ? ` tag "${filterTag}"` : ''}${filterTag && query ? ' and' : ''}${query ? ` "${query}"` : ''}.`
            : 'No entries yet. Log your first 1:1 or interview.'}
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
            <div className="row-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="row-main">
                <div>
                  <div className="row-title">{it.title || '(untitled)'}</div>
                  <div className="row-sub">{it.person ? `${it.person} · ` : ''}{it.date || 'no date'}</div>
                  {it.tags && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                      {splitTags(it.tags).map((t) => (
                        <button type="button" className="badge tag-btn" key={t} style={{ fontSize:10.5, padding:'2px 7px' }}
                          title={`Show all conversations tagged "${t}"`}
                          onClick={(e) => { e.stopPropagation(); setFilterTag(tagKey(t)) }}>{t}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {it.faceToFace && <span className="badge good" title="Face-to-face meeting">🤝 Face-to-face</span>}
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
                    {splitTags(it.tags).map((t) => (
                      <button type="button" className="badge tag-btn" key={t}
                        title={`Show all conversations tagged "${t}"`}
                        onClick={(e) => { e.stopPropagation(); setFilterTag(tagKey(t)) }}>{t}</button>
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
          items={items}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function InterviewForm({ initial, reports, items, onCancel, onSave }) {
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

  const titleSuggestions = useMemo(() => {
    const historical = items.map((i) => i.title).filter(Boolean)
    return [...new Set([...DEFAULT_TITLE_SUGGESTIONS, ...historical])]
  }, [items])

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
          <input required list="interview-title-suggestions" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Weekly" />
          <datalist id="interview-title-suggestions">
            {titleSuggestions.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Type</label>
          <div className="type-row">
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="check-label">
              <input type="checkbox" checked={!!form.faceToFace} onChange={(e) => set('faceToFace', e.target.checked)} />
              🤝 Face-to-face meeting
            </label>
          </div>
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
