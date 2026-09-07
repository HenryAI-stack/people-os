# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this is

**PeopleOS** — a lightweight, single-user "People Leader" hub for tracking direct reports,
1:1s/interview notes, follow-ups, and a work-schedule/holiday calculator. It has no backend
server and no database: it's a static React SPA that authenticates one allow-listed Google
account and reads/writes its own data straight to a private GitHub repo via the GitHub
Contents API, encrypting every record client-side first.

It's the second app in this pattern (the first is `recruit-os`) and shares the same
architecture: Firebase Auth for identity only, GitHub-repo-as-database, GitHub Pages for
hosting, GitHub Actions for CI/CD.

## Stack

- React 18 + Vite 5, `@vitejs/plugin-react`
- `react-router-dom` v6, mounted with `HashRouter` (required — GitHub Pages has no
  server-side routing)
- `firebase` v10 — **Authentication only**, not used for data storage
- `crypto-js` — AES-256 encryption of every record before it leaves the browser
- `date-fns`
- No CSS framework — plain `src/styles.css` with CSS custom properties for theming
- No test runner and no linter are configured in this repo yet

## Architecture

```
Browser (React SPA)
   ├── Google Login  → Firebase Authentication (identity check only)
   ├── Read/write    → GitHub Contents API → private data repo (AES-256 encrypted JSON)
   └── Deploy        → GitHub Actions → GitHub Pages
```

- **Auth**: `src/lib/auth.js` wraps Firebase `signInWithPopup` and hard-checks
  `result.user.email` against `VITE_ALLOWED_EMAIL`, signing the user back out and throwing
  `ACCESS_DENIED` if it doesn't match. This is a single-user app by design — one hardcoded
  allowed email, not a domain allowlist.
- **Data**: `src/lib/dataStore.js` is the entire persistence layer. `makeStore(filename)`
  builds a tiny CRUD wrapper (`list` / `upsert` / `remove`) around one JSON file in the data
  repo (e.g. `direct-reports.json`). Every write re-fetches the file's current SHA first
  (`forceRefresh`) to avoid 409 conflicts, and there's a 60s in-memory read cache
  (`_cache`/`CACHE_TTL`) keyed by filename.
- **Encryption**: `src/lib/crypto.js` — `encrypt`/`decrypt` via `CryptoJS.AES` using
  `VITE_ENCRYPTION_SECRET` as the passphrase. **This secret must never change once real data
  exists** — there's no migration path, old data just becomes unreadable.
- **AI features**: `src/lib/autoTags.js` and inline calls in `src/pages/PersonDetail.jsx`
  hit OpenRouter (`openrouter/free` model) directly from the browser using
  `VITE_OPENROUTER_API_KEY`, for auto-generated interview tags, takeaways, follow-up-topic
  suggestions, and AI executive summaries. All of it is best-effort with try/catch and
  user-facing error strings — no server-side proxy.

## Directory layout

```
src/
  main.jsx           HashRouter + StrictMode entry point
  App.jsx             Auth gate, sidebar/nav shell, route table, theme + collapse prefs
  lib/
    auth.js           Firebase Auth wrapper — ACTIVE, used by App.jsx
    firebase.js       A second, unused Firebase Auth wrapper (redirect-based, domain
                       allowlist via VITE_ALLOWED_DOMAIN) — see "Known quirks" below
    dataStore.js       GitHub-repo-as-database CRUD layer, one store per collection
    crypto.js          AES encrypt/decrypt helpers
    autoTags.js        OpenRouter calls for tags / takeaways / follow-up topics
    holidays.js        Hardcoded public-holiday tables (PL, IN, MX) for WorkSchedule
    locationFlag.js     Free-text location string → ISO country code → flag emoji/image
    imageUtils.js       Client-side avatar photo resizing before storing as base64
  pages/
    Dashboard.jsx       Team stats, upcoming anniversaries, recent activity
    DirectReports.jsx   Team roster CRUD, grouped by team; also exports `Avatar`, `ReportForm`
    PersonDetail.jsx    Per-person profile + interview history + AI exec summary
    Interviews.jsx      1:1 / skip-level / hiring / exit / performance / team-meeting log
    FollowUps.jsx       Action-item tracker, optionally linked to a person; exports `urgencyLabel`
    Notes.jsx           Freeform scratchpad
    WorkSchedule.jsx    Homeoffice/office day calculator with country holiday awareness
  components/
    DraggableModal.jsx  Shared draggable modal shell used by every "add/edit" form
.github/workflows/deploy.yml   Build + deploy to GitHub Pages on push to main
```

