/**
 * Microsoft Graph API — one-way push of PeopleOS follow-ups to Microsoft To Do.
 *
 * Token: get a temporary access token from https://developer.microsoft.com/graph/graph-explorer
 * (sign in → click avatar → Access token). Add as VITE_MS_GRAPH_TOKEN in GitHub secrets.
 * Tokens expire after ~1 hour — refresh from Graph Explorer when sync stops working.
 */

const BASE    = 'https://graph.microsoft.com/v1.0/me/todo'
const TOKEN   = import.meta.env.VITE_MS_GRAPH_TOKEN
const LIST_NAME = 'PeopleOS Follow-ups'

function authHeaders() {
  if (!TOKEN) throw new Error('VITE_MS_GRAPH_TOKEN is not set. Add it in GitHub secrets.')
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  }
}

/** Finds or creates the "PeopleOS Follow-ups" task list and returns its id. */
async function getOrCreateList() {
  // Fetch all lists
  const res = await fetch(`${BASE}/lists`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('Microsoft token has expired. Refresh it from Graph Explorer.')
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
    if (res.status === 401) throw new Error('Microsoft token has expired. Refresh it from Graph Explorer.')
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
  if (res.status === 401) throw new Error('Microsoft token has expired. Refresh it from Graph Explorer.')
  if (!res.ok) throw new Error(`Could not create task (${res.status})`)
  const task = await res.json()
  return task.id
}
