import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { onAuth, loginWithGoogle, completeRedirectLogin, logout } from './lib/auth.js'
import { subscribePwa, applyUpdate } from './lib/pwa.js'

import Dashboard    from './pages/Dashboard.jsx'
import DirectReports from './pages/DirectReports.jsx'
import Interviews   from './pages/Interviews.jsx'
import Notes        from './pages/Notes.jsx'
import FollowUps     from './pages/FollowUps.jsx'
import WorkSchedule  from './pages/WorkSchedule.jsx'
import Accomplishments from './pages/Accomplishments.jsx'
import PersonDetail from './pages/PersonDetail.jsx'
import Settings from './pages/Settings.jsx'
import WorldMapModal from './components/WorldMapModal.jsx'
import { CLOCKS, fmtTime, fmtDate, fmtTzAbbr, fmtTzFull } from './lib/worldClock.js'

function usePref(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : def } catch { return def }
  })
  function save(v) { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }
  return [val, save]
}

export default function App() {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError,   setAuthError]   = useState(null)
  const [light,       setLight]       = usePref('peopleos-theme-light', false)
  const [collapsed,   setCollapsed]   = usePref('peopleos-sidebar-collapsed', false)

  const [navOpen,     setNavOpen]     = useState(false)  // mobile drawer (≤760px only)

  useEffect(() => {
    document.body.classList.toggle('light', light)
    // Status bar / task switcher colour of the installed app follows the theme.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#1b1f26')
  }, [light])
  useEffect(() => { return onAuth(u => { setUser(u); setAuthLoading(false) }) }, [])
  useEffect(() => {
    completeRedirectLogin().catch((e) => { if (e.message === 'ACCESS_DENIED') setAuthError('access_denied') })
  }, [])

  async function handleLogin() {
    try { setAuthError(null); await loginWithGoogle() }
    catch (e) {
      if (e.message === 'ACCESS_DENIED') setAuthError('access_denied')
      else if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e?.code)) setAuthError(e?.code || e?.message || 'failed')
    }
  }

  if (authLoading) return <Centered>Loading PeopleOS…</Centered>
  if (!user)       return <LoginPage onLogin={handleLogin} authError={authError} />

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
        <div className="brand"><span className="dot">●</span><span className="brand-text">PeopleOS</span></div>
      </header>
      <Sidebar user={user} light={light} onToggleTheme={() => setLight(!light)}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)}
        onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <AppBanners />
        <Routes>
          <Route path="/"                    element={<Dashboard />} />
          <Route path="/direct-reports"      element={<DirectReports />} />
          <Route path="/direct-reports/:id"  element={<PersonDetail />} />
          <Route path="/interviews"          element={<Interviews />} />
          <Route path="/notes"               element={<Notes />} />
          <Route path="/follow-ups"          element={<FollowUps />} />
          <Route path="/accomplishments"     element={<Accomplishments />} />
          <Route path="/work-schedule"       element={<WorkSchedule />} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="*"                    element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Sidebar({ user, light, onToggleTheme, collapsed, onToggleCollapse, onNavigate }) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand"><span className="dot">●</span><span className="brand-text">PeopleOS</span></div>
      <div className="sidebar-scroll">
        <nav className="nav" onClick={(e) => { if (e.target.closest('a')) onNavigate?.() }}>
          <NavLink to="/" end title="Dashboard"><span className="nav-icon">📊</span><span className="nav-label">Dashboard</span></NavLink>
          <NavLink to="/direct-reports" title="Direct Reports"><span className="nav-icon">👥</span><span className="nav-label">Direct Reports</span></NavLink>
          <NavLink to="/interviews" title="Interviews"><span className="nav-icon">🗣️</span><span className="nav-label">Interviews</span></NavLink>
          <NavLink to="/notes" title="Notes"><span className="nav-icon">📝</span><span className="nav-label">Notes</span></NavLink>
          <NavLink to="/follow-ups" title="Follow-ups"><span className="nav-icon">📋</span><span className="nav-label">Follow-ups</span></NavLink>
          <NavLink to="/accomplishments" title="Accomplishments"><span className="nav-icon">🏆</span><span className="nav-label">Accomplishments</span></NavLink>
          <NavLink to="/work-schedule" title="Work Schedule"><span className="nav-icon">🗓️</span><span className="nav-label">Work Schedule</span></NavLink>
          <NavLink to="/settings" title="Settings"><span className="nav-icon">⚙️</span><span className="nav-label">Settings</span></NavLink>
        </nav>
      </div>
      <WorldClock />
      <div className="sidebar-bottom">
        <div className="theme-row" title={light ? 'Switch to dark mode' : 'Switch to light mode'}>
          <span className="nav-icon" style={{ fontSize: 14 }}>{light ? '☀️' : '🌙'}</span>
          <span className="theme-label">{light ? 'Light mode' : 'Dark mode'}</span>
          <label className="toggle-pill">
            <input type="checkbox" checked={light} onChange={onToggleTheme} />
            <span className="toggle-track" /><span className="toggle-thumb" />
          </label>
        </div>
        <button className="collapse-btn" onClick={onToggleCollapse}>
          <span className="collapse-btn-icon">◀</span>
          <span className="collapse-btn-label">Collapse</span>
        </button>
        <div className="sidebar-footer">
          {user.photoURL ? <img className="avatar" src={user.photoURL} alt="" /> : <div className="avatar" />}
          <div className="user-mini">
            <div className="name">{user.displayName || 'You'}</div>
            <div className="email">{user.email}</div>
            <button className="signout-btn" onClick={logout}>Sign out</button>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── PWA / connectivity banners ──────────────────────────────────────────────
