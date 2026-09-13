/**
 * Microsoft Graph API — two-way sync of PeopleOS follow-ups with a "PeopleOS Follow-ups"
 * list in Microsoft To Do. This module only talks to Graph; the reconciliation logic
 * (deciding whether a given follow-up should push, pull, or get imported) lives in
 * FollowUps.jsx, per this repo's "page components own their data" convention.
 *
 * Token: get a temporary access token from https://developer.microsoft.com/graph/graph-explorer
 * (sign in → click avatar → Access token), then paste it on the Settings page.
 * Tokens expire after ~1 hour — refresh from Graph Explorer and update it there when
 * sync stops working.
 */
import { getMsGraphToken } from './settings.js'

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
