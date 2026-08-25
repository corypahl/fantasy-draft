(function attachEspnDraftParser(globalScope) {
  const POSITION_PATTERN = '(QB|RB|WR|TE|K|D\\/?ST|DST|DEF)'
  const TEAM_PATTERN = '([A-Z]{2,3})'
  const PICK_ROW_SELECTORS = [
    '[data-testid*="draft-pick"]',
    '[data-testid*="draft-result"]',
    '[data-testid*="pick-history"] [role="row"]',
    '[data-testid*="pick-history"] li',
    '[class*="pickHistory"] [role="row"]',
    '[class*="pickHistory"] li',
    '[class*="PickHistory"] [role="row"]',
    '[class*="PickHistory"] li',
    '[class*="draftResults"] [role="row"]',
    '[class*="draftResults"] li',
    '[class*="DraftResults"] [role="row"]',
    '[class*="DraftResults"] li',
    '[class*="draftLog"] [role="row"]',
    '[class*="draftLog"] li',
    '[class*="DraftLog"] [role="row"]',
    '[class*="DraftLog"] li',
    '[class*="recentPicks"] > *',
    '[class*="RecentPicks"] > *'
  ]
  const FALLBACK_ROW_SELECTOR = 'tr, li, [role="row"], [class*="pick"], [class*="Pick"]'
  const TEAM_NAME_SELECTORS = [
    '[data-testid*="draft-order"] [data-testid*="team"]',
    '[data-testid*="draft-board"] [data-testid*="team-name"]',
    '[class*="draftOrder"] [class*="teamName"]',
    '[class*="DraftOrder"] [class*="teamName"]',
    '[class*="DraftBoard"] [class*="teamName"]',
    '[class*="draftBoard"] [class*="teamName"]'
  ]

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function normalizePosition(value) {
    const normalized = normalizeText(value).toUpperCase().replace('/', '')
    if (normalized === 'DEF' || normalized === 'DST') return 'DST'
    return ['QB', 'RB', 'WR', 'TE', 'K'].includes(normalized) ? normalized : undefined
  }

  function normalizeTeam(value) {
    const normalized = normalizeText(value).toUpperCase()
    if (normalized === 'JAC') return 'JAX'
    if (normalized === 'WSH') return 'WAS'
    return /^[A-Z]{2,3}$/.test(normalized) ? normalized : undefined
  }

  function slugify(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function getPickLocation(pick, totalTeams) {
    const safeTeams = Math.max(2, Number(totalTeams) || 10)
    const safePick = Math.max(1, Number(pick) || 1)
    const round = Math.ceil(safePick / safeTeams)
    const withinRound = (safePick - 1) % safeTeams
    const slot = round % 2 === 1 ? withinRound + 1 : safeTeams - withinRound
    return { round, slot }
  }

  function pickFromRoundSlot(round, displayedSlot, totalTeams) {
    const safeTeams = Math.max(2, Number(totalTeams) || 10)
    const safeRound = Math.max(1, Number(round) || 1)
    const safeDisplayedSlot = Math.min(safeTeams, Math.max(1, Number(displayedSlot) || 1))
    return (safeRound - 1) * safeTeams + safeDisplayedSlot
  }

  function readNumericDataset(dataset, keys) {
    for (const key of keys) {
      const value = Number(dataset?.[key])
      if (Number.isFinite(value) && value > 0) return value
    }
    return undefined
  }

  function parsePickNumber(text, dataset, totalTeams) {
    const directPick = readNumericDataset(dataset, ['pick', 'pickNo', 'pickNumber', 'overallPick', 'overall'])
    if (directPick) return Math.round(directPick)

    const round = readNumericDataset(dataset, ['round', 'roundNumber'])
    const roundSlot = readNumericDataset(dataset, ['roundPick', 'pickInRound', 'roundSlot'])
    if (round && roundSlot) return pickFromRoundSlot(round, roundSlot, totalTeams)

    const roundSlotMatch = text.match(/(?:^|\s)(\d{1,2})\s*[.\-]\s*(\d{1,2})(?=\s|$)/)
    if (roundSlotMatch) return pickFromRoundSlot(Number(roundSlotMatch[1]), Number(roundSlotMatch[2]), totalTeams)

    const labeledPickMatch = text.match(/\b(?:overall\s+)?pick\s*#?\s*(\d{1,3})\b/i)
    if (labeledPickMatch) return Number(labeledPickMatch[1])

    const parentheticalPickMatch = text.match(/^\s*(\d{1,3})\s*[.)]\s*\(\s*\d{1,3}\s*\)/)
    if (parentheticalPickMatch) return Number(parentheticalPickMatch[1])

    return undefined
  }

  function parseTeamAndPosition(text, dataset) {
    const datasetPosition = normalizePosition(dataset?.position || dataset?.playerPosition || dataset?.pos)
    const datasetTeam = normalizeTeam(dataset?.team || dataset?.proTeam || dataset?.nflTeam)
    if (datasetPosition && datasetTeam) return { position: datasetPosition, team: datasetTeam }

    const positionThenTeam = text.match(new RegExp(`${POSITION_PATTERN}\\s*(?:[-·,]|\\s)\\s*${TEAM_PATTERN}\\b`, 'i'))
    if (positionThenTeam) return { position: normalizePosition(positionThenTeam[1]), team: normalizeTeam(positionThenTeam[2]) }

    const teamThenPosition = text.match(new RegExp(`\\b${TEAM_PATTERN}\\s*(?:[-·,]|\\s)\\s*${POSITION_PATTERN}\\b`, 'i'))
    if (teamThenPosition) return { position: normalizePosition(teamThenPosition[2]), team: normalizeTeam(teamThenPosition[1]) }

    return { position: datasetPosition, team: datasetTeam }
  }

  function stripPickPrefix(text) {
    return text
      .replace(/^\s*\d{1,2}\s*[.\-]\s*\d{1,2}\s*/, '')
      .replace(/^\s*(?:overall\s+)?pick\s*#?\s*\d{1,3}\s*/i, '')
      .replace(/^\s*\d{1,3}\s*[.)]\s*\(\s*\d{1,3}\s*\)\s*/, '')
      .trim()
  }

  function parsePlayerName(text, dataset, position, team) {
    const datasetName = normalizeText(dataset?.playerName || dataset?.name || dataset?.athleteName)
    if (datasetName) return datasetName

    let candidate = stripPickPrefix(text)
    if (position && team) {
      const positionPattern = position === 'DST' ? '(?:D\\/?ST|DST|DEF)' : position
      const positionThenTeam = new RegExp(`\\s+${positionPattern}\\s*(?:[-·,]|\\s)\\s*${team}\\b.*$`, 'i')
      const teamThenPosition = new RegExp(`\\s+${team}\\s*(?:[-·,]|\\s)\\s*${positionPattern}\\b.*$`, 'i')
      candidate = candidate.replace(positionThenTeam, '').replace(teamThenPosition, '')
    }
    candidate = candidate.replace(/\s+\b(?:selected|drafted)\s+by\b.*$/i, '').trim()
    if (!candidate || candidate.length > 80 || /^(pick|round|team)\b/i.test(candidate)) return undefined
    return candidate
  }

  function parsePickText(rawText, dataset, totalTeams, teamNames) {
    const text = normalizeText(rawText)
    if (!text || text.length > 320) return undefined
    const pick = parsePickNumber(text, dataset || {}, totalTeams)
    if (!pick) return undefined
    const { position, team } = parseTeamAndPosition(text, dataset || {})
    if (!position || !team) return undefined
    const playerName = parsePlayerName(text, dataset || {}, position, team)
    if (!playerName) return undefined
    const location = getPickLocation(pick, totalTeams)
    const datasetSlot = readNumericDataset(dataset || {}, ['draftSlot', 'slot', 'teamSlot'])
    const slot = datasetSlot || location.slot
    const datasetRound = readNumericDataset(dataset || {}, ['round', 'roundNumber'])
    const round = datasetRound || location.round
    return {
      pick,
      round,
      slot,
      teamName: teamNames?.[slot - 1] || `Team ${slot}`,
      playerId: slugify(`${playerName}-${team}-${position}`),
      playerName,
      position,
      team
    }
  }

  function uniqueElements(elements) {
    return [...new Set(elements)]
  }

  function collectCandidateRows(documentRef) {
    const primary = uniqueElements(PICK_ROW_SELECTORS.flatMap((selector) => [...documentRef.querySelectorAll(selector)]))
    if (primary.length) return primary
    return [...documentRef.querySelectorAll(FALLBACK_ROW_SELECTOR)].filter((element) => {
      const context = normalizeText(`${element.className || ''} ${element.id || ''} ${element.getAttribute?.('data-testid') || ''} ${element.parentElement?.className || ''}`)
      const text = normalizeText(element.textContent)
      return /draft|pick|history|result|selection/i.test(context)
        && text.length >= 8
        && text.length <= 320
        && new RegExp(`\\b${POSITION_PATTERN}\\b`, 'i').test(text)
    })
  }

  function collectTeamNames(documentRef, totalTeams) {
    for (const selector of TEAM_NAME_SELECTORS) {
      const values = [...documentRef.querySelectorAll(selector)]
        .map((element) => normalizeText(element.textContent))
        .filter((value) => value && value.length <= 60 && !/^(team|pick|round)\s*\d*$/i.test(value))
      const unique = [...new Set(values)]
      if (unique.length === Number(totalTeams)) return unique
    }
    return []
  }

  function scanDocument(documentRef, pageUrl, config) {
    const totalTeams = Math.max(2, Number(config?.totalTeams) || 10)
    const totalRounds = Math.max(1, Number(config?.totalRounds) || 16)
    const detectedTeamNames = collectTeamNames(documentRef, totalTeams)
    const configuredTeamNames = Array.isArray(config?.teamNames) ? config.teamNames.map(normalizeText).filter(Boolean) : []
    const teamNames = detectedTeamNames.length === totalTeams
      ? detectedTeamNames
      : configuredTeamNames.length === totalTeams ? configuredTeamNames : []
    const rows = collectCandidateRows(documentRef)
    const parsed = rows
      .map((element) => parsePickText(element.textContent, element.dataset || {}, totalTeams, teamNames))
      .filter(Boolean)
    const byPick = new Map()
    parsed.forEach((pick) => {
      if (!byPick.has(pick.pick)) byPick.set(pick.pick, pick)
    })
    const picks = [...byPick.values()].sort((a, b) => a.pick - b.pick)
    const totalPicks = totalTeams * totalRounds
    const status = picks.length === 0 ? 'pre_draft' : picks.length >= totalPicks ? 'complete' : 'drafting'
    const url = new URL(pageUrl)
    return {
      capturedAt: new Date().toISOString(),
      detectedLeagueId: url.searchParams.get('leagueId') || undefined,
      pageUrl: url.href,
      picks,
      status,
      teamNames,
      diagnostics: {
        candidateCount: rows.length,
        parsedCount: picks.length,
        samples: rows.slice(0, 12).map((element) => ({
          tag: element.tagName,
          className: normalizeText(element.className).slice(0, 180),
          testId: element.getAttribute?.('data-testid') || '',
          text: normalizeText(element.textContent).slice(0, 260)
        }))
      }
    }
  }

  globalScope.EspnDraftParser = {
    getPickLocation,
    normalizePosition,
    parsePickText,
    scanDocument,
    slugify
  }
})(globalThis)
