import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { watchAuthState, signInWithGoogle, signOut, isAllowedUser, handleRedirectResult } from './lib/firebase'

import Dashboard from './pages/Dashboard.jsx'
import DirectReports from './pages/DirectReports.jsx'
import Interviews from './pages/Interviews.jsx'
import Notes from './pages/Notes.jsx'

function usePref(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : def } catch { return def }
  })
  function save(v) { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }
  return [val, save]
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [authError, setAuthError] = useState('')
  const [light, setLight] = usePref('peopleos-theme-light', false)
  const [collapsed, setCollapsed] = usePref('peopleos-sidebar-collapsed', false)

  useEffect(() => {
    document.body.classList.toggle('light', light)
  }, [light])

  useEffect(() => {
    // Handle the result when Google redirects back to the app
    handleRedirectResult().catch((err) => {
      console.error('Redirect result error:', err)
      setAuthError('Sign-in failed: ' + err.message)
    })

    const unsub = watchAuthState((u) => {
      if (u && !isAllowedUser(u)) {
        setAuthError('This Google account is not authorized for PeopleOS.')
        signOut()
        setUser(null)
        return
      }
      setAuthError('')
      setUser(u)
    })
    return unsub
  }, [])

  if (user === undefined) return <div className="loading-screen">Loading PeopleOS…</div>
  if (!user) return <LoginScreen error={authError} />

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        light={light}
        onToggleTheme={() => setLight(!light)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/direct-reports" element={<DirectReports />} />
          <Route path="/interviews" element={<Interviews />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Sidebar({ user, light, onToggleTheme, collapsed, onToggleCollapse }) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand">
        <span className="dot">●</span>
        <span className="brand-text">PeopleOS</span>
      </div>
      <nav className="nav">
        <NavLink to="/" end title="Dashboard">
          <span className="nav-icon">📊</span>
          <span className="nav-label">Dashboard</span>
        </NavLink>
        <NavLink to="/direct-reports" title="Direct Reports">
          <span className="nav-icon">👥</span>
          <span className="nav-label">Direct Reports</span>
        </NavLink>
        <NavLink to="/interviews" title="Interviews">
          <span className="nav-icon">🗣️</span>
          <span className="nav-label">Interviews</span>
        </NavLink>
        <NavLink to="/notes" title="Notes">
          <span className="nav-icon">📝</span>
          <span className="nav-label">Notes</span>
        </NavLink>
      </nav>
      <div className="sidebar-controls">
        <div className="theme-row" title={light ? 'Switch to dark mode' : 'Switch to light mode'}>
          <span className="nav-icon" style={{ fontSize: 14 }}>{light ? '☀️' : '🌙'}</span>
          <span className="theme-label">{light ? 'Light mode' : 'Dark mode'}</span>
          <label className="toggle-pill" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={light} onChange={onToggleTheme} />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>
        <button className="collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <span className="collapse-btn-icon">◀</span>
          <span className="collapse-btn-label">Collapse</span>
        </button>
      </div>
      <div className="sidebar-footer">
        {user.photoURL
          ? <img className="avatar" src={user.photoURL} alt="" />
          : <div className="avatar" />
        }
        <div className="user-mini">
          <div className="name">{user.displayName || 'You'}</div>
          <div className="email">{user.email}</div>
          <button className="signout-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </aside>
  )
}

function LoginScreen({ error }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(error || '')

  async function handleSignIn() {
    setBusy(true)
    setErr('')
    try {
      await signInWithGoogle() // triggers redirect — page will reload
    } catch (e) {
      setErr('Sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <span className="dot">●</span>
          <span className="brand-text">PeopleOS</span>
        </div>
        <p>Your leadership hub — direct reports, 1:1s, and notes, all in one place.</p>
        <button className="google-btn" onClick={handleSignIn} disabled={busy}>
          <GoogleIcon /> {busy ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>
        {err && <div className="login-error">{err}</div>}
      </div>
    </div>
  )
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
