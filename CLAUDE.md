# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**PeopleOS** — a lightweight, single-user "People Leader" hub for tracking direct reports,
1:1s/interview notes, follow-ups, a monthly accomplishments log, and a work-schedule/holiday
calculator. It has no backend server and no database: it's a static React SPA that
authenticates one allow-listed Google account and reads/writes its own data straight to a
private GitHub repo via the GitHub Contents API, encrypting every record client-side first.

It's the second app in this pattern (the first is `recruit-os`) and shares the same
architecture: Firebase Auth for identity only, GitHub-repo-as-database, GitHub Pages for
hosting, GitHub Actions for CI/CD. One GitHub Actions cron job also emails a monthly
accomplishments summary (server-side, via Resend).

## Stack

- React 18 + Vite 5, `@vitejs/plugin-react`
- `react-router-dom` v6, mounted with `HashRouter` in `src/main.jsx` (required — GitHub Pages
  has no server-side routing)
- `firebase` v10 — **Authentication only**, not used for data storage
- `crypto-js` — AES-256 encryption of every record before it leaves the browser (passphrase
  mode: `CryptoJS.AES.encrypt(json, secret)`)
- `date-fns`
- No CSS framework — plain `src/styles.css` with CSS custom properties for theming
- No test runner and no linter are configured in this repo
- One Node script under `scripts/` (`send-accomplishments-email.mjs`) runs in CI only, not
  bundled into the app; it depends on `crypto-js` and Node 22's global `fetch`

## Architecture

```
Browser (React SPA)
   ├── Google Login  → Firebase Authentication (identity check only)
   ├── Read/write    → GitHub Contents API → private data repo (AES-256-encrypted JSON)
   ├── AI features   → OpenRouter (OpenAI-compatible), called directly from the browser
   ├── Outlook sync  → Microsoft Graph API, called directly from the browser
   ├── "Send email now" → dispatches a GitHub Actions workflow (no mail key in the bundle)
   └── Deploy        → GitHub Actions → GitHub Pages
```

- **Auth**: `src/lib/auth.js` wraps Firebase `signInWithPopup` and hard-checks
  `result.user.email` against `VITE_ALLOWED_EMAIL`, signing the user back out and throwing
  `ACCESS_DENIED` if it doesn't match. This is a single-user app by design — one hardcoded
  allowed email, not a domain allowlist.
- **Data**: `src/lib/dataStore.js` is the entire persistence layer. `makeStore(filename)`
  builds a tiny CRUD wrapper (`list` / `upsert` / `remove`) around one JSON file in the data
  repo (e.g. `direct-reports.json`). `upsert`/`remove` re-fetch the file's current SHA first
  (`readCollection(filename, true)`) to avoid 409 conflicts; there's a 60s in-memory read
  cache (`_cache` / `CACHE_TTL`) keyed by filename that writes update in place. Records get
  `id` (`crypto.randomUUID()`), `createdAt`, `updatedAt` stamped automatically.
- **Encryption**: `src/lib/crypto.js` — `encrypt`/`decrypt` via `CryptoJS.AES` using
  `VITE_ENCRYPTION_SECRET` as the passphrase. **This secret must never change once real data
  exists** — there's no migration path, old data just becomes unreadable. `decrypt` swallows
  failures and returns `null`.
