import { useEffect, useState } from 'react'
import { getMsGraphToken, setMsGraphToken, getMsGraphTokenInfo, tokenHasAnyScope, TODO_SCOPES, SHAREPOINT_WRITE_SCOPES, GROUP_CALENDAR_SCOPES } from '../lib/settings.js'
import { subscribePwa, promptInstall, isStandalone, isIOS } from '../lib/pwa.js'

export default function Settings() {
  const [token, setToken] = useState(() => getMsGraphToken())
  const [show,  setShow]  = useState(false)
  const [saved, setSaved] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    setMsGraphToken(token.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    setToken('')
    setMsGraphToken('')
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Local to this browser — nothing here is written to the data repo.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Microsoft Graph token</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Powers the "Sync to Outlook" buttons on the Follow-ups page — they push follow-ups
          into a <strong>PeopleOS Follow-ups</strong> list in Microsoft To Do — and the Work
          Schedule's <strong>Upload to SharePoint</strong> button. Graph Explorer
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
          <li>Paste it below and click Save. It only lives in this browser's local storage.</li>
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

        <TokenStatus token={token.trim()} />
      </div>

      <InstallCard />
      <CaptionGrabberCard />
    </>
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
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-faint)' }}>Permissions in this token ({info.scopes.length})</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {info.scopes.map((s) => <span key={s} className="badge" style={{ fontSize: 10.5 }}>{s}</span>)}
        </div>
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
