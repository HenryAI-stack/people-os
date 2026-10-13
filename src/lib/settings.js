// User-entered, browser-local settings — never written to the data repo.
// Currently just the Microsoft Graph token, which otherwise requires a
// rebuild+redeploy (VITE_MS_GRAPH_TOKEN is baked in at build time) every
// time the ~1h token expires. Storing it here lets it be refreshed from
// the Settings page instead.

const MS_GRAPH_TOKEN_KEY = 'peopleos-ms-graph-token'

export function getMsGraphToken() {
  try {
    const stored = localStorage.getItem(MS_GRAPH_TOKEN_KEY)
    if (stored) return stored
  } catch {}
  return import.meta.env.VITE_MS_GRAPH_TOKEN || ''
}

export function setMsGraphToken(token) {
  try {
    if (token) localStorage.setItem(MS_GRAPH_TOKEN_KEY, token)
    else localStorage.removeItem(MS_GRAPH_TOKEN_KEY)
  } catch {}
}

// ── Token details (display-only hints) ──────────────────────────────────────
// A Graph Explorer access token is a JWT; reading its payload shows which permissions (`scp`)
// it carries and when it expires, so the Settings page can say *before* an action fails
// whether e.g. "Upload to SharePoint" will work. No signature check: Graph is still the
// authority, this is only a hint. Returns null for anything that doesn't parse.
export const TODO_SCOPES = ['Tasks.ReadWrite']
export const SHAREPOINT_WRITE_SCOPES = ['Sites.ReadWrite.All', 'Files.ReadWrite.All', 'Sites.Manage.All', 'Sites.FullControl.All']
// Writing to a Microsoft 365 group calendar (the On-duty calendar page's Group calendar web part).
export const GROUP_CALENDAR_SCOPES = ['Group.ReadWrite.All']

export function getMsGraphTokenInfo(token = getMsGraphToken()) {
  try {
    const part = (token || '').split('.')[1]
    if (!part) return null
    const bytes = Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const p = JSON.parse(new TextDecoder().decode(bytes))
    return {
      scopes: String(p.scp || '').split(' ').filter(Boolean),
      expiresAt: p.exp ? new Date(p.exp * 1000) : null,
      account: p.upn || p.preferred_username || p.unique_name || '',
    }
  } catch {
    return null
  }
}

export function tokenHasAnyScope(info, scopes) {
  return !!info && info.scopes.some((s) => scopes.includes(s))
}
