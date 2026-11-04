// User-entered, browser-local settings — never written to the data repo.
// Currently just the Microsoft Graph token, which otherwise requires a
// rebuild+redeploy (VITE_MS_GRAPH_TOKEN is baked in at build time) every
// time the ~1h token expires. Storing it here lets it be refreshed from
// the Settings page instead.

const MS_GRAPH_TOKEN_KEY = 'peopleos-ms-graph-token'

// A pasted token can arrive with a "Bearer " prefix, surrounding quotes, or line breaks/spaces
// in the middle (copying a wrapped token on a phone). Graph rejects all of those, so the token is
// cleaned the same way wherever it's read, stored or decoded.
export function normalizeToken(token) {
  return String(token || '').replace(/\s+/g, '').replace(/^bearer/i, '').replace(/^["']+|["']+$/g, '')
}

export function getMsGraphToken() {
  try {
    const stored = localStorage.getItem(MS_GRAPH_TOKEN_KEY)
    if (stored) return normalizeToken(stored)
  } catch {}
  return normalizeToken(import.meta.env.VITE_MS_GRAPH_TOKEN)
}

export function setMsGraphToken(token) {
  token = normalizeToken(token)
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
// Writing the "Export for Copilot" file into the user's own OneDrive (/me/drive).
export const ONEDRIVE_WRITE_SCOPES = ['Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.ReadWrite.All']

// Microsoft Graph's resource id; a Graph access token's `aud` is this GUID or the Graph URL.
const GRAPH_RESOURCE_ID = '00000003-0000-0000-c000-000000000000'

// `kind` tells the Settings page why a token shows no permissions:
//   'delegated' — normal Graph Explorer access token (`scp`)
//   'app'       — app-only token (`roles`, no `scp`)
//   'id'        — an ID token (no `scp`/`roles`, audience is the app itself): copied from the wrong place
//   'other-aud' — an access token for some other API (Outlook, SharePoint, Teams …), not Graph
//   'none'      — a Graph token that simply carries no permissions
export function getMsGraphTokenInfo(token = getMsGraphToken()) {
  try {
    const part = normalizeToken(token).split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const p = JSON.parse(new TextDecoder().decode(bytes))
    const scp = String(p.scp || '').split(' ').filter(Boolean)
    const roles = Array.isArray(p.roles) ? p.roles : []
    const aud = String(p.aud || '')
    const isGraph = aud === GRAPH_RESOURCE_ID || /^https:\/\/graph\.microsoft\.(com|us)\/?$/i.test(aud)
    const kind = !isGraph
      ? (!scp.length && !roles.length ? 'id' : 'other-aud')
      : scp.length ? 'delegated' : roles.length ? 'app' : 'none'
    return {
      scopes: [...new Set([...scp, ...roles])],
      expiresAt: p.exp ? new Date(p.exp * 1000) : null,
      account: p.upn || p.preferred_username || p.unique_name || p.email || '',
      aud,
      appName: p.app_displayname || '',
      isGraph,
      kind,
    }
  } catch {
    return null
  }
}

export function tokenHasAnyScope(info, scopes) {
  return !!info && info.isGraph && info.scopes.some((s) => scopes.includes(s))
}

// ── "Export for Copilot" (Settings page) ────────────────────────────────────────────────────
// Which sections/period to export, and when/where the last export went. Browser-local like the
// rest of this file; the export itself never touches the data repo.
const COPILOT_EXPORT_KEY = 'peopleos-copilot-export'

export function getCopilotExportSettings() {
  try { return JSON.parse(localStorage.getItem(COPILOT_EXPORT_KEY) || '{}') || {} } catch { return {} }
}

export function setCopilotExportSettings(patch) {
  try {
    const next = { ...getCopilotExportSettings(), ...patch }
    localStorage.setItem(COPILOT_EXPORT_KEY, JSON.stringify(next))
    return next
  } catch { return patch }
}
