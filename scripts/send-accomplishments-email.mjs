/**
 * Monthly accomplishments email.
 *
 * Runs from a GitHub Actions cron (see .github/workflows/accomplishments-email.yml)
 * every Thursday. Only actually sends when today is the LAST working Thursday
 * of the month for Europe/Vienna (unless FORCE_SEND=true, used for manual testing
 * via workflow_dispatch) — since that only happens once a month, no extra
 * "already sent" bookkeeping is needed.
 *
 * Reads accomplishments.json from the private GitHub data repo (same repo/API
 * the app itself uses), decrypts it with the same AES secret the app uses,
 * and emails a summary for the current month via the Resend API.
 */
import CryptoJS from 'crypto-js'

const {
  VITE_GITHUB_OWNER: OWNER,
  VITE_GITHUB_REPO: REPO,
  VITE_GITHUB_TOKEN: GH_TOKEN,
  VITE_GITHUB_BRANCH: BRANCH_RAW,
  VITE_ENCRYPTION_SECRET: SECRET,
  RESEND_API_KEY,
  ACCOMPLISHMENTS_EMAIL_TO,
  ACCOMPLISHMENTS_EMAIL_FROM,
  FORCE_SEND,
  FORCE_MONTH,
} = process.env

const BRANCH = BRANCH_RAW || 'main'
const TO_EMAIL = ACCOMPLISHMENTS_EMAIL_TO || 'maximilian.bielecki@ul.com'
const FROM_EMAIL = ACCOMPLISHMENTS_EMAIL_FROM || 'PeopleOS <onboarding@resend.dev>'
const TIMEZONE = 'Europe/Vienna'

function requireEnv(name, val) {
  if (!val) { console.error(`Missing required env var: ${name}`); process.exit(1) }
}
requireEnv('VITE_GITHUB_OWNER', OWNER)
requireEnv('VITE_GITHUB_REPO', REPO)
requireEnv('VITE_GITHUB_TOKEN', GH_TOKEN)
requireEnv('VITE_ENCRYPTION_SECRET', SECRET)
requireEnv('RESEND_API_KEY', RESEND_API_KEY)

// ── Date helpers (all computed in Europe/Vienna local time) ─────────────────
function viennaNow() {
  // en-CA gives YYYY-MM-DD; combined with a weekday lookup this avoids any
  // UTC-vs-local drift on the GitHub Actions runner.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'), // 'Mon'..'Sun'
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

function isLastThursdayOfMonth({ year, month, day, weekday }) {
  if (weekday !== 'Thu') return false
  const daysInMonth = new Date(year, month, 0).getDate() // month is 1-indexed here, so this is correct
  return day + 7 > daysInMonth
}

// ── GitHub Contents API (mirrors src/lib/dataStore.js) ───────────────────────
async function readCollection(filename) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}?ref=${BRANCH}&_=${Date.now()}`,
    { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' } }
  )
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)
  const file = await res.json()
  const raw = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const bytes = CryptoJS.AES.decrypt(raw, SECRET)
  const json = bytes.toString(CryptoJS.enc.Utf8)
  if (!json) return []
  const data = JSON.parse(json)
  return Array.isArray(data) ? data : []
}

// ── Email content ─────────────────────────────────────────────────────────
function fmtMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function buildEmail(monthKey, items) {
  const monthLabel = fmtMonthLabel(monthKey)

  if (items.length === 0) {
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 4px;">🏆 Accomplishments — ${monthLabel}</h2>
        <p style="color:#666;font-size:14px;">Nothing was logged in PeopleOS for ${monthLabel}. Worth a quick check-in with the team before the month closes out.</p>
      </div>`
    return { subject: `Accomplishments — ${monthLabel} (nothing logged yet)`, html }
  }

  const groups = {}
  for (const a of items) {
    const key = a.assigneeType === 'team' ? `🏷️ ${a.team || 'Unassigned team'}` : `👤 ${a.personName || 'Unassigned'}`
    ;(groups[key] ||= []).push(a)
  }
  const sortedKeys = Object.keys(groups).sort((x, y) => {
    const lx = x.startsWith('🏷️') ? `0${x}` : `1${x}`
    const ly = y.startsWith('🏷️') ? `0${y}` : `1${y}`
    return lx.localeCompare(ly)
  })

  const sections = sortedKeys.map((key) => {
    const rows = groups[key]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((a) => `<li style="margin-bottom:6px;"><span style="color:#888;font-size:12.5px;">${escapeHtml(fmtDate(a.date))}</span> — ${escapeHtml(a.text)}</li>`)
      .join('')
    return `
      <div style="margin-bottom:18px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:6px;">${escapeHtml(key)}</div>
        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5;">${rows}</ul>
      </div>`
  }).join('')

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">🏆 Accomplishments — ${monthLabel}</h2>
      <p style="color:#666;font-size:13px;margin:0 0 20px;">${items.length} item${items.length === 1 ? '' : 's'} logged in PeopleOS.</p>
      ${sections}
      <p style="color:#aaa;font-size:11.5px;margin-top:24px;">Sent automatically on the last working Thursday of the month.</p>
    </div>`

  return { subject: `Accomplishments — ${monthLabel} (${items.length} logged)`, html }
}

async function sendEmail({ subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, html }),
  })
  if (!res.ok) throw new Error(`Resend send failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const now = viennaNow()
  const force = FORCE_SEND === 'true'

  if (!force && !isLastThursdayOfMonth(now)) {
    console.log(`Today (${now.dateStr}, ${now.weekday}, Europe/Vienna) is not the last working Thursday of the month — skipping.`)
    return
  }

  const monthKey = FORCE_MONTH || `${now.year}-${String(now.month).padStart(2, '0')}`
  console.log(`Building accomplishments email for ${monthKey}${force ? ' (forced run)' : ''}…`)

  const all = await readCollection('accomplishments.json')
  const items = all.filter((a) => a.month === monthKey)

  const email = buildEmail(monthKey, items)
  await sendEmail(email)
  console.log(`Sent "${email.subject}" to ${TO_EMAIL}.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
