// Automated Microsoft Graph token acquisition for Outlook / Microsoft To Do sync, via
// MSAL.js (Authorization Code + PKCE, public client). Replaces the old "paste a Graph
// Explorer token every ~1h" flow: sign in once from the Settings page, and MSAL silently
// redeems its cached refresh token for a fresh access token on every subsequent Graph call
// (msGraph.js's authHeaders()) — no manual copy/paste, and no server component needed since
// this is a public client (no client secret ships in the bundle).
//
// Requires an Entra ID (Azure AD) app registration of platform type "Single-page
// application" with VITE_MS_GRAPH_CLIENT_ID set to its Application (client) ID and
// "Tasks.ReadWrite" delegated permission granted — see INSTALLATION.md.
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'

const CLIENT_ID = import.meta.env.VITE_MS_GRAPH_CLIENT_ID || ''
const TENANT_ID = import.meta.env.VITE_MS_GRAPH_TENANT_ID || 'common'
const SCOPES = ['Tasks.ReadWrite']

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  },
  cache: {
    // Refresh tokens live here so a silent renewal survives page reloads and tab closes —
    // the whole point is not needing to sign in again every couple hours.
    cacheLocation: 'localStorage',
  },
}

let msalInstance = null
let initPromise = null

function getInstance() {
  if (!CLIENT_ID) throw new Error('VITE_MS_GRAPH_CLIENT_ID is not set. Add it to your .env / GitHub secrets — see INSTALLATION.md.')
  if (!msalInstance) msalInstance = new PublicClientApplication(msalConfig)
  if (!initPromise) initPromise = msalInstance.initialize()
  return initPromise.then(() => msalInstance)
}

function pickAccount(instance) {
  const active = instance.getActiveAccount()
  if (active) return active
  const accounts = instance.getAllAccounts()
  if (accounts.length === 0) return null
  instance.setActiveAccount(accounts[0])
  return accounts[0]
}

/** Interactive sign-in (popup). Call this once from the Settings page "Connect" button. */
export async function msalConnect() {
  const instance = await getInstance()
  const result = await instance.loginPopup({ scopes: SCOPES, prompt: 'select_account' })
  instance.setActiveAccount(result.account)
  return result.account
}

/** Forgets the signed-in account and clears its cached tokens from this browser. */
export async function msalDisconnect() {
  const instance = await getInstance()
  const account = pickAccount(instance)
  if (account) await instance.clearCache({ account })
}

/** The currently signed-in account, or null. Used by Settings.jsx to show connection status. */
export async function msalGetAccount() {
  if (!CLIENT_ID) return null
  const instance = await getInstance()
  return pickAccount(instance)
}

/**
 * Returns a live Graph access token, silently renewing it from the cached refresh token
 * whenever the previous one has expired. Falls back to an interactive popup only the first
 * time, or if the refresh token itself has gone stale (e.g. revoked, or ~90 days idle).
 */
export async function getGraphAccessToken() {
  const instance = await getInstance()
  const account = pickAccount(instance)
  if (!account) throw new Error('Not connected to Microsoft. Go to Settings and click "Connect Microsoft Account".')

  try {
    const result = await instance.acquireTokenSilent({ scopes: SCOPES, account })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({ scopes: SCOPES, account })
      return result.accessToken
    }
    throw err
  }
}
