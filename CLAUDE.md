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
- `exceljs` — builds the Work Schedule's `.xlsx` export; dynamically imported (own chunk),
  never in the main bundle
- `pdfkit` — builds the Work Schedule email's `.pdf` attachment; only ever imported from
  `scripts/send-schedule-email.mjs` (a CI-only script), so despite being a normal
  `dependencies` entry it never reaches the browser bundle at all
- No CSS framework — plain `src/styles.css` with CSS custom properties for theming
- Installable **PWA** (manifest + hand-rolled service worker, no `vite-plugin-pwa`/workbox) with
  a phone layout at ≤760px — see "PWA / mobile" under Architecture
- No test runner and no linter are configured in this repo
- Two Node scripts under `scripts/` (`send-accomplishments-email.mjs`,
  `send-schedule-email.mjs`) run in CI only, not bundled into the app; they depend on
  `crypto-js`/`exceljs`/`pdfkit` and Node 22's global `fetch`

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
  allowed email, not a domain allowlist. For the installed PWA, `loginWithGoogle` falls back to
  `signInWithRedirect` when the popup is unsupported (`POPUP_UNSUPPORTED` codes such as
  `auth/popup-blocked`); `completeRedirectLogin()` (called once from `App.jsx` on mount) finishes
  that flow with the same email check, and `onAuth` itself also drops/signs out any non-allowed
  user, so the check holds whichever path produced the session. Popup stays the default — the
  redirect flow is unreliable on iOS Safari (third-party-storage partitioning between
  github.io and the Firebase `authDomain`), so don't flip the default to redirect.
