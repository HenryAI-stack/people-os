/**
 * "Export for Copilot" (Settings page) — turns PeopleOS records into one readable Word file that
 * Microsoft 365 Copilot can read from the user's own OneDrive.
 *
 * Why a file: custom Copilot agents/plugins can't be installed in the user's tenant (no app
 * registration, no custom app upload), but Copilot can always read the signed-in user's own
 * OneDrive files — in chat ("/" → pick the file) or as an agent-builder knowledge source.
 *
 * buildExportModel() is pure (no import.meta.env, no browser globals) so it can be exercised from
 * Node. buildExportDocx() dynamically imports `docx`, so that library lands in its own chunk and
 * only downloads when someone actually exports (same pattern as exceljs in scheduleExcel.js).
 */
import { fmtBirthdayLabel } from './birthdays.js'

export const EXPORT_FOLDER = 'PeopleOS'
export const EXPORT_FILENAME = 'PeopleOS Copilot export.docx'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const INTERVIEW_TYPES = {
  '1:1': '1:1',
  skip_level: 'Skip-level',
  performance: 'Performance review',
  team_meeting: 'Team meeting',
  hiring: 'Hiring interview',
  exit: 'Exit interview',
}

// Hiring interviews are about external candidates and exit interviews are the most sensitive
// notes in the app, so they're opt-in rather than exported by default.
export const DEFAULT_EXPORT_OPTIONS = {
  months: 12,
  people: true,
  interviews: true,
  interviewTypes: ['1:1', 'skip_level', 'performance', 'team_meeting'],
  followUps: true,
  accomplishments: true,
  notes: false,
  includeInactive: false,
}

// ── Date helpers: plain string math on 'YYYY-MM-DD', no ISO round-trips (see CLAUDE.md) ─────────
function pad(n) { return String(n).padStart(2, '0') }
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** 'YYYY-MM-DD' that lies `months` calendar months before `today` (day clamped to month length). */
export function monthsBefore(today, months) {
  const [y, m, d] = today.split('-').map(Number)
  const total = y * 12 + (m - 1) - months
  const ny = Math.floor(total / 12)
  const nm = total % 12 + 1
  const dim = new Date(ny, nm, 0).getDate()
  return `${ny}-${pad(nm)}-${pad(Math.min(d, dim))}`
}

const byDateDesc = (field) => (a, b) => String(b[field] || '').localeCompare(String(a[field] || ''))
const lc = (s) => String(s || '').trim().toLowerCase()

/**
 * Groups everything per person (how Copilot questions are usually asked: "prep my 1:1 with Ana"),
 * plus sections for records that aren't linked to a direct report. Interviews and accomplishments
 * are limited to the last `months`; follow-ups are open ones only; notes are non-archived ones.
 */
