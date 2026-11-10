# PeopleOS AI proxy (Vercel)

A single serverless function, `POST /api/chat`, that forwards PeopleOS's AI calls
(interview tags, takeaways, follow-up topics, executive summary, "AI improve") to
OpenRouter.

**Why:** some networks (the company laptop) block `openrouter.ai`, and calling it
straight from the browser means the OpenRouter key ships inside the app bundle.
With the proxy, the browser only talks to your own address (e.g.
`ai.cloudplay.at`) and the key stays in Vercel.

**Who can use it:** only you. The app sends your Firebase sign-in token; the
proxy checks it against Google's public keys and requires the token's email to
equal `ALLOWED_EMAIL` (the same single-account rule the app uses). Browser
calls are limited to the app's origins (CORS). It also only forwards the fields
PeopleOS uses (`model`, `max_tokens`, `messages`), so it's not a general relay.

`GET /api/chat` (same sign-in check) is a free health ping used by the app's
Settings → 🔌 Connections card: it checks OpenRouter accepts the key (via
OpenRouter's key-info endpoint — no model call) and reports this month's spend.

Code: `lib/handler.js` (all logic), `api/chat.js` (Vercel entry point),
`test/handler.test.js` (`npm test`, no network needed).

---

## Deploy (one-time, ~20 minutes, free Hobby plan)

### 1. Create the Vercel project

1. Sign in at <https://vercel.com> with GitHub (Hobby plan is free).
2. **Add New… → Project → Import** `HenryAI-stack/people-os` (allow the Vercel
   GitHub app access to this repo if asked).
3. **Root Directory:** click *Edit* and choose **`ai-proxy`**. This matters — the
   rest of the repo is the GitHub Pages app and must not be built by Vercel.
4. **Framework Preset:** `Other`. Leave build/output settings empty.
5. **Environment Variables** (add before the first deploy):

   | Name | Value |
   |---|---|
   | `OPENROUTER_API_KEY` | A **new** key from <https://openrouter.ai/keys> (see step 4 — the old one was public in the bundle) |
   | `FIREBASE_PROJECT_ID` | Your Firebase project ID (Firebase console → ⚙ Project settings → *Project ID*, e.g. `people-os-xxxxx`) — same value as the `VITE_FIREBASE_PROJECT_ID` secret |
   | `ALLOWED_EMAIL` | The Google account you sign in to PeopleOS with — same as `VITE_ALLOWED_EMAIL` |
   | `OPENROUTER_MODEL` | *Optional.* Overrides the model the app asks for (handy when a slug is retired — change it here, no app rebuild) |
   | `ALLOWED_ORIGINS` | *Optional.* Comma-separated origins allowed to call it. Default: `https://henryai-stack.github.io, https://cloudplay.at, https://www.cloudplay.at`, plus `localhost:5173/4173` for dev |

6. **Deploy.** Then open `https://<project>.vercel.app/api/chat` in a browser:
   `{"error":{"message":"Missing sign-in token.", …}}` means it's live (it only
   answers signed-in PeopleOS). Try the same URL on
   the company laptop — if it loads there, you can skip the custom domain.

### 2. Give it your own address (recommended)

`*.vercel.app` addresses are often blocked by company filters; a subdomain of
your own domain usually isn't. Your DNS stays where it is.

1. Vercel project → **Settings → Domains → Add** `ai.cloudplay.at`.
2. Vercel shows a **CNAME** record (name `ai`, value like `cname.vercel-dns.com`
   or a project-specific one — use exactly what it shows). Add it at your DNS
   provider for `cloudplay.at`.
3. Wait until Vercel shows the domain as *Valid* (minutes, sometimes up to an
   hour). HTTPS is issued automatically.
4. Check `https://ai.cloudplay.at/api/chat` → "Missing sign-in token." — on the company
   laptop too.

### 3. Point the app at it

1. App repo → **Settings → Secrets and variables → Actions → New repository
   secret**: `VITE_AI_PROXY_URL` = `https://ai.cloudplay.at/api/chat`
   (or the `vercel.app` URL).
2. **Actions → Deploy PeopleOS → Run workflow** (or push to `main`).
3. In the app, run any AI feature (e.g. "✦ AI improve" on Accomplishments).

### 4. Take the key out of the app

Once AI works through the proxy:

1. Delete the `VITE_OPENROUTER_API_KEY` repository secret and redeploy — the key
   is then no longer in the bundle.
2. In OpenRouter, **delete the old key** (it was readable by anyone who opened
   the site's JS) and keep only the new one stored in Vercel.

---

## Troubleshooting

| What the app says | Meaning |
|---|---|
| "Can't reach the AI service (ai.cloudplay.at)…" | The proxy address itself is blocked or wrong — open the URL in that browser to see |
| "Sign-in token is invalid or expired…" | Reload the app; if it persists, `FIREBASE_PROJECT_ID` doesn't match the app's Firebase project |
| "This account may not use the AI proxy." | `ALLOWED_EMAIL` in Vercel doesn't match your sign-in |
| "Origin … is not allowed" | The app runs on an origin missing from `ALLOWED_ORIGINS` |
| "AI proxy is not configured…" | A required Vercel env var is missing — add it, then **Redeploy** (env changes need a redeploy) |
| "OpenRouter rejected the proxy's key…" | `OPENROUTER_API_KEY` in Vercel is wrong or deleted |
| "OpenRouter account is out of credit" | Top up at openrouter.ai |

A Vercel login page instead of JSON means *Deployment Protection* is on for that
URL — use the production domain (Protection only covers preview URLs by
default), or turn it off under Settings → Deployment Protection.

Vercel redeploys on pushes to `main` only when something under `ai-proxy/`
changed (`ignoreCommand` in `vercel.json`).
