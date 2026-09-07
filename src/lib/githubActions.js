/**
 * Triggers the "Accomplishments Email" GitHub Actions workflow on demand
 * (the same workflow the Thursday cron uses), so the actual Resend send
 * always happens server-side — never with an email-sending key in the
 * browser bundle.
 *
 * Token: a fine-grained PAT scoped to ONLY this repo with the single
 * permission "Actions: Read and write". Nothing broader — it can start a
 * workflow run, nothing else. Add it as VITE_GH_ACTIONS_TOKEN in GitHub
 * secrets. See INSTALLATION.md.
 */

// This app's own code repo (not the private data repo) — where the
// accomplishments-email.yml workflow lives. Change these if you've forked
// PeopleOS under a different owner/repo name.
const APP_OWNER = 'HenryAI-stack'
const APP_REPO  = 'people-os'
const WORKFLOW_FILE = 'accomplishments-email.yml'
const REF = 'main'

const TOKEN = import.meta.env.VITE_GH_ACTIONS_TOKEN

/** Fires the accomplishments email workflow for the given YYYY-MM month. */
export async function sendAccomplishmentsEmailNow(monthKey) {
  if (!TOKEN) throw new Error('VITE_GH_ACTIONS_TOKEN is not set. See INSTALLATION.md to enable manual sending.')

  const res = await fetch(
    `https://api.github.com/repos/${APP_OWNER}/${APP_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: REF, inputs: { force: 'true', month: monthKey } }),
    }
  )

  if (res.status === 401 || res.status === 403) throw new Error('GitHub Actions token is missing, expired, or lacks the "Actions: write" permission on this repo.')
  if (res.status === 404) throw new Error('Workflow not found — make sure accomplishments-email.yml is on the main branch.')
  if (!res.ok) throw new Error(`Could not start the workflow (${res.status}): ${await res.text()}`)
  // 204 No Content on success — GitHub's dispatch API doesn't return a run id.
}

/** Link to watch the run in the GitHub Actions UI. */
export const ACTIONS_URL = `https://github.com/${APP_OWNER}/${APP_REPO}/actions/workflows/${WORKFLOW_FILE}`
