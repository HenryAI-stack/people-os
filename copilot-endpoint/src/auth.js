/**
 * Auth gate for the Copilot endpoint.
 *
 * Every request must carry a Microsoft Entra ID access token that Microsoft 365
 * Copilot obtained on the user's behalf (Entra SSO / OAuthPluginVault). We accept
 * it only if ALL of these hold — any single failure is a 401/403:
 *
 *   1. Signature verifies against the tenant's published signing keys (RS256 only)
 *   2. Issuer is this tenant (v2 or v1 issuer format)
 *   3. Audience is our own API app registration (client ID or Application ID URI)
 *   4. Not expired / not used before nbf (60s clock tolerance)
 *   5. tid  === ENTRA_TENANT_ID
 *   6. oid  === ALLOWED_USER_OID   ← the "only my account" check. oid is the user's
 *                                    immutable object ID; unlike email/UPN it can never
 *                                    be reassigned to someone else.
 *   7. It's a delegated user token carrying the PeopleOS.Read scope (app-only tokens
 *      have no scp and are rejected)
 *   8. The token was requested by an allowed client — by default only Microsoft's
 *      Enterprise token store, i.e. the thing Copilot uses to fetch tokens.
 *
 * Failure reasons are logged as a short code only — never the token itself.
 */
import { jwtVerify, createRemoteJWKSet } from 'jose'

// Microsoft Enterprise token store — the client that requests tokens on Copilot's
// behalf when a plugin uses Entra SSO (documented by Microsoft for OAuthPluginVault).
export const COPILOT_TOKEN_STORE_CLIENT_ID = 'ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b'
export const REQUIRED_SCOPE = 'PeopleOS.Read'

const REQUIRED_ENV = ['ENTRA_TENANT_ID', 'ENTRA_API_AUDIENCES', 'ALLOWED_USER_OID']

export class AuthError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status // 401 = who are you?, 403 = I know who you are, and no
    this.code = code
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Throws if the auth config is missing or malformed — we fail closed, never open. */
export function assertAuthConfig(env) {
  for (const k of REQUIRED_ENV) {
    if (!env[k] || !String(env[k]).trim()) throw new Error(`Missing config: ${k}`)
  }
  if (!GUID.test(env.ENTRA_TENANT_ID.trim())) throw new Error('ENTRA_TENANT_ID must be a tenant GUID (not "common"/"organizations")')
  if (!GUID.test(env.ALLOWED_USER_OID.trim())) throw new Error('ALLOWED_USER_OID must be a user object ID GUID')
}

function list(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean)
}

// One JWKS per isolate; jose caches keys and only refetches on an unknown `kid`
// (with a cooldown), so garbage tokens can't make us hammer Microsoft.
let _jwks = null
let _jwksTenant = null
export function defaultJwks(tenantId) {
  if (!_jwks || _jwksTenant !== tenantId) {
    _jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`))
    _jwksTenant = tenantId
  }
  return _jwks
}

/**
 * Verifies the request's bearer token and returns its (trusted) claims.
 * @param {Request} request
 * @param {object} env  Worker env (secrets)
 * @param {object} [opts] { jwks } — injectable key set, used by tests
 */
export async function authenticate(request, env, opts = {}) {
  assertAuthConfig(env)
  const tenantId = env.ENTRA_TENANT_ID.trim().toLowerCase()
  const allowedOid = env.ALLOWED_USER_OID.trim().toLowerCase()
  const audiences = list(env.ENTRA_API_AUDIENCES)
  const allowedClients = list(env.ALLOWED_CLIENT_IDS || COPILOT_TOKEN_STORE_CLIENT_ID).map((s) => s.toLowerCase())

  const header = request.headers.get('Authorization') || ''
  const match = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(header.trim())
  if (!match) throw new AuthError(401, 'missing_token')

  let payload
  try {
    ;({ payload } = await jwtVerify(match[1], opts.jwks || defaultJwks(tenantId), {
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
      audience: audiences,
      algorithms: ['RS256'],
      clockTolerance: 60,
      requiredClaims: ['exp', 'iat', 'tid', 'oid'],
    }))
  } catch (err) {
    throw new AuthError(401, `invalid_token:${err.code || 'unknown'}`)
  }

  if (String(payload.tid).toLowerCase() !== tenantId) throw new AuthError(403, 'wrong_tenant')
  if (String(payload.oid).toLowerCase() !== allowedOid) throw new AuthError(403, 'wrong_user')

  const scopes = String(payload.scp || '').split(' ')
  if (!scopes.includes(REQUIRED_SCOPE)) throw new AuthError(403, 'missing_scope')

  // v2 tokens name the calling client in `azp`, v1 tokens in `appid`.
  const client = String(payload.azp || payload.appid || '').toLowerCase()
  if (!allowedClients.includes(client)) throw new AuthError(403, 'wrong_client')

  return payload
}
