import { useCallback, useEffect, useRef, useState } from 'react'
import { getMsGraphToken, setMsGraphToken, normalizeToken, getMsGraphTokenInfo, tokenHasAnyScope, TODO_SCOPES, SHAREPOINT_WRITE_SCOPES, GROUP_CALENDAR_SCOPES, ONEDRIVE_WRITE_SCOPES, getCopilotExportSettings, setCopilotExportSettings } from '../lib/settings.js'
import { directReportsStore, interviewsStore, followUpsStore, accomplishmentsStore, notesStore } from '../lib/dataStore.js'
import { uploadToOneDrive, checkOneDriveSharing } from '../lib/msGraph.js'
import { buildExportModel, buildExportDocx, exportCounts, DEFAULT_EXPORT_OPTIONS, EXPORT_FOLDER, EXPORT_FILENAME, DOCX_MIME } from '../lib/copilotExport.js'
import { pullMsGraphToken, pushMsGraphToken, TOKEN_CHANGED_EVENT } from '../lib/tokenSync.js'
import { subscribePwa, promptInstall, isStandalone, isIOS } from '../lib/pwa.js'
import { CONNECTIONS, runConnectionCheck } from '../lib/healthChecks.js'

export default function Settings() {
  const [token, setToken] = useState(() => getMsGraphToken())
  const [show,  setShow]  = useState(false)
  const [saved, setSaved] = useState(false)
  const [sync,  setSync]  = useState('')   // '' | 'saving' | 'synced' | error message

  // A token saved on another device replaces this one when it's newer (tokenSync.js).
  useEffect(() => {
    const adopt = (e) => setToken(e.detail)
    window.addEventListener(TOKEN_CHANGED_EVENT, adopt)
    pullMsGraphToken()
    return () => window.removeEventListener(TOKEN_CHANGED_EVENT, adopt)
  }, [])

  async function share(value) {
    setSync('saving')
    try { await pushMsGraphToken(value); setSync('synced') }
    catch (e) { setSync(`Couldn't sync to your other devices: ${e.message || e}`) }
  }

  function handleSave(e) {
    e.preventDefault()
    setMsGraphToken(token)
    setToken(normalizeToken(token))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    share(token)
  }

  function handleClear() {
    setToken('')
    setMsGraphToken('')
    share('')
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Local to this browser, except the Microsoft Graph token, which is synced (encrypted) to your other devices.</p>
      </div>

      <ConnectionsCard graphToken={normalizeToken(token)} />

      <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Microsoft Graph token</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Powers the "Sync to Outlook" buttons on the Follow-ups page — they push follow-ups
          into a <strong>PeopleOS Follow-ups</strong> list in Microsoft To Do — and the Work
          Schedule's <strong>Upload to SharePoint</strong> button, and <strong>Export for Copilot</strong> below. Graph Explorer
          tokens expire after about an hour, so come back and paste a fresh one here whenever
          sync starts failing with an expired-token error.
        </p>
        <ol style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.8, paddingLeft: 20, margin: '0 0 18px' }}>
          <li>
            Open{' '}
            <a href="https://developer.microsoft.com/graph/graph-explorer" target="_blank" rel="noreferrer">
              Microsoft Graph Explorer
            </a>{' '}
            and sign in with your Outlook / Microsoft 365 account.
          </li>
          <li>
            <em>For Upload to SharePoint (one-time):</em> click your profile picture →{' '}
            <strong>Consent to permissions</strong> (or the <strong>Modify permissions</strong> tab) and search
            for <strong>Sites.ReadWrite.All</strong>. If it has a <strong>Consent</strong> button, click it. If it's
            greyed out with consent type <strong>AllPrincipals</strong>, an admin has already granted it for
            everyone, so there's nothing to do. The token check below confirms it either way.
          </li>
          <li>Click your profile picture in the top right, then <strong>Access token</strong>, and copy the whole thing.</li>
          <li>Paste it below and click Save. It's also stored encrypted in your data repo, so your other devices with the same login pick it up automatically (a newer token always wins).</li>
        </ol>

        <form onSubmit={handleSave}>
          <div className="field">
            <label>Access token</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the Graph Explorer access token"
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn ghost" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn ghost danger" onClick={handleClear} disabled={!token}>Clear</button>
            <button type="submit" className="btn primary" disabled={!token}>{saved ? 'Saved ✓' : 'Save'}</button>
          </div>
        </form>

        {sync && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: sync === 'synced' ? 'var(--good)' : sync === 'saving' ? 'var(--text-faint)' : 'var(--bad)' }}>
            {sync === 'saving' ? 'Syncing to your other devices…' : sync === 'synced' ? (token ? '✓ Available on your other devices' : '✓ Removed from your other devices') : `⚠ ${sync}`}
          </div>
        )}
        <TokenStatus token={normalizeToken(token)} />
      </div>

      <CopilotExportCard token={normalizeToken(token)} />
      <InstallCard />
      <CaptionGrabberCard />
    </>
  )
}

