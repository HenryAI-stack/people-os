/**
 * Live checks for every external service PeopleOS depends on — the Settings page's
 * "🔌 Connections" card. Each check makes one cheap, read-only request and returns
 *   { status: 'ok' | 'warn' | 'error' | 'off', detail: string }
 * ('off' = not configured on purpose, e.g. no Graph token pasted). Checks never throw.
 * Nothing here writes data or calls the AI model (the proxy's GET is a free health ping).
 */
import { auth } from './auth.js'
import { AI_PROXY_URL } from './ai.js'
import { APP_OWNER, APP_REPO } from './githubActions.js'
import { getMsGraphToken, getMsGraphTokenInfo } from './settings.js'

const DATA_OWNER = import.meta.env.VITE_GITHUB_OWNER
const DATA_REPO  = import.meta.env.VITE_GITHUB_REPO
const DATA_TOKEN = import.meta.env.VITE_GITHUB_TOKEN
const ACTIONS_TOKEN = import.meta.env.VITE_GH_ACTIONS_TOKEN
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

const TIMEOUT_MS = 15_000
const EXPIRY_WARN_DAYS = 14

function hostOf(url) { try { return new URL(url).host } catch { return url } }

/** fetch with a timeout; returns { res } or { netError: 'timeout' | 'blocked' }. */
async function probe(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return { res: await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' }) }
  } catch (err) {
    return { netError: err?.name === 'AbortError' ? 'timeout' : 'blocked' }
  } finally {
    clearTimeout(timer)
  }
}

function unreachable(netError, host) {
  return netError === 'timeout'
    ? { status: 'error', detail: `${host} didn't answer within ${TIMEOUT_MS / 1000}s.` }
    : { status: 'error', detail: `Can't reach ${host} — offline, or blocked on this network.` }
}