- **AI features**: `src/lib/ai.js` is the one place the app talks to an LLM — a `chat(prompt,
  {maxTokens})` helper that POSTs to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`,
  OpenAI-compatible) with `VITE_OPENROUTER_API_KEY`. Model is the `MODEL` constant in that file
  (`openai/gpt-4o-mini` — a real paid slug; the account needs credit, and the old
  `openrouter/free` slug + free-tier caps were why AI calls used to fail constantly).
  `src/lib/autoTags.js` builds on it for auto interview tags, key takeaways, and
  follow-up-topic suggestions (used from `Interviews.jsx` and `PersonDetail.jsx`);
  `PersonDetail.jsx`'s `generateAISummary` calls `chat` directly for the executive summary.
  All best-effort with try/catch and user-facing error strings; the takeaway/topic parsers
  still strip any "thinking" preamble a model may emit. Swapping provider (Azure AI Foundry,
  a proxy, …) is a change to `ai.js` alone. (Note: GitHub Models was retired 2026-07-30 —
  don't reach for it.)
- **Outlook / Microsoft To Do sync**: `src/lib/msGraph.js` — one-way push of a follow-up to
  a "PeopleOS Follow-ups" task list via Microsoft Graph, using a short-lived
  `VITE_MS_GRAPH_TOKEN` (manually pasted from Graph Explorer, expires ~1h). Called from
  `FollowUps.jsx`; stores the returned task id back on the record as `msTaskId`.
- **Monthly accomplishments email**: `.github/workflows/accomplishments-email.yml` runs
  `scripts/send-accomplishments-email.mjs` every Thursday 07:00 UTC; the script only actually
  sends on the **last Thursday of the month** (Europe/Vienna), reading `accomplishments.json`
  from the data repo, decrypting with the same AES secret, and sending via the Resend API.
  `src/lib/githubActions.js` lets the "Send this month's email" button in `Accomplishments.jsx`
  trigger that same workflow on demand (`workflow_dispatch` with `force: true`), so the
  Resend key never ships in the browser bundle.
- **Work-schedule generator**: `src/lib/scheduleGenerator.js` builds a monthly homeoffice/
  office rota for three support centers (`CENTERS`: Warsaw, Bangalore, Mexico City), matching
  people to a center by free-text `location`. Holiday awareness and month/weekend helpers
  come from `src/lib/holidays.js` (`getHoliday`, `isWeekend`, `getDaysInMonth`; hardcoded
  PL/IN/MX holiday tables for 2024–2027). Key rota rules, encoded in `generateSchedule`:
  weekdays need ≥2 people, weekends/holidays exactly 1, working a Sunday or holiday blocks
  that person the next calendar day (hard rule — a day is left short-staffed rather than
  broken), ~20–21 working days per person, weekend burden balanced across months via a
  `fairnessSnapshot` persisted on the schedule record.

## Directory layout

```
src/
  main.jsx            HashRouter + StrictMode entry point
  App.jsx             Auth gate, sidebar/nav shell, route table, theme + collapse prefs
                       (localStorage: peopleos-theme-light, peopleos-sidebar-collapsed),
                       plus an inline World Clock component
  lib/
    auth.js            Firebase Auth wrapper — used by App.jsx (VITE_ALLOWED_EMAIL)
    dataStore.js       GitHub-repo-as-database CRUD layer, one store per collection
    crypto.js          AES encrypt/decrypt helpers
    ai.js              chat() helper — the only LLM call site (OpenRouter)
    autoTags.js        Prompts on top of ai.js: tags / takeaways / follow-up topics
    msGraph.js         Microsoft Graph push of follow-ups to Microsoft To Do
    githubActions.js   Fires the accomplishments-email workflow via workflow_dispatch
    scheduleGenerator.js  CENTERS + generateSchedule() rota builder for WorkSchedule
    holidays.js        Hardcoded PL/IN/MX holiday tables + date helpers used by the generator
    locationFlag.js    Free-text location → ISO country code (getCountryCode) → flag image URL
    imageUtils.js      Client-side avatar photo resizing before storing as base64
  pages/
    Dashboard.jsx      Team stats, upcoming anniversaries, recent activity
    DirectReports.jsx  Team roster CRUD, grouped by team; also exports `Avatar`, `ReportForm`
    PersonDetail.jsx   Per-person profile + interview history + AI follow-up topics
    Interviews.jsx     1:1 / skip-level / hiring / exit / performance / team-meeting log
    FollowUps.jsx      Action-item tracker, optional person link, optional Outlook sync;
                        exports `urgencyLabel`
    Notes.jsx          Freeform scratchpad
    Accomplishments.jsx  Monthly wins log, per person or per team; "send this month's email"
    WorkSchedule.jsx   Monthly office/homeoffice rota with country holiday awareness
  components/
    DraggableModal.jsx  Shared draggable modal shell used by every "add/edit" form
scripts/
  send-accomplishments-email.mjs   CI-only Node script; re-implements dataStore's read+decrypt
.github/workflows/
  deploy.yml               Build + deploy to GitHub Pages on push to main
  accomplishments-email.yml Thursday cron + manual dispatch for the monthly email
