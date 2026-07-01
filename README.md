# PeopleOS

A lightweight People Leader hub for tracking direct reports, 1:1s/interview
notes, and general notes — built on the same serverless pattern as RecruitOS.

- **Google login** via Firebase Authentication (identity only — no user data touches Firebase)
- **Dashboard** with team stats and recent activity
- **Direct Reports** — add, edit, and track your team
- **Interviews** — log 1:1s, skip-levels, hiring interviews, and exit interviews
- **Notes** — a freeform scratchpad
- **Storage**: every record is AES-256 encrypted client-side, then committed
  as JSON to a **private** GitHub data repo via the GitHub Contents API.
  No database, no server.

See [INSTALLATION.md](./INSTALLATION.md) for full setup instructions.

## Quick local dev

```bash
npm install
cp .env.example .env   # fill in your own values
npm run dev
```

## Architecture

```
Browser (React app)
   │
   ├── Google Login        → Firebase Authentication (identity only)
   ├── Read/write records   → GitHub API → private data repo (AES-256 encrypted JSON)
   └── Deploy                → GitHub Actions → GitHub Pages
```
