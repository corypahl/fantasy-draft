const fields = {
  enabled: document.getElementById('enabled'),
  publishToApi: document.getElementById('publishToApi'),
  apiUrl: document.getElementById('apiUrl'),
  ingestToken: document.getElementById('ingestToken'),
  draftId: document.getElementById('draftId'),
  leagueId: document.getElementById('leagueId'),
  leagueName: document.getElementById('leagueName'),
  totalTeams: document.getElementById('totalTeams'),
  totalRounds: document.getElementById('totalRounds'),
  teamNames: document.getElementById('teamNames')
}

let latestStatus

function relativeTime(value) {
  if (!value) return 'Never'
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 5) return 'Now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.round(seconds / 60)}m ago`
}

function renderStatus(status) {
  latestStatus = status
  const dot = document.getElementById('statusDot')
  dot.className = status?.state === 'error' || status?.state === 'partial' ? 'error' : status?.enabled && status?.lastSentAt ? 'live' : ''
  document.getElementById('statusTitle').textContent = status?.state === 'error'
    ? 'Needs attention'
    : status?.state === 'partial' ? 'Partial draft history'
    : status?.enabled ? 'Bridge enabled' : 'Preview mode'
  document.getElementById('statusMessage').textContent = status?.message || 'Open the ESPN draft room to preview its picks.'
  document.getElementById('pickCount').textContent = String(status?.pickCount || 0)
  document.getElementById('candidateCount').textContent = String(status?.candidateCount || 0)
  document.getElementById('lastScan').textContent = relativeTime(status?.lastScanAt)
}

function populate(config) {
  fields.enabled.checked = Boolean(config.enabled)
  fields.publishToApi.checked = Boolean(config.publishToApi)
  fields.apiUrl.value = config.apiUrl || ''
  fields.ingestToken.value = config.ingestToken || ''
  fields.draftId.value = config.draftId || 'gvsu-draft'
  fields.leagueId.value = config.leagueId || 'gvsu'
  fields.leagueName.value = config.leagueName || 'GVSU'
  fields.totalTeams.value = String(config.totalTeams || 10)
  fields.totalRounds.value = String(config.totalRounds || 16)
  fields.teamNames.value = Array.isArray(config.teamNames) ? config.teamNames.join('\n') : ''
}

function readConfig() {
  return {
    enabled: fields.enabled.checked,
    publishToApi: fields.publishToApi.checked,
    apiUrl: fields.apiUrl.value.trim(),
    ingestToken: fields.ingestToken.value.trim(),
    draftId: fields.draftId.value.trim() || 'gvsu-draft',
    leagueId: fields.leagueId.value.trim() || 'gvsu',
    leagueName: fields.leagueName.value.trim() || 'GVSU',
    totalTeams: Math.max(2, Number(fields.totalTeams.value) || 10),
    totalRounds: Math.max(1, Number(fields.totalRounds.value) || 16),
    teamNames: fields.teamNames.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  }
}

async function scanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.startsWith('https://fantasy.espn.com/')) {
    renderStatus({ ...latestStatus, state: 'error', message: 'Open the ESPN draft room, then click Rescan.' })
    return
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_ESPN_DRAFT_NOW' })
    window.setTimeout(refresh, 400)
  } catch {
    renderStatus({ ...latestStatus, state: 'error', message: 'Reload the ESPN draft page once after installing the extension.' })
  }
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_CONFIG' })
  populate(response.config || {})
  renderStatus(response.status || {})
}

document.getElementById('saveButton').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SAVE_BRIDGE_CONFIG', config: readConfig() })
  await scanActiveTab()
})

document.getElementById('scanButton').addEventListener('click', scanActiveTab)

document.getElementById('diagnosticsButton').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_STATUS' })
  const diagnostics = JSON.stringify({ status: response.bridgeStatus, draft: response.latestEspnDraft }, null, 2)
  await navigator.clipboard.writeText(diagnostics)
  document.getElementById('diagnosticsButton').textContent = 'Copied'
})

void refresh()
