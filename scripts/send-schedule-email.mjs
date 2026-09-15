/**
 * Work schedule email — fired on demand (see .github/workflows/schedule-email.yml,
 * triggered by the "📧 Send via Email" button on WorkSchedule.jsx via
 * sendScheduleEmailNow() in src/lib/githubActions.js). There's no cron for this
 * one, unlike the accomplishments email — it only ever runs when someone asks.
 *
 * Reads direct-reports.json and schedules.json from the private GitHub data repo
 * (same repo/API the app itself uses), decrypts them with the same AES secret the
 * app uses, rebuilds the schedule as both a .pdf and a .xlsx, and emails both as
 * attachments via the Resend API.
 *
 * The .xlsx is built with the exact same buildScheduleWorkbook() the browser's
 * "Export Excel" button uses (src/lib/scheduleExcel.js) — that module has no
 * import.meta.env or browser-global usage, so it's safe to import directly here,
 * unlike dataStore.js/crypto.js which this script has to reimplement below.
 * The .pdf has no browser equivalent (the app's own "Print PDF" button just does
 * window.print()), so it's built from scratch with pdfkit, reusing dayCode() and
 * the FILL_ and EMPLOYEE_COLORS constants from scheduleExcel.js so the two documents
 * stay visually consistent with each other and with the on-screen calendar.
 */
import CryptoJS from 'crypto-js'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { CENTERS, getCenter } from '../src/lib/scheduleGenerator.js'
import { getDaysInMonth } from '../src/lib/holidays.js'
import {
  buildScheduleWorkbook, dayCode,
  FILL_SHIFT, FILL_HOLIDAY, FILL_DAYOFF, EMPLOYEE_COLORS,
} from '../src/lib/scheduleExcel.js'

const {
  VITE_GITHUB_OWNER: OWNER,
  VITE_GITHUB_REPO: REPO,
  VITE_GITHUB_TOKEN: GH_TOKEN,
  VITE_GITHUB_BRANCH: BRANCH_RAW,
  VITE_ENCRYPTION_SECRET: SECRET,
  RESEND_API_KEY,
  SCHEDULE_EMAIL_TO,
  SCHEDULE_EMAIL_FROM,
  SCHEDULE_MONTH,
} = process.env

const BRANCH = BRANCH_RAW || 'main'
// Resend's shared onboarding@resend.dev sender can only send to the Resend
// account's own verified address until a domain is verified — see the 403
// this hits if SCHEDULE_EMAIL_TO points anywhere else.
const TO_EMAIL = SCHEDULE_EMAIL_TO || 'henry.ai.server@gmail.com'
const FROM_EMAIL = SCHEDULE_EMAIL_FROM || 'PeopleOS <onboarding@resend.dev>'
const TEAM_NAME = '24/7 Core Operations' // must match WorkSchedule.jsx's TEAM_NAME
const TIMEZONE = 'Europe/Vienna'

function requireEnv(name, val) {
  if (!val) { console.error(`Missing required env var: ${name}`); process.exit(1) }
}
requireEnv('VITE_GITHUB_OWNER', OWNER)
requireEnv('VITE_GITHUB_REPO', REPO)
requireEnv('VITE_GITHUB_TOKEN', GH_TOKEN)
requireEnv('VITE_ENCRYPTION_SECRET', SECRET)
requireEnv('RESEND_API_KEY', RESEND_API_KEY)

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

// ── Date helpers ──────────────────────────────────────────────────────────
function viennaMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}`
}
function monthLabelOf(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function weekdayShortUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
}
const hex = (argb) => `#${argb.slice(2)}` // exceljs ARGB ('FFrrggbb') -> pdfkit RGB hex ('#rrggbb')

