const DEFAULT_CONFIG = {
  enabled: false,
  publishToApi: false,
  apiUrl: 'https://dqen8hccb0.execute-api.us-east-1.amazonaws.com',
  ingestToken: '',
  draftId: 'gvsu-draft',
  leagueId: 'gvsu',
  leagueName: 'GVSU',
  totalTeams: 10,
  totalRounds: 16,
  teamNames: []
}

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.storage.local.setAccessLevel) {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  }
  const stored = await chrome.storage.local.get('bridgeConfig')
  await chrome.storage.local.set({ bridgeConfig: { ...DEFAULT_CONFIG, ...(stored.bridgeConfig || {}) } })
})

async function getConfig() {
  const stored = await chrome.storage.local.get('bridgeConfig')
  return { ...DEFAULT_CONFIG, ...(stored.bridgeConfig || {}) }
}

function normalizedTeamNames(snapshot, config, totalTeams) {
  if (Array.isArray(snapshot.teamNames) && snapshot.teamNames.length === totalTeams) return snapshot.teamNames
  if (Array.isArray(config.teamNames) && config.teamNames.length === totalTeams) return config.teamNames
  return Array.from({ length: totalTeams }, (_, index) => `Team ${index + 1}`)
}

function buildDraft(snapshot, config) {
  const totalTeams = Math.max(2, Number(snapshot.totalTeams) || snapshot.teamNames?.length || Number(config.totalTeams) || 10)
  const totalRounds = Math.max(1, Number(snapshot.totalRounds) || Number(config.totalRounds) || 16)
  const teamNames = normalizedTeamNames(snapshot, config, totalTeams)
  const drafted = snapshot.picks.map((pick) => ({
    ...pick,
    teamName: teamNames[pick.slot - 1] || pick.teamName || `Team ${pick.slot}`
  }))
  const latestPick = drafted.reduce((maximum, pick) => Math.max(maximum, Number(pick.pick) || 0), 0)
  return {
    id: config.draftId,
    leagueId: config.leagueId,
    currentPick: latestPick + 1,
    drafted,
    teamNames,
    source: 'espn',
    sessionType: 'live',
    status: snapshot.status,
    totalRounds,
    leagueName: config.leagueName,
    lastSyncedAt: snapshot.capturedAt
  }
}

async function relayToDraftWizard(draft, status) {
  const tabs = await chrome.tabs.query({
    url: [
      'https://corypahl.github.io/fantasy-draft/*',
      'http://localhost/*',
      'http://127.0.0.1/*'
    ]
  })
  await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, {
    type: 'ESPN_BRIDGE_DRAFT',
    draft,
    status
  }).catch(() => undefined)))
  return tabs.length
}

async function publishDraft(draft, config, capturedAt) {
  if (!config.publishToApi) return { state: 'local', message: 'Live in open Draft Wizard tabs' }
  if (!config.ingestToken) return { state: 'error', message: 'Cloud publishing needs an ingestion token' }
  const apiUrl = config.apiUrl.replace(/\/$/, '')
  const response = await fetch(`${apiUrl}/drafts/${encodeURIComponent(config.draftId)}/ingest`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Draft-Token': config.ingestToken
    },
    body: JSON.stringify({ draft, sourceUpdatedAt: capturedAt })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `Draft API returned ${response.status}`)
  return { state: 'cloud', message: `Published ${payload.pickCount ?? draft.drafted.length} picks` }
}

async function handleSnapshot(snapshot) {
  const config = await getConfig()
  const draft = buildDraft(snapshot, config)
  const baseStatus = {
    activePage: snapshot.pageUrl,
    candidateCount: snapshot.diagnostics?.candidateCount || 0,
    detectedLeagueId: snapshot.detectedLeagueId,
    diagnostics: snapshot.diagnostics,
    enabled: config.enabled,
    lastScanAt: snapshot.capturedAt,
    pickCount: draft.drafted.length
  }
  if (!config.enabled) {
    const status = { ...baseStatus, state: 'preview', message: `Preview found ${draft.drafted.length} picks` }
    await chrome.storage.local.set({ bridgeStatus: status, latestEspnDraft: draft })
    return status
  }

  const tabCount = await relayToDraftWizard(draft, baseStatus)
  try {
    const published = await publishDraft(draft, config, snapshot.capturedAt)
    const status = {
      ...baseStatus,
      ...published,
      lastSentAt: new Date().toISOString(),
      message: draft.drafted.length === 0 && snapshot.diagnostics?.apiError
        ? snapshot.diagnostics.apiError
        : config.publishToApi ? published.message : `Updated ${tabCount} open Draft Wizard tab${tabCount === 1 ? '' : 's'}`
    }
    await chrome.storage.local.set({ bridgeStatus: status, latestEspnDraft: draft })
    return status
  } catch (error) {
    const status = {
      ...baseStatus,
      state: 'error',
      lastSentAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error)
    }
    await chrome.storage.local.set({ bridgeStatus: status, latestEspnDraft: draft })
    return status
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_BRIDGE_CONFIG') {
    void Promise.all([getConfig(), chrome.storage.local.get('bridgeStatus')])
      .then(([config, stored]) => sendResponse({ config, status: stored.bridgeStatus }))
    return true
  }
  if (message?.type === 'SAVE_BRIDGE_CONFIG') {
    const nextConfig = { ...DEFAULT_CONFIG, ...(message.config || {}) }
    void chrome.storage.local.set({ bridgeConfig: nextConfig }).then(() => sendResponse({ ok: true, config: nextConfig }))
    return true
  }
  if (message?.type === 'GET_BRIDGE_STATUS') {
    void chrome.storage.local.get(['bridgeStatus', 'latestEspnDraft']).then((stored) => sendResponse(stored))
    return true
  }
  if (message?.type === 'GET_LATEST_ESPN_DRAFT') {
    void Promise.all([getConfig(), chrome.storage.local.get(['bridgeStatus', 'latestEspnDraft'])])
      .then(([config, stored]) => sendResponse({ enabled: config.enabled, draft: stored.latestEspnDraft, status: stored.bridgeStatus }))
    return true
  }
  if (message?.type === 'ESPN_DRAFT_SNAPSHOT') {
    void handleSnapshot(message.snapshot).then((status) => sendResponse({ ok: true, status }))
    return true
  }
  if (message?.type === 'ESPN_DRAFT_SCAN_ERROR') {
    void chrome.storage.local.set({
      bridgeStatus: {
        state: 'error',
        message: message.error,
        activePage: message.pageUrl,
        lastScanAt: new Date().toISOString()
      }
    }).then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})
