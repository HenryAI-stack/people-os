# PeopleOS → Microsoft 365 Copilot endpoint

A **read-only**, **single-user** API that lets your Microsoft 365 Copilot (work
account) answer questions from PeopleOS — direct reports, 1:1/interview notes,
follow-ups, accomplishments and notes — via a private declarative agent.

```
Microsoft 365 Copilot (your account only)
   │  Entra ID SSO token (via Microsoft's Enterprise token store)
   ▼
Cloudflare Worker  ── checks token ── wrong user/tenant/app/scope → 401/403, nothing read
   │  read-only fine-grained PAT
   ▼
people-os-data (private repo, AES-encrypted JSON) → decrypt → trimmed JSON back to Copilot
```

Everything deploys from GitHub Actions (`.github/workflows/copilot-endpoint.yml`),
so nothing has to be installed on the work laptop.

## How it's locked to your account

| Layer | What it does |
|---|---|
| Entra enterprise app: **assignment required**, only you assigned | Nobody else in the tenant can even obtain a token for this API |
| Worker: token signature, issuer, audience, expiry | Only genuine, current tokens issued by your tenant for *this* API |
| Worker: `oid` must equal `ALLOWED_USER_OID` | Pinned to your immutable user object ID — not email/UPN, which can be reassigned |
| Worker: `scp` must include `PeopleOS.Read`; calling client must be Microsoft's Enterprise token store | App-only tokens and tokens minted by other tools (Graph Explorer, scripts) are refused |
| Worker: GET only, no CORS, `no-store`, unknown paths 401 before routing | No writes, no browser access, nothing cached, no route discovery |
| Worker: fails closed | Any missing secret → 500 and no data read |
| Separate PAT: `people-os-data`, **Contents: Read-only** | Even a compromised Worker can't modify or delete PeopleOS data |
| Output trimming | Photos, Microsoft To Do IDs and long text (>4000 chars) never leave the Worker |
| Agent package | Uploaded only for you; not published to the org catalog |

`npm test` (25 tests) exercises each rejection path: other user, other tenant,
wrong audience, expired, missing scope, app-only token, other client app, forged
signature, `alg=none`, writes, missing config.

## Before you start

Two tenant settings decide whether this works at all — check them first:

1. **Can you register apps in Entra?** (entra.microsoft.com → App registrations → New registration). If it's greyed out, IT has to create the app registration for you.
2. **Can you upload custom apps/agents?** (Teams → Apps → Manage your apps → *Upload an app*). If there's no *Upload a custom app* option, IT has to allow it for your account.

## Setup

### 1. Entra app registration (in your work tenant)

1. entra.microsoft.com → **App registrations → New registration**
   Name `PeopleOS Copilot API`, *Accounts in this organizational directory only*. Note the **Application (client) ID** and **Directory (tenant) ID**.
2. **Manifest** → set `"requestedAccessTokenVersion": 2` (under `api`) → Save.
3. **Expose an API** → *Add* Application ID URI (accept the default `api://<client-id>`) → **Add a scope** `PeopleOS.Read`, *Admins and users*, enabled.
4. **Expose an API → Add a client application**: `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` (Microsoft Enterprise token store), tick `PeopleOS.Read`.
5. **Authentication → Add a platform → Web**, redirect URI `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect`.
6. **Enterprise applications → PeopleOS Copilot API → Properties → Assignment required? = Yes** → Save. Then **Users and groups → Add** → only yourself.
7. Your **object ID**: Entra → Users → you → *Object ID*.

No client secret is needed.

### 2. Cloudflare (free plan is enough)

1. Create an account, open **Workers & Pages** once so it assigns your `*.workers.dev` subdomain.
2. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template. Note the token and your **Account ID**.

### 3. GitHub secrets & variables (people-os repo → Settings → Secrets and variables → Actions)

