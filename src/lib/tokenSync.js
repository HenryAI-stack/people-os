// Shares the Microsoft Graph token between devices through the data repo, so a token pasted in
// the laptop browser also reaches the installed phone app (same Google login, same data repo).
//
// localStorage (settings.js) stays the working copy that msGraph.js reads synchronously; this
// module only copies tokens between it and one record in `app-settings.json` — encrypted like
// every other record. The newer token wins, judged by its `exp` claim, so a device never swaps
// a fresh token for an older one. Best-effort: failures are swallowed (pull) or reported (push).
import { appSettingsStore } from './dataStore.js'
import { getMsGraphToken, setMsGraphToken, getMsGraphTokenInfo, normalizeToken } from './settings.js'

const RECORD_ID = 'ms-graph-token'
export const TOKEN_CHANGED_EVENT = 'peopleos-graph-token-changed'

const expMs = (token) => getMsGraphTokenInfo(token)?.expiresAt?.getTime() || 0

let _pulling = null

/** Adopts the synced token if it's newer than this device's. Returns true when it changed. */
export function pullMsGraphToken() {
  if (_pulling) return _pulling
  _pulling = (async () => {
    try {
      const items = await appSettingsStore.list({ fresh: true })
      const remote = normalizeToken(items.find((i) => i.id === RECORD_ID)?.token)
      const local = getMsGraphToken()
      if (!remote || remote === local) return false
      if (local && expMs(remote) <= expMs(local)) return false
      setMsGraphToken(remote)
      window.dispatchEvent(new CustomEvent(TOKEN_CHANGED_EVENT, { detail: remote }))
      return true
    } catch {
      return false
    } finally {
      _pulling = null
    }
  })()
  return _pulling
}

/** Stores the token for the other devices (empty token = remove it everywhere). Throws on failure. */
export async function pushMsGraphToken(token) {
  token = normalizeToken(token)
  if (token) await appSettingsStore.upsert({ id: RECORD_ID, token })
  else await appSettingsStore.remove(RECORD_ID)
}