// Fine-grained GitHub PATs report their expiry in a response header (when GitHub exposes it
// to the browser — if not, we just don't show it).
function githubExpiry(res) {
  const raw = res.headers.get('github-authentication-token-expiration')
  if (!raw) return null
  const d = new Date(raw.replace(' UTC', 'Z').replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

function expiryNote(date) {
  if (!date) return { warn: false, text: '' }
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000)
  const when = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return { warn: days < EXPIRY_WARN_DAYS, text: days < EXPIRY_WARN_DAYS ? ` Token expires ${when} — renew it soon.` : ` Token valid until ${when}.` }
}

// ── The checks ───────────────────────────────────────────────────────────────────────────────

async function checkAiProxy() {
  if (!AI_PROXY_URL) {
    return OPENROUTER_KEY
      ? { status: 'warn', detail: 'No proxy set (VITE_AI_PROXY_URL) — AI calls go straight to openrouter.ai, which is blocked on some networks.' }
      : { status: 'off', detail: 'Not configured — set VITE_AI_PROXY_URL.' }
  }
  const host = hostOf(AI_PROXY_URL)
  const user = auth.currentUser
  if (!user) return { status: 'error', detail: 'Not signed in.' }
  let idToken
  try { idToken = await user.getIdToken() } catch { return { status: 'error', detail: 'Could not get a sign-in token from Firebase.' } }

  const { res, netError } = await probe(AI_PROXY_URL, { headers: { Authorization: `Bearer ${idToken}` } })
  if (netError) return unreachable(netError, host)

  let body = null
  try { body = await res.json() } catch {}
  // A proxy deployed before the health check existed answers GET with 405 "Use POST." —
  // that still proves it's reachable and lets this origin through.
  if (res.status === 405) return { status: 'warn', detail: `${host} is reachable, but this proxy version can't run the full check — redeploy it in Vercel.` }
  if (!res.ok) return { status: 'error', detail: body?.error?.message || `${host} answered ${res.status}.` }

  const or = body?.openrouter || {}
  if (!body?.ok) return { status: 'error', detail: or.message || 'The proxy is up, but OpenRouter isn’t accepting its key.' }
  const bits = [`${host} → OpenRouter OK`]
  if (typeof or.usageMonthly === 'number') bits.push(`$${or.usageMonthly.toFixed(2)} used this month`)
  if (typeof or.limitRemaining === 'number') bits.push(`$${or.limitRemaining.toFixed(2)} left on the key's limit`)
  if (body.model) bits.push(`model ${body.model}`)
  const lowLimit = typeof or.limitRemaining === 'number' && or.limitRemaining < 1
  return { status: lowLimit ? 'warn' : 'ok', detail: bits.join(' · ') + (lowLimit ? ' — top up soon.' : '') }
}

async function checkFirebase() {
  const user = auth.currentUser
  if (!user) return { status: 'error', detail: 'Not signed in.' }
  try {
    await user.getIdToken(true) // forces a round-trip to Google, so it proves the connection
    return { status: 'ok', detail: `Signed in as ${user.email}.` }
  } catch (err) {
    return err?.code === 'auth/network-request-failed'
      ? { status: 'error', detail: 'Can’t reach Google sign-in — offline, or blocked on this network.' }
      : { status: 'error', detail: `Sign-in session problem (${err?.code || err?.message || 'unknown'}) — sign out and in again.` }
  }
}

async function checkDataRepo() {
  if (!DATA_OWNER || !DATA_REPO || !DATA_TOKEN) return { status: 'error', detail: 'VITE_GITHUB_OWNER / _REPO / _TOKEN not set — the app can’t load data.' }
  const { res, netError } = await probe(`https://api.github.com/repos/${DATA_OWNER}/${DATA_REPO}`, {
    headers: { Authorization: `Bearer ${DATA_TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (netError) return unreachable(netError, 'api.github.com')
  if (res.status === 401) return { status: 'error', detail: 'GitHub rejected the data-repo token — it expired or was revoked.' }
  if (res.status === 403 || res.status === 404) return { status: 'error', detail: `No access to ${DATA_OWNER}/${DATA_REPO} with this token (${res.status}).` }
  if (!res.ok) return { status: 'error', detail: `GitHub answered ${res.status}.` }
  const repo = await res.json().catch(() => ({}))
  const exp = expiryNote(githubExpiry(res))
  if (repo.private === false) return { status: 'warn', detail: `${DATA_OWNER}/${DATA_REPO} is PUBLIC — make it private (data is encrypted, but still).${exp.text}` }
  return { status: exp.warn ? 'warn' : 'ok', detail: `${DATA_OWNER}/${DATA_REPO} (private).${exp.text}` }
}

async function checkGraph() {
  const token = getMsGraphToken()
  if (!token) return { status: 'off', detail: 'No token — paste one in “Microsoft Graph token” below (Outlook sync, SharePoint, Copilot export).' }
  const info = getMsGraphTokenInfo(token)
  const mins = info?.expiresAt ? Math.round((info.expiresAt.getTime() - Date.now()) / 60000) : null
  if (mins !== null && mins <= 0) return { status: 'error', detail: 'Token expired — paste a fresh one below.' }

  const { res, netError } = await probe('https://graph.microsoft.com/v1.0/me?$select=userPrincipalName', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (netError) return unreachable(netError, 'graph.microsoft.com')
  if (res.status === 401) return { status: 'error', detail: 'Microsoft rejected the token — paste a fresh one below.' }
  if (!res.ok) return { status: 'error', detail: `Microsoft Graph answered ${res.status}.` }
  const me = await res.json().catch(() => ({}))
  const who = me.userPrincipalName ? ` as ${me.userPrincipalName}` : ''
  if (mins === null) return { status: 'ok', detail: `Connected${who}.` }
  return mins < 10
    ? { status: 'warn', detail: `Connected${who} — token expires in ${mins} min.` }
    : { status: 'ok', detail: `Connected${who} · token valid ${mins} more min.` }
}

async function checkActions() {
  if (!ACTIONS_TOKEN) return { status: 'off', detail: 'Not configured — the “send email now” buttons are disabled (VITE_GH_ACTIONS_TOKEN).' }
  const { res, netError } = await probe(`https://api.github.com/repos/${APP_OWNER}/${APP_REPO}/actions/workflows?per_page=1`, {
    headers: { Authorization: `Bearer ${ACTIONS_TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (netError) return unreachable(netError, 'api.github.com')
  if (res.status === 401) return { status: 'error', detail: 'GitHub rejected the Actions token — it expired or was revoked.' }
  if (res.status === 403 || res.status === 404) return { status: 'error', detail: `The Actions token has no access to ${APP_OWNER}/${APP_REPO} (${res.status}).` }
  if (!res.ok) return { status: 'error', detail: `GitHub answered ${res.status}.` }
  const exp = expiryNote(githubExpiry(res))
  return { status: exp.warn ? 'warn' : 'ok', detail: `Can start the email workflows.${exp.text}` }
}

/** In display order. `run` never throws. */
export const CONNECTIONS = [
  { id: 'ai',       label: 'AI proxy (Vercel → OpenRouter)', run: checkAiProxy },
  { id: 'firebase', label: 'Google sign-in (Firebase)',      run: checkFirebase },
  { id: 'data',     label: 'Data repo (GitHub)',             run: checkDataRepo },
  { id: 'graph',    label: 'Microsoft 365 (Graph)',          run: checkGraph },
  { id: 'actions',  label: 'Email workflows (GitHub Actions)', run: checkActions },
]

/** Runs one check, timing it and turning any unexpected exception into an error row. */
export async function runConnectionCheck(conn) {
  const t0 = performance.now()
  let result
  try { result = await conn.run() } catch (err) { result = { status: 'error', detail: err?.message || String(err) } }
  return { ...result, ms: Math.round(performance.now() - t0), checkedAt: Date.now() }
}