export function buildExportModel(data, options = {}, today = localDateStr()) {
  const opt = { ...DEFAULT_EXPORT_OPTIONS, ...options }
  const since = monthsBefore(today, opt.months)
  const types = new Set(opt.interviewTypes || [])

  const allPeople = data.people || []
  const people = allPeople
    .filter((p) => opt.includeInactive || (p.status || 'active') === 'active')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

  // Link records by personId, falling back to a case-insensitive name match (older interviews
  // only stored the name — same rule as PersonDetail.jsx / cadence.js).
  const idByName = new Map(allPeople.map((p) => [lc(p.name), p.id]))
  const ownerOf = (r, nameField) => r.personId || idByName.get(lc(r[nameField])) || null

  const interviews = !opt.interviews ? [] : (data.interviews || [])
    .filter((i) => types.has(i.type || '1:1'))
    .filter((i) => i.date && i.date >= since && i.date <= today) // future = scheduled, not held
    .sort(byDateDesc('date'))
  const followUps = !opt.followUps ? [] : (data.followUps || [])
    .filter((f) => !f.done)
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
  const accomplishments = !opt.accomplishments ? [] : (data.accomplishments || [])
    .filter((a) => (a.date || `${a.month || ''}-01`) >= since)
    .sort(byDateDesc('date'))

  const exported = new Set(people.map((p) => p.id))
  const persons = people.map((p) => {
    const ivs = interviews.filter((i) => ownerOf(i, 'person') === p.id)
    const last11 = (data.interviews || []).filter((i) => (i.type || '1:1') === '1:1' && ownerOf(i, 'person') === p.id && i.date && i.date <= today).sort(byDateDesc('date'))[0]
    return {
      name: p.name || '(no name)',
      facts: opt.people ? [
        ['Role', p.role], ['Team', p.team], ['Level', p.level], ['Location', p.location],
        ['Status', p.status || 'active'], ['Start date', p.startDate], ['Birthday', p.birthday && (fmtBirthdayLabel(p.birthday) || p.birthday)], ['Email', p.email],
        ['Last 1:1', last11?.date],
      ].filter(([, v]) => v) : [],
      notes: opt.people ? (p.notes || '') : '',
      followUps: followUps.filter((f) => ownerOf(f, 'personName') === p.id),
      accomplishments: accomplishments.filter((a) => a.assigneeType !== 'team' && ownerOf(a, 'personName') === p.id),
      interviews: ivs,
    }
  })

  // Anything not tied to an exported person: other conversations (externals, inactive people when
  // they're excluded…), unlinked follow-ups, team-level accomplishments.
  const isOther = (owner) => !owner || !exported.has(owner)
  const inactiveIds = new Set(allPeople.filter((p) => !exported.has(p.id)).map((p) => p.id))
  return {
    generatedOn: today,
    since,
    options: opt,
    persons,
    otherInterviews: interviews.filter((i) => isOther(ownerOf(i, 'person')) && !inactiveIds.has(ownerOf(i, 'person'))),
    otherFollowUps: followUps.filter((f) => isOther(ownerOf(f, 'personName')) && !inactiveIds.has(ownerOf(f, 'personName'))),
    teamAccomplishments: accomplishments.filter((a) => a.assigneeType === 'team'),
    notes: !opt.notes ? [] : (data.notes || []).filter((n) => !n.archived)
      .sort((a, b) => (b.pinned === true) - (a.pinned === true) || byDateDesc('updatedAt')(a, b)),
  }
}

export function exportCounts(model) {
  return {
    people: model.persons.length,
    interviews: model.persons.reduce((s, p) => s + p.interviews.length, 0) + model.otherInterviews.length,
    followUps: model.persons.reduce((s, p) => s + p.followUps.length, 0) + model.otherFollowUps.length,
    accomplishments: model.persons.reduce((s, p) => s + p.accomplishments.length, 0) + model.teamAccomplishments.length,
    notes: model.notes.length,
  }
}

