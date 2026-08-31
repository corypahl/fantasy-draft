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

function getSourceDraftKey(pageUrl, detectedLeagueId) {
  try {
    const url = new URL(pageUrl)
    const leagueId = url.searchParams.get('leagueId') || detectedLeagueId || ''
    const seasonId = url.searchParams.get('seasonId') || ''
    return leagueId ? `espn:${seasonId}:${leagueId}` : undefined
  } catch {
    return detectedLeagueId ? `espn::${detectedLeagueId}` : undefined
  }
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
    lastSyncedAt: snapshot.capturedAt,
    sourceDraftKey: getSourceDraftKey(snapshot.pageUrl, snapshot.detectedLeagueId)
  }
}

function mergeDraftHistory(previousDraft, incomingDraft, previousStatus, snapshot) {
  if (!previousDraft || previousDraft.source !== 'espn') return incomingDraft
  if (previousDraft.id !== incomingDraft.id || previousDraft.leagueId !== incomingDraft.leagueId) return incomingDraft

  const previousKey = previousDraft.sourceDraftKey
    || getSourceDraftKey(previousStatus?.activePage, previousStatus?.detectedLeagueId)
  const incomingKey = incomingDraft.sourceDraftKey
    || getSourceDraftKey(snapshot?.pageUrl, snapshot?.detectedLeagueId)
  if (previousKey && incomingKey && previousKey !== incomingKey) return incomingDraft

  const incomingPicks = Array.isArray(incomingDraft.drafted) ? incomingDraft.drafted : []
  const previousPicks = Array.isArray(previousDraft.drafted) ? previousDraft.drafted : []
  const firstIncomingPick = incomingPicks.reduce((minimum, pick) => Math.min(minimum, Number(pick.pick) || Infinity), Infinity)

  // If either snapshot predates source IDs, a scan beginning at pick 1 is the
  // safest signal that a fresh draft has started. Identified snapshots can be
  // merged because ESPN only runs one draft per league and season.
  if ((!previousKey || !incomingKey) && firstIncomingPick === 1) return incomingDraft

  const picksByNumber = new Map()
  previousPicks.forEach((pick) => {
    const pickNumber = Number(pick.pick)
    if (Number.isInteger(pickNumber) && pickNumber > 0) picksByNumber.set(pickNumber, pick)
  })
  incomingPicks.forEach((pick) => {
    const pickNumber = Number(pick.pick)
    if (Number.isInteger(pickNumber) && pickNumber > 0) picksByNumber.set(pickNumber, pick)
  })
  const drafted = [...picksByNumber.values()].sort((a, b) => Number(a.pick) - Number(b.pick))
  const latestPick = drafted.reduce((maximum, pick) => Math.max(maximum, Number(pick.pick) || 0), 0)
  const totalPicks = incomingDraft.teamNames.length * incomingDraft.totalRounds
  const status = drafted.length >= totalPicks
    ? 'complete'
    : incomingDraft.status === 'pre_draft' && drafted.length ? 'drafting' : incomingDraft.status

  return {
    ...previousDraft,
    ...incomingDraft,
    currentPick: latestPick + 1,
    drafted,
    status,
    sourceDraftKey: incomingKey || previousKey
  }
}

function getMissingPickNumbers(drafted) {
  const pickNumbers = new Set(drafted.map((pick) => Number(pick.pick)).filter((pick) => Number.isInteger(pick) && pick > 0))
  const latestPick = Math.max(0, ...pickNumbers)
  const missing = []
  for (let pick = 1; pick <= latestPick; pick += 1) {
    if (!pickNumbers.has(pick)) missing.push(pick)
  }
  return missing
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
  const stored = await chrome.storage.local.get(['bridgeStatus', 'latestEspnDraft'])
  const incomingDraft = buildDraft(snapshot, config)
  const draft = mergeDraftHistory(stored.latestEspnDraft, incomingDraft, stored.bridgeStatus, snapshot)
  const recoveredPickCount = Math.max(0, draft.drafted.length - incomingDraft.drafted.length)
  const missingPickNumbers = getMissingPickNumbers(draft.drafted)
  const historyWarning = missingPickNumbers.length
    ? `Missing ${missingPickNumbers.length} earlier pick${missingPickNumbers.length === 1 ? '' : 's'} (starting with #${missingPickNumbers[0]}). Open Pick History in ESPN, then click Rescan.`
    : undefined
  const baseStatus = {
    activePage: snapshot.pageUrl,
    candidateCount: snapshot.diagnostics?.candidateCount || 0,
    detectedLeagueId: snapshot.detectedLeagueId,
    diagnostics: snapshot.diagnostics,
    enabled: config.enabled,
    lastScanAt: snapshot.capturedAt,
    pickCount: draft.drafted.length,
    recoveredPickCount,
    missingPickCount: missingPickNumbers.length
  }
  if (!config.enabled) {
    const status = { ...baseStatus, state: historyWarning ? 'partial' : 'preview', message: historyWarning || `Preview found ${draft.drafted.length} picks` }
    await chrome.storage.local.set({ bridgeStatus: status, latestEspnDraft: draft })
    return status
  }

  const relayStatus = historyWarning
    ? { ...baseStatus, state: 'partial', message: historyWarning }
    : baseStatus
  const tabCount = await relayToDraftWizard(draft, relayStatus)
  try {
    const published = await publishDraft(draft, config, snapshot.capturedAt)
    const status = {
      ...baseStatus,
      ...published,
      state: historyWarning ? 'partial' : published.state,
      lastSentAt: new Date().toISOString(),
      message: historyWarning || (draft.drafted.length === 0 && snapshot.diagnostics?.apiError
        ? snapshot.diagnostics.apiError
        : config.publishToApi
          ? published.message
          : recoveredPickCount
            ? `Updated ${tabCount} Draft Wizard tab${tabCount === 1 ? '' : 's'} and restored ${recoveredPickCount} earlier pick${recoveredPickCount === 1 ? '' : 's'}`
            : `Updated ${tabCount} open Draft Wizard tab${tabCount === 1 ? '' : 's'}`)
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

globalThis.EspnDraftBridgeWorker = {
  buildDraft,
  getMissingPickNumbers,
  getSourceDraftKey,
  mergeDraftHistory
}