Data collections (each a JSON file in the **separate, private** `people-os-data` repo,
encrypted at rest): `direct-reports.json`, `interviews.json`, `notes.json`,
`follow-ups.json`, `schedules.json`.

## Conventions to follow when editing

- **Page components own their data fetching.** Each `src/pages/*.jsx` calls the relevant
  store(s) directly in a `useEffect`/`load()` pattern — there's no global state manager
  (no Redux/Zustand/Context for data). Follow that pattern for new pages rather than
  introducing one.
- **Forms use `DraggableModal`.** Add/edit forms across the app render inside
  `<DraggableModal title=... onClose=...>`; reuse it rather than building a new modal shell.
- **Cross-page exports are normal here.** `DirectReports.jsx` exports `Avatar` and
  `ReportForm`; `FollowUps.jsx` exports `urgencyLabel`. Other pages import these directly.
  It's a small app — don't over-abstract this into a shared `components/` file unless asked.
- **New persisted collections** go through `makeStore()` in `dataStore.js`, get a `.json`
  filename, and should be added to `.gitignore`-style secrets/docs if they need new env vars.
- **`base: '/people-os/'` in `vite.config.js`** must keep matching the GitHub Pages repo
  name — don't change one without the other.
- Styling is hand-rolled CSS variables (`var(--accent)`, `var(--bad)`, `var(--border)`,
  etc.) — match the existing look rather than adding a UI library.

## Known quirks worth knowing before touching auth

- `src/lib/firebase.js` looks like an earlier or parallel auth implementation
  (redirect-based sign-in, `VITE_ALLOWED_DOMAIN` domain check) but nothing in `src/`
  currently imports from it — `App.jsx` uses `src/lib/auth.js` exclusively. Treat
  `firebase.js` as dead code; confirm with the user before deleting it or before assuming
  `VITE_ALLOWED_DOMAIN` does anything at runtime (it currently doesn't — only
  `VITE_ALLOWED_EMAIL` is wired up).
- Anniversary-date math is duplicated (`nextAnniversary` in `Dashboard.jsx` vs.
  `getNextAnniversary` in `PersonDetail.jsx`) with slightly different return shapes. If you
  touch one, check whether the other needs the same fix.

## Environment variables

Local dev: `cp .env.example .env` and fill in. Production: the same names are stored as
GitHub Actions repository secrets and injected at build time (see `deploy.yml`).

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Firebase project config (auth only) |
| `VITE_ALLOWED_EMAIL` | The single Google account allowed to log in |
| `VITE_GITHUB_OWNER`, `VITE_GITHUB_REPO` (`people-os-data`), `VITE_GITHUB_TOKEN`, `VITE_GITHUB_BRANCH` | Data-repo access — the PAT is bundled client-side, scope it narrowly |
| `VITE_ENCRYPTION_SECRET` | AES-256 passphrase for all records — never rotate once real data exists |
| `VITE_OPENROUTER_API_KEY` | Powers the AI tag/takeaway/summary features |
| `VITE_MS_GRAPH_TOKEN` | Present in the deploy workflow's secrets list but not currently referenced anywhere in `src/` — check before relying on it |

**Security note**: the GitHub PAT and encryption secret both ship inside the client-side JS
bundle. That's an accepted, documented tradeoff for this single-user tool (see
`INSTALLATION.md`), not an oversight — don't "fix" it by moving secrets around without
understanding the intended threat model first.

## Commands

```bash
npm install
npm run dev       # vite dev server
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

There is no `npm test` or `npm run lint` script — don't assume either exists when writing
CI steps or pre-commit instructions.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` builds with Node 22, injects the secrets
above, and deploys `dist/` to GitHub Pages via `actions/deploy-pages`. There's no staging
environment or preview-deploy step — `main` is production.