- **PWA / mobile**: installable from the phone's browser. `public/manifest.webmanifest` (all
  paths relative, deliberately no `id`, so nothing in it depends on the repo name) + icons in
  `public/icons/` (`icon.svg` is the source; the PNGs were rendered from it once) + iOS meta tags
  in `index.html` (`viewport-fit=cover`, `apple-mobile-web-app-capable`/`-title`, deliberately
  no status-bar style — see below, `%BASE_URL%` hrefs).
  The service worker is **generated at build time**: the `serviceWorker()` plugin in
  `vite.config.js` reads `src/sw-template.js`, injects this build's JS/CSS file list (minus the
  lazily-loaded exceljs chunk, which is runtime-cached on first use) plus `./`, the manifest and
  icons, versions the cache with a hash of that list + the built `index.html`, and emits
  `dist/sw.js`. It only handles same-origin GETs inside the scope: navigations get the cached
  shell (cache-first → instant, offline-capable launch), other assets cache-first. **Data is
  never cached** — GitHub API/Firebase/OpenRouter/Graph are cross-origin and pass straight
  through, so offline the app opens but shows an offline banner and data errors. Updates: a new
  deploy installs as a *waiting* worker (no auto `skipWaiting`), `src/lib/pwa.js` raises
  `updateReady`, and `App.jsx`'s `AppBanners` shows "new version available — Reload", which
  posts `SKIP_WAITING` and reloads on `controllerchange`; `pwa.js` also calls `reg.update()`
  whenever the app is foregrounded. The SW is registered only in production builds (`npm run
  dev` never registers it). `pwa.js` also captures `beforeinstallprompt` for the Settings page's
  "Install on your phone" card (`InstallCard`), which falls back to iOS/Android instructions.
  Phone layout (all in `styles.css`, `@media (max-width: 760px)`): a sticky `.mobile-topbar`
  with ☰ opens the **same** `Sidebar` as an off-canvas drawer (`.app-shell.nav-open`, backdrop,
  closes on nav tap). The desktop collapse preference is ignored there, which is why `WorldClock`
  is hidden by CSS (`.sidebar.collapsed .world-clock`) instead of returning `null`. List rows
  wrap: put action buttons in a `.row-actions` container (and the title+actions line of
  column-style rows in `.row-head`) so they drop to their own line on phones instead of
  squeezing the text. The Work Schedule month grid becomes a one-column day list
  (`.ws-day-wd` weekday and `.ws-hol-name` holiday labels show only in list mode) — driven by
  a **container query** (`@container wscal (max-width: 999px)` on `.ws-center-block`), not the
  760px media query, so it also kicks in on ~1280px laptops with the sidebar expanded, where
  the 7 columns would be too narrow to show names. The grid itself is
  `repeat(7, minmax(0, 1fr))` (plain `1fr` refused to shrink below the name chips and pushed
  Sunday off-screen), and `.main:has(.ws-calendar)` lifts `.main`'s 1100px max-width on that page
  so the grid gets the full window. Print resets the container (`container-type: normal`) and
  always uses the grid. Inputs are forced
  to 16px on phones (below that, iOS zooms on focus), and `env(safe-area-inset-*)` padding keeps
  content clear of the notch and home indicator.
  **iOS status bar — don't add `apple-mobile-web-app-status-bar-style: black-translucent` back.**
  It draws the page under the status bar, and since iOS 26 the installed app then gets a Liquid
  Glass edge blur over the top ~40pt past the status bar, which no CSS can switch off. That's
  what made the first line blurry on iPad and iPhone. An opaque `body::before` strip behind the
  status bar did *not* help: the blur reaches past it. `index.html` therefore sets no
  status-bar style at all. iOS uses the default opaque bar, tinted from `theme-color` (which
  `App.jsx` switches with the theme), and starts the web view below it, so
  `env(safe-area-inset-top)` is 0. The top-inset rules in `styles.css` (that strip, plus
  `.sidebar`/`.main`/`.overlay`/`.login-screen` padding, at every width) are left in as a
  harmless no-op guard. iOS reads the status-bar style when the app is **added to the Home
  Screen**, so a change to it only shows after removing and re-adding the app.
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
  OpenAI-compatible) with `VITE_OPENROUTER_API_KEY`. Model = `VITE_OPENROUTER_MODEL` or the
  `MODEL` default in `ai.js` (`google/gemini-2.5-flash`). Avoid Azure-served OpenAI slugs like
  `gpt-4o-mini` — their content filter blocks HR/review text and returns an empty 200.
  OpenRouter also retires slugs often ("No endpoints found") and the account needs credit; the
  old `openrouter/free` slug + free-tier caps were why AI calls used to fail constantly.
  `chat()` surfaces OpenRouter's 200-with-error-body, stale-slug, and `finish_reason` cases
  rather than a generic "empty response".
  `src/lib/autoTags.js` builds on it for auto interview tags, key takeaways, and
  follow-up-topic suggestions (used from `Interviews.jsx` and `PersonDetail.jsx`);
  `PersonDetail.jsx`'s `generateAISummary` calls `chat` directly for the executive summary, and
  `Accomplishments.jsx`'s `improveAccomplishmentText` likewise calls `chat` directly (a "✦ AI
  improve" button next to the Accomplishment textarea in `AccomplishmentForm`, enabled once
  there's any text, rewrites it into a polished one-or-two-sentence entry and replaces the
  textarea content in place) — both one-off, single-page AI calls live in their own page file
  rather than `autoTags.js`, which is reserved for prompts actually shared across pages.
  All best-effort with try/catch and user-facing error strings; the takeaway/topic parsers
  still strip any "thinking" preamble a model may emit. Swapping provider (Azure AI Foundry,
  a proxy, …) is a change to `ai.js` alone. (Note: GitHub Models was retired 2026-07-30 —
  don't reach for it.)
- **Outlook / Microsoft To Do sync**: `src/lib/msGraph.js` talks to a "PeopleOS Follow-ups"
  task list via Microsoft Graph, using a short-lived Graph Explorer token (expires ~1h).
  `src/lib/settings.js`'s `getMsGraphToken()` reads it from `localStorage` (set via the
  Settings page's paste-a-token form — the normal way to refresh it, since it doesn't
  require a rebuild) and falls back to the build-time `VITE_MS_GRAPH_TOKEN` env var if
  nothing is stored locally. msGraph.js itself is just Graph API calls
  (`syncFollowUpToOutlook` create/update, `listOutlookTasks`, `deleteOutlookTask`) — the
  reconciliation logic lives in `FollowUps.jsx`, per the "page components own their data"
  convention:
  - Per-row "Sync to Outlook" is a one-way push, same as before.
  - "Sync with Outlook" (was "Sync all to Outlook") is now a full two-way reconciliation:
    for each linked follow-up it compares the task's `lastModifiedDateTime` directly
    against the record's own `updatedAt` — whichever side actually wrote more recently
    wins. Newer task → **pull** (overwrite local `text`/`dueDate`/`done` from the task).
    Otherwise → **push** (also covers brand-new follow-ups, a task deleted in Outlook, and
    no-op re-pushes when nothing changed). Outlook tasks with no matching local record get
    **imported** as new follow-ups (`sourceType: 'outlook'`).
    A first version tracked a separate `msSyncedAt` "last synced" timestamp instead of
    comparing `updatedAt` directly — don't reintroduce that. It captured `msSyncedAt` in JS
    *before* awaiting `followUpsStore.upsert`, but upsert does a GitHub round-trip before
    stamping `updatedAt`, so `updatedAt` always ended up later than `msSyncedAt` by however
    long that round-trip took. Every follow-up then looked "changed locally since last
    sync" on every run, which silently made push always win over pull — sync only ever
    appeared to work one-way. Comparing real timestamps directly has no such gap.
  - Deleting a follow-up (`handleDelete`) also best-effort deletes its linked Outlook task,
    so it doesn't reappear as an "imported" follow-up on the next sync.
- **Notes**: `Notes.jsx` stores a plain `archived` boolean per record (alongside the existing
  `pinned` one) — no separate collection or soft-delete tombstone. A `showArchived` toggle
  switches the whole page between the active list and the archived list (`!!n.archived ===
  showArchived`, so records without the field at all — anything created before this existed —
  read as `archived: false` and show up in the active list as before); the Pin button is
  hidden while viewing archived notes since pin ordering only matters for the active list.
  Archiving/unarchiving is just `notesStore.upsert({ ...note, archived: !note.archived })`,
  the same pattern `togglePin` already used.