// ── Word document ────────────────────────────────────────────────────────────────────────────
function fmtDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || ''
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Builds the .docx and returns it as a Blob (browser) — or a Buffer when `asBuffer` (Node/tests). */
export async function buildExportDocx(model, { asBuffer = false } = {}) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')

  const out = []
  const h = (text, level) => out.push(new Paragraph({ text, heading: level, spacing: { before: 240, after: 80 } }))
  const p = (runs, opts = {}) => out.push(new Paragraph({ children: Array.isArray(runs) ? runs : [new TextRun(String(runs))], spacing: { after: 60 }, ...opts }))
  const label = (k, v) => p([new TextRun({ text: `${k}: `, bold: true }), new TextRun(String(v))])
  const bullet = (runs) => p(runs, { bullet: { level: 0 } })
  // Multi-line text (summaries, notes) → one paragraph per line, bullets kept as written.
  const textBlock = (text, prefix) => {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
    lines.forEach((line, i) => p(i === 0 && prefix
      ? [new TextRun({ text: `${prefix}: `, bold: true }), new TextRun(line)]
      : [new TextRun(line)]))
  }
  const followUpRun = (f) => [
    new TextRun(f.text || ''),
    ...(f.dueDate ? [new TextRun({ text: ` — due ${fmtDate(f.dueDate)}`, italics: true })] : []),
    ...(f.sourceTitle ? [new TextRun({ text: ` (from ${f.sourceTitle})`, italics: true })] : []),
  ]
  const interview = (i, withPerson) => {
    const type = INTERVIEW_TYPES[i.type] || i.type || '1:1'
    h(`${fmtDate(i.date)} — ${type}${i.title ? ` — ${i.title}` : ''}${withPerson && i.person ? ` — ${i.person}` : ''}`, HeadingLevel.HEADING_3)
    if (i.faceToFace) p([new TextRun({ text: 'Face-to-face meeting', italics: true })])
    if (i.summary) textBlock(i.summary, 'Notes')
    if (i.takeaways) textBlock(i.takeaways, 'Key takeaways')
    if (i.tags) label('Topics', i.tags)
  }

  // Header + reading guide. The guide is written for Copilot as much as for a human reader.
  out.push(new Paragraph({ text: 'PeopleOS export for Copilot', heading: HeadingLevel.TITLE }))
  p(`Generated ${fmtDate(model.generatedOn)} from PeopleOS. Conversations and accomplishments cover ${fmtDate(model.since)} – ${fmtDate(model.generatedOn)}; follow-ups are the open ones on that day.`)
  p([new TextRun({ text: 'Confidential: ', bold: true }), new TextRun('a people leader\'s private management notes about individual employees. Interview notes are the manager\'s own notes, not quotes from the employee. This file is a snapshot and is replaced on every export; PeopleOS remains the source of truth.')])

  h('Team', HeadingLevel.HEADING_1)
  if (!model.persons.length) p('No direct reports in this export.')
  for (const person of model.persons) {
    h(person.name, HeadingLevel.HEADING_2)
    for (const [k, v] of person.facts) label(k, k === 'Start date' || k === 'Last 1:1' ? fmtDate(v) : v)
    if (person.notes) textBlock(person.notes, 'Profile notes')
    if (model.options.followUps) {
      p([new TextRun({ text: 'Open follow-ups:', bold: true }), ...(person.followUps.length ? [] : [new TextRun(' none')])])
      person.followUps.forEach((f) => bullet(followUpRun(f)))
    }
    if (model.options.accomplishments && person.accomplishments.length) {
      p([new TextRun({ text: 'Accomplishments:', bold: true })])
      person.accomplishments.forEach((a) => bullet([new TextRun({ text: `${fmtDate(a.date) || a.month}: `, bold: true }), new TextRun((a.text || '').replace(/\n+/g, ' '))]))
    }
    if (model.options.interviews) {
      p([new TextRun({ text: `Conversations (${person.interviews.length}):`, bold: true }), ...(person.interviews.length ? [] : [new TextRun(' none in this period')])])
      person.interviews.forEach((i) => interview(i, false))
    }
  }

  if (model.otherInterviews.length) {
    h('Other conversations', HeadingLevel.HEADING_1)
    p('Conversations not linked to a current direct report (for example candidates or other colleagues).')
    model.otherInterviews.forEach((i) => interview(i, true))
  }
  if (model.otherFollowUps.length) {
    h('Other open follow-ups', HeadingLevel.HEADING_1)
    model.otherFollowUps.forEach((f) => bullet([...(f.personName ? [new TextRun({ text: `${f.personName}: `, bold: true })] : []), ...followUpRun(f)]))
  }
  if (model.teamAccomplishments.length) {
    h('Team accomplishments', HeadingLevel.HEADING_1)
    model.teamAccomplishments.forEach((a) => bullet([new TextRun({ text: `${a.team || 'Team'}, ${fmtDate(a.date) || a.month}: `, bold: true }), new TextRun((a.text || '').replace(/\n+/g, ' '))]))
  }
  if (model.notes.length) {
    h('Notes', HeadingLevel.HEADING_1)
    for (const n of model.notes) {
      h(`${n.pinned ? '📌 ' : ''}${n.title || 'Untitled note'}`, HeadingLevel.HEADING_3)
      textBlock(n.body)
    }
  }

  const doc = new Document({
    creator: 'PeopleOS',
    title: 'PeopleOS export for Copilot',
    description: 'Snapshot of PeopleOS data for Microsoft 365 Copilot',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: out }],
  })
  return asBuffer ? Packer.toBuffer(doc) : Packer.toBlob(doc)
}
