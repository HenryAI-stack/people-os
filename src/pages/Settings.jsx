import { useEffect, useState } from 'react'
import { msalConnect, msalDisconnect, msalGetAccount } from '../lib/msalAuth.js'

const CLIENT_ID_SET = !!import.meta.env.VITE_MS_GRAPH_CLIENT_ID

export default function Settings() {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    msalGetAccount().then(setAccount).finally(() => setLoading(false))
  }, [])

  async function handleConnect() {
    setBusy(true)
    setError('')
    try {
      const acct = await msalConnect()
      setAccount(acct)
    } catch (err) {
      setError(err.message || 'Could not connect to Microsoft.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    setError('')
    try {
      await msalDisconnect()
      setAccount(null)
    } catch (err) {
      setError(err.message || 'Could not disconnect.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Local to this browser — nothing here is written to the data repo.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Microsoft account</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Powers the "Sync to Outlook" buttons on the Follow-ups page — they push follow-ups
          into a <strong>PeopleOS Follow-ups</strong> list in Microsoft To Do. Connect once and
          PeopleOS silently renews its own access token in the background from then on — no
          more copy-pasting a fresh token every hour or two.
        </p>

        {!CLIENT_ID_SET ? (
          <div style={{ color: 'var(--bad)', fontSize: 13.5, lineHeight: 1.6 }}>
            <code>VITE_MS_GRAPH_CLIENT_ID</code> is not set in this build — Outlook sync is
            disabled until an Entra ID app registration is created and its client ID is added
            (see INSTALLATION.md).
          </div>
        ) : loading ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Checking connection…</div>
        ) : account ? (
          <>
            <div style={{ fontSize: 13.5, marginBottom: 14 }}>
              Status: connected as <strong>{account.username}</strong>.
            </div>
            <button type="button" className="btn ghost danger" onClick={handleDisconnect} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginBottom: 14 }}>
              Status: not connected — Outlook sync will show an error until you connect.
            </div>
            <button type="button" className="btn primary" onClick={handleConnect} disabled={busy}>
              {busy ? 'Connecting…' : 'Connect Microsoft Account'}
            </button>
          </>
        )}

        {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>
    </>
  )
}