// ── PDF ───────────────────────────────────────────────────────────────────
function drawCenterPage(doc, center, people, days, monthLabel, assignmentMap) {
  const marginX = 24
  const top = 24
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const nameColW = 90
  const dayColW = (pageWidth - marginX * 2 - nameColW) / days.length
  let y = top

  doc.fillColor(hex('FF1F2937')).font('Helvetica-Bold').fontSize(14)
    .text(`${center.label} | ${monthLabel} | Shift ${center.hours}`, marginX, y)
  y += 22

  // Legend
  const legend = [['S', FILL_SHIFT, `Shift ${center.hours}`], ['D', FILL_DAYOFF, 'Day Off'], ['H', FILL_HOLIDAY, 'Holiday']]
  let lx = marginX
  doc.fontSize(8)
  for (const [code, argb, label] of legend) {
    doc.rect(lx, y, 14, 14).fill(hex(argb))
    doc.fillColor('#1a1a1a').font('Helvetica-Bold').text(code, lx, y + 3, { width: 14, align: 'center' })
    doc.font('Helvetica').text(label, lx + 18, y + 3)
    lx += 18 + doc.widthOfString(label) + 22
  }
  y += 22

  function drawHeader() {
    doc.font('Helvetica-Bold').fontSize(6).fillColor('#1a1a1a')
    days.forEach((dateStr, i) => {
      const x = marginX + nameColW + i * dayColW
      doc.text(weekdayShortUTC(dateStr), x, y, { width: dayColW, align: 'center' })
    })
    y += 9
    doc.rect(marginX, y, nameColW, 14).fill(hex('FF497A7C'))
    doc.fillColor('#ffffff').fontSize(7).text('Employee name', marginX + 4, y + 4)
    days.forEach((dateStr, i) => {
      const x = marginX + nameColW + i * dayColW
      doc.rect(x, y, dayColW, 14).fill(hex('FF497A7C'))
      doc.fillColor('#ffffff').fontSize(6).text(String(Number(dateStr.split('-')[2])), x, y + 4, { width: dayColW, align: 'center' })
    })
    y += 14
  }
  drawHeader()

  const rowH = 13
  people.forEach((person, pi) => {
    if (y + rowH > pageHeight - 30) {
      doc.addPage()
      y = top
      drawHeader()
    }
    doc.rect(marginX, y, nameColW, rowH).fill(hex(EMPLOYEE_COLORS[pi % EMPLOYEE_COLORS.length]))
    doc.fillColor('#1a1a1a').font('Helvetica-Bold').fontSize(7)
      .text(person.name, marginX + 4, y + 3, { width: nameColW - 8, ellipsis: true, height: rowH })
    days.forEach((dateStr, i) => {
      const x = marginX + nameColW + i * dayColW
      const [code, argb] = dayCode(dateStr, center, person.id, assignmentMap)
      doc.rect(x, y, dayColW, rowH).fillAndStroke(hex(argb), '#ffffff')
      doc.fillColor('#1a1a1a').font('Helvetica').fontSize(7).text(code, x, y + 2, { width: dayColW, align: 'center' })
    })
    y += rowH
  })

  // pageHeight - marginBottom (24) is the writable area's exact bottom edge —
  // placing text AT that y, even with explicit coordinates, makes pdfkit think
  // it doesn't fit and silently insert a blank extra page. Stay a few points
  // inside the margin instead.
  doc.font('Helvetica-Oblique').fontSize(7).fillColor('#666666')
    .text(`Generated by PeopleOS on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      marginX, pageHeight - 32, { lineBreak: false })
}

function buildSchedulePdf(month, people, schedule) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const days = getDaysInMonth(month)
    const monthLabel = monthLabelOf(month)
    const assignmentMap = {}
    for (const a of schedule?.assignments || []) {
      const key = `${a.date}|${a.center}`
      ;(assignmentMap[key] ||= []).push(a)
    }

    let any = false
    for (const center of CENTERS) {
      const centerPeople = people.filter((p) => getCenter(p) === center.id)
      if (!centerPeople.length) continue
      if (any) doc.addPage()
      any = true
      drawCenterPage(doc, center, centerPeople, days, monthLabel, assignmentMap)
    }
    if (!any) doc.fontSize(14).text('No team members assigned to any support center.', 24, 24)
    doc.end()
  })
}

// ── Email ─────────────────────────────────────────────────────────────────
async function sendEmail({ subject, html, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, html, attachments }),
  })
  if (!res.ok) throw new Error(`Resend send failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const monthKey = SCHEDULE_MONTH || viennaMonth()
  const monthLabel = monthLabelOf(monthKey)
  console.log(`Building work schedule email for ${monthKey}…`)

  const allPeople = await readCollection('direct-reports.json')
  const people = allPeople.filter((p) => p.team === TEAM_NAME)
  if (!people.length) {
    console.error(`No team members found in "${TEAM_NAME}" — nothing to send.`)
    process.exit(1)
  }

  const schedules = await readCollection('schedules.json')
  const schedule = schedules.find((s) => s.month === monthKey)
  if (!schedule) {
    console.error(`No saved schedule found for ${monthKey}. Generate and save one in the app first.`)
    process.exit(1)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PeopleOS'
  workbook.created = new Date()
  buildScheduleWorkbook(workbook, monthKey, people, schedule)
  const xlsxBuffer = await workbook.xlsx.writeBuffer()

  const pdfBuffer = await buildSchedulePdf(monthKey, people, schedule)

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">📅 Work Schedule — ${monthLabel}</h2>
      <p style="color:#666;font-size:14px;">Attached: the ${monthLabel} work schedule for ${TEAM_NAME}, as PDF and Excel
      (.xlsx) — one page/sheet per support center.</p>
    </div>`

  await sendEmail({
    subject: `Work Schedule — ${monthLabel}`,
    html,
    attachments: [
      { filename: `work-schedule-${monthKey}.pdf`, content: Buffer.from(pdfBuffer).toString('base64') },
      { filename: `work-schedule-${monthKey}.xlsx`, content: Buffer.from(xlsxBuffer).toString('base64') },
    ],
  })
  console.log(`Sent "Work Schedule — ${monthLabel}" to ${TO_EMAIL}.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