- **Birthdays**: stored as a single `birthday` string on the direct report record — `'MM-DD'`
  when only the day/month are known (the common case; most people don't share their birth
  year with their manager), or `'YYYY-MM-DD'` when the year is known too. `src/lib/birthdays.js`
  (`parseBirthday`/`formatBirthdayValue`/`nextBirthday`/`fmtBirthdayLabel`) is the single shared
  implementation — deliberately **not** duplicated across pages the way anniversary math
  already is (see the Known quirks note below); `DirectReports.jsx`'s `ReportForm`, `PersonDetail.jsx`,
  and `Dashboard.jsx` all import from it. The add/edit form uses two `<select>`s (month, day)
  plus an optional number input for the year, rather than a native `<input type="date">` —
  HTML date inputs require a year, which defeats the point when the year is usually unknown.
  `nextBirthday()` mirrors `nextAnniversary()`'s local-timezone-only approach (never round-trips
  the stored value through a Date-string constructor, since month/day/year are already plain
  numbers from `birthday.split('-')`) — see the work-schedule feature's `Date.UTC()` notes above
  for the bug class this avoids. `PersonDetail.jsx` shows a "Birthday" chip plus a colored
  days-until badge (with `turning <age>` appended when the year is known) next to the existing
  anniversary chip. On `Dashboard.jsx`, anniversaries and birthdays share one "🎉 Anniversaries &
  birthdays" section laid out as two side-by-side columns (`.grid.cols-2`, which stacks to one
  column under 760px), rendered via a shared `EventRow`. Each column lists the next 3 upcoming,
  preceded by one greyed-out row (`opacity: 0.5`) for the most recent one that already passed —
  `lastBirthday()` in `birthdays.js` and a Dashboard-local `prevAnniversary()` (which skips
  anyone with no full year of tenure yet). "Today" counts as upcoming, not past. In the half-width
  columns, location shows as just the flag next to the name, not the full location text.
