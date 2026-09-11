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
