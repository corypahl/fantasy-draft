(function connectEspnDraftApi() {
  const REQUEST_TYPE = 'FANTASY_DRAFT_ESPN_API_REQUEST'
  const RESPONSE_TYPE = 'FANTASY_DRAFT_ESPN_API_RESPONSE'

  function respond(requestId, response) {
    window.postMessage({
      type: RESPONSE_TYPE,
      version: 1,
      requestId,
      ...response,
    }, window.location.origin)
  }

  async function fetchDraftData() {
    const pageUrl = new URL(window.location.href)
    const leagueId = pageUrl.searchParams.get('leagueId')
    const seasonId = pageUrl.searchParams.get('seasonId') || String(new Date().getFullYear())
    if (!leagueId || !/^\d+$/.test(leagueId) || !/^\d{4}$/.test(seasonId)) {
      throw new Error('The ESPN draft URL does not include a league and season ID')
    }

    const endpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${leagueId}`
    const draftResponse = await fetch(`${endpoint}?view=mDraftDetail&view=mTeam&view=mSettings`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!draftResponse.ok) throw new Error(`ESPN draft data returned ${draftResponse.status}`)
    const league = await draftResponse.json()
    const playerIds = [...new Set((league.draftDetail?.picks || [])
      .map((pick) => Number(pick.playerId))
      .filter((playerId) => Number.isInteger(playerId) && playerId > 0))]

    let players = []
    if (playerIds.length) {
      const playerResponse = await fetch(`${endpoint}?view=kona_player_info`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-Fantasy-Filter': JSON.stringify({ players: { filterIds: { value: playerIds } } }),
        },
        cache: 'no-store',
      })
      if (!playerResponse.ok) throw new Error(`ESPN player data returned ${playerResponse.status}`)
      const playerPayload = await playerResponse.json()
      players = Array.isArray(playerPayload.players) ? playerPayload.players : []
    }

    return { league, players }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    if (event.data?.type !== REQUEST_TYPE || event.data.version !== 1 || !event.data.requestId) return
    const requestId = event.data.requestId
    void fetchDraftData()
      .then((payload) => respond(requestId, { ok: true, payload }))
      .catch((error) => respond(requestId, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))
  })
})()