- **New-interview defaults**: there are two separate "log a new interview" entry points — the
  standalone `InterviewForm` in `Interviews.jsx` ("+ Log entry") and the one inside
  `PersonDetail.jsx` ("+ Add interview", used from a person's profile) — genuinely two different
  components, not a shared one (per the "page components own their data" convention). Both
  independently default a brand-new entry's Date field to today (a page-local `todayDate()` in
  each file, `getFullYear()`/`getMonth()`/`getDate()` — local getters, matching `todayMonth()`'s
  existing pattern elsewhere in the app; **not** `toISOString()`, which reads the UTC date and
  can be off by a day depending on the browser's timezone) and offer the Title field as an
  `<input list=…>` + `<datalist>` autocomplete (no library — plain HTML) seeded with `['Weekly']`
  merged with whatever titles have actually been used before (org-wide in `Interviews.jsx`, this
  person's own history in `PersonDetail.jsx`), deduped via `Set`. Editing an existing interview is
  untouched — only new entries get the today-date default.
  Both forms also put the Type `<select>` in a narrow `.type-row` next to a "🤝 Face-to-face
  meeting" checkbox (`.check-label`), stored as a plain `faceToFace` boolean on the interview
  record (editable on existing interviews too; records without it read as `false`). Both
  interview lists show a "🤝 Face-to-face" badge next to the type badge when it's set.
- **1:1 cadence**: derived entirely from `interviews.json` — no stored field. `src/lib/cadence.js`
  (`lastOneOnOne`/`cadenceBadge`/`isOverdue`, `CADENCE_DAYS = 14`, i.e. a fortnightly rhythm) finds each person's most recent
  interview of type `'1:1'` (matched by `personId` or case-insensitive name, same as
  `PersonDetail.jsx`, so older name-only interviews still count; other types like performance
  reviews don't). Badge is green ≤14 days, amber ≤28, red beyond that (bands are 1× and 2× `CADENCE_DAYS`) or "No 1:1 yet". Shown only
  for `status === 'active'` people (nobody on leave gets nagged): a badge on each
  `DirectReports.jsx` roster row (which now loads `interviewsStore` too), and a "🗣️ 1:1s overdue"
  section on `Dashboard.jsx` (never-had-one first, then most overdue, top 5). Date math splits the
  `'YYYY-MM-DD'` string into numbers and uses local `Date` construction — no ISO-string parsing.
- **Monthly accomplishments email**: `.github/workflows/accomplishments-email.yml` runs
  `scripts/send-accomplishments-email.mjs` every Thursday 07:00 UTC; the script only actually
  sends on the **last Thursday of the month** (Europe/Vienna), reading `accomplishments.json`
  from the data repo, decrypting with the same AES secret, and sending via the Resend API.
  `src/lib/githubActions.js` lets the "Send this month's email" button in `Accomplishments.jsx`
  trigger that same workflow on demand (`workflow_dispatch` with `force: true`), so the
  Resend key never ships in the browser bundle.
- **Work-schedule generator**: `src/lib/scheduleGenerator.js` builds a monthly homeoffice/
  office rota for three support centers (`CENTERS`: Bangalore, Warsaw, Mexico City — array order is the
  display order everywhere: tabs, default tab, print view, Excel sheets, PDF pages), matching
  people to a center by free-text `location`. Holiday awareness and month/weekend helpers
  come from `src/lib/holidays.js` (`getHoliday`, `isWeekend`, `getDaysInMonth`; hardcoded
  PL/IN/MX holiday tables for 2024–2027). Key rota rules, encoded in `generateSchedule`:
  weekdays need ≥2 people, weekends/holidays exactly 1; each special day is re-ranked so it
  goes to whoever has the lightest weekend/holiday load (this month's `specialUsed` +
  cross-month `fairnessSnapshot`), so it rotates instead of piling on one person; a soft
  preference skips whoever worked the day before (so a Saturday worker isn't also given the
  Sunday) unless nobody else is free; working a Sunday or holiday hard-blocks that person the
  next calendar day (a day is left short-staffed rather than broken); ~20–21 working days per
  person; **hard cap of 40h per person per Mon–Sun week** (`MAX_WEEKLY_HOURS = 40`, 8h shifts →
  5 shifts/week; `weekStart()` exported) — also enforced on the special-day and top-up steps, and
  seeded with last month's shifts (`generateSchedule`'s 4th param `prevAssignments`, passed by
  `WorkSchedule.jsx`'s `handleGenerate`) so a week straddling the month boundary still caps at 40h.
  Like the rest rule, the cap leaves a day short-staffed rather than breaking it: with only 2
  people at a center (≈53 shifts needed/month vs 2×40h/week) some weekdays get 1 person instead of
  2 — 3+ people per center covers everything. Before the cap, the generator routinely handed out
  48h weeks. Weekend burden balanced across months via the `fairnessSnapshot` persisted on the
  schedule record. **Nobody is scheduled on their own birthday** (Rule 6, via `isBirthdayOn()` from
  `birthdays.js`, pure string math, 29 Feb → 28 Feb in non-leap years). Unlike the rest rule
  and the 40h cap, this is a strong *preference*, not a hard block: every pick tries non-birthday
  candidates first and only falls back to the birthday person when nobody else can cover the day,
  so coverage never drops because of it. The top-up step never adds a shift on a birthday.
  (`scheduleGenerator.js` now imports `birthdays.js`, which is also free of `import.meta.env`/browser
  globals, so the CI email script can still import the generator.)
  Schedules saved *before* the 2026-09-15 `getDaysInMonth` fix (see Excel export below) are
  shifted by a day in CET — e.g. October stored as Sep 30–Oct 30, so Oct 31 shows empty. Fix by
  assigning the empty day (click "—" / "+") or regenerating the month.
- **Work-schedule editing (`WorkSchedule.jsx`)**: clicking a person's chip in a day cell opens a
  `ShiftModal` (`DraggableModal`) with a "Swap with" dropdown of the other people at that center —
  plain names, no day counts (removed on request); anyone already on that day is disabled, and anyone who
  worked the Sunday/holiday before is flagged "⚠ rest day" (mirrors the generator's rest rule;
  still allowed, it's the manager's call), and anyone whose birthday it is is flagged "🎂 birthday"
  (plus a warning line when picked; also still allowed). Chips of people working on their birthday
  show 🎂 in the calendar (e.g. schedules saved before the birthday rule, or last-resort picks) — plus "Remove from this day" (sets `cleared: true`,
  restorable with ↩, same as the chip's ✕). `swapAssignment()` rewrites the assignment's
  `personId`/`personName` in place (date/center/flags/comment kept) and drops any *cleared* entry
  the replacement already had that day, so nobody is listed twice. Drag-and-drop (move to another
  day), ✕ and 💬 still work as before; their buttons `stopPropagation` so they don't open the modal.
  Clicking an empty day's "—", or the "+" that appears on hover in every day header, opens the
  same modal in **assign mode** (`personId: null`: "Assign shift", no current person, no remove
  button) → `addAssignment()` adds a full assignment record (same fields as the generator's
  `makeAssignment`). Each stat chip shows month hours plus `max Nh/wk` (tooltip = per-week
  breakdown); it turns red with ⚠ if any week exceeds `MAX_WEEKLY_HOURS` (e.g. after manual edits —
  manual swaps/assigns aren't blocked by the cap, only flagged).
  Edits don't recompute the saved `fairnessSnapshot` (same as drag-and-drop always behaved).
- **24/7 on-duty view (Dashboard)**: the three centers' shifts are each in *local* time and chain
  "follow the sun" (Bangalore 07:00–15:00 IST → Warsaw 11:30–19:30 → Mexico City 11:30–19:30), so
  every `CENTERS` entry now carries a `tz` (IANA name). `src/lib/onDuty.js`'s
  `getShiftTimeline(schedules, now)` builds concrete shift instances for each center for its own
  local yesterday/today/tomorrow, converts start/end to absolute instants via `Intl` offsets (no
  timezone library; a two-pass `zonedToUtc`, imported from `worldClock.js`, handles DST), attaches non-cleared assignments by
  `date|center` (date = that center's local date, so Mexico City's evening shift belongs to its own
  calendar day), and returns `{ current[], previous, next, hasSchedule }`. `current` is an array
  because coverage isn't seamless all year: in Warsaw winter time there's a real 1-hour gap after
  Bangalore and a 1-hour Warsaw/Mexico overlap — the "On duty now" card says "gap in coverage" (and
  when the next shift starts) rather than hiding it. `Dashboard.jsx` shows Before (greyed) / On duty
  now (accent border) / Up next cards, each with the center's local hours plus the same window in
  the viewer's own browser time, and re-evaluates every 60s. Empty shifts show "No one scheduled".
- **Excel export**: `src/lib/scheduleExcel.js`'s `downloadScheduleExcel(month, people,
  schedule)` builds a multi-sheet `.xlsx` (one sheet per center, named e.g. `Warsaw` —
  matches `CENTERS[].id`) via `exceljs`, styled to mirror the app's own on-screen colors
  (`--accent`-tint for on-shift, `--bad`-tint for holiday, neutral for day off) rather than
  the arbitrary palette in the reference sheet this was modeled on. `exceljs` is ~270KB
  gzipped, so it's **dynamically imported** inside that function (`await import('exceljs')`)
  instead of statically at the top of the file — it lands in its own chunk that only
  downloads when someone actually clicks "Export Excel" on `WorkSchedule.jsx`, rather than
  bloating every page's bundle. Per person per day: `'S'` (on shift — a non-cleared
  assignment exists for that date/center/person), else `'H'` (public holiday for that
  center's country), else `'D'` (day off, including weekends and cleared assignments) — no
  `'V'`/vacation code, since this app has no leave-tracking data to draw one from. The date
  header row (day 1, day 2, …) uses real `Date` objects with `numFmt: 'd-mmm'`, not text, so
  they render as "1-Nov" while staying genuine dates. Day columns are 7 chars wide, not the
  ~5.5 that fits just the S/D/H letter — narrower than that and Excel renders the `d-mmm`
  header as `####` instead of truncating. Each person's "Employee name" cell also gets a
  distinct fill from a small cycling pastel palette (`EMPLOYEE_COLORS`), purely so adjacent
  rows are easier to tell apart — it never touches the S/D/H day-cell fills further right.
  `getDaysInMonth()` (in `holidays.js`, used here and by `scheduleGenerator.js`) used to build
  its month via a LOCAL-timezone `Date` constructor round-tripped through `.toISOString()`
  (UTC), which shifted every date back by one day in any positive-UTC-offset timezone — the
  export visibly ran "30 Sep – 30 Oct" instead of "1–31 Oct" for a browser in, e.g., CET. Fixed
  by building the day list from pure string/number arithmetic with no `Date`/ISO round-trip at
  all; the small remaining `Date` usages in `scheduleExcel.js` itself (`monthLabel`, the
  weekday-abbreviation label) pass `timeZone: 'UTC'` for the same reason. If you touch date
  logic anywhere in the work-schedule feature, prefer `Date.UTC()`/`getUTC*()` (or
  `timeZone: 'UTC'`, or plain string parsing) over local-timezone `Date` methods — see the same
  fix applied to `isWeekend`/`getDaysInMonth` in `holidays.js`, `dow`/`addOneDay`/`prevDay` in
  `scheduleGenerator.js`, and `fmtDate`/`fmtDay`/`fmtWeekday`/month-header labels in
  `WorkSchedule.jsx`.
- **Work-schedule email**: unlike accomplishments, there's no cron — the "📧 Send via Email"
  button on `WorkSchedule.jsx` (`handleSendEmail`, next to Print PDF/Export Excel) calls
  `sendScheduleEmailNow(month)` in `src/lib/githubActions.js`, which fires
  `.github/workflows/schedule-email.yml` (`workflow_dispatch` only) on demand. That workflow
  runs `scripts/send-schedule-email.mjs`, which re-reads `direct-reports.json` and
  `schedules.json` from the data repo, decrypts them, and emails **both** a `.pdf` and a
  `.xlsx` of the schedule (one page/sheet per center) as attachments via Resend — to a
  hardcoded `henry.ai.server@gmail.com` (`SCHEDULE_EMAIL_TO` env var in the workflow,
  mirroring `ACCOMPLISHMENTS_EMAIL_TO`'s pattern). The recipient isn't configurable from the
  UI; change the workflow's `SCHEDULE_EMAIL_TO` line to redirect it.
  **That address is a hard requirement, not a preference**: with the default
  `onboarding@resend.dev` sender (`FROM_EMAIL`/`SCHEDULE_EMAIL_FROM`), Resend rejects any
  recipient other than the Resend account's own verified address with a 403
  (`validation_error`, "You can only send testing emails to your own email address") — hit for
  real the first time this workflow ran, when `SCHEDULE_EMAIL_TO` was still
  `maximilian.bielecki@ul.com`. Sending to any other address requires verifying a domain at
  resend.com/domains and setting `SCHEDULE_EMAIL_FROM` to an address on that domain — until
  then, `SCHEDULE_EMAIL_TO` must stay `henry.ai.server@gmail.com`. The same restriction applies
  to the accomplishments email (same account, same default sender), so
  `ACCOMPLISHMENTS_EMAIL_TO` in `accomplishments-email.yml` was fixed to
  `henry.ai.server@gmail.com` too, before its first real send ever had the chance to hit the
  same 403 (every completed cron run up to that point had hit the "not the last Thursday" early
  exit, so the old `maximilian.bielecki@ul.com` default had never actually been exercised).
  The `.xlsx` reuses the exact same rendering code as the "Export Excel" button: `scheduleExcel.js`
  exports `buildScheduleWorkbook(workbook, month, people, schedule)` — the sheet-building half of
  what used to be all inside `downloadScheduleExcel` — plus `dayCode`, `FILL_SHIFT`,
  `FILL_HOLIDAY`, `FILL_DAYOFF`, and `EMPLOYEE_COLORS`, so the email script (which constructs
  its own `ExcelJS.Workbook` via a plain top-level `import ExcelJS from 'exceljs'`, no dynamic
  import needed — that's only a browser-bundle-size concern) never duplicates the sheet layout
  or the S/D/H classification logic; `downloadScheduleExcel` itself now just constructs the
  workbook, calls `buildScheduleWorkbook`, and handles the browser download.
  The `.pdf` has no browser equivalent to reuse (the "Print PDF" button just calls
  `window.print()` on the on-screen calendar) — `send-schedule-email.mjs` draws it from
  scratch with `pdfkit` (one A4-landscape page per center, drawn manually with `doc.rect`/
  `doc.text` — no table plugin), importing `dayCode`/`FILL_*`/`EMPLOYEE_COLORS` from
  `scheduleExcel.js` so its colors and S/D/H codes exactly match the Excel/on-screen versions.
  `pdfkit` is a normal `dependencies` entry (like `crypto-js`) even though only this CI-only
  script imports it — since nothing under `src/` ever imports it, Vite never bundles it into
  the browser build.
  One pdfkit gotcha hit while building this: placing text at exactly
  `pageHeight - marginBottom` (the writable area's precise bottom edge) makes pdfkit think the
  text doesn't fit and silently insert a blank extra page, even though the coordinates were
  passed explicitly — the footer is drawn a few points higher (`pageHeight - 32`) with
  `{ lineBreak: false }` to avoid it. If you add more per-page text near a page edge, stay
  clear of that exact boundary.
  `scripts/send-schedule-email.mjs` can otherwise import `scheduleGenerator.js`/`holidays.js`/
  `scheduleExcel.js` directly (no reimplementation needed, unlike `dataStore.js`/`crypto.js`)
  because none of those three modules touch `import.meta.env` or any browser global.

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
    githubActions.js   Fires the accomplishments-email and schedule-email workflows via
                       workflow_dispatch
    scheduleGenerator.js  CENTERS + generateSchedule() rota builder for WorkSchedule
    scheduleExcel.js   buildScheduleWorkbook() (shared with scripts/send-schedule-email.mjs)
                       + downloadScheduleExcel() — multi-sheet .xlsx export of the work
                       schedule via exceljs (dynamically imported, its own chunk, browser only)
    holidays.js        Hardcoded PL/IN/MX holiday tables + date helpers used by the generator
    onDuty.js          getShiftTimeline — who's on 24/7 duty now / before / next, from saved
                       schedules + each center's local shift hours (Dashboard)
    cadence.js         lastOneOnOne/cadenceBadge/isOverdue — 1:1 cadence derived from
                       interviews, used by Dashboard.jsx and DirectReports.jsx
    birthdays.js       parseBirthday/formatBirthdayValue/nextBirthday/fmtBirthdayLabel —
                       shared by DirectReports.jsx (ReportForm), PersonDetail.jsx, and
                       Dashboard.jsx, rather than duplicated the way anniversary math is
    locationFlag.js    Free-text location → ISO country code (getCountryCode) → flag image
                        URL, and → [lat, lon] city centroid (getCoords, used by WorldMapModal)
    sunPosition.js     Approximate subsolar point + terminator latitude, for WorldMapModal's
                        day/night shading
    worldContinents.js `LAND_POLYGONS` — real coastlines WorldMapModal draws inline as its
                        base map (no external image/network dependency). One-time generated
                        from `world-atlas`'s `land-110m.json` (Natural Earth 1:110m, public
                        domain) via `topojson-client`, flattened to plain [lon, lat] rings;
                        `world-atlas`/`topojson-client` are NOT runtime deps, only used to
                        produce this static file (`npm install --no-save world-atlas
                        topojson-client`, then `topojson.feature(...)` on `land-110m.json`'s
                        `land` object — see git history for the exact one-off script if this
                        ever needs regenerating at a different resolution). Each entry is one
                        polygon's rings (`[outer, ...holes]`) — WorldMapModal draws it as a
                        single `<path fill-rule="evenodd">` so holes (e.g. the Caspian/Aral
                        Sea inside Asia) render as open water. Don't flatten rings into
                        independent filled shapes again — that silently paints holes as land.
    worldClock.js      CLOCKS (Warsaw/Chicago/Bangalore/Mexico City, each with a converter
                        `region` label) + fmtTime/fmtDate/fmtTzAbbr/fmtTzFull, shared by
                        App.jsx's sidebar widget and WorldMapModal's clocks table + time
                        converter; also the one Intl wall-clock↔instant helper set
                        (zonedToUtc/localDateStr/localTimeStr) that onDuty.js imports too
    imageUtils.js      Client-side avatar photo resizing before storing as base64
    settings.js        Browser-local (localStorage) user settings — currently just
                        getMsGraphToken()/setMsGraphToken(), read by msGraph.js and
                        written by the Settings page
    pwa.js             Service-worker registration + update banner state, install prompt
                        capture (subscribePwa/applyUpdate/promptInstall/isStandalone/isIOS)
  sw-template.js       Service-worker source; NOT imported — vite.config.js's serviceWorker()
                       plugin fills in the precache list/version and emits dist/sw.js
  pages/
    Dashboard.jsx      Team stats, 24/7 on duty (before/now/next), follow-ups, anniversaries | birthdays (two columns,
                       last-passed row greyed + next 3), 1:1s overdue, recent activity
    DirectReports.jsx  Team roster CRUD, grouped by team; also exports `Avatar`, `ReportForm`
    PersonDetail.jsx   Per-person profile + interview history + AI follow-up topics
    Interviews.jsx     1:1 / skip-level / hiring / exit / performance / team-meeting log
    FollowUps.jsx      Action-item tracker, optional person link (dropdown sorted A–Z by
                        first name, i.e. `localeCompare` on the stored "First Last" name), optional Outlook sync
                        (per-row one-way push, or "Sync with Outlook" for a full two-way
                        reconciliation across every follow-up);
                        exports `urgencyLabel`
    Notes.jsx          Freeform scratchpad; pin, archive/unarchive, search
    Accomplishments.jsx  Monthly wins log, per person or per team; "send this month's email"
    WorkSchedule.jsx   Monthly office/homeoffice rota with country holiday awareness
    Settings.jsx       Browser-local settings — the Microsoft Graph token form
                        (backs msGraph.js via settings.js), with instructions for generating
                        one from Graph Explorer, plus the "Install on your phone" PWA card
  components/
    DraggableModal.jsx  Shared draggable modal shell used by every "add/edit" form
    WorldMapModal.jsx  Full-screen world map (opened from the sidebar's World Clock):
                        day/night terminator + a dashed solar-noon meridian line through the
                        sun position, a pin per active direct report's resolved location
                        (hover tooltip with photo/name; pins sharing a city cluster into one
                        badge), and a clocks table (same cities as `worldClock.js`'s CLOCKS)
                        alongside the map. Under the clocks table, a "Convert a time" form
                        (`TimeConverter`): pick a region (India/Poland/Mexico/USA, i.e.
                        `CLOCKS[].region`; USA = Chicago), enter a date + time, and every
                        other city shows the same instant (with a ±day badge when the date
                        changes). Conversion uses `zonedToUtc`/`localDateStr`/`localTimeStr`
                        from `worldClock.js` (Intl, DST-correct on both ends); a time skipped
                        by a spring-forward change is called out rather than silently moved.
                        The base map itself is drawn inline from
                        `src/lib/worldContinents.js`'s real coastline data (Natural Earth,
                        generated once — see that file's header) — deliberately not an
                        external image. An earlier version hotlinked a
                        Wikimedia map image; that rendered as a black rectangle for at least
                        one user on a restrictive/corporate network, so don't reintroduce an
                        external image dependency here. It renders via `createPortal(…,
                        document.body)`: it's opened from inside the sidebar, which is
                        `position: sticky` (= its own stacking context), so rendered in place its
                        z-index only ranked it within the sidebar and any faded (`opacity < 1`)
                        main-content element — e.g. the Dashboard's greyed "last passed"
                        anniversary/birthday rows and "Before" duty card — painted on top of it.
                        Portal any future overlay launched from the sidebar the same way.
                        Draggable by its header via `useDraggable()` (exported from
                        `DraggableModal.jsx`, the same hook DraggableModal itself uses) — it
                        isn't a DraggableModal because of its wide custom layout. The hook
                        ignores mousedowns on buttons inside the handle, so the × still clicks.
public/
  manifest.webmanifest PWA manifest (relative paths, no repo-name dependency)
  icons/               App icons — icon.svg source + 192/512/maskable/apple-touch PNGs
  404.html             GitHub Pages deep-link redirect
scripts/
  send-accomplishments-email.mjs   CI-only Node script; re-implements dataStore's read+decrypt
  send-schedule-email.mjs   CI-only Node script; imports scheduleGenerator.js/holidays.js/
                       scheduleExcel.js directly (they're import.meta.env-free) but still
                       re-implements dataStore's read+decrypt like the script above; builds
                       and emails a .pdf (via pdfkit) + .xlsx (via buildScheduleWorkbook)
.github/workflows/
  deploy.yml               Build + deploy to GitHub Pages on push to main
  accomplishments-email.yml Thursday cron + manual dispatch for the monthly email
  schedule-email.yml       Manual dispatch only — "📧 Send via Email" on WorkSchedule.jsx
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
  A modal that genuinely needs its own shell (e.g. `WorldMapModal`) should still be draggable
  via the exported `useDraggable()` hook rather than a copy of the drag logic.
- **Cross-page exports are normal here.** `DirectReports.jsx` exports `Avatar` and
  `ReportForm`; `FollowUps.jsx` exports `urgencyLabel`. `Dashboard.jsx`, `PersonDetail.jsx`,
  and `WorkSchedule.jsx` import these directly. It's a small app — don't over-abstract this
  into a shared `components/` file unless asked.
- **New persisted collections** go through `makeStore()` in `dataStore.js` and get a `.json`
  filename. Export a `<name>Store` alongside the existing ones.
- **`base: '/people-os/'` in `vite.config.js`** must keep matching the GitHub Pages repo
  name — don't change one without the other. (The PWA manifest and service worker derive
  everything from `base`/their own scope, so they need no change when it moves.) `githubActions.js`'s `APP_OWNER`/`APP_REPO`
  constants (and, cosmetically, `ai.js`'s `APP_URL`) are also hardcoded to
  `HenryAI-stack/people-os`; update them together if the repo moves.
- **Everything must work on a phone** (the app is installed as a PWA). Check new UI at ~390px
  wide: wrap row buttons in `.row-actions`, don't rely on hover-only affordances (add them to the
  `@media (hover: none)` block), and launch any new overlay from the sidebar via `createPortal`
  (the drawer is `position: fixed` and its own stacking context, like the sticky desktop
  sidebar).
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
  touch one, check whether the other needs the same fix. Birthday math deliberately avoided
  repeating this mistake — `src/lib/birthdays.js` is the one implementation both pages import.
- `msGraph.js` and `githubActions.js` both rely on tokens that are either short-lived
  (the Microsoft Graph token, ~1h) or narrowly scoped (`VITE_GH_ACTIONS_TOKEN` —
  "Actions: write" on this repo only). Both features degrade to a clear error string when
  the token is absent or expired; that's intended. The Graph token is the one exception to
  "env vars are build-time only": it's normally set at runtime from the Settings page
  (`localStorage`, via `settings.js`), specifically so refreshing the ~1h-lived token doesn't
  need a rebuild+redeploy. `VITE_MS_GRAPH_TOKEN` still works as a build-time fallback when
  nothing is stored locally.

## Environment variables

Local dev: `cp .env.example .env` and fill in. `.env.example` lists all 13 build vars and is
kept in sync with `import.meta.env.*` usage in `src/` and with `deploy.yml` (verified — no
gaps in any direction). Production: the same names are stored as GitHub Actions repository
secrets and injected at build time. `deploy.yml` is the definitive list of what the app build
consumes; `accomplishments-email.yml` and `schedule-email.yml` list what those two email jobs
consume (`RESEND_API_KEY`, `ACCOMPLISHMENTS_EMAIL_TO`, and `SCHEDULE_EMAIL_TO` are server-side
only and not in `.env.example`).

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | app build | Firebase project config (auth only) |
| `VITE_ALLOWED_EMAIL` | app build (`auth.js`) | The single Google account allowed to log in |
| `VITE_GITHUB_OWNER`, `VITE_GITHUB_REPO`, `VITE_GITHUB_TOKEN`, `VITE_GITHUB_BRANCH` | app build + both email jobs | Data-repo access — the PAT is bundled client-side, scope it narrowly |
| `VITE_ENCRYPTION_SECRET` | app build + both email jobs | AES passphrase for all records — never rotate once real data exists |
| `VITE_OPENROUTER_API_KEY` | app build (`ai.js`) | OpenRouter key — powers all AI features (tags, takeaways, follow-up topics, exec summary); account needs credit |
| `VITE_OPENROUTER_MODEL` | app build (`ai.js`) | Optional model-slug override; falls back to `ai.js`'s `MODEL` default. Set when OpenRouter retires the current slug |
| `VITE_MS_GRAPH_TOKEN` | app build (`msGraph.js`) | Build-time fallback Graph token for Outlook / Microsoft To Do sync; expires ~1h. Normally set instead from the Settings page at runtime (`localStorage`, no rebuild needed) — see `src/lib/settings.js` |
| `VITE_GH_ACTIONS_TOKEN` | app build (`githubActions.js`) | Fine-grained PAT, "Actions: write" on this repo only, for the manual "send email now" and "Send via Email" buttons |
| `RESEND_API_KEY` | both email jobs | Server-side Resend API key, shared by both the accomplishments and work-schedule emails |
| `ACCOMPLISHMENTS_EMAIL_TO` | accomplishments email job (workflow env) | Recipient of the monthly summary (currently hardcoded in the workflow) |
| `SCHEDULE_EMAIL_TO` | schedule email job (workflow env) | Recipient of the work-schedule PDF+Excel email (hardcoded to `henry.ai.server@gmail.com` in `schedule-email.yml` — the Resend account's own verified address; see the note under Work-schedule email above before changing it) |

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

`package-lock.json` is committed and both workflows run `npm ci`, so keep the lockfile in
sync with `package.json` (run `npm install` locally after changing deps and commit the
lockfile change).

To exercise the monthly email script locally, set the env vars from the table above
(`VITE_GITHUB_*`, `VITE_ENCRYPTION_SECRET`, `RESEND_API_KEY`) plus `FORCE_SEND=true`
(optionally `FORCE_MONTH=YYYY-MM`) and run `node scripts/send-accomplishments-email.mjs`.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` builds with Node 22, injects the secrets
above, and deploys `dist/` to GitHub Pages via `actions/deploy-pages`. There's no staging
environment or preview-deploy step — `main` is production. The `accomplishments-email.yml`
and `schedule-email.yml` workflows are independent of deploy: the former is a Thursday cron
plus manual `workflow_dispatch`, the latter `workflow_dispatch`-only — both fired from the
app via `githubActions.js`.