// "🔌 Connections" — a live green/amber/red light per external service (src/lib/healthChecks.js).
// Runs every check when the page opens; the Graph row re-runs when the token changes.
const STATUS_LABEL = { ok: 'Working', warn: 'Needs attention', error: 'Not working', off: 'Not set up', checking: 'Checking…' }

function ConnectionsCard({ graphToken }) {
  const [results, setResults] = useState({})   // id → { status, detail, ms, checkedAt }
  const [running, setRunning] = useState(0)    // checks in flight

  const runOne = useCallback(async (conn) => {
    setResults((r) => ({ ...r, [conn.id]: { ...r[conn.id], status: 'checking' } }))
    setRunning((n) => n + 1)
    const res = await runConnectionCheck(conn)
    setResults((r) => ({ ...r, [conn.id]: res }))
    setRunning((n) => n - 1)
  }, [])

  const runAll = useCallback(() => { CONNECTIONS.forEach(runOne) }, [runOne])
  useEffect(() => { runAll() }, [runAll])

  // A new/cleared Graph token (pasted here or synced from another device) → re-check just that row.
  const firstToken = useRef(true)
  useEffect(() => {
    if (firstToken.current) { firstToken.current = false; return }
    const graph = CONNECTIONS.find((c) => c.id === 'graph')
    if (graph) runOne(graph)
  }, [graphToken, runOne])

  const done = CONNECTIONS.map((c) => results[c.id]).filter((r) => r && r.status !== 'checking')
  const errors = done.filter((r) => r.status === 'error').length
  const warns = done.filter((r) => r.status === 'warn').length
  const summary = running > 0 ? 'Checking…'
    : errors ? `${errors} not working` + (warns ? `, ${warns} need${warns === 1 ? 's' : ''} attention` : '')
    : warns ? `${warns} need${warns === 1 ? 's' : ''} attention`
    : 'All working'
  const summaryStatus = running > 0 ? 'checking' : errors ? 'error' : warns ? 'warn' : 'ok'
  const lastChecked = Math.max(0, ...done.map((r) => r.checkedAt || 0))

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="row-head" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0, flex: 1 }}>🔌 Connections</h3>
        <span className={`conn-summary ${summaryStatus}`}>{summary}</span>
        <button type="button" className="btn ghost" onClick={runAll} disabled={running > 0} title="Run all checks again">
          ↻ Check again
        </button>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '0 0 10px' }}>
        Live check of each external service, from this browser and network.
        {lastChecked ? <> Last checked {new Date(lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.</> : null}
      </p>
      <div className="conn-list">
        {CONNECTIONS.map((c) => {
          const r = results[c.id] || { status: 'checking' }
          return (
            <div key={c.id} className="conn-row">
              <span className={`conn-dot ${r.status}`} role="img" aria-label={STATUS_LABEL[r.status]} title={STATUS_LABEL[r.status]} />
              <div className="conn-main">
                <div className="conn-name">{c.label}</div>
                <div className="conn-detail">{r.status === 'checking' && !r.detail ? 'Checking…' : r.detail}</div>
              </div>
              {r.status !== 'checking' && typeof r.ms === 'number' && <span className="conn-ms">{r.ms} ms</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// What the pasted Graph token can do — read from the token itself (settings.js, display-only).
function TokenStatus({ token }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const box = { marginTop: 14, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.7 }
  if (!token) return <div style={box}>Status: no token set — Outlook sync and SharePoint upload will show an error until one is added.</div>

  const info = getMsGraphTokenInfo(token)
  if (!info) return <div style={box}>Status: token set, ending in <code>{token.slice(-6)}</code> (its details couldn't be read — it will still be tried as-is).</div>

  // Why a token can't do anything — shown in place of a silent row of ✗s.
  const problem = {
    id: 'This is an ID token, not an access token, so it carries no permissions. In Graph Explorer, open your profile picture → Access token (or the "Access token" tab next to Request headers) and copy that one.',
    'other-aud': `This access token is for another API (${info.aud}), not Microsoft Graph. Copy the token from Graph Explorer's "Access token" tab instead.`,
    none: 'This Graph token carries no permissions. In Graph Explorer, run any query once (e.g. GET /me) so it fetches a token with your consented permissions, then copy the access token again.',
  }[info.kind]

  const mins = info.expiresAt ? Math.round((info.expiresAt.getTime() - now) / 60000) : null
  const expired = mins !== null && mins <= 0
  const ready = (hasScope, label, need) => {
    const ok = hasScope && !expired
    return (
      <div><span style={{ color: ok ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{ok ? '✓' : '✗'}</span> {label}
        {!hasScope ? <span style={{ color: 'var(--text-faint)' }}> — needs {need}</span>
          : expired ? <span style={{ color: 'var(--text-faint)' }}> — token expired</span> : null}</div>
    )
  }
  return (
    <div style={box}>
      <div>
        Token{info.account ? <> for <strong>{info.account}</strong></> : ''}:{' '}
        {mins === null ? 'no expiry info'
          : expired ? <span style={{ color: 'var(--bad)', fontWeight: 600 }}>expired — paste a fresh one</span>
          : <span style={{ color: mins < 10 ? 'var(--warn)' : 'var(--good)' }}>valid for {mins} more min</span>}
      </div>
      {ready(tokenHasAnyScope(info, TODO_SCOPES), 'Outlook / To Do sync', 'Tasks.ReadWrite')}
      {ready(tokenHasAnyScope(info, SHAREPOINT_WRITE_SCOPES), 'Upload to SharePoint', 'Sites.ReadWrite.All (or Files.ReadWrite.All)')}
      {ready(tokenHasAnyScope(info, GROUP_CALENDAR_SCOPES), 'On-duty calendar (group calendar)', 'Group.ReadWrite.All')}
      {ready(tokenHasAnyScope(info, ONEDRIVE_WRITE_SCOPES), 'Export for Copilot (OneDrive)', 'Files.ReadWrite')}
      {problem && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bad)', color: 'var(--text)' }}>
          <span style={{ color: 'var(--bad)', fontWeight: 600 }}>⚠ </span>{problem}
        </div>
      )}
      <details style={{ marginTop: 4 }} open={!info.scopes.length || undefined}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-faint)' }}>Permissions in this token ({info.scopes.length})</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {info.scopes.length
            ? info.scopes.map((s) => <span key={s} className="badge" style={{ fontSize: 10.5 }}>{s}</span>)
            : <span style={{ color: 'var(--text-faint)' }}>none</span>}
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-faint)', wordBreak: 'break-all' }}>
          Issued for: {info.aud || '—'}{info.appName ? <> · app: {info.appName}</> : null} · ends in <code>{token.slice(-6)}</code>
        </div>
      </details>
    </div>
  )
}


// "Export for Copilot" — writes one Word file with the chosen PeopleOS data into the user's own
// OneDrive, where Microsoft 365 Copilot can read it (custom Copilot agents can't be installed in
// the tenant). Builder: src/lib/copilotExport.js; upload: msGraph.js's uploadToOneDrive().
const EXPORT_SECTIONS = [
  ['people', 'Team profiles', 'Role, team, location, start date, birthday, profile notes'],
  ['interviews', 'Conversations', '1:1s, skip-levels, performance reviews, team meetings'],
  ['followUps', 'Open follow-ups', null],
  ['accomplishments', 'Accomplishments', null],
  ['notes', 'Notes', 'Your freeform notes (archived ones are never included)'],
]
const SENSITIVE_TYPES = ['hiring', 'exit']

function CopilotExportCard({ token }) {
  const [opts, setOpts] = useState(() => ({ ...DEFAULT_EXPORT_OPTIONS, ...(getCopilotExportSettings().options || {}) }))
  const [busy, setBusy] = useState('')     // '' | 'upload' | 'download'
  const [error, setError] = useState('')
  const [result, setResult] = useState(() => getCopilotExportSettings().last || null)

  const info = getMsGraphTokenInfo(token)
  const tokenOk = !!token && tokenHasAnyScope(info, ONEDRIVE_WRITE_SCOPES) && !(info?.expiresAt && info.expiresAt.getTime() <= Date.now())
  const anySection = EXPORT_SECTIONS.some(([k]) => opts[k])
  const sensitiveOn = SENSITIVE_TYPES.every((t) => opts.interviewTypes.includes(t))

  function update(patch) {
    const next = { ...opts, ...patch }
    setOpts(next)
    setCopilotExportSettings({ options: next })
  }
  function toggleSensitive(on) {
    const base = opts.interviewTypes.filter((t) => !SENSITIVE_TYPES.includes(t))
    update({ interviewTypes: on ? [...base, ...SENSITIVE_TYPES] : base })
  }

  async function buildFile() {
    const [people, interviews, followUps, accomplishments, notes] = await Promise.all([
      directReportsStore.list({ fresh: true }),
      interviewsStore.list({ fresh: true }), // also feeds "Last 1:1" when conversations are left out
      followUpsStore.list({ fresh: true }),
      accomplishmentsStore.list({ fresh: true }),
      opts.notes ? notesStore.list({ fresh: true }) : [],
    ])
    const model = buildExportModel({ people, interviews, followUps, accomplishments, notes }, opts)
    return { model, blob: await buildExportDocx(model) }
  }

  async function handleUpload() {
    setBusy('upload'); setError('')
    try {
      const { model, blob } = await buildFile()
      const up = await uploadToOneDrive({ folder: EXPORT_FOLDER, filename: EXPORT_FILENAME, data: blob, contentType: DOCX_MIME })
      const sharing = await checkOneDriveSharing(up.itemId)
      const last = { at: new Date().toISOString(), webUrl: up.webUrl, replaced: up.replaced, counts: exportCounts(model), sharing: sharing.status }
      setResult(last)
      setCopilotExportSettings({ last })
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy('') }
  }

  async function handleDownload() {
    setBusy('download'); setError('')
    try {
      const { blob } = await buildFile()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = EXPORT_FILENAME
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy('') }
  }

  const dim = { color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6 }
  const hint = { fontSize: 12, color: 'var(--text-faint)', marginLeft: 25, marginTop: -2 }
  const c = result?.counts
  const plural = (n, w) => `${n} ${n === 1 ? w : w === 'person' ? 'people' : `${w}s`}`

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>🤖 Export for Copilot</h3>
      <p style={{ ...dim, marginTop: 0 }}>
        Saves a Word file with your PeopleOS data to <strong>your own OneDrive</strong> ({EXPORT_FOLDER} › {EXPORT_FILENAME}),
        so Microsoft 365 Copilot can answer questions about your team. It's a snapshot: export again
        whenever you want Copilot to see newer entries. Each export replaces the previous file.
      </p>

      <div className="field" style={{ marginBottom: 10 }}>
        <label>Conversations and accomplishments from the last</label>
        <select value={opts.months} onChange={(e) => update({ months: Number(e.target.value) })} style={{ maxWidth: 200 }}>
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
        </select>
      </div>

      <div className="field" style={{ gap: 8 }}>
        <label>Include</label>
        {EXPORT_SECTIONS.map(([key, title, sub]) => (
          <div key={key}>
            <label className="check-label">
              <input type="checkbox" checked={!!opts[key]} onChange={(e) => update({ [key]: e.target.checked })} />
              {title}
            </label>
            {sub && <div style={hint}>{sub}</div>}
            {key === 'interviews' && opts.interviews && (
              <label className="check-label" style={{ marginLeft: 25, marginTop: 6, fontSize: 13 }}>
                <input type="checkbox" checked={sensitiveOn} onChange={(e) => toggleSensitive(e.target.checked)} />
                Also hiring and exit interviews
              </label>
            )}
          </div>
        ))}
        <label className="check-label" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={!!opts.includeInactive} onChange={(e) => update({ includeInactive: e.target.checked })} />
          Include people who aren't active (on leave, left)
        </label>
      </div>

      <p style={{ ...dim, fontSize: 12.5, margin: '0 0 12px' }}>
        The file is stored unencrypted in your company OneDrive and isn't shared with anyone. Leave
        out anything you wouldn't keep there.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn primary" onClick={handleUpload} disabled={!!busy || !anySection || !tokenOk}>
          {busy === 'upload' ? 'Exporting…' : '☁️ Export to OneDrive'}
        </button>
        <button className="btn" onClick={handleDownload} disabled={!!busy || !anySection}>
          {busy === 'download' ? 'Building…' : '⬇ Download .docx'}
        </button>
      </div>
      {!tokenOk && (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>
          Needs a current Microsoft Graph token with OneDrive write permission (Files.ReadWrite) — see the token status above.
          You can still download the file and upload it to OneDrive yourself.
        </div>
      )}
      {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 10 }}>⚠ {error}</div>}

      {result && !error && (
        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
          <div>
            <span style={{ color: 'var(--good)', fontWeight: 600 }}>✓</span>{' '}
            {result.replaced ? 'Updated' : 'Saved'} on {new Date(result.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {result.webUrl && <> · <a href={result.webUrl} target="_blank" rel="noreferrer">Open in OneDrive</a></>}
          </div>
          {c && (
            <div style={{ color: 'var(--text-dim)' }}>
              {[plural(c.people, 'person'), plural(c.interviews, 'conversation'), plural(c.followUps, 'open follow-up'),
                plural(c.accomplishments, 'accomplishment'), ...(c.notes ? [plural(c.notes, 'note')] : [])].join(' · ')}
            </div>
          )}
          {result.sharing === 'private' && <div style={{ color: 'var(--good)' }}>🔒 Only you have access to this file</div>}
          {result.sharing === 'shared' && <div style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠ This file is shared with others — stop sharing it in OneDrive (or its PeopleOS folder).</div>}
          {result.sharing === 'unknown' && <div style={{ color: 'var(--text-faint)' }}>Couldn't check who has access — make sure the PeopleOS folder isn't shared.</div>}
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>How to use it in Copilot</summary>
        <ol style={{ ...dim, paddingLeft: 20, margin: '8px 0 0' }}>
          <li><strong>In any Copilot chat:</strong> type <code>/</code>, choose <strong>{EXPORT_FILENAME}</strong>, then ask, e.g. "Prepare my next 1:1 with Ana".</li>
          <li>
            <strong>As your own agent (optional):</strong> in Microsoft 365 Copilot choose <strong>Create agent</strong>,
            add the file under <strong>Knowledge</strong>, and give it an instruction such as "Answer only from this file; it holds my
            people-management notes." Keep the agent private — don't share it.
          </li>
          <li>Export again after adding new 1:1s or follow-ups; Copilot reads the updated file.</li>
        </ol>
      </details>
    </div>
  )
}

// "Install on your phone" — PeopleOS is a PWA (manifest + service worker, see src/lib/pwa.js).
function InstallCard() {
  const [pwa, setPwa] = useState({ installPrompt: null })
  useEffect(() => subscribePwa(setPwa), [])
  const standalone = isStandalone()
  const ios = isIOS()
  const steps = { color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.8, paddingLeft: 20, margin: '0 0 6px' }

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>📱 Install on your phone</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
        PeopleOS can be installed as an app: its own home-screen icon, full screen without the
        browser bar, and an instant start. Data still comes live from the data repo, so you need a
        connection to load or save anything.
      </p>
      {standalone ? (
        <div className="badge good" style={{ display: 'inline-block' }}>✓ You're using the installed app</div>
      ) : pwa.installPrompt ? (
        <button className="btn primary" onClick={promptInstall}>Install PeopleOS</button>
      ) : ios ? (
        <ol style={steps}>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
      ) : (
        <>
          <ol style={steps}>
            <li><strong>Android (Chrome):</strong> open this page on your phone, tap the <strong>⋮</strong> menu → <strong>Install app</strong> (or <em>Add to Home screen</em>).</li>
            <li><strong>iPhone (Safari):</strong> Share button → <strong>Add to Home Screen</strong>.</li>
          </ol>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Open the same address on your phone: <code>{window.location.origin + import.meta.env.BASE_URL}</code>
          </div>
        </>
      )}
    </div>
  )
}

// Quick links to the Teams caption grabber: the browser bookmarklet's install page
// (public/tools/caption-grabber.html) and the Windows app (desktop/caption-grabber, GitHub release).
const CAPTION_GRABBER_LINKS = [
  {
    title: 'Browser bookmarklet',
    sub: 'For Teams in Edge or Chrome. Open the page and drag the yellow button to your bookmarks bar.',
    url: new URL(import.meta.env.BASE_URL + 'tools/caption-grabber.html', window.location.origin).href,
  },
  {
    title: 'Windows app (CaptionGrabber.exe)',
    sub: 'For the Teams desktop app. Needs IT approval before installing.',
    url: 'https://github.com/HenryAI-stack/people-os/releases/latest/download/CaptionGrabber.exe',
  },
  {
    title: 'Details for IT',
    sub: 'What the Windows app reads and stores, for the approval request.',
    url: 'https://github.com/HenryAI-stack/people-os/tree/main/desktop/caption-grabber#for-it-what-it-does-and-doesnt-do',
  },
]

function CaptionGrabberCard() {
  const [copied, setCopied] = useState('')

  async function copy(url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? '' : c)), 2000)
    } catch {
      window.prompt?.('Copy this link:', url)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>🎙️ Teams caption grabber</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
        Keeps the live captions of a Teams call and copies them as a transcript for the interview notes.
        Copy a link to open it on your work laptop.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CAPTION_GRABBER_LINKS.map((l) => (
          <div key={l.url} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{l.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>{l.sub}</div>
            </div>
            <div className="row-actions" style={{ display: 'flex', gap: 8 }}>
              <a className="btn" href={l.url} target="_blank" rel="noreferrer">Open</a>
              <button className="btn" type="button" onClick={() => copy(l.url)}>
                {copied === l.url ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