function AppBanners() {
  const [pwa, setPwa] = useState({ updateReady: false })
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => subscribePwa(setPwa), [])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return (
    <>
      {!online && (
        <div className="app-banner warn">📴 You're offline — data can't be loaded or saved until you reconnect.</div>
      )}
      {pwa.updateReady && (
        <div className="app-banner">
          ✨ A new version of PeopleOS is available.
          <button className="btn primary" onClick={applyUpdate}>Reload</button>
        </div>
      )}
    </>
  )
}

// ── World Clock ───────────────────────────────────────────────────────────────
function flagUrl(code) {
  return `https://flagcdn.com/16x12/${code.toLowerCase()}.png`
}

function WorldClock() {
  const [now, setNow] = useState(new Date())
  const [mapOpen, setMapOpen] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])

  // Hidden via CSS (not unmounted) when collapsed, so the mobile drawer — which ignores the
  // desktop collapse preference — still shows it.
  return (
    <div className="world-clock" style={{ padding: '8px 8px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
      <button
        className="world-clock-title-btn"
        onClick={() => setMapOpen(true)}
        title="Open world map"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-faint)', marginBottom: 6, paddingLeft: 2, background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
      >
        <span aria-hidden="true">🌐</span> World Clock
        <span className="world-map-icon" aria-hidden="true">🗺️</span>
      </button>
      {mapOpen && <WorldMapModal onClose={() => setMapOpen(false)} />}
      {CLOCKS.map((c) => (
        <div key={c.city} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px', borderRadius: 6, marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <img src={flagUrl(c.country)} alt={c.country} style={{ width: 16, height: 12, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.city}</span>
            {c.offset && <span style={{ fontSize: 9.5, color: 'var(--text-faint)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 3px', flexShrink: 0 }}>{c.offset}</span>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>
              {fmtTime(now, c.tz)}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>{fmtDate(now, c.tz)}</div>
            <div title={fmtTzFull(now, c.tz)} style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.3px', cursor: 'help' }}>{fmtTzAbbr(now, c.tz)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}


function LoginPage({ onLogin, authError }) {
  const [busy, setBusy] = useState(false)
  async function handle() { setBusy(true); await onLogin(); setBusy(false) }
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand"><span className="dot">●</span><span className="brand-text">PeopleOS</span></div>
        <p>Your leadership hub — direct reports, 1:1s, and notes.</p>
        <button className="google-btn" onClick={handle} disabled={busy}>
          <GoogleIcon />{busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        {authError === 'access_denied' && <div className="login-error">This Google account is not authorized.</div>}
        {authError && authError !== 'access_denied' && <div className="login-error">Sign-in failed ({authError}). Please try again.</div>}
      </div>
    </div>
  )
}

function Centered({ children }) {
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:14, color:'#888' }}>{children}</div>
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.85.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  )
}
