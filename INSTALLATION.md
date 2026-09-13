# PeopleOS – Installation Guide

This app runs entirely on GitHub, with no separate server or database.
All personal data is **AES-256 encrypted** before it's ever written to disk.

---

## Architecture overview

```
Browser (React app)
   │
   ├── Google Login   →  Firebase Authentication (identity only, free)
   │
   └── Read/write data →  GitHub API  →  Private repo (AES-256 encrypted JSON files)
```

---

## Prerequisites

- A **GitHub account** (free)
- A **Google account** (for Firebase)
- **Node.js** 20+ → https://nodejs.org (CI builds on Node 22)
- **Git** → https://git-scm.com

---

## Step 1 — Create two GitHub repositories

You need **two** repos:

### 1a. App repository (public)
This holds the code. GitHub Pages deploys the site from here.

1. Go to https://github.com/new
2. Name: `people-os` (or whatever you like — just match it in `vite.config.js`)
3. Visibility: **Public** (GitHub Pages is free for public repos)
4. Click **Create repository**, then push this code to it (Step 6 below)

### 1b. Data repository (must be private!)
This holds your encrypted team data. **Nobody but you should have access.**

1. Go to https://github.com/new again
2. Name: `people-os-data`
3. Visibility: **Private** ← important!
4. Check "Add a README file" so the repo isn't empty
5. Click **Create repository**

---

## Step 2 — Create a Firebase project (Google Login)

1. Go to https://console.firebase.google.com
2. **Add project** → name it `people-os` → continue
3. Disable Google Analytics if you don't want it → **Create project**

### Enable Authentication
1. Left menu → **Build → Authentication**
2. **Get started**
3. **Sign-in method** tab → **Google** → enable it
4. Enter your email as the project support email → **Save**

### Add your authorized domain (after first deploy)
1. Authentication → **Settings** → **Authorized domains**
2. **Add domain** → enter `YOUR-USERNAME.github.io`

### Grab your Firebase config
1. Gear icon (top left) → **Project settings**
2. Scroll to "Your apps" → click **`</>`** (Web app)
3. Name it anything → **Register app**
4. Copy the values shown:
   ```
   apiKey:     AIza...
   authDomain: people-os-xxxxx.firebaseapp.com
   projectId:  people-os-xxxxx
   ```

---

## Step 3 — Create a GitHub Personal Access Token

This token lets the app write to your private data repo.

1. Go to https://github.com/settings/tokens/new
2. **Note:** `PeopleOS Data Access`
3. **Expiration:** 90 days (or longer, your call)
4. **Scopes:** check only **`repo`**
5. **Generate token** → copy it immediately (shown only once)

> ⚠️ **Important limitation to understand:** this token is bundled into the
> app's client-side JavaScript so the browser can call the GitHub API directly.
> That means anyone with your deployed app's URL *and* dev tools open could
> in theory extract this token from the bundle. Mitigate this by:
> - Setting `VITE_ALLOWED_EMAIL` so only your own Google account can log in
> - Scoping the PAT to **only** the `people-os-data` repo if you use a
>   fine-grained token (Settings → Developer settings → Fine-grained tokens)
> - Rotating the token regularly and immediately if you suspect exposure
> - Keeping the app repo itself private too, if you want an extra layer (note: GitHub Pages on private repos requires GitHub Pro/Team/Enterprise)

---

## Step 4 — Choose your encryption secret

This is the master password for AES-256 encryption of all team data.

- Generate a long, random password, e.g. via https://1password.com/password-generator/
- **32+ characters recommended**
- **Write it down somewhere safe** — without it, your data is permanently unreadable

Example: `mX7#kP9$qR2@wN5!vB8^jL3&hD6*cA1`

---

## Step 5 — Configure GitHub Secrets

These get injected as environment variables on every build (see
`.github/workflows/deploy.yml`).

1. Go to your **app repository** → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each of the following:

| Secret name                 | Example value                      | Where it comes from   |
| ---------------------------- | ----------------------------------- | ---------------------- |
| `VITE_FIREBASE_API_KEY`      | `AIzaSyB...`                        | Firebase console       |
| `VITE_FIREBASE_AUTH_DOMAIN`  | `people-os-xxxxx.firebaseapp.com`   | Firebase console       |
| `VITE_FIREBASE_PROJECT_ID`   | `people-os-xxxxx`                   | Firebase console       |
| `VITE_GITHUB_OWNER`          | `your-github-username`              | Your GitHub profile    |
| `VITE_GITHUB_REPO`           | `people-os-data`                    | Name of the data repo  |
| `VITE_GITHUB_TOKEN`          | `ghp_xxxxxxxxxxxx`                  | Step 3                 |
| `VITE_GITHUB_BRANCH`         | `main`                              | Branch in the data repo (usually `main`) |
| `VITE_ENCRYPTION_SECRET`     | `mX7#kP9$qR2@wN5!...`               | Step 4                 |
| `VITE_ALLOWED_EMAIL`         | `you@example.com`                   | The only Google account allowed to log in |

**Optional** — leave unset to disable the feature it powers (the build still succeeds):

| Secret name                 | Example value                      | Powers                |
| ---------------------------- | ----------------------------------- | --------------------- |
| `VITE_OPENROUTER_API_KEY`   | `sk-or-v1-...`                      | AI interview tags, takeaways, follow-up topics, and executive summaries, via [OpenRouter](https://openrouter.ai/keys). Put ≥ $10 of credit on the account — the free tier is capped at ~50 requests/day |
| `VITE_OPENROUTER_MODEL`     | `google/gemini-2.5-flash`          | Optional. Overrides the default model in `src/lib/ai.js` — set it if that slug gets retired (error: "No endpoints found"). Current [model list](https://openrouter.ai/models) |
| `VITE_MS_GRAPH_TOKEN`       | `eyJ0eXAi...`                      | Build-time fallback for Outlook / Microsoft To Do sync. Easier in practice: paste the token straight into the app's **Settings** page instead (saved to `localStorage`, no rebuild needed) — same short-lived (~1h) token from [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) → sign in → avatar → **Access token** |
| `VITE_GH_ACTIONS_TOKEN`     | `github_pat_...`                   | The "Send this month's email" button — see the Monthly accomplishments email section below |

> The monthly accomplishments email also needs `RESEND_API_KEY` (and reuses
> `VITE_GITHUB_*` + `VITE_ENCRYPTION_SECRET`). It's a separate workflow with its
> own setup — see **Optional — Monthly accomplishments email** below.

---

## Step 6 — Push the code

```bash
cd people-os
git init
git add .
git commit -m "Initial commit: PeopleOS"
git remote add origin https://github.com/YOUR-USERNAME/people-os.git
git branch -M main
git push -u origin main
```

---

## Step 7 — Enable GitHub Pages

1. App repo → **Settings** → **Pages**
2. **Source:** `GitHub Actions`

That's all — `.github/workflows/deploy.yml` builds the site and publishes it
straight to Pages (there is no `gh-pages` branch). The first deploy kicks off
automatically once you push. Watch progress under **your repo → Actions**.

---

## Step 8 — Update the hardcoded repo name

This repo hardcodes the upstream name `HenryAI-stack/people-os` in a few
places. If you forked/renamed (i.e. your app repo is **not** literally
`people-os` owned by `HenryAI-stack`), update all of them:

| File | What to change |
| ---- | -------------- |
| `vite.config.js` | `base: '/people-os/'` → `'/YOUR-REPO/'` (must match the repo name exactly, with leading and trailing slash) |
| `src/lib/githubActions.js` | `APP_OWNER` / `APP_REPO` constants — these tell the "Send this month's email" button which repo's workflow to dispatch |
| `src/lib/ai.js` | `APP_URL` — cosmetic, just the label shown on OpenRouter's app-rankings dashboard |

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: '/YOUR-REPO/',   // ← match your actual repo name
})
```

Then commit and push:
```bash
git add vite.config.js src/lib/githubActions.js src/lib/ai.js
git commit -m "chore: point config at my fork"
git push
```

---

## Step 9 — Done! Open the app

After ~2 minutes, the app is live at:
```
https://YOUR-USERNAME.github.io/people-os/
```

---

## Troubleshooting

| Problem                                  | Fix                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Login error "auth/unauthorized-domain"     | Firebase → Authentication → Settings → add `YOUR-USERNAME.github.io`        |
| Page shows 404                             | Check `base` in `vite.config.js` matches the repo name                      |
| Data isn't saving                          | Check GitHub token scope (`repo`) and that it hasn't expired                |
| Data unreadable after rotating the token   | That's fine — the token doesn't affect decryption, only write access        |
| Data unreadable after changing the secret  | The encryption secret must **never** change — otherwise old data is lost    |
| Actions workflow fails                     | Repo → Actions → read the log; confirm all required secrets from Step 5 are set correctly |

---

## Security notes

- The **data repo** (`people-os-data`) must always stay **private**
- Never commit the **encryption secret** to code — GitHub Secrets only
- Rotate the GitHub token regularly (every 90 days recommended)
- This data includes real employees' personal and performance information —
  treat it with the same care as any HR system, and check your company's
  data-handling policies before using this for real records
- If a leader leaves the team or company, revoke their token immediately at
  https://github.com/settings/tokens and rotate the encryption secret if
  the data needs to be re-secured

---

## Optional — Monthly accomplishments email

The **Accomplishments** tab lets you log wins per month, assigned to a
person or a team. A scheduled GitHub Actions workflow
(`.github/workflows/accomplishments-email.yml`) checks every Thursday
whether it's the **last working Thursday of the month** (Europe/Vienna) and,
if so, emails you a summary of everything logged that month. It reuses the
same GitHub token and encryption secret the app already uses to read the
data, so the only new thing to set up is the email send.

1. **Create a free [Resend](https://resend.com) account** and generate an
   API key (Dashboard → API Keys → Create API Key).
2. **Add the key as a repo secret**: Settings → Secrets and variables →
   Actions → New repository secret → name it `RESEND_API_KEY`.
3. That's it for a quick start — Resend's shared `onboarding@resend.dev`
   sender works out of the box **as long as the recipient is the email
   address you signed up to Resend with** (`maximilian.bielecki@ul.com`).
   If you ever want to send from your own address instead, verify a domain
   in Resend and set an `ACCOMPLISHMENTS_EMAIL_FROM` secret/env
   (e.g. `PeopleOS <accomplishments@yourdomain.com>`) in the workflow.
4. To change who receives the email, edit the `ACCOMPLISHMENTS_EMAIL_TO`
   line directly in the workflow file.

**Testing it:** Repo → Actions → "Accomplishments Email" → **Run workflow**.
The manual trigger defaults to `force: true`, so it sends immediately for
the current month regardless of what day it is — handy for checking the
email looks right before waiting for the real schedule. You can also pass a
specific `month` (e.g. `2026-08`) to preview a past month.

### Sending it on demand, from inside the app

The Accomplishments page has a **"Send this month's email"** button that
fires the same workflow for whatever month you're viewing, without going
to GitHub. It calls GitHub's Actions API — never Resend directly — so your
`RESEND_API_KEY` never leaves the server side.

This needs one more secret:

1. Go to https://github.com/settings/personal-access-tokens/new
2. **Repository access** → Only select repositories → `people-os`
3. **Permissions** → Repository permissions → **Actions** → set to
   **Read and write**. Leave everything else as "No access".
4. Generate, copy the token, and add it as a repo secret named
   `VITE_GH_ACTIONS_TOKEN` (same place as the others — Settings → Secrets
   and variables → Actions).

This token is bundled into the app's client-side JavaScript, same
limitation as `VITE_GITHUB_TOKEN` (see Step 3 above) — but it can only
start a run of a single workflow on a repo that's already public, nothing
more. If you'd rather not add it, the button just shows an error telling
you it's not configured; the scheduled Thursday send is unaffected either way.

---

## Shipping updates

```bash
git add .
git commit -m "describe your change"
git push
# → GitHub Actions builds and deploys automatically
```