```

Data collections (each a JSON file in the **separate, private** data repo — default name
`people-os-data` — encrypted at rest): `direct-reports.json`, `interviews.json`, `notes.json`,
`follow-ups.json`, `schedules.json`, `accomplishments.json`.

## Conventions to follow when editing

- **Page components own their data fetching.** Each `src/pages/*.jsx` calls the relevant
  store(s) directly in a `useEffect`/`load()` pattern — there's no global state manager
  (no Redux/Zustand/Context for data). Follow that pattern for new pages rather than
  introducing one.
- **Forms use `DraggableModal`.** Add/edit forms across the app render inside
  `<DraggableModal title=... onClose=...>`; reuse it rather than building a new modal shell.
- **Cross-page exports are normal here.** `DirectReports.jsx` exports `Avatar` and
  `ReportForm`; `FollowUps.jsx` exports `urgencyLabel`. `Dashboard.jsx`, `PersonDetail.jsx`,
  and `WorkSchedule.jsx` import these directly. It's a small app — don't over-abstract this
  into a shared `components/` file unless asked.
- **New persisted collections** go through `makeStore()` in `dataStore.js` and get a `.json`
  filename. Export a `<name>Store` alongside the existing ones.
- **`base: '/people-os/'` in `vite.config.js`** must keep matching the GitHub Pages repo
  name — don't change one without the other. `githubActions.js`'s `APP_OWNER`/`APP_REPO`
  constants (and, cosmetically, `ai.js`'s `APP_URL`) are also hardcoded to
  `HenryAI-stack/people-os`; update them together if the repo moves.
- Styling is hand-rolled CSS variables (`var(--accent)`, `var(--bad)`, `var(--border)`,
  `var(--text-dim)`, `var(--text-faint)`, …) in `src/styles.css` — match the existing look
  rather than adding a UI library. Dark is the default; `body.light` is the light theme.

## Known quirks worth knowing

- **Auth is a single allowed email, not a domain.** `auth.js` checks `result.user.email`
  against `VITE_ALLOWED_EMAIL` exactly; there is no domain-allowlist mode. `deploy.yml`,
  `.env.example`, and `INSTALLATION.md` all agree on this. (An older `VITE_ALLOWED_DOMAIN`
  is fully gone — don't reintroduce it.)
- `scripts/send-accomplishments-email.mjs` re-implements `dataStore.js`'s GitHub read +
  base64 + AES-decrypt by hand (it can't import browser code that uses `import.meta.env`).
  If you change the storage format, encryption, or file layout in `dataStore.js`/`crypto.js`,
  update this script to match.
- Anniversary-date math is duplicated (`nextAnniversary` in `Dashboard.jsx` vs.
  `getNextAnniversary` in `PersonDetail.jsx`) with slightly different return shapes. If you
  touch one, check whether the other needs the same fix.
- `msGraph.js` and `githubActions.js` both rely on tokens shipped in the client bundle that
  are either short-lived (`VITE_MS_GRAPH_TOKEN`, ~1h) or narrowly scoped
  (`VITE_GH_ACTIONS_TOKEN` — "Actions: write" on this repo only). Both features degrade to a
  clear error string when the token is absent or expired; that's intended.

## Environment variables

Local dev: `cp .env.example .env` and fill in. `.env.example` lists all 12 build vars and is
kept in sync with `import.meta.env.*` usage in `src/` and with `deploy.yml` (verified — no
gaps in any direction). Production: the same names are stored as GitHub Actions repository
secrets and injected at build time. `deploy.yml` is the definitive list of what the app build
consumes; `accomplishments-email.yml` lists what the email job consumes (that job's
`RESEND_API_KEY` and `ACCOMPLISHMENTS_EMAIL_TO` are server-side only and not in
`.env.example`).

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | app build | Firebase project config (auth only) |
| `VITE_ALLOWED_EMAIL` | app build (`auth.js`) | The single Google account allowed to log in |
| `VITE_GITHUB_OWNER`, `VITE_GITHUB_REPO`, `VITE_GITHUB_TOKEN`, `VITE_GITHUB_BRANCH` | app build + email job | Data-repo access — the PAT is bundled client-side, scope it narrowly |
| `VITE_ENCRYPTION_SECRET` | app build + email job | AES passphrase for all records — never rotate once real data exists |
| `VITE_OPENROUTER_API_KEY` | app build (`ai.js`) | OpenRouter key — powers all AI features (tags, takeaways, follow-up topics, exec summary); account needs credit |
| `VITE_MS_GRAPH_TOKEN` | app build (`msGraph.js`) | Short-lived Graph token for Outlook / Microsoft To Do sync; expires ~1h |
| `VITE_GH_ACTIONS_TOKEN` | app build (`githubActions.js`) | Fine-grained PAT, "Actions: write" on this repo only, for the manual "send email now" button |
| `RESEND_API_KEY` | email job only | Server-side Resend API key for the monthly email |
| `ACCOMPLISHMENTS_EMAIL_TO` | email job (workflow env) | Recipient of the monthly summary (currently hardcoded in the workflow) |

**Security note**: the data-repo PAT, encryption secret, OpenRouter key, Graph token, and
Actions token all ship inside the client-side JS bundle. That's an accepted, documented
tradeoff for this single-user tool (see `INSTALLATION.md`) — don't "fix" it by moving secrets
around without understanding the intended threat model first. The one key kept server-side is
`RESEND_API_KEY`, which is why the email send goes through a GitHub Actions workflow rather
than the browser.

## Commands

```bash
npm install
npm run dev       # vite dev server
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

There is no `npm test` or `npm run lint` script — don't assume either exists when writing
CI steps or pre-commit instructions.

To exercise the monthly email script locally, set the env vars from the table above
(`VITE_GITHUB_*`, `VITE_ENCRYPTION_SECRET`, `RESEND_API_KEY`) plus `FORCE_SEND=true`
(optionally `FORCE_MONTH=YYYY-MM`) and run `node scripts/send-accomplishments-email.mjs`.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` builds with Node 22, injects the secrets
above, and deploys `dist/` to GitHub Pages via `actions/deploy-pages`. There's no staging
environment or preview-deploy step — `main` is production. The `accomplishments-email.yml`
workflow is independent: a Thursday cron plus manual `workflow_dispatch` (also fired from the
app via `githubActions.js`).
