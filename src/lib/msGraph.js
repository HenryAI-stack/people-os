/**
 * Microsoft Graph API — two-way sync of PeopleOS follow-ups with a "PeopleOS Follow-ups"
 * list in Microsoft To Do, plus the Work Schedule's "Upload to SharePoint" (bottom of file). This module only talks to Graph; the reconciliation logic
 * (deciding whether a given follow-up should push, pull, or get imported) lives in
 * FollowUps.jsx, per this repo's "page components own their data" convention.
 *
 * Token: get a temporary access token from https://developer.microsoft.com/graph/graph-explorer
 * (sign in → click avatar → Access token), then paste it on the Settings page.
 * Tokens expire after ~1 hour — refresh from Graph Explorer and update it there when
 * sync stops working.
 */
import { getMsGraphToken, getMsGraphTokenInfo, tokenHasAnyScope, SHAREPOINT_WRITE_SCOPES } from './settings.js'

const BASE    = 'https://graph.microsoft.com/v1.0/me/todo'
const LIST_NAME = 'PeopleOS Follow-ups'

function authHeaders() {
  const token = getMsGraphToken()
  if (!token) throw new Error('No Microsoft Graph token set. Add one on the Settings page.')
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Finds or creates the "PeopleOS Follow-ups" task list and returns its id. */
async function getOrCreateList() {
  // Fetch all lists
  const res = await fetch(`${BASE}/lists`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
  if (!res.ok) throw new Error(`Graph API error (${res.status})`)

  const data  = await res.json()
  const lists = data.value || []
  const existing = lists.find((l) => l.displayName === LIST_NAME)
  if (existing) return existing.id

  // Create the list if it doesn't exist
  const create = await fetch(`${BASE}/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ displayName: LIST_NAME }),
  })
  if (!create.ok) throw new Error(`Could not create task list (${create.status})`)
  const newList = await create.json()
  return newList.id
}

/**
 * Syncs a single follow-up to Microsoft To Do.
 * - Creates a new task if msTaskId is not set
 * - Updates the existing task if msTaskId is already set
 * Returns the msTaskId to store back on the record.
 */
export async function syncFollowUpToOutlook(followUp) {
  const listId = await getOrCreateList()

  const body = {
    title: followUp.text,
    importance: 'normal',
    ...(followUp.dueDate ? {
      dueDateTime: {
        dateTime: `${followUp.dueDate}T00:00:00`,
        timeZone: 'UTC',
      },
    } : {}),
    body: {
      contentType: 'text',
      content: [
        followUp.personName ? `Person: ${followUp.personName}` : '',
        followUp.sourceTitle ? `Source: ${followUp.sourceTitle}` : '',
        'Created in PeopleOS',
      ].filter(Boolean).join('\n'),
    },
    ...(followUp.done ? { status: 'completed' } : { status: 'notStarted' }),
  }

  // Update existing task
  if (followUp.msTaskId) {
    const res = await fetch(`${BASE}/lists/${listId}/tasks/${followUp.msTaskId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    if (res.status === 404) {
      // Task was deleted in Outlook — create a new one
      return createTask(listId, body)
    }
    if (res.status === 401) throw new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
    if (!res.ok) throw new Error(`Could not update task (${res.status})`)
    return followUp.msTaskId
  }

  // Create new task
  return createTask(listId, body)
}

async function createTask(listId, body) {
  const res = await fetch(`${BASE}/lists/${listId}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
  if (!res.ok) throw new Error(`Could not create task (${res.status})`)
  const task = await res.json()
  return task.id
}

/**
 * Lists every task currently in the "PeopleOS Follow-ups" list (paginating through
 * @odata.nextLink), normalized to just what FollowUps.jsx needs to reconcile state.
 */
export async function listOutlookTasks() {
  const listId = await getOrCreateList()
  const tasks = []
  let url = `${BASE}/lists/${listId}/tasks?$top=100`

  while (url) {
    const res = await fetch(url, { headers: authHeaders() })
    if (res.status === 401) throw new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
    if (!res.ok) throw new Error(`Graph API error (${res.status})`)
    const data = await res.json()
    for (const t of data.value || []) {
      tasks.push({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDateTime?.dateTime ? t.dueDateTime.dateTime.slice(0, 10) : '',
        lastModifiedDateTime: t.lastModifiedDateTime,
      })
    }
    url = data['@odata.nextLink'] || null
  }
  return tasks
}

/**
 * Deletes a task from the "PeopleOS Follow-ups" list. Called when a linked follow-up is
 * deleted in PeopleOS, so it doesn't get pulled back in as an "Outlook-only" task on the
 * next sync. Missing tasks (already deleted on the Outlook side) are not an error.
 */
export async function deleteOutlookTask(taskId) {
  const listId = await getOrCreateList()
  const res = await fetch(`${BASE}/lists/${listId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 401) throw new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete task (${res.status})`)
}

// ── SharePoint upload (Work Schedule → "Upload to SharePoint") ───────────────────────────────
// Same Graph Explorer token as the To Do sync, but it additionally needs a SharePoint write
// permission consented in Graph Explorer ("Modify permissions"): Sites.ReadWrite.All or
// Files.ReadWrite.All. Without it, Graph answers 403 and we say exactly that.
const GRAPH = 'https://graph.microsoft.com/v1.0'

function graphError(status, what) {
  if (status === 401) return new Error('Microsoft token has expired. Get a fresh one from Graph Explorer and update it on the Settings page.')
  if (status === 403) {
    // Tell "the token lacks the permission" apart from "your account lacks rights on the site".
    const info = getMsGraphTokenInfo()
    if (info && !tokenHasAnyScope(info, SHAREPOINT_WRITE_SCOPES)) {
      return new Error(`Your Microsoft token doesn't include SharePoint write permission, so it can't ${what}. In Graph Explorer, check that Sites.ReadWrite.All shows as consented (greyed out with consent type "AllPrincipals" means an admin already granted it), sign out and back in to Graph Explorer, then copy a fresh token to the Settings page — it shows which permissions the token has.`)
    }
    return new Error(`Microsoft refused to ${what} even though your token includes SharePoint write permission — your account probably doesn't have edit rights on that SharePoint site/folder. Ask a site owner for Edit (Member) access.`)
  }
  if (status === 404) return new Error(what === 'read the SharePoint site'
    ? 'SharePoint site not found — check the site address, and that your account has access to it.'
    : `Not found on SharePoint while trying to ${what}.`)
  if (status === 423) return new Error('The file is locked on SharePoint (probably open for editing). Close it and try again.')
  return new Error(`Graph API error (${status}) while trying to ${what}.`)
}

/**
 * Uploads (or replaces) one file in a SharePoint site's default document library
 * ("Shared Documents"). `siteUrl` is the site address, e.g. https://contoso.sharepoint.com/sites/Team;
 * `folder` is an optional path inside the library ('' = library root). Replacing an existing file
 * keeps the old one in SharePoint's version history.
 * Returns { name, webUrl, replaced, driveId, itemId }.
 */
function graphAuth() {
  const token = getMsGraphToken()
  if (!token) throw new Error('No Microsoft Graph token set. Add one on the Settings page.')
  return { Authorization: `Bearer ${token}` }
}

// Site URL → Graph site id. Cached: the id never changes, and a pre-upload existence check plus the
// upload itself would otherwise look the site up twice.
const _siteIds = new Map()
async function resolveSiteId(siteUrl, auth) {
  if (_siteIds.has(siteUrl)) return _siteIds.get(siteUrl)
  const u = new URL(siteUrl)
  const sitePath = decodeURIComponent(u.pathname).replace(/\/+$/, '')
  const siteRes = await fetch(`${GRAPH}/sites/${u.hostname}:${encodeURI(sitePath)}?$select=id,webUrl`, { headers: auth })
  if (!siteRes.ok) throw graphError(siteRes.status, 'read the SharePoint site')
  const { id } = await siteRes.json()
  _siteIds.set(siteUrl, id)
  return id
}

function libraryPath(folder, filename) {
  return [...folder.split('/'), filename].filter(Boolean).map(encodeURIComponent).join('/')
}

/**
 * Is there already a file at folder/filename in the site's Shared Documents? Returns null when not,
 * else { name, webUrl, lastModified (Date|null), lastModifiedBy } — used to ask before replacing.
 */
export async function findSharePointFile({ siteUrl, folder = '', filename }) {
  const auth = graphAuth()
  const siteId = await resolveSiteId(siteUrl, auth)
  const res = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${libraryPath(folder, filename)}?$select=name,webUrl,lastModifiedDateTime,lastModifiedBy`, { headers: auth })
  if (res.status === 404) return null
  if (!res.ok) throw graphError(res.status, 'check SharePoint for an existing file')
  const item = await res.json()
  return {
    name: item.name,
    webUrl: item.webUrl,
    lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
    lastModifiedBy: item.lastModifiedBy?.user?.displayName || '',
  }
}

export async function uploadFileToSharePoint({ siteUrl, folder = '', filename, data, contentType }) {
  const auth = graphAuth()
  const siteId = await resolveSiteId(siteUrl, auth)
  const up = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${libraryPath(folder, filename)}:/content`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': contentType || 'application/octet-stream' },
    body: data,
  })
  if (!up.ok) throw graphError(up.status, 'upload files to SharePoint')
  const item = await up.json()
  // 201 = new file, 200 = replaced
  return { name: item.name, webUrl: item.webUrl, replaced: up.status === 200, driveId: item.parentReference?.driveId, itemId: item.id }
}

/**
 * Read-only check after an upload: can the site's "… Members" group edit this file?
 * Making uploads view-only for Members is a one-time *folder* setting in SharePoint (files inherit
 * it — see INSTALLATION.md). Graph can't reliably change inherited permissions per file, so this
 * only *verifies*. Returns { status: 'readOnly' | 'canEdit' | 'unknown', group? }. 'unknown' when the
 * permissions can't be read or the Members group isn't listed (e.g. the caller isn't a site owner,
 * so Graph shows them only part of the list). Never throws.
 */
export async function checkMembersAccess({ driveId, itemId }) {
  try {
    const token = getMsGraphToken()
    if (!token || !driveId || !itemId) return { status: 'unknown' }
    const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/permissions`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { status: 'unknown' }
    const perms = (await res.json()).value || []
    const members = perms.filter((p) => /members$/i.test(p.grantedToV2?.siteGroup?.displayName || ''))
    if (!members.length) return { status: 'unknown' }
    // SharePoint site-group roles via Graph: 'read' (Visitors-style), 'write' (Members by default), 'owner'.
    const canEdit = members.some((p) => (p.roles || []).some((r) => String(r).toLowerCase() !== 'read'))
    return { status: canEdit ? 'canEdit' : 'readOnly', group: members[0].grantedToV2.siteGroup.displayName }
  } catch {
    return { status: 'unknown' }
  }
}

// ── SharePoint "On-duty calendar" (updated together with "Upload to SharePoint") ──────────────
// The calendar the team opens is a *page* (SitePages/On-Duty-Calendar.aspx) showing a web part.
// We read that page through Graph to find which list the web part displays (Events web part or a
// List web part in calendar view — both are SharePoint lists, writable with the same
// Sites.ReadWrite.All token). A Group-calendar web part would need Group.ReadWrite.All instead, so
// that case is reported rather than guessed at. Fallback: a list on the site named like
// "On-duty …" or with the classic Events template.
const WP_EVENTS = '20745d7d-8581-4a6c-bf26-68279bc123fc'
const WP_GROUP_CALENDAR = '6676088b-e28e-4a90-b9cb-d0d0303cd2eb'
const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i

async function graphJson(path, auth, what, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...opts,
    headers: { ...auth, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  })
  if (!res.ok) throw graphError(res.status, what)
  return res.status === 204 ? null : res.json()
}

/** Every standard web part on a page's canvas: [{ type, title, properties }]. */
function pageWebParts(page) {
  const out = []
  const visit = (wps) => (wps || []).forEach((w) => out.push({ type: String(w.webPartType || '').toLowerCase(), title: w.data?.title || '', properties: w.data?.properties || {} }))
  for (const sec of page.canvasLayout?.horizontalSections || []) for (const col of sec.columns || []) visit(col.webparts)
  visit(page.canvasLayout?.verticalSection?.webparts)
  return out
}

/** First property value whose key looks like a list id (selectedListId, listId, …) and holds a GUID. */
function findListIdProp(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /list.?id$/i.test(k) && GUID.test(v)) return v.replace(/[{}]/g, '')
  }
  for (const v of Object.values(obj)) { const hit = findListIdProp(v, depth + 1); if (hit) return hit }
  return null
}

async function findOnDutyList(siteId, pageName, auth) {
  const seen = []
  // 1) The page's web part
  try {
    const pages = await graphJson(`/sites/${siteId}/pages/microsoft.graph.sitePage?$select=id,name,title&$top=200`, auth, 'read the site pages')
    const pg = (pages.value || []).find((p) => (p.name || '').toLowerCase() === pageName.toLowerCase())
    if (pg) {
      const page = await graphJson(`/sites/${siteId}/pages/${pg.id}/microsoft.graph.sitePage?$expand=canvasLayout`, auth, 'read the On-duty calendar page')
      const parts = pageWebParts(page)
      seen.push(`page web parts: ${parts.map((w) => w.title || w.type).join(', ') || 'none'}`)
      if (parts.some((w) => w.type === WP_GROUP_CALENDAR)) {
        throw new Error('The On-duty calendar page shows the Microsoft 365 group calendar. Updating that needs the Group.ReadWrite.All permission, which PeopleOS does not use yet.')
      }
      const wp = parts.find((w) => w.type === WP_EVENTS && findListIdProp(w.properties)) || parts.find((w) => findListIdProp(w.properties))
      if (wp) {
        const listId = findListIdProp(wp.properties)
        const list = await graphJson(`/sites/${siteId}/lists/${listId}?$select=id,displayName`, auth, 'read the On-duty calendar list')
        return { listId: list.id, listName: list.displayName }
      }
    } else seen.push(`page "${pageName}" not found`)
  } catch (e) {
    if (/group calendar/.test(e.message)) throw e
    seen.push(`page lookup failed (${e.message.slice(0, 60)})`)
  }
  // 2) Fallback: a list that looks like the on-duty calendar
  const lists = await graphJson(`/sites/${siteId}/lists?$select=id,displayName,list&$top=200`, auth, 'read the site lists')
  const all = lists.value || []
  const hit = all.find((l) => /on.?duty/i.test(l.displayName)) || all.find((l) => l.list?.template === 'events')
  if (hit) return { listId: hit.id, listName: hit.displayName }
  throw new Error(`Couldn't find the On-duty calendar's list (${seen.join('; ')}; lists: ${all.map((l) => l.displayName).join(', ') || 'none'}).`)
}

/** Which columns hold title / start / end / description / location / all-day for this list. */
async function calendarFieldMap(siteId, listId, auth) {
  const cols = (await graphJson(`/sites/${siteId}/lists/${listId}/columns?$top=200`, auth, 'read the calendar columns')).value || []
  const writable = cols.filter((c) => !c.readOnly && !c.hidden)
  const by = (name) => writable.find((c) => c.name === name)
  const dates = writable.filter((c) => c.dateTime && !['Created', 'Modified'].includes(c.name))
  const start = by('EventDate') || dates.find((c) => /start|begin|from/i.test(c.name + c.displayName)) || dates[0]
  const end = by('EndDate') || dates.find((c) => c !== start && /end|until|to\b|finish/i.test(c.name + c.displayName)) || dates.find((c) => c !== start)
  if (!start) throw new Error(`The On-duty calendar list has no date column to put shifts on (columns: ${writable.map((c) => c.displayName).join(', ')}).`)
  const desc = by('Description') || writable.find((c) => c.text?.allowMultipleLines)
  return {
    title: 'Title', start: start.name, end: end?.name || null,
    description: desc?.name || null, location: by('Location')?.name || null, allDay: by('fAllDayEvent')?.name || null,
  }
}

/** Runs Graph requests in $batch calls of 20, retrying throttled (429) ones. Returns the failed requests. */
async function graphBatch(requests, auth) {
  const failed = []
  for (let i = 0; i < requests.length; i += 20) {
    let chunk = requests.slice(i, i + 20).map((r, j) => ({ id: String(i + j), ...r }))
    for (let attempt = 0; chunk.length && attempt < 4; attempt++) {
      const res = await graphJson('/$batch', auth, 'update the On-duty calendar', { method: 'POST', body: JSON.stringify({ requests: chunk }) })
      const byId = Object.fromEntries((res.responses || []).map((r) => [r.id, r]))
      const throttled = chunk.filter((r) => byId[r.id]?.status === 429)
      chunk.filter((r) => !byId[r.id] || (byId[r.id].status >= 400 && byId[r.id].status !== 429)).forEach((r) => failed.push({ ...r, status: byId[r.id]?.status ?? 0 }))
      if (!throttled.length) break
      const wait = Math.min(10, Math.max(...throttled.map((r) => Number(byId[r.id].headers?.['Retry-After']) || 2)))
      await new Promise((ok) => setTimeout(ok, wait * 1000))
      chunk = throttled
      if (attempt === 3) throttled.forEach((r) => failed.push({ ...r, status: 429 }))
    }
  }
  return failed
}

/**
 * Replaces this month's PeopleOS entries in the On-duty calendar with `entries` (from
 * buildOnDutyEntries). Entries are recognized by `marker` in their description (or, if the list has
 * no description column, by their "Center: …" title within the month). Hand-made entries are kept.
 * Returns { listName, created, deleted, failed }.
 */
export async function syncOnDutyCalendar({ siteUrl, pageName, month, marker, entries }) {
  const auth = graphAuth()
  const siteId = await resolveSiteId(siteUrl, auth)
  const { listId, listName } = await findOnDutyList(siteId, pageName, auth)
  const f = await calendarFieldMap(siteId, listId, auth)

  // Existing PeopleOS entries for this month
  const select = [f.title, f.start, f.description].filter(Boolean).join(',')
  const mine = []
  let next = `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=${select})&$top=200`
  while (next) {
    const page = await graphJson(next, auth, 'read the On-duty calendar entries')
    for (const it of page.value || []) {
      const fl = it.fields || {}
      const isMine = f.description
        ? String(fl[f.description] || '').includes(marker)
        : /^(Bangalore|Warsaw|Mexico City): /.test(fl.Title || '') && String(fl[f.start] || '').slice(0, 7) === month
      if (isMine) mine.push(it.id)
    }
    next = page['@odata.nextLink'] || null
  }

  const base = `/sites/${siteId}/lists/${listId}/items`
  const deletes = mine.map((id) => ({ method: 'DELETE', url: `${base}/${id}` }))
  const creates = entries.map((e) => {
    const fields = { [f.title]: e.title, [f.start]: e.start }
    if (f.end) fields[f.end] = e.end
    if (f.description) fields[f.description] = e.description
    if (f.location) fields[f.location] = e.location
    if (f.allDay) fields[f.allDay] = false
    return { method: 'POST', url: base, headers: { 'Content-Type': 'application/json' }, body: { fields } }
  })
  const failedDeletes = await graphBatch(deletes, auth)
  const failedCreates = await graphBatch(creates, auth)
  return {
    listName,
    deleted: deletes.length - failedDeletes.length,
    created: creates.length - failedCreates.length,
    failed: failedDeletes.length + failedCreates.length,
  }
}