Create a new **fine-grained PAT**: repository access *only* `people-os-data`, permission **Contents: Read-only**, nothing else.

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
| `COPILOT_ENTRA_TENANT_ID` | Directory (tenant) ID |
| `COPILOT_ALLOWED_USER_OID` | your object ID |
| `COPILOT_ENTRA_API_AUDIENCES` | the client ID for now (step 5 adds a second value) |
| `COPILOT_GH_READ_TOKEN` | the new read-only PAT |

`VITE_GITHUB_OWNER`, `VITE_GITHUB_REPO`, `VITE_GITHUB_BRANCH` and `VITE_ENCRYPTION_SECRET` already exist and are reused.

Variable (not secret): `COPILOT_ENDPOINT_ENABLED` = `true`.

Run **Actions → Copilot endpoint → Run workflow**. The deploy log shows the URL, e.g. `https://peopleos-copilot.<subdomain>.workers.dev`.

### 4. Teams Developer Portal SSO registration

dev.teams.microsoft.com → **Tools → Microsoft Entra SSO client ID registration → Register client ID**:

- Base URL: `https://peopleos-copilot.<subdomain>.workers.dev/v1` (must match the OpenAPI server URL, including `/v1`)
- Restrict usage by org: **My organization only**
- Restrict usage by app: *Any Teams app* (bind it to the app ID after step 6)
- Client ID: from step 1 · Scope: `api://<client-id>/PeopleOS.Read`

Save. Note the **Microsoft Entra SSO registration ID** and the generated **Application ID URI**.

### 5. Wire the registration back

1. Entra app → **Manifest** → add the generated Application ID URI to `identifierUris` (keep the existing one).
2. GitHub secret `COPILOT_ENTRA_API_AUDIENCES` = `<client-id>,<generated Application ID URI>`.
3. GitHub variables: `COPILOT_ENDPOINT_URL` = the workers.dev URL (no `/v1`), `COPILOT_SSO_REGISTRATION_ID` = the registration ID.
4. Run the workflow again → it redeploys and produces the **peopleos-copilot-agent** artifact (a .zip, kept 1 day).

### 6. Install the agent (just for you)

Teams → **Apps → Manage your apps → Upload an app → Upload a custom app** → pick the zip. Open Microsoft 365 Copilot, select the **PeopleOS** agent and ask something; the first call shows a sign-in/consent prompt. Don't share the agent.

Optionally, in the SSO registration, change *Restrict usage by app* to the app ID from `appPackage/manifest.json`.

### 7. Check the lock

- Open the endpoint URL + `/v1/people` in a browser → **401**.
- Call it with a Graph Explorer token → **403**.
- Cloudflare dashboard → the Worker → **Logs** shows one line per request with the rejection code (`wrong_user`, `wrong_client`, …) — never tokens or data.

## Maintenance

- **Storage format changes**: `src/data.js` re-implements the app's read + decrypt (like the email scripts). Update it if `dataStore.js`/`crypto.js` change.
- **New fields**: output is allow-listed in `shape` in `src/data.js` — a new record field isn't exposed until you add it there (and to `appPackage/openapi.yaml`).
- **PAT expiry**: fine-grained PATs expire; when Copilot starts answering "Could not read PeopleOS data", rotate `COPILOT_GH_READ_TOKEN` and re-run the workflow.
- **Turning it off**: set `COPILOT_ENDPOINT_ENABLED` to `false` and delete the Worker in Cloudflare (or just remove yourself from the enterprise app — no one can then get a token).
- **Public repo**: no IDs are committed; they live in Actions secrets/variables. Security doesn't rely on the URL staying secret.

## Not included (on purpose)

- **Writes** (creating follow-ups, logging a 1:1). Possible later as separate POST routes with a separate `PeopleOS.Write` scope and Copilot's confirmation card — kept out so this first version can't change data.
- **Work schedules** — `schedules.json` is a generated rota; easy to add as another route if you want Copilot to answer "who's in the office on Friday".
