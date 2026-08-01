import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  Baby,
  BarChart3,
  Check,
  ClipboardList,
  Copy,
  LayoutGrid,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import './style.css'

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
type ScoringPreset = 'standard' | 'halfPpr' | 'ppr' | 'custom'
type Platform = 'sleeper' | 'espn'
type AppTab = 'players' | 'board' | 'consistency' | 'depth' | 'injuries' | 'rookies' | 'leagues'
type DepthChartColumn = 'QB' | 'RB' | 'WR' | 'TE' | 'K'
type DepthChartTeamRow = Record<DepthChartColumn, DepthChartEntry[]> & { team: string; projectedWinTotal?: number }

type Player = {
  id: string
  name: string
  team: string
  position: Position
  rank: number
  posRank?: string
  bye?: number
  tier?: number
  adp?: number
  points?: number
  projections?: Record<string, number>
  depthChart?: DepthChartEntry
  injury?: InjuryDetail
  rookie?: RookieDetail
  previousYear?: PreviousYearResult
  sleeper?: SleeperDetail
}

type RankedPlayer = Player & {
  projectedPoints: number
  draftScore: number
}

type Recommendation = {
  player: RankedPlayer
  reason: string
  outlook: string
  score: number
}

type DepthChartEntry = {
  name: string
  team: string
  position: Position
  order: number
  source: string
}

type InjuryDetail = {
  name: string
  team?: string
  position: Position
  updated?: string
  injury?: string
  status: string
  source: string
}

type RookieDetail = {
  name: string
  team?: string
  position: Position
  college?: string
  draftRound?: number
  draftPick?: number
  rookieYear?: number
  source: string
}

type PreviousYearResult = {
  name: string
  team: string
  position: Position
  rank?: number
  games?: number
  fpts?: number
  fpts_per_game?: number
}

type PreviousYearWeeklyResult = PreviousYearResult & {
  week: number
  opponent?: string
  passing_td?: number
  passing_tds?: number
  passing_int?: number
  passing_ints?: number
  passing_yds?: number
  rushing_td?: number
  rushing_tds?: number
  rushing_yds?: number
  receiving_rec?: number
  receiving_td?: number
  receiving_tds?: number
  receiving_yds?: number
  fumbles_lost?: number
  fg?: number
  xpt?: number
  sack?: number
  int?: number
  fr?: number
  td?: number
  special_teams_td?: number
  safety?: number
}

type ConsistencyWeek = {
  week: number
  points: number
  rank: number
  opponent?: string
}

type ConsistencyPlayerRow = {
  id: string
  name: string
  team: string
  position: Position
  rank: number
  games: number
  totalPoints: number
  ppg: number
  consistencyScore: number
  top6: number
  top12: number
  top24: number
  weeks: Record<number, ConsistencyWeek>
}

type SleeperDetail = {
  playerId?: string
  status?: string
  age?: number
  yearsExp?: number
  college?: string
}

const POSITION_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
const NFL_REGULAR_SEASON_GAMES = 17
const DEFAULT_VISIBLE_POSITIONS: Record<Position, boolean> = {
  QB: true,
  RB: true,
  WR: true,
  TE: true,
  K: false,
  DST: false,
}

type RankingsFile = {
  generatedAt: string
  season: number
  source: string
  scoring: Partial<Record<ScoringPreset, Player[]>>
  depthCharts?: Record<string, Partial<Record<Position, DepthChartEntry[]>>>
  teamWinTotals?: Record<string, TeamWinTotal>
  injuries?: InjuryDetail[]
  rookies?: RookieDetail[]
  previousYearResults?: Partial<Record<Position, PreviousYearResult[]>>
  previousYearWeeklyResults?: Partial<Record<Position, PreviousYearWeeklyResult[]>>
}

type TeamWinTotal = {
  wins?: number
  overOdds?: string
  underOdds?: string
  source?: string
}

type ProjectionDetail = {
  points?: number
  projections?: Record<string, number>
}

type SplitDataFiles = {
  rankings: Pick<RankingsFile, 'generatedAt' | 'season' | 'source' | 'scoring'>
  projections: { projections?: Record<string, ProjectionDetail> }
  depthCharts: { depthCharts?: RankingsFile['depthCharts']; teamWinTotals?: RankingsFile['teamWinTotals'] }
  injuries: { injuries?: InjuryDetail[] }
  rookies: { rookies?: RookieDetail[] }
  previousYearResults: { previousYearResults?: RankingsFile['previousYearResults']; previousSeason?: number }
  previousYearWeeklyResults?: { previousYearWeeklyResults?: RankingsFile['previousYearWeeklyResults']; previousSeason?: number }
}

type LineupSettings = {
  teams: number
  rosterSpots: number
  qb: number
  rb: number
  wr: number
  te: number
  flex: number
  superflex: number
  k: number
  dst: number
  bench: number
}

type ScoringRules = {
  passingYardsPerPoint: number
  passingTd: number
  interception: number
  rushingYardsPerPoint: number
  receivingYardsPerPoint: number
  rushReceiveTd: number
  reception: number
  fumbleLost: number
  fieldGoal: number
  extraPoint: number
  dstSack: number
  dstInterception: number
  dstFumbleRecovery: number
  dstTouchdown: number
  dstSafety: number
}

type LeagueProfile = {
  id: string
  name: string
  platform: Platform
  externalLeagueId: string
  externalTeamId?: string
  draftSlot?: number
  scoringPreset: ScoringPreset
  rankingPreset: Exclude<ScoringPreset, 'custom'>
  lineup: LineupSettings
  scoring: ScoringRules
}

type DraftPick = {
  pick: number
  round: number
  slot: number
  teamName: string
  playerId: string
  playerName?: string
  position?: Position
  team?: string
}

type DraftState = {
  id: string
  leagueId: string
  currentPick: number
  drafted: DraftPick[]
  teamNames: string[]
  sleeperDraftId?: string
  source?: 'manual' | 'sleeper' | 'espn'
  status?: string
  totalRounds?: number
  leagueName?: string
  lastSyncedAt?: string
}

const DEFAULT_DATA_BASE_URL = 'https://corypahl-fantasy-bucket.s3.us-east-1.amazonaws.com/data'
const DEFAULT_RANKINGS_URL = `${DEFAULT_DATA_BASE_URL}/fantasy-data.json`
const DEFAULT_DRAFT_API_URL = 'https://dqen8hccb0.execute-api.us-east-1.amazonaws.com'
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL || (import.meta.env.PROD ? DEFAULT_DATA_BASE_URL : '/data')
const DATA_URL = import.meta.env.VITE_RANKINGS_URL || (import.meta.env.PROD ? DEFAULT_RANKINGS_URL : '/data/fantasy-data.json')
const API_URL = import.meta.env.VITE_DRAFT_API_URL || (import.meta.env.PROD ? DEFAULT_DRAFT_API_URL : '')

const defaultLineup: LineupSettings = {
  teams: 12,
  rosterSpots: 16,
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  k: 1,
  dst: 1,
  bench: 6,
}

const halfPprScoring: ScoringRules = {
  passingYardsPerPoint: 25,
  passingTd: 4,
  interception: -2,
  rushingYardsPerPoint: 10,
  receivingYardsPerPoint: 10,
  rushReceiveTd: 6,
  reception: 0.5,
  fumbleLost: -2,
  fieldGoal: 3,
  extraPoint: 1,
  dstSack: 1,
  dstInterception: 2,
  dstFumbleRecovery: 2,
  dstTouchdown: 6,
  dstSafety: 2,
}

const pprScoring: ScoringRules = {
  ...halfPprScoring,
  reception: 1,
}

const standardScoring: ScoringRules = {
  ...halfPprScoring,
  reception: 0,
}

const leagueProfiles: LeagueProfile[] = [
  {
    id: 'fanduel',
    name: 'FanDuel',
    platform: 'sleeper',
    externalLeagueId: '1257088161859772416',
    scoringPreset: 'ppr',
    rankingPreset: 'ppr',
    lineup: {
      ...defaultLineup,
      teams: 16,
      rosterSpots: 12,
      rb: 1,
      flex: 2,
      bench: 3,
    },
    scoring: {
      ...pprScoring,
      interception: -1,
    },
  },
  {
    id: 'jackson',
    name: 'Jackson',
    platform: 'sleeper',
    externalLeagueId: '1257138560092348416',
    scoringPreset: 'halfPpr',
    rankingPreset: 'halfPpr',
    lineup: {
      ...defaultLineup,
      teams: 8,
      rosterSpots: 15,
      bench: 6,
    },
    scoring: {
      ...halfPprScoring,
      passingTd: 6,
    },
  },
  {
    id: 'gvsu',
    name: 'GVSU',
    platform: 'espn',
    externalLeagueId: '509557',
    externalTeamId: '',
    scoringPreset: 'standard',
    rankingPreset: 'standard',
    lineup: {
      ...defaultLineup,
      teams: 10,
      flex: 1,
      bench: 7,
    },
    scoring: standardScoring,
  },
]

const seedPlayers: Player[] = [
  {
    id: 'bijan-robinson-atl-rb',
    name: 'Bijan Robinson',
    team: 'ATL',
    position: 'RB',
    rank: 1,
    posRank: 'RB1',
    tier: 1,
    adp: 1.4,
    points: 321,
    projections: {
      rushing_yds: 1426,
      rushing_tds: 9.5,
      receiving_rec: 80,
      receiving_yds: 737,
      receiving_tds: 3.5,
      fumbles_lost: 1.8,
    },
  },
  {
    id: 'jamarr-chase-cin-wr',
    name: "Ja'Marr Chase",
    team: 'CIN',
    position: 'WR',
    rank: 2,
    posRank: 'WR1',
    tier: 1,
    adp: 2.1,
    points: 309,
    projections: {
      receiving_rec: 121,
      receiving_yds: 1510,
      receiving_tds: 10.6,
      rushing_yds: 17,
      rushing_tds: 0,
      fumbles_lost: 1,
    },
  },
  {
    id: 'josh-allen-buf-qb',
    name: 'Josh Allen',
    team: 'BUF',
    position: 'QB',
    rank: 13,
    posRank: 'QB1',
    tier: 3,
    adp: 19.4,
    points: 374,
    projections: {
      passing_yds: 3812,
      passing_tds: 27.4,
      passing_ints: 11.2,
      rushing_yds: 586,
      rushing_tds: 11.8,
      fumbles_lost: 4.1,
    },
  },
]

const seedData: RankingsFile = {
  generatedAt: new Date().toISOString(),
  season: 2026,
  source: 'Seed data until the scraper publishes S3 rankings',
  scoring: {
    standard: seedPlayers,
    halfPpr: seedPlayers,
    ppr: seedPlayers,
  },
}

function createDraftState(profile: LeagueProfile): DraftState {
  return {
    id: `${profile.id}-draft`,
    leagueId: profile.id,
    currentPick: 1,
    drafted: [],
    teamNames: Array.from({ length: profile.lineup.teams }, (_, index) => `Team ${index + 1}`),
  }
}

function App() {
  const [data, setData] = useState<RankingsFile>(seedData)
  const [profiles, setProfiles] = useState<LeagueProfile[]>(loadLocal('league-profiles', leagueProfiles))
  const [selectedLeagueId, setSelectedLeagueId] = useState(loadLocal('selected-league-id', leagueProfiles[0].id))
  const [draftsByLeague, setDraftsByLeague] = useState<Record<string, DraftState>>(
    loadLocal(
      'drafts-by-league',
      Object.fromEntries(leagueProfiles.map((profile) => [profile.id, createDraftState(profile)])),
    ),
  )
  const [query, setQuery] = useState('')
  const [visiblePositions, setVisiblePositions] = useState<Record<Position, boolean>>(DEFAULT_VISIBLE_POSITIONS)
  const [activeTab, setActiveTab] = useState<AppTab>(() => getTabFromHash())
  const [consistencyPosition, setConsistencyPosition] = useState<Position>('QB')
  const [consistencyQuery, setConsistencyQuery] = useState('')
  const [consistencyMinGames, setConsistencyMinGames] = useState(6)
  const [remoteLoaded, setRemoteLoaded] = useState(!API_URL)
  const [draftInput, setDraftInput] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [autoSync, setAutoSync] = useState(false)
  const [watchlistIds, setWatchlistIds] = useState<string[]>(loadLocal('watchlist-ids', []))
  const [selectedPlayer, setSelectedPlayer] = useState<RankedPlayer | null>(null)
  const [persistenceStatus, setPersistenceStatus] = useState<'Saving' | 'Saved locally' | 'Synced'>('Saving')
  const [leagueImportStatus, setLeagueImportStatus] = useState('')
  const [isImportingLeague, setIsImportingLeague] = useState(false)

  const selectedLeague = profiles.find((profile) => profile.id === selectedLeagueId) || profiles[0]
  const draft = draftsByLeague[selectedLeague.id] || createDraftState(selectedLeague)

  useEffect(() => {
    setDraftInput(draft.sleeperDraftId || selectedLeague.externalLeagueId || '')
    setSyncStatus('')
  }, [draft.sleeperDraftId, selectedLeague.externalLeagueId, selectedLeague.id])

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onHashChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#players')
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onHashChange)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('draft-wizard:watchlist-ids', JSON.stringify(watchlistIds))
  }, [watchlistIds])

  useEffect(() => {
    fetchSplitData()
      .then((payload) => setData(payload))
      .catch(() =>
        fetch(DATA_URL, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
          .then((payload: RankingsFile) => setData(payload))
          .catch(() => setData(seedData)),
      )
  }, [])

  useEffect(() => {
    localStorage.setItem('draft-wizard:selected-league-id', JSON.stringify(selectedLeagueId))
  }, [selectedLeagueId])

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === selectedLeagueId) && profiles[0]) {
      setSelectedLeagueId(profiles[0].id)
    }
  }, [profiles, selectedLeagueId])

  useEffect(() => {
    if (!API_URL) return
    Promise.all([
      fetch(`${API_URL}/leagues`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
        .catch(() => null),
      fetch(`${API_URL}/drafts/${draft.id}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
        .catch(() => null),
    ])
      .then(([leaguePayload, draftPayload]: [{ leagues?: LeagueProfile[] } | null, { profiles?: LeagueProfile[]; draft?: DraftState } | null]) => {
        const remoteProfiles = leaguePayload?.leagues?.length ? leaguePayload.leagues : draftPayload?.profiles
        if (remoteProfiles?.length) {
          const localProfiles = loadLocal<LeagueProfile[]>('league-profiles', [])
          setProfiles(mergeLeagueProfiles(remoteProfiles, localProfiles))
        }
        if (draftPayload?.draft) setDraftsByLeague((current) => ({ ...current, [draftPayload.draft!.leagueId]: draftPayload.draft! }))
      })
      .finally(() => setRemoteLoaded(true))
  }, [])

  useEffect(() => {
    if (!remoteLoaded) return
    setPersistenceStatus('Saving')
    persistState(profiles, draftsByLeague, draft).then((status) => setPersistenceStatus(status === 'Synced' ? 'Synced' : 'Saved locally'))
  }, [profiles, draftsByLeague, draft, remoteLoaded])

  const players = useMemo(() => {
    const fromData = data.scoring[selectedLeague.rankingPreset] || data.scoring.halfPpr || []
    return fromData.map((player) => {
      const projectedPoints = calculateProjectedPoints(player, selectedLeague.scoring)
      return {
        ...player,
        projectedPoints,
        draftScore: calculateDraftScore(player, selectedLeague, projectedPoints),
      }
    })
  }, [data, selectedLeague])

  const draftedIds = useMemo(() => new Set(draft.drafted.map((pick) => pick.playerId)), [draft.drafted])
  const draftedPlayerKeys = useMemo(() => new Set(draft.drafted.map((pick) => pick.playerName).filter(Boolean).map((name) => playerKey(name!))), [draft.drafted])
  const availablePlayers = useMemo<RankedPlayer[]>(() => {
    const lowerQuery = query.toLowerCase().trim()
    return players
      .filter((player) => !draftedIds.has(player.id) && !draftedPlayerKeys.has(playerKey(player.name)))
      .filter((player) => !lowerQuery || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.draftScore - a.draftScore)
  }, [draftedIds, draftedPlayerKeys, players, query])

  const recommendations = useMemo(
    () => buildRecommendations(availablePlayers, draft, selectedLeague),
    [availablePlayers, draft, selectedLeague],
  )
  const watchlistPlayers = useMemo(
    () => watchlistIds.map((id) => availablePlayers.find((player) => player.id === id)).filter((player): player is RankedPlayer => Boolean(player)),
    [availablePlayers, watchlistIds],
  )
  const playerByKey = useMemo(() => {
    const index = new Map<string, RankedPlayer>()
    players.forEach((player) => {
      index.set(playerKey(player.name), player)
      index.set(playerKey(player.name, player.team), player)
    })
    return index
  }, [players])
  const playersByPosition = useMemo(() => {
    const grouped: Record<Position, RankedPlayer[]> = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      DST: [],
    }
    availablePlayers.forEach((player) => grouped[player.position].push(player))
    POSITION_ORDER.forEach((item) => grouped[item].sort((a, b) => a.rank - b.rank))
    return grouped
  }, [availablePlayers])

  const injuryNameSet = useMemo(() => new Set((data.injuries || []).map((item) => playerKey(item.name))), [data.injuries])
  const rookieNameSet = useMemo(() => new Set((data.rookies || []).map((item) => playerKey(item.name))), [data.rookies])
  const playerTierByKey = useMemo(() => {
    const tiers = new Map<string, number>()
    players.forEach((player) => {
      if (!player.tier) return
      tiers.set(playerKey(player.name), player.tier)
      tiers.set(playerKey(player.name, player.team), player.tier)
    })
    return tiers
  }, [players])
  const playerPosRankByKey = useMemo(() => {
    const ranks = new Map<string, string>()
    players.forEach((player) => {
      if (!player.posRank) return
      ranks.set(playerKey(player.name), player.posRank)
      ranks.set(playerKey(player.name, player.team), player.posRank)
    })
    return ranks
  }, [players])
  const depthRows = useMemo(() => buildDepthChartRows(data.depthCharts, data.teamWinTotals), [data.depthCharts, data.teamWinTotals])
  const injuryRows = useMemo(
    () =>
      [...(data.injuries || [])].sort(
        (a, b) =>
          getSortableTier(a.name, a.team, playerTierByKey) - getSortableTier(b.name, b.team, playerTierByKey) ||
          parseInjuryDate(b.updated) - parseInjuryDate(a.updated),
      ),
    [data.injuries, playerTierByKey],
  )
  const rookieRows = useMemo(
    () =>
      [...(data.rookies || [])].sort(
        (a, b) =>
          (a.draftRound || 99) - (b.draftRound || 99) ||
          (a.draftPick || 9999) - (b.draftPick || 9999) ||
          a.name.localeCompare(b.name),
      ),
    [data.rookies],
  )
  const consistencyRows = useMemo(
    () => buildConsistencyRows(data.previousYearWeeklyResults, consistencyPosition, selectedLeague.scoring, consistencyMinGames, consistencyQuery),
    [data.previousYearWeeklyResults, consistencyPosition, selectedLeague.scoring, consistencyMinGames, consistencyQuery],
  )
  function updateDraft(nextDraft: DraftState) {
    setDraftsByLeague((current) => ({ ...current, [selectedLeague.id]: nextDraft }))
  }

  function updateLeague(patch: Partial<LeagueProfile>) {
    const nextLeague = { ...selectedLeague, ...patch }
    setProfiles((current) => current.map((profile) => (profile.id === selectedLeague.id ? nextLeague : profile)))
    if (nextLeague.lineup.teams !== draft.teamNames.length) {
      updateDraft({
        ...draft,
        teamNames: Array.from({ length: nextLeague.lineup.teams }, (_, index) => draft.teamNames[index] || `Team ${index + 1}`),
      })
    }
  }

  function updateScoring(patch: Partial<ScoringRules>) {
    updateLeague({ scoring: { ...selectedLeague.scoring, ...patch } })
  }

  function updateLineup(key: keyof LineupSettings, value: number) {
    updateLeague({ lineup: { ...selectedLeague.lineup, [key]: value } })
  }

  function togglePosition(nextPosition: Position) {
    setVisiblePositions((current) => ({ ...current, [nextPosition]: !current[nextPosition] }))
  }

  const syncDraftState = useCallback(async (quiet = false) => {
    const sourceId = draftInput.trim() || selectedLeague.externalLeagueId
    if (!sourceId) {
      setSyncStatus(`Enter a ${selectedLeague.platform === 'sleeper' ? 'Sleeper draft or league' : 'league'} ID.`)
      return
    }
    if (!quiet) setSyncStatus(`Loading ${selectedLeague.platform === 'sleeper' ? 'Sleeper' : 'ESPN'} draft...`)
    setIsSyncing(true)
    try {
      const nextDraft = selectedLeague.platform === 'sleeper'
        ? await fetchSleeperDraftState(sourceId, selectedLeague, draft)
        : await fetchManagedDraftState(draft, selectedLeague)
      updateDraft(nextDraft)
      setDraftInput(nextDraft.sleeperDraftId || sourceId)
      setSyncStatus(`Synced ${nextDraft.drafted.length} picks at ${new Date().toLocaleTimeString()}.`)
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : `Unable to load ${selectedLeague.platform.toUpperCase()} draft.`)
    } finally {
      setIsSyncing(false)
    }
  }, [draft, draftInput, selectedLeague])

  useEffect(() => {
    if (!autoSync || activeTab !== 'board') return
    const timer = window.setInterval(() => void syncDraftState(true), 15000)
    return () => window.clearInterval(timer)
  }, [activeTab, autoSync, syncDraftState])

  function navigateTab(tab: AppTab) {
    if (tab === activeTab) return
    window.history.pushState(null, '', `#${tab}`)
    setActiveTab(tab)
  }

  function toggleWatchlist(playerId: string) {
    setWatchlistIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId])
  }

  function draftPlayer(player: RankedPlayer) {
    const totalTeams = draft.teamNames.length || selectedLeague.lineup.teams
    const totalPicks = totalTeams * (draft.totalRounds || selectedLeague.lineup.rosterSpots)
    if (draft.currentPick > totalPicks) {
      setSyncStatus('This draft is already complete.')
      return
    }
    const location = getSlotRoundForPick(draft.currentPick, totalTeams)
    const pick: DraftPick = {
      pick: draft.currentPick,
      round: location.round,
      slot: location.slot,
      teamName: draft.teamNames[location.slot - 1] || `Team ${location.slot}`,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      team: player.team,
    }
    updateDraft({
      ...draft,
      currentPick: draft.currentPick + 1,
      drafted: [...draft.drafted.filter((item) => item.pick !== pick.pick && item.playerId !== player.id), pick].sort((a, b) => a.pick - b.pick),
      source: 'manual',
      lastSyncedAt: new Date().toISOString(),
    })
    setWatchlistIds((current) => current.filter((id) => id !== player.id))
    setSyncStatus(`${player.name} recorded at pick ${pick.pick}.`)
  }

  function undoLastPick() {
    const lastPick = [...draft.drafted].sort((a, b) => b.pick - a.pick)[0]
    if (!lastPick) return
    updateDraft({ ...draft, currentPick: lastPick.pick, drafted: draft.drafted.filter((pick) => pick !== lastPick), source: 'manual' })
    setSyncStatus(`Removed ${lastPick.playerName || 'the last pick'}.`)
  }

  function addLeague() {
    const id = `league-${Date.now()}`
    const profile: LeagueProfile = {
      ...selectedLeague,
      id,
      name: 'New League',
      externalLeagueId: '',
      externalTeamId: '',
      draftSlot: 1,
      lineup: { ...selectedLeague.lineup },
      scoring: { ...selectedLeague.scoring },
    }
    setProfiles((current) => [...current, profile])
    setDraftsByLeague((current) => ({ ...current, [id]: createDraftState(profile) }))
    setSelectedLeagueId(id)
  }

  function duplicateLeague() {
    const id = `${slugify(selectedLeague.name)}-${Date.now()}`
    const profile = { ...selectedLeague, id, name: `${selectedLeague.name} Copy`, lineup: { ...selectedLeague.lineup }, scoring: { ...selectedLeague.scoring } }
    setProfiles((current) => [...current, profile])
    setDraftsByLeague((current) => ({ ...current, [id]: createDraftState(profile) }))
    setSelectedLeagueId(id)
  }

  function removeLeague() {
    if (profiles.length <= 1 || !window.confirm(`Delete ${selectedLeague.name}? This removes its local draft state.`)) return
    const remaining = profiles.filter((profile) => profile.id !== selectedLeague.id)
    setProfiles(remaining)
    setDraftsByLeague((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== selectedLeague.id)))
    setSelectedLeagueId(remaining[0].id)
  }

  async function importLeagueSettings() {
    const leagueId = selectedLeague.externalLeagueId.trim()
    if (!leagueId) {
      setLeagueImportStatus('Enter a league ID first.')
      return
    }
    setIsImportingLeague(true)
    setLeagueImportStatus(`Importing ${selectedLeague.platform.toUpperCase()} settings...`)
    try {
      if (selectedLeague.platform === 'sleeper') {
        const payload = await fetchSleeperJson<any>(`/league/${leagueId}`)
        updateLeague(buildSleeperLeaguePatch(payload, selectedLeague))
      } else {
        if (!API_URL) throw new Error('ESPN import requires the managed league service.')
        const response = await fetch(`${API_URL}/leagues`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`ESPN league import failed (${response.status}).`)
        const payload: { leagues?: LeagueProfile[] } = await response.json()
        const matched = payload.leagues?.find((profile) => profile.externalLeagueId === leagueId)
        if (!matched) throw new Error('No managed ESPN league matched that ID.')
        updateLeague({ ...matched, id: selectedLeague.id })
      }
      setLeagueImportStatus('League name, scoring and lineup imported. Review warnings before drafting.')
    } catch (error) {
      setLeagueImportStatus(error instanceof Error ? error.message : 'Unable to import league settings.')
    } finally {
      setIsImportingLeague(false)
    }
  }

  return (
    <main className="shell">
      <nav className="tabs" aria-label="Draft views">
        <button aria-current={activeTab === 'players' ? 'page' : undefined} className={activeTab === 'players' ? 'active' : ''} onClick={() => navigateTab('players')}>
          <ClipboardList size={16} /> <span>Players</span>
        </button>
        <button aria-current={activeTab === 'board' ? 'page' : undefined} className={activeTab === 'board' ? 'active' : ''} onClick={() => navigateTab('board')}>
          <LayoutGrid size={16} /> <span>Board</span>
        </button>
        <button aria-current={activeTab === 'consistency' ? 'page' : undefined} className={activeTab === 'consistency' ? 'active' : ''} onClick={() => navigateTab('consistency')}>
          <BarChart3 size={16} /> <span>Consistency</span>
        </button>
        <button aria-current={activeTab === 'depth' ? 'page' : undefined} className={activeTab === 'depth' ? 'active' : ''} onClick={() => navigateTab('depth')}>
          <ListTree size={16} /> <span>Depth</span>
        </button>
        <button aria-current={activeTab === 'injuries' ? 'page' : undefined} className={activeTab === 'injuries' ? 'active' : ''} onClick={() => navigateTab('injuries')}>
          <Activity size={16} /> <span>Injuries</span>
        </button>
        <button aria-current={activeTab === 'rookies' ? 'page' : undefined} className={activeTab === 'rookies' ? 'active' : ''} onClick={() => navigateTab('rookies')}>
          <Baby size={16} /> <span>Rookies</span>
        </button>
        <button aria-current={activeTab === 'leagues' ? 'page' : undefined} className={activeTab === 'leagues' ? 'active' : ''} onClick={() => navigateTab('leagues')}>
          <Settings size={16} /> <span>Leagues</span>
        </button>
      </nav>

      <DataHealth data={data} league={selectedLeague} persistenceStatus={persistenceStatus} />

      {activeTab === 'players' ? (
        <PlayersBoard
          availableCount={availablePlayers.length}
          leagueName={selectedLeague.name}
          leagueTeams={selectedLeague.lineup.teams}
          playersByPosition={playersByPosition}
          query={query}
          recommendations={recommendations}
          watchlistIds={watchlistIds}
          watchlistPlayers={watchlistPlayers}
          togglePosition={togglePosition}
          visiblePositions={visiblePositions}
          onDraftPlayer={draftPlayer}
          onPlayerSelect={setSelectedPlayer}
          onQueryChange={setQuery}
          onToggleWatchlist={toggleWatchlist}
        />
      ) : null}

      {activeTab === 'board' ? (
        <DraftBoardPage
          draft={draft}
          league={selectedLeague}
          recommendations={recommendations}
          draftInput={draftInput}
          syncStatus={syncStatus}
          autoSync={autoSync}
          isSyncing={isSyncing}
          onAutoSyncChange={setAutoSync}
          onDraftInputChange={setDraftInput}
          onDraftPlayer={draftPlayer}
          onSyncDraft={() => void syncDraftState(false)}
          onUndoLastPick={undoLastPick}
        />
      ) : null}

      {activeTab === 'consistency' ? (
        <ConsistencyPage
          league={selectedLeague}
          minGames={consistencyMinGames}
          position={consistencyPosition}
          query={consistencyQuery}
          rows={consistencyRows}
          season={(data.season || new Date().getFullYear()) - 1}
          playerByKey={playerByKey}
          onMinGamesChange={setConsistencyMinGames}
          onPlayerSelect={setSelectedPlayer}
          onPositionChange={setConsistencyPosition}
          onQueryChange={setConsistencyQuery}
        />
      ) : null}

      {activeTab === 'depth' ? (
        <DepthChartsPage
          rows={depthRows}
          injuredNames={injuryNameSet}
          rookieNames={rookieNameSet}
          playerPosRankByKey={playerPosRankByKey}
          playerTierByKey={playerTierByKey}
          playerByKey={playerByKey}
          onPlayerSelect={setSelectedPlayer}
        />
      ) : null}
      {activeTab === 'injuries' ? <InjuriesPage rows={injuryRows} playerByKey={playerByKey} playerTierByKey={playerTierByKey} onPlayerSelect={setSelectedPlayer} /> : null}
      {activeTab === 'rookies' ? <RookiesPage rows={rookieRows} playerByKey={playerByKey} playerTierByKey={playerTierByKey} onPlayerSelect={setSelectedPlayer} /> : null}
      {activeTab === 'leagues' ? (
        <SettingsPanel
          draft={draft}
          league={selectedLeague}
          profiles={profiles}
          selectedLeagueId={selectedLeague.id}
          setSelectedLeagueId={setSelectedLeagueId}
          updateDraft={updateDraft}
          updateLeague={updateLeague}
          updateLineup={updateLineup}
          updateScoring={updateScoring}
          persistenceStatus={persistenceStatus}
          importStatus={leagueImportStatus}
          isImporting={isImportingLeague}
          onAddLeague={addLeague}
          onDuplicateLeague={duplicateLeague}
          onImportLeague={() => void importLeagueSettings()}
          onRemoveLeague={removeLeague}
        />
      ) : null}
      {selectedPlayer ? (
        <PlayerDrawer
          isWatched={watchlistIds.includes(selectedPlayer.id)}
          player={selectedPlayer}
          recommendation={recommendations.find((item) => item.player.id === selectedPlayer.id)}
          onClose={() => setSelectedPlayer(null)}
          onDraft={() => { draftPlayer(selectedPlayer); setSelectedPlayer(null) }}
          onToggleWatchlist={() => toggleWatchlist(selectedPlayer.id)}
        />
      ) : null}
    </main>
  )
}

function DataHealth({ data, league, persistenceStatus }: { data: RankingsFile; league: LeagueProfile; persistenceStatus: string }) {
  const generated = new Date(data.generatedAt)
  const ageHours = Number.isFinite(generated.getTime()) ? (Date.now() - generated.getTime()) / 36e5 : Number.POSITIVE_INFINITY
  const warnings = getScoringWarnings(league)
  return (
    <section className={`dataHealth ${ageHours > 48 || warnings.length ? 'dataHealthWarning' : ''}`} aria-label="Draft data status">
      <div className="dataHealthPrimary">
        {ageHours <= 48 && !warnings.length ? <Check size={16} /> : <AlertTriangle size={16} />}
        <strong>{data.season} data</strong>
        <span>{ageHours <= 48 ? `Updated ${formatRelativeTime(generated)}` : 'Data may be stale'}</span>
        <span>{data.source}</span>
      </div>
      <div className="dataHealthSecondary">
        {warnings.length ? <span className="healthWarning">{warnings.length} scoring warning{warnings.length === 1 ? '' : 's'}</span> : <span>Scoring verified</span>}
        <span>{persistenceStatus}</span>
      </div>
    </section>
  )
}

function ResearchFilters({
  position,
  query,
  queryLabel,
  onPositionChange,
  onQueryChange,
}: {
  position: 'ALL' | Position
  query: string
  queryLabel: string
  onPositionChange: (position: 'ALL' | Position) => void
  onQueryChange: (query: string) => void
}) {
  return (
    <div className="researchFilters">
      <label className="searchBox researchSearch"><Search size={15} /><span className="srOnly">{queryLabel}</span><input onChange={(event) => onQueryChange(event.target.value)} placeholder={queryLabel} value={query} /></label>
      <div className="positionToggles" aria-label="Filter by position">
        {(['ALL', ...POSITION_ORDER] as const).map((item) => <button aria-pressed={position === item} className={position === item ? 'active neutralToggle' : ''} key={item} onClick={() => onPositionChange(item)} type="button">{item}</button>)}
      </div>
    </div>
  )
}

function PlayerDrawer({
  player,
  recommendation,
  isWatched,
  onClose,
  onDraft,
  onToggleWatchlist,
}: {
  player: RankedPlayer
  recommendation?: Recommendation
  isWatched: boolean
  onClose: () => void
  onDraft: () => void
  onToggleWatchlist: () => void
}) {
  return (
    <div className="drawerBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }} role="presentation">
      <aside aria-label={`${player.name} details`} aria-modal="true" className="playerDrawer" role="dialog">
        <div className="drawerHeader">
          <div><span className={`position position${player.position}`}>{player.position}</span><h2>{player.name}</h2><p>{player.team} · {player.posRank || 'Unranked'} · Tier {player.tier || '-'}</p></div>
          <button aria-label="Close player details" className="drawerClose" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        {recommendation ? <div className="drawerRecommendation"><strong>Why now</strong><span>{recommendation.reason}. {recommendation.outlook}</span></div> : null}
        <div className="playerMetricGrid">
          <div><span>Overall rank</span><strong>#{player.rank}</strong></div>
          <div><span>ADP</span><strong>{player.adp?.toFixed(1) || '-'}</strong></div>
          <div><span>Projected PPG</span><strong>{formatProjectedPointsPerGame(player.projectedPoints)}</strong></div>
          <div><span>Bye</span><strong>{player.bye || '-'}</strong></div>
        </div>
        {player.injury ? <div className="detailNotice injuryNotice"><AlertTriangle size={16} /><div><strong>{player.injury.status}</strong><span>{player.injury.injury || 'Injury reported'} · {player.injury.updated || 'Update pending'}</span></div></div> : null}
        {player.rookie ? <div className="detailNotice"><Baby size={16} /><div><strong>Rookie · Pick #{player.rookie.draftPick || '-'}</strong><span>{player.rookie.college || 'College unavailable'} · {player.rookie.source}</span></div></div> : null}
        {player.depthChart ? <div className="detailNotice"><ListTree size={16} /><div><strong>{player.position}{player.depthChart.order} on the depth chart</strong><span>{player.depthChart.source}</span></div></div> : null}
        <div className="drawerActions">
          <button className={isWatched ? 'iconTextButton watched' : 'iconTextButton'} onClick={onToggleWatchlist} type="button"><Star size={16} /> {isWatched ? 'Watching' : 'Watch'}</button>
          <button className="primaryAction" onClick={onDraft} type="button">Draft {player.name}</button>
        </div>
      </aside>
    </div>
  )
}

function ConsistencyPage({
  league,
  minGames,
  position,
  query,
  rows,
  season,
  playerByKey,
  onMinGamesChange,
  onPlayerSelect,
  onPositionChange,
  onQueryChange,
}: {
  league: LeagueProfile
  minGames: number
  position: Position
  query: string
  rows: ConsistencyPlayerRow[]
  season: number
  playerByKey: Map<string, RankedPlayer>
  onMinGamesChange: (value: number) => void
  onPlayerSelect: (player: RankedPlayer) => void
  onPositionChange: (position: Position) => void
  onQueryChange: (query: string) => void
}) {
  const weeks = Array.from({ length: 18 }, (_, index) => index + 1)

  return (
    <section className="consistencyPage">
      <div className="consistencyTitle">
        <div><h2>{season} Weekly Consistency</h2><p>Prior-season scoring recalculated with {league.name}'s current rules. Minimum six games is recommended.</p></div>
        <span className="countPill">{rows.length} players</span>
      </div>
      <div className="consistencyPositionTabs" aria-label="Consistency positions">
        {POSITION_ORDER.map((item) => (
          <button aria-pressed={position === item} className={position === item ? 'active' : ''} key={item} onClick={() => onPositionChange(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <div className="consistencyToolbar">
        <label className="searchBox consistencySearch">
          <Search size={18} />
          <span className="srOnly">Search consistency results</span>
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search players" />
        </label>
        <div className="consistencyMeta">
          <span>Based on {league.scoring.passingTd} Pts per Pass TD Scoring</span>
          <span className="legendTop6">Top 6</span>
          <span className="legendTop12">Top 12</span>
          <span className="legendTop24">Top 24</span>
          <span className="legendMiss">25+</span>
        </div>
        <label className="minGamesControl">
          Min. Games
          <button aria-label="Decrease minimum games" type="button" onClick={() => onMinGamesChange(Math.max(1, minGames - 1))}>-</button>
          <span>{minGames}</span>
          <button aria-label="Increase minimum games" type="button" onClick={() => onMinGamesChange(Math.min(18, minGames + 1))}>+</button>
        </label>
      </div>
      <div className="consistencyTableWrap">
        <p className="mobileTableNote">Weekly splits are available on wider screens; mobile shows the decision summary.</p>
        <div className="consistencyGrid">
          <div className="consistencyHead consistencyPlayerHead">Player</div>
          <div className="consistencyHead statHead">Rank</div>
          <div className="consistencyHead statHead">PPG</div>
          {weeks.map((week) => (
            <div className="consistencyHead weekHead" key={week}>{week}</div>
          ))}
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <div className="consistencyPlayerCell">
                <span className={`position position${row.position}`}>{row.position}</span>
                <div>
                  <strong><button className="tablePlayerButton" disabled={!playerByKey.get(playerKey(row.name, row.team)) && !playerByKey.get(playerKey(row.name))} onClick={() => {
                    const ranked = playerByKey.get(playerKey(row.name, row.team)) || playerByKey.get(playerKey(row.name))
                    if (ranked) onPlayerSelect(ranked)
                  }} type="button">{row.name}</button></strong>
                  <small>{row.team} ({row.top12} top-12, {row.top24} top-24)</small>
                </div>
              </div>
              <div className="consistencyRankCell">
                <strong>{row.rank}</strong>
                <small>{row.totalPoints.toFixed(1)} PTS</small>
              </div>
              <div className="consistencyPpgCell">{row.ppg.toFixed(1)}</div>
              {weeks.map((week) => {
                const result = row.weeks[week]
                return (
                  <div className={`consistencyWeekCell ${getConsistencyCellClass(result?.rank)}`} key={`${row.id}-${week}`}>
                    {result ? (
                      <>
                        <small>{result.points.toFixed(1)} PTS</small>
                        <strong>{result.rank}</strong>
                        <span>{result.opponent || ''}</span>
                      </>
                    ) : (
                      <span className="byeLabel">BYE</span>
                    )}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
          {rows.length === 0 ? (
            <div className="consistencyEmpty">
              No weekly {position} results are available for {season}. Generate or publish `previous-year-weekly-results.json` to populate this page.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function DepthChartsPage({
  rows,
  injuredNames,
  rookieNames,
  playerPosRankByKey,
  playerTierByKey,
  playerByKey,
  onPlayerSelect,
}: {
  rows: DepthChartTeamRow[]
  injuredNames: Set<string>
  rookieNames: Set<string>
  playerPosRankByKey: Map<string, string>
  playerTierByKey: Map<string, number>
  playerByKey: Map<string, RankedPlayer>
  onPlayerSelect: (player: RankedPlayer) => void
}) {
  const columns: DepthChartColumn[] = ['QB', 'RB', 'WR', 'TE', 'K']
  const [query, setQuery] = useState('')
  const filteredRows = rows.filter((row) => !query.trim() || `${row.team} ${columns.flatMap((column) => row[column].map((player) => player.name)).join(' ')}`.toLowerCase().includes(query.toLowerCase().trim()))
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <div><h2>Depth Charts</h2><p className="panelDescription">Search a team or player, then open a player for draft context.</p></div>
        <span className="countPill">{filteredRows.length} teams</span>
      </div>
      <label className="searchBox researchSearch"><Search size={15} /><span className="srOnly">Search depth charts</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search team or player" value={query} /></label>
      <div className="depthMatrix">
        <div className="depthMatrixHead">
          <span>Team</span>
          {columns.map((column) => (
            <span key={column} className={`depthHeading depthHeading${column.replace(/\d/g, '')}`}>
              {column}
            </span>
          ))}
        </div>
        {filteredRows.map((row) => (
          <div className="depthMatrixRow" key={row.team}>
            <strong className="depthTeamCell">
              <span>{row.team}</span>
              {row.projectedWinTotal != null ? <small>{row.projectedWinTotal.toFixed(1)} wins</small> : null}
            </strong>
            {columns.map((column) => {
              const players = row[column]
              return (
                <div
                  className="depthCell"
                  data-position={column}
                  key={`${row.team}-${column}`}
                >
                  {players.length ? (
                    players.map((player) => {
                      const isInjured = injuredNames.has(playerKey(player.name))
                      const isRookie = rookieNames.has(playerKey(player.name))
                      const posRank = getDepthPlayerPosRank(player, playerPosRankByKey)
                      return (
                        <button
                          className={depthPlayerClass(player)}
                          key={`${row.team}-${column}-${player.order}-${player.name}`}
                          style={{ color: getTierColor(getDepthPlayerTier(player, playerTierByKey)) }}
                          title={`${player.source} ${player.position}${player.order}`}
                          type="button"
                          onClick={() => {
                            const ranked = playerByKey.get(playerKey(player.name, player.team)) || playerByKey.get(playerKey(player.name))
                            if (ranked) onPlayerSelect(ranked)
                          }}
                        >
                          <span className="depthPlayerName">
                            {player.name}{posRank ? ` (${formatPositionRank(posRank)})` : ''}
                          </span>
                          {isInjured ? <span className="depthMarker depthMarkerInjury" title="Injured">I</span> : null}
                          {isRookie ? <span className="depthMarker depthMarkerRookie" title="Rookie">R</span> : null}
                        </button>
                      )
                    })
                  ) : (
                    <span className="depthPlayer depthEmpty">-</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {filteredRows.length === 0 ? <p className="emptyState">No matching depth chart entries.</p> : null}
      </div>
    </section>
  )
}

function DraftBoardPage({
  draft,
  league,
  recommendations,
  draftInput,
  syncStatus,
  autoSync,
  isSyncing,
  onAutoSyncChange,
  onDraftInputChange,
  onDraftPlayer,
  onSyncDraft,
  onUndoLastPick,
}: {
  draft: DraftState
  league: LeagueProfile
  recommendations: Recommendation[]
  draftInput: string
  syncStatus: string
  autoSync: boolean
  isSyncing: boolean
  onAutoSyncChange: (value: boolean) => void
  onDraftInputChange: (value: string) => void
  onDraftPlayer: (player: RankedPlayer) => void
  onSyncDraft: () => void
  onUndoLastPick: () => void
}) {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const totalRounds = draft.totalRounds || league.lineup.rosterSpots
  const picksBySlotRound = useMemo(() => {
    const picks = new Map<string, DraftPick>()
    draft.drafted.forEach((pick) => picks.set(`${pick.slot}-${pick.round}`, pick))
    return picks
  }, [draft.drafted])
  const currentLocation = getSlotRoundForPick(draft.currentPick, totalTeams)
  const currentTeam = draft.teamNames[currentLocation.slot - 1] || `Team ${currentLocation.slot}`
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const userRoster = draft.drafted.filter((pick) => pick.slot === userSlot)
  const isUserPick = currentLocation.slot === userSlot

  return (
    <section className="panel pagePanel draftBoardPanel">
      <div className="panelHeader draftBoardHeader">
        <div>
          <h2>Draft Board</h2>
          <div className="draftBoardMeta">
            <span>{league.name}</span>
            {draft.leagueName ? <span>{draft.leagueName}</span> : null}
            {draft.status ? <span>{draft.status.replace(/_/g, ' ')}</span> : null}
            {draft.lastSyncedAt ? <span>Synced {new Date(draft.lastSyncedAt).toLocaleTimeString()}</span> : null}
          </div>
        </div>
        <div className="draftSync">
          <input
            aria-label={`${league.platform === 'sleeper' ? 'Sleeper draft or league' : 'ESPN league'} ID`}
            placeholder={`${league.platform === 'sleeper' ? 'Sleeper draft or league' : 'ESPN league'} ID`}
            value={draftInput}
            onChange={(event) => onDraftInputChange(event.target.value)}
          />
          <button className="iconTextButton" disabled={isSyncing} onClick={onSyncDraft} type="button">
            <RefreshCw className={isSyncing ? 'spin' : ''} size={15} /> {isSyncing ? 'Syncing' : `Sync ${league.platform.toUpperCase()}`}
          </button>
        </div>
      </div>
      <div className={`onClockBanner ${isUserPick ? 'userPick' : ''}`}>
        <div>
          <span className="eyebrow">Pick {draft.currentPick} · Round {currentLocation.round}</span>
          <strong>{isUserPick ? 'You are on the clock' : `${currentTeam} is on the clock`}</strong>
        </div>
        <div className="draftActions">
          <label className="autoSyncToggle">
            <input checked={autoSync} onChange={(event) => onAutoSyncChange(event.target.checked)} type="checkbox" />
            Auto-sync
          </label>
          <button className="iconTextButton" disabled={!draft.drafted.length} onClick={onUndoLastPick} type="button"><Undo2 size={15} /> Undo</button>
        </div>
      </div>
      {syncStatus ? <div className="syncStatus" role="status">{syncStatus}</div> : null}
      <div className="draftCommandGrid">
        <section className="commandCard">
          <div className="commandCardHeader"><h3>Draft now</h3><span>{recommendations.length} options</span></div>
          <div className="recommendationStrip">
            {recommendations.slice(0, 4).map((item, index) => (
              <article className="recommendationCard" key={item.player.id}>
                <span className="recommendationNumber">{index + 1}</span>
                <div><strong>{item.player.name}</strong><small>{item.player.position} · {item.player.team} · {item.reason}</small></div>
                <button aria-label={`Draft ${item.player.name}`} onClick={() => onDraftPlayer(item.player)} type="button">Draft</button>
              </article>
            ))}
          </div>
        </section>
        <section className="commandCard rosterCard">
          <div className="commandCardHeader"><h3>Your roster</h3><span>Slot {userSlot}</span></div>
          {userRoster.length ? userRoster.map((pick) => <span className={`rosterChip positionText${pick.position || ''}`} key={pick.pick}>{pick.position} {formatShortPlayerName(pick.playerName || pick.playerId)}</span>) : <p>No selections yet.</p>}
        </section>
      </div>
      <div className="draftBoardScroller">
        <div className="draftBoardGrid" style={{ gridTemplateColumns: `56px repeat(${totalTeams}, minmax(118px, 1fr))` }}>
          <div className="draftBoardCorner">Rd</div>
          {draft.teamNames.map((teamName, index) => (
            <div className="draftBoardTeam" key={`${teamName}-${index}`}>
              <span>{teamName}</span>
            </div>
          ))}
          {Array.from({ length: totalRounds }, (_, roundIndex) => {
            const round = roundIndex + 1
            return (
              <React.Fragment key={round}>
                <div className="draftBoardRound">{round}</div>
                {draft.teamNames.map((_, slotIndex) => {
                  const slot = slotIndex + 1
                  const pickNumber = getPickNumberForSlotRound(slot, round, totalTeams)
                  const pick = picksBySlotRound.get(`${slot}-${round}`)
                  const isCurrent = pickNumber === draft.currentPick
                  return (
                    <div className={`draftBoardCell ${isCurrent ? 'current' : ''}`} key={`${slot}-${round}`}>
                      {pick ? (
                        <div className="draftBoardPlayer" style={{ borderLeftColor: getPositionColor(pick.position) }}>
                          <strong style={{ color: getPositionColor(pick.position) }}>{formatShortPlayerName(pick.playerName || pick.playerId)}</strong>
                          <span>{pick.position || '-'} {pick.team || ''}</span>
                        </div>
                      ) : (
                        <span className="draftBoardPick">#{pickNumber}</span>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function InjuriesPage({
  rows,
  playerByKey,
  playerTierByKey,
  onPlayerSelect,
}: {
  rows: InjuryDetail[]
  playerByKey: Map<string, RankedPlayer>
  playerTierByKey: Map<string, number>
  onPlayerSelect: (player: RankedPlayer) => void
}) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<'ALL' | Position>('ALL')
  const filteredRows = rows.filter((row) => (position === 'ALL' || row.position === position) && (!query.trim() || `${row.name} ${row.team} ${row.injury} ${row.status}`.toLowerCase().includes(query.toLowerCase().trim())))
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <div><h2>Injuries</h2><p className="panelDescription">Prioritized by fantasy tier and report recency.</p></div>
        <span className="countPill">{filteredRows.length} reports</span>
      </div>
      <ResearchFilters position={position} query={query} queryLabel="Search player, injury or status" onPositionChange={setPosition} onQueryChange={setQuery} />
      <div className="infoTable injuriesTable">
        <div className="infoHead">
          <span>Player</span>
          <span>Team</span>
          <span>Pos</span>
          <span>Status</span>
          <span>Injury</span>
          <span>Updated</span>
          <span>Source</span>
        </div>
        {filteredRows.map((row) => {
          const tierColor = getTierColor(getPlayerTier(row.name, row.team, playerTierByKey))
          const ranked = playerByKey.get(playerKey(row.name, row.team)) || playerByKey.get(playerKey(row.name))
          return (
            <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.status}`} style={{ borderLeftColor: tierColor }}>
              <strong data-label="Player" style={{ color: tierColor }}><button className="tablePlayerButton" disabled={!ranked} onClick={() => ranked && onPlayerSelect(ranked)} type="button">{row.name}</button></strong>
              <span data-label="Team">{row.team || '-'}</span>
              <span data-label="Position" className={`position position${row.position}`}>{row.position}</span>
              <span data-label="Status" className="warningText">{row.status}</span>
              <span data-label="Injury">{row.injury || '-'}</span>
              <small data-label="Updated">{row.updated || '-'}</small>
              <small data-label="Source">{row.source}</small>
            </div>
          )
        })}
        {filteredRows.length === 0 ? <p className="emptyState">No matching injury reports.</p> : null}
      </div>
    </section>
  )
}

function RookiesPage({
  rows,
  playerByKey,
  playerTierByKey,
  onPlayerSelect,
}: {
  rows: RookieDetail[]
  playerByKey: Map<string, RankedPlayer>
  playerTierByKey: Map<string, number>
  onPlayerSelect: (player: RankedPlayer) => void
}) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<'ALL' | Position>('ALL')
  const filteredRows = rows.filter((row) => (position === 'ALL' || row.position === position) && (!query.trim() || `${row.name} ${row.team} ${row.college}`.toLowerCase().includes(query.toLowerCase().trim())))
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <div><h2>Rookies</h2><p className="panelDescription">NFL draft capital connected to rankings, projections and depth-chart opportunity.</p></div>
        <span className="countPill">{filteredRows.length} players</span>
      </div>
      <ResearchFilters position={position} query={query} queryLabel="Search rookie, team or college" onPositionChange={setPosition} onQueryChange={setQuery} />
      <div className="infoTable rookiesTable">
        <div className="infoHead">
          <span>Round</span>
          <span>Pick</span>
          <span>Player</span>
          <span>Team</span>
          <span>Pos</span>
          <span>College</span>
        </div>
        {filteredRows.map((row) => {
          const tierColor = getTierColor(getPlayerTier(row.name, row.team, playerTierByKey))
          const ranked = playerByKey.get(playerKey(row.name, row.team)) || playerByKey.get(playerKey(row.name))
          return (
            <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.draftPick || row.rookieYear || 'rookie'}`} style={{ borderLeftColor: tierColor }}>
              <span data-label="Round">{row.draftRound || '-'}</span>
              <span data-label="Pick">{row.draftPick ? `#${row.draftPick}` : '-'}</span>
              <strong data-label="Player" style={{ color: tierColor }}><button className="tablePlayerButton" disabled={!ranked} onClick={() => ranked && onPlayerSelect(ranked)} type="button">{row.name}</button></strong>
              <span data-label="Team">{row.team || '-'}</span>
              <span data-label="Position" className={`position position${row.position}`}>{row.position}</span>
              <span data-label="College">{row.college || '-'}</span>
            </div>
          )
        })}
        {filteredRows.length === 0 ? <p className="emptyState">No matching rookies.</p> : null}
      </div>
    </section>
  )
}

function buildConsistencyRows(
  weeklyResults: RankingsFile['previousYearWeeklyResults'],
  position: Position,
  scoring: ScoringRules,
  minGames: number,
  query: string,
): ConsistencyPlayerRow[] {
  const rows = weeklyResults?.[position] || []
  if (!rows.length) return []

  const weekRanks = new Map<string, ConsistencyWeek>()
  Array.from({ length: 18 }, (_, index) => index + 1).forEach((week) => {
    rows
      .filter((row) => row.week === week)
      .map((row) => ({
        row,
        points: calculatePreviousYearWeeklyPoints(row, scoring),
      }))
      .sort((a, b) => b.points - a.points)
      .forEach((item, index) => {
        weekRanks.set(`${playerKey(item.row.name, item.row.team)}-${week}`, {
          week,
          points: item.points,
          rank: index + 1,
          opponent: item.row.opponent,
        })
      })
  })

  const byPlayer = new Map<string, ConsistencyPlayerRow>()
  rows.forEach((row) => {
    const key = playerKey(row.name, row.team)
    const result = weekRanks.get(`${key}-${row.week}`)
    if (!result) return
    const current =
      byPlayer.get(key) ||
      ({
        id: key,
        name: row.name,
        team: row.team,
        position,
        rank: 0,
        games: 0,
        totalPoints: 0,
        ppg: 0,
        consistencyScore: 0,
        top6: 0,
        top12: 0,
        top24: 0,
        weeks: {},
      } satisfies ConsistencyPlayerRow)
    current.games += 1
    current.totalPoints += result.points
    current.top6 += result.rank <= 6 ? 1 : 0
    current.top12 += result.rank <= 12 ? 1 : 0
    current.top24 += result.rank <= 24 ? 1 : 0
    current.consistencyScore += result.rank <= 6 ? 6 : result.rank <= 12 ? 4 : result.rank <= 24 ? 2 : 0
    current.weeks[row.week] = result
    byPlayer.set(key, current)
  })

  const lowerQuery = query.toLowerCase().trim()
  return [...byPlayer.values()]
    .filter((row) => row.games >= minGames)
    .filter((row) => !lowerQuery || `${row.name} ${row.team} ${row.position}`.toLowerCase().includes(lowerQuery))
    .map((row) => ({ ...row, ppg: row.games ? row.totalPoints / row.games : 0 }))
    .sort(
      (a, b) =>
        b.consistencyScore - a.consistencyScore ||
        b.top6 - a.top6 ||
        b.top12 - a.top12 ||
        b.top24 - a.top24 ||
        b.ppg - a.ppg,
    )
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function calculatePreviousYearWeeklyPoints(row: PreviousYearWeeklyResult, scoring: ScoringRules) {
  if (row.position === 'K') {
    return value(row.fg) * scoring.fieldGoal + value(row.xpt) * scoring.extraPoint
  }
  if (row.position === 'DST') {
    return (
      value(row.sack) * scoring.dstSack +
      value(row.int) * scoring.dstInterception +
      value(row.fr) * scoring.dstFumbleRecovery +
      (value(row.td) + value(row.special_teams_td)) * scoring.dstTouchdown +
      value(row.safety) * scoring.dstSafety
    )
  }
  return (
    value(row.passing_yds) / scoring.passingYardsPerPoint +
    value(row.passing_tds ?? row.passing_td) * scoring.passingTd +
    value(row.passing_ints ?? row.passing_int) * scoring.interception +
    value(row.rushing_yds) / scoring.rushingYardsPerPoint +
    value(row.rushing_tds ?? row.rushing_td) * scoring.rushReceiveTd +
    value(row.receiving_rec) * scoring.reception +
    value(row.receiving_yds) / scoring.receivingYardsPerPoint +
    value(row.receiving_tds ?? row.receiving_td) * scoring.rushReceiveTd +
    value(row.fumbles_lost) * scoring.fumbleLost
  )
}

function getConsistencyCellClass(rank: number | undefined) {
  if (!rank) return 'consistencyBye'
  if (rank <= 6) return 'consistencyTop6'
  if (rank <= 12) return 'consistencyTop12'
  if (rank <= 24) return 'consistencyTop24'
  return 'consistencyMiss'
}

function buildDepthChartRows(depthCharts: RankingsFile['depthCharts'], teamWinTotals: RankingsFile['teamWinTotals']): DepthChartTeamRow[] {
  if (!depthCharts) return []
  const mergedCharts = Object.entries(depthCharts).reduce<Record<string, Partial<Record<Position, DepthChartEntry[]>>>>((merged, [team, positions]) => {
    const normalizedTeam = normalizeDisplayTeam(team)
    const current = merged[normalizedTeam] || {}
    POSITION_ORDER.forEach((position) => {
      const nextEntries = positions[position]
      if (!nextEntries?.length) return
      const currentEntries = current[position] || []
      const byOrder = new Map<number, DepthChartEntry>()
      ;[...currentEntries, ...nextEntries.map((entry) => ({ ...entry, team: normalizedTeam }))].forEach((entry) => byOrder.set(entry.order, entry))
      current[position] = [...byOrder.values()].sort((a, b) => a.order - b.order)
    })
    merged[normalizedTeam] = current
    return merged
  }, {})

  return Object.entries(mergedCharts)
    .map(([team, positions]) => {
      const row: DepthChartTeamRow = {
        team,
        projectedWinTotal: teamWinTotals?.[team]?.wins,
        QB: getDepthEntries(positions?.QB, 2),
        RB: getDepthEntries(positions?.RB, 3),
        WR: getDepthEntries(positions?.WR, 3),
        TE: getDepthEntries(positions?.TE, 2),
        K: getDepthEntries(positions?.K, 1),
      }
      return row
    })
    .sort((a, b) => a.team.localeCompare(b.team))
}

function getDepthEntries(entries: DepthChartEntry[] | undefined, limit: number) {
  return [...(entries || [])].sort((a, b) => a.order - b.order).slice(0, limit)
}

function normalizeDisplayTeam(team: string) {
  if (team === 'TXSO') return 'WAS'
  if (team === 'WSH') return 'WAS'
  return team
}

function getDepthPlayerTier(player: DepthChartEntry, playerTierByKey: Map<string, number>) {
  return getPlayerTier(player.name, player.team, playerTierByKey)
}

function getPlayerTier(name: string, team: string | undefined, playerTierByKey: Map<string, number>) {
  return (team ? playerTierByKey.get(playerKey(name, team)) : undefined) || playerTierByKey.get(playerKey(name))
}

function getSortableTier(name: string, team: string | undefined, playerTierByKey: Map<string, number>) {
  return getPlayerTier(name, team, playerTierByKey) || 999
}

function getDepthPlayerPosRank(player: DepthChartEntry, playerPosRankByKey: Map<string, string>) {
  return playerPosRankByKey.get(playerKey(player.name, player.team)) || playerPosRankByKey.get(playerKey(player.name))
}

function formatPositionRank(posRank: string) {
  return posRank.replace(/^[A-Z]+/, '')
}

function getPickNumberForSlotRound(slot: number, round: number, totalTeams: number) {
  const roundSlot = round % 2 === 1 ? slot : totalTeams - slot + 1
  return (round - 1) * totalTeams + roundSlot
}

function getSlotRoundForPick(pick: number, totalTeams: number) {
  const safePick = Math.max(1, pick)
  const round = Math.ceil(safePick / totalTeams)
  const withinRound = (safePick - 1) % totalTeams
  const slot = round % 2 === 1 ? withinRound + 1 : totalTeams - withinRound
  return { round, slot }
}

function clampLeagueDraftSlot(league: LeagueProfile, totalTeams: number) {
  return Math.min(totalTeams, Math.max(1, league.draftSlot || Number(league.externalTeamId) || 1))
}

function getTabFromHash(): AppTab {
  const value = window.location.hash.replace('#', '') as AppTab
  return ['players', 'board', 'consistency', 'depth', 'injuries', 'rookies', 'leagues'].includes(value) ? value : 'players'
}

function mergeLeagueProfiles(remote: LeagueProfile[], local: LeagueProfile[]) {
  const merged = new Map(remote.map((profile) => [profile.id, profile]))
  local.forEach((profile) => merged.set(profile.id, { ...(merged.get(profile.id) || {}), ...profile }))
  return [...merged.values()]
}

function getScoringWarnings(league: LeagueProfile) {
  const warnings: string[] = []
  if (league.scoring.interception > 0) warnings.push(`Interceptions thrown add ${league.scoring.interception} points; most leagues use a negative penalty.`)
  if (league.scoring.fumbleLost > 0) warnings.push(`Fumbles lost add ${league.scoring.fumbleLost} points; most leagues use a negative penalty.`)
  if (league.scoring.passingYardsPerPoint <= 0 || league.scoring.rushingYardsPerPoint <= 0 || league.scoring.receivingYardsPerPoint <= 0) warnings.push('Yards-per-point values must be greater than zero.')
  if (league.lineup.teams < 2) warnings.push('League size must include at least two teams.')
  return warnings
}

function formatRelativeTime(date: Date) {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : date.toLocaleDateString()
}

function buildRecommendations(players: RankedPlayer[], draft: DraftState, league: LeagueProfile): Recommendation[] {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const roster = draft.drafted.filter((pick) => pick.slot === userSlot)
  const rosterCounts = new Map<Position, number>()
  roster.forEach((pick) => pick.position && rosterCounts.set(pick.position, (rosterCounts.get(pick.position) || 0) + 1))
  const nextUserPick = findNextPickForSlot(draft.currentPick + 1, userSlot, totalTeams, draft.totalRounds || league.lineup.rosterSpots)

  return players.slice(0, 120).map((player) => {
    const target = getPositionTarget(player.position, league.lineup)
    const rostered = rosterCounts.get(player.position) || 0
    const need = Math.max(0, target - rostered)
    const adpValue = player.adp ? draft.currentPick - player.adp : 0
    const injuryPenalty = player.injury ? 10 : 0
    const score = player.draftScore + need * 14 + Math.max(0, adpValue) * 1.6 - injuryPenalty
    const reason = need > 0
      ? `Fills ${need === 1 ? 'an open' : `${need} open`} ${player.position} starter spot${need === 1 ? '' : 's'}`
      : adpValue >= 6
        ? `${Math.round(adpValue)} picks of value versus ADP`
        : `Top tier-${player.tier || '-'} ${player.position} available`
    const outlook = nextUserPick && player.adp && player.adp < nextUserPick
      ? `Unlikely to last to your next pick at ${nextUserPick}`
      : nextUserPick
        ? `May remain available at your next pick (${nextUserPick})`
        : 'Best available for the current pick'
    return { player, reason, outlook, score }
  }).sort((a, b) => b.score - a.score).slice(0, 8)
}

function getPositionTarget(position: Position, lineup: LineupSettings) {
  if (position === 'QB') return lineup.qb + lineup.superflex
  if (position === 'RB') return lineup.rb + Math.ceil(lineup.flex / 2)
  if (position === 'WR') return lineup.wr + Math.floor(lineup.flex / 2)
  if (position === 'TE') return lineup.te
  if (position === 'K') return lineup.k
  return lineup.dst
}

function findNextPickForSlot(startPick: number, slot: number, totalTeams: number, totalRounds: number) {
  const finalPick = totalTeams * totalRounds
  for (let pick = startPick; pick <= finalPick; pick += 1) {
    if (getSlotRoundForPick(pick, totalTeams).slot === slot) return pick
  }
  return undefined
}

function buildSleeperLeaguePatch(payload: any, current: LeagueProfile): Partial<LeagueProfile> {
  const positions = Array.isArray(payload.roster_positions) ? payload.roster_positions.map((value: unknown) => String(value).toUpperCase()) : []
  const settings = payload.scoring_settings || {}
  const count = (...values: string[]) => positions.filter((position: string) => values.includes(position)).length
  const yardsPerPoint = (raw: unknown, fallback: number) => {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback
    return numeric < 1 ? Math.round((1 / numeric) * 100) / 100 : numeric
  }
  const reception = Number(settings.rec ?? current.scoring.reception)
  const rankingPreset: Exclude<ScoringPreset, 'custom'> = reception >= 0.75 ? 'ppr' : reception >= 0.25 ? 'halfPpr' : 'standard'
  return {
    name: payload.name || current.name,
    externalLeagueId: String(payload.league_id || current.externalLeagueId),
    scoringPreset: rankingPreset,
    rankingPreset,
    lineup: {
      ...current.lineup,
      teams: Number(payload.total_rosters) || current.lineup.teams,
      rosterSpots: positions.length || current.lineup.rosterSpots,
      qb: count('QB'),
      rb: count('RB'),
      wr: count('WR'),
      te: count('TE'),
      flex: count('FLEX', 'W/R/T', 'WRRB_FLEX'),
      superflex: count('SUPER_FLEX', 'Q/W/R/T'),
      k: count('K'),
      dst: count('DEF', 'DST'),
      bench: count('BN'),
    },
    scoring: {
      ...current.scoring,
      passingYardsPerPoint: yardsPerPoint(settings.pass_yd, current.scoring.passingYardsPerPoint),
      passingTd: Number(settings.pass_td ?? current.scoring.passingTd),
      interception: Number(settings.pass_int ?? current.scoring.interception),
      rushingYardsPerPoint: yardsPerPoint(settings.rush_yd, current.scoring.rushingYardsPerPoint),
      receivingYardsPerPoint: yardsPerPoint(settings.rec_yd, current.scoring.receivingYardsPerPoint),
      rushReceiveTd: Number(settings.rush_td ?? settings.rec_td ?? current.scoring.rushReceiveTd),
      reception,
      fumbleLost: Number(settings.fum_lost ?? current.scoring.fumbleLost),
      fieldGoal: Number(settings.fgm ?? current.scoring.fieldGoal),
      extraPoint: Number(settings.xpm ?? current.scoring.extraPoint),
      dstSack: Number(settings.sack ?? current.scoring.dstSack),
      dstInterception: Number(settings.int ?? current.scoring.dstInterception),
      dstFumbleRecovery: Number(settings.fum_rec ?? current.scoring.dstFumbleRecovery),
      dstTouchdown: Number(settings.def_td ?? current.scoring.dstTouchdown),
      dstSafety: Number(settings.safe ?? current.scoring.dstSafety),
    },
  }
}

function getPositionColor(position: Position | undefined) {
  if (position === 'QB') return '#e53e3e'
  if (position === 'RB') return '#38a169'
  if (position === 'WR') return '#3182ce'
  if (position === 'TE') return '#805ad5'
  if (position === 'K') return '#d69e2e'
  if (position === 'DST') return '#dd6b20'
  return '#718096'
}

function formatShortPlayerName(name: string) {
  const parts = normalizePlayerName(name).split(' ').filter(Boolean)
  if (parts.length < 2) return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function depthPlayerClass(player: DepthChartEntry | undefined) {
  if (!player) return 'depthPlayer depthEmpty'
  return 'depthPlayer'
}

function parseInjuryDate(value: string | undefined) {
  if (!value) return 0
  const now = new Date()
  const parsed = Date.parse(`${value} ${now.getFullYear()}`)
  return Number.isFinite(parsed) ? parsed : 0
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizePlayerName(value: string) {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\b(QB|RB|WR|TE|K|DST|DEF)\d*\b/g, '')
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function playerKey(name: string, team?: string) {
  return slugify(team ? `${normalizePlayerName(name)}-${team}` : normalizePlayerName(name))
}

async function fetchManagedDraftState(currentDraft: DraftState, league: LeagueProfile): Promise<DraftState> {
  if (!API_URL) throw new Error('ESPN live sync requires the managed draft service. Manual drafting is available now.')
  const response = await fetch(`${API_URL}/drafts/${currentDraft.id}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`ESPN draft sync failed (${response.status}). Manual drafting is still available.`)
  const payload: { draft?: DraftState } = await response.json()
  if (!payload.draft) throw new Error('No ESPN draft feed is published yet. Use manual Draft buttons until the feed starts.')
  return { ...payload.draft, leagueId: league.id, source: 'espn', lastSyncedAt: new Date().toISOString() }
}

async function fetchSleeperDraftState(sourceId: string, league: LeagueProfile, currentDraft: DraftState): Promise<DraftState> {
  const draftData = await resolveSleeperDraft(sourceId)
  const draftId = String(draftData.draft_id || sourceId)
  const draftOrderUserIds = Object.keys(draftData.draft_order || {})
  const [picksData, rostersData, usersData] = await Promise.all([
    fetchSleeperJson<any[]>(`/draft/${draftId}/picks`).catch(() => []),
    draftData.league_id ? fetchSleeperJson<any[]>(`/league/${draftData.league_id}/rosters`).catch(() => []) : Promise.resolve([]),
    draftData.league_id
      ? fetchSleeperJson<any[]>(`/league/${draftData.league_id}/users`).catch(() => [])
      : Promise.all(draftOrderUserIds.map((userId) => fetchSleeperJson<any>(`/user/${userId}`).catch(() => null))).then((users) => users.filter(Boolean)),
  ])
  const totalTeams = Number(draftData.settings?.teams || league.lineup.teams || currentDraft.teamNames.length || 12)
  const totalRounds = Number(draftData.settings?.rounds || league.lineup.rosterSpots || currentDraft.totalRounds || 16)
  const teamNames = buildSleeperTeamNames(totalTeams, draftData.slot_to_roster_id || {}, draftData.draft_order || {}, rostersData, usersData)
  const drafted = [...picksData]
    .sort((a, b) => Number(a.pick_no || 0) - Number(b.pick_no || 0))
    .map((pick) => {
      const playerName = getSleeperPickPlayerName(pick)
      const slot = Number(pick.draft_slot || 1)
      return {
        pick: Number(pick.pick_no || getPickNumberForSlotRound(slot, Number(pick.round || 1), totalTeams)),
        round: Number(pick.round || Math.ceil(Number(pick.pick_no || 1) / totalTeams)),
        slot,
        teamName: teamNames[slot - 1] || `Team ${slot}`,
        playerId: String(pick.player_id || playerKey(playerName)),
        playerName,
        position: normalizeSleeperPosition(pick.metadata?.position),
        team: normalizeSleeperTeam(pick.metadata?.team),
      }
    })
  const totalPicks = totalTeams * totalRounds

  return {
    ...currentDraft,
    id: draftId,
    leagueId: league.id,
    currentPick: Math.min(drafted.length + 1, totalPicks + 1),
    drafted,
    teamNames,
    sleeperDraftId: draftId,
    source: 'sleeper',
    status: draftData.status || 'unknown',
    totalRounds,
    leagueName: draftData.metadata?.name || draftData.league_id || league.name,
    lastSyncedAt: new Date().toISOString(),
  }
}

async function resolveSleeperDraft(sourceId: string) {
  const directDraft = await fetchSleeperJson<any>(`/draft/${sourceId}`).catch(() => null)
  if (directDraft?.draft_id) return directDraft

  const leagueDrafts = await fetchSleeperJson<any[]>(`/league/${sourceId}/drafts`).catch(() => [])
  const sortedDrafts = [...leagueDrafts].sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
  const activeDraft = sortedDrafts.find((draft) => ['drafting', 'paused', 'pre_draft'].includes(draft.status))
  const selectedDraft = activeDraft || sortedDrafts[0]
  if (!selectedDraft?.draft_id) throw new Error('No Sleeper draft found for that draft or league ID.')
  return selectedDraft
}

async function fetchSleeperJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SLEEPER_API_BASE}${path}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Sleeper request failed: ${response.status}`)
  return response.json()
}

function buildSleeperTeamNames(totalTeams: number, slotToRosterId: Record<string, number>, draftOrder: Record<string, number>, rosters: any[], users: any[]) {
  const usersById = new Map(users.map((user) => [user.user_id, user]))
  const rostersById = new Map(rosters.map((roster) => [String(roster.roster_id), roster]))
  const userIdBySlot = new Map(Object.entries(draftOrder).map(([userId, slot]) => [Number(slot), userId]))
  return Array.from({ length: totalTeams }, (_, index) => {
    const slot = index + 1
    const rosterId = String(slotToRosterId[String(slot)] || slot)
    const roster = rostersById.get(rosterId)
    const user = roster?.owner_id ? usersById.get(roster.owner_id) : usersById.get(userIdBySlot.get(slot))
    return user?.metadata?.team_name || user?.display_name || `Team ${slot}`
  })
}

function getSleeperPickPlayerName(pick: any) {
  const firstName = pick.metadata?.first_name || ''
  const lastName = pick.metadata?.last_name || ''
  return `${firstName} ${lastName}`.trim() || pick.metadata?.player_name || 'Unknown Player'
}

function normalizeSleeperPosition(position: string | undefined): Position | undefined {
  if (!position) return undefined
  const normalized = position === 'DEF' ? 'DST' : position
  return POSITION_ORDER.includes(normalized as Position) ? (normalized as Position) : undefined
}

function normalizeSleeperTeam(team: string | undefined) {
  if (!team) return undefined
  if (team === 'JAC') return 'JAX'
  if (team === 'WSH') return 'WAS'
  return team
}

async function fetchSplitData(): Promise<RankingsFile> {
  const [rankings, projections, depthCharts, injuries, rookies, previousYearResults, previousYearWeeklyResults] = await Promise.all([
    fetchJson<SplitDataFiles['rankings']>(`${DATA_BASE_URL}/rankings.json`),
    fetchJson<SplitDataFiles['projections']>(`${DATA_BASE_URL}/projections.json`),
    fetchJson<SplitDataFiles['depthCharts']>(`${DATA_BASE_URL}/depth-charts.json`),
    fetchJson<SplitDataFiles['injuries']>(`${DATA_BASE_URL}/injuries.json`),
    fetchJson<SplitDataFiles['rookies']>(`${DATA_BASE_URL}/rookies.json`),
    fetchJson<SplitDataFiles['previousYearResults']>(`${DATA_BASE_URL}/previous-year-results.json`),
    fetchJson<NonNullable<SplitDataFiles['previousYearWeeklyResults']>>(`${DATA_BASE_URL}/previous-year-weekly-results.json`).catch(() => ({
      previousYearWeeklyResults: {},
    })),
  ])

  return composeSplitData({ rankings, projections, depthCharts, injuries, rookies, previousYearResults, previousYearWeeklyResults })
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.statusText}`)
  return response.json()
}

function composeSplitData(files: SplitDataFiles): RankingsFile {
  const depthCharts = files.depthCharts.depthCharts
  const teamWinTotals = files.depthCharts.teamWinTotals || {}
  const injuries = files.injuries.injuries || []
  const rookies = files.rookies.rookies || []
  const previousYearResults = files.previousYearResults.previousYearResults || {}
  const previousYearWeeklyResults = files.previousYearWeeklyResults?.previousYearWeeklyResults || {}
  const enrichments = buildClientEnrichments(depthCharts, injuries, rookies, previousYearResults)

  return {
    generatedAt: files.rankings.generatedAt,
    season: files.rankings.season,
    source: 'Split data files: FantasyPros rankings/projections/stats, CBS injuries/depth charts, rookie draft results',
    scoring: Object.fromEntries(
      Object.entries(files.rankings.scoring).map(([scoring, players]) => [
        scoring,
        (players || []).map((player) => {
          const projection = files.projections.projections?.[playerKey(player.name, player.team)] || files.projections.projections?.[playerKey(player.name)]
          const enrichment = enrichments.get(playerKey(player.name, player.team)) || enrichments.get(playerKey(player.name)) || {}
          return {
            ...player,
            points: projection?.points ?? player.points,
            projections: projection?.projections ?? player.projections,
            ...enrichment,
          }
        }),
      ]),
    ) as Partial<Record<ScoringPreset, Player[]>>,
    depthCharts,
    teamWinTotals,
    injuries,
    rookies,
    previousYearResults,
    previousYearWeeklyResults,
  }
}

function buildClientEnrichments(
  depthCharts: RankingsFile['depthCharts'],
  injuries: InjuryDetail[],
  rookies: RookieDetail[],
  previousYearResults: RankingsFile['previousYearResults'],
) {
  const enrichments = new Map<string, Partial<Player>>()

  Object.entries(depthCharts || {}).forEach(([team, positions]) => {
    Object.values(positions || {}).forEach((entries) => {
      ;(entries || []).forEach((entry) => mergeClientEnrichment(enrichments, entry.name, team, { depthChart: entry }))
    })
  })
  injuries.forEach((injury) => mergeClientEnrichment(enrichments, injury.name, injury.team || '', { injury }))
  rookies.forEach((rookie) => mergeClientEnrichment(enrichments, rookie.name, rookie.team || '', { rookie }))
  Object.values(previousYearResults || {}).forEach((entries) => {
    ;(entries || []).forEach((entry) => mergeClientEnrichment(enrichments, entry.name, entry.team || '', { previousYear: entry }))
  })

  return enrichments
}

function mergeClientEnrichment(enrichments: Map<string, Partial<Player>>, name: string, team: string, patch: Partial<Player>) {
  const cleanName = playerKey(name)
  const keys = team ? [cleanName, playerKey(name, team)] : [cleanName]
  keys.forEach((key) => enrichments.set(key, { ...(enrichments.get(key) || {}), ...patch }))
}

function PlayersBoard({
  availableCount,
  leagueName,
  leagueTeams,
  playersByPosition,
  query,
  recommendations,
  watchlistIds,
  watchlistPlayers,
  togglePosition,
  visiblePositions,
  onDraftPlayer,
  onPlayerSelect,
  onQueryChange,
  onToggleWatchlist,
}: {
  availableCount: number
  leagueName: string
  leagueTeams: number
  playersByPosition: Record<Position, RankedPlayer[]>
  query: string
  recommendations: Recommendation[]
  watchlistIds: string[]
  watchlistPlayers: RankedPlayer[]
  togglePosition: (position: Position) => void
  visiblePositions: Record<Position, boolean>
  onDraftPlayer: (player: RankedPlayer) => void
  onPlayerSelect: (player: RankedPlayer) => void
  onQueryChange: (query: string) => void
  onToggleWatchlist: (playerId: string) => void
}) {
  const activePositions = POSITION_ORDER.filter((position) => visiblePositions[position])

  return (
    <div className="playersBoard">
      <section className="playerListPanel">
        <div className="playerListHeader">
          <h2>Available Players - {leagueName}</h2>
          <div className="playerCount">{availableCount} players available</div>
        </div>

        <div className="playerControls">
          <label className="searchBox playerSearch">
            <Search size={14} />
            <span className="srOnly">Search available players</span>
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search players, teams, positions" />
          </label>
          <div className="positionToggles" aria-label="Visible position columns">
            {POSITION_ORDER.map((position) => (
              <button
                className={`positionToggle positionToggle${position} ${visiblePositions[position] ? 'active' : ''}`}
                key={position}
                onClick={() => togglePosition(position)}
                aria-pressed={visiblePositions[position]}
                type="button"
              >
                {position}
              </button>
            ))}
          </div>
        </div>

        <div className="playersContainer">
          {availableCount === 0 ? (
            <div className="noPlayers">All players have been drafted.</div>
          ) : (
            <section className="positionColumns">
              {activePositions.map((position) => (
                <div className={`positionColumn positionColumn${position}`} key={position}>
                  <div className="positionHeader">
                    <span className="positionLabel">{position}</span>
                    <span className="positionCount">({playersByPosition[position].length})</span>
                  </div>
                  <div className="positionPlayers">
                    {playersByPosition[position].map((player) => (
                      <PlayerSummary
                        isWatched={watchlistIds.includes(player.id)}
                        key={player.id}
                        leagueTeams={leagueTeams}
                        player={player}
                        variant="column"
                        onDraft={() => onDraftPlayer(player)}
                        onSelect={() => onPlayerSelect(player)}
                        onToggleWatchlist={() => onToggleWatchlist(player.id)}
                      />
                    ))}
                    {playersByPosition[position].length === 0 ? <p className="muted">No players.</p> : null}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </section>

      <aside className="shortlistRail">
        <div className="shortlistHeader">
          <div><h3>Draft now</h3><small>Roster-aware recommendations</small></div>
          <div className="shortlistCount">{recommendations.length} ranked</div>
        </div>
        <div className="shortlistContainer">
          {watchlistPlayers.length ? <div className="railSectionLabel"><Star size={13} /> Watchlist</div> : null}
          {watchlistPlayers.map((player) => (
            <PlayerSummary
              isWatched
              key={`watch-${player.id}`}
              leagueTeams={leagueTeams}
              player={player}
              variant="shortlist"
              onDraft={() => onDraftPlayer(player)}
              onSelect={() => onPlayerSelect(player)}
              onToggleWatchlist={() => onToggleWatchlist(player.id)}
            />
          ))}
          <div className="railSectionLabel">Best available</div>
          {recommendations.map((item) => (
            <div className="recommendationRailItem" key={item.player.id}>
              <PlayerSummary
                isWatched={watchlistIds.includes(item.player.id)}
                leagueTeams={leagueTeams}
                player={item.player}
                variant="shortlist"
                onDraft={() => onDraftPlayer(item.player)}
                onSelect={() => onPlayerSelect(item.player)}
                onToggleWatchlist={() => onToggleWatchlist(item.player.id)}
              />
              <p>{item.reason}. {item.outlook}</p>
            </div>
          ))}
          {recommendations.length === 0 ? <p className="muted">No matching players.</p> : null}
        </div>
      </aside>
    </div>
  )
}

function PlayerSummary({
  player,
  leagueTeams,
  variant,
  isWatched,
  onDraft,
  onSelect,
  onToggleWatchlist,
}: {
  player: RankedPlayer
  leagueTeams: number
  variant: 'shortlist' | 'column'
  isWatched: boolean
  onDraft: () => void
  onSelect: () => void
  onToggleWatchlist: () => void
}) {
  const tierColor = getTierColor(player.tier)
  const adpLabel = formatAdpRoundPick(player.adp, leagueTeams)
  const projectedPointsPerGame = formatProjectedPointsPerGame(player.projectedPoints)
  if (variant === 'shortlist') {
    return (
      <div className="shortlistItem" style={{ borderLeftColor: tierColor }}>
        <span className="shortlistRank" style={{ color: tierColor }}>
          #{player.rank}
        </span>
        <button className="playerNameButton shortlistName" onClick={onSelect} style={{ color: tierColor }} type="button">{player.name}</button>
        <span className="shortlistMeta">
          {player.position}{player.posRank ? ` ${player.posRank.replace(player.position, '')}` : ''} | {projectedPointsPerGame} | {adpLabel}
        </span>
        <span className="playerQuickActions">
          <button aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`} className={isWatched ? 'watched' : ''} onClick={onToggleWatchlist} type="button"><Star size={13} /></button>
          <button aria-label={`Draft ${player.name}`} className="draftQuickButton" onClick={onDraft} type="button">Draft</button>
        </span>
      </div>
    )
  }

  return (
    <div className="playerItem" style={{ borderLeftColor: tierColor }}>
      <div className="playerRank" style={{ color: tierColor }}>
        #{player.rank}
      </div>
      <div className="playerName" style={{ color: tierColor }}>
        <button className="playerNameButton" onClick={onSelect} type="button">{player.name}</button>
        <span className="playerInlineMeta">
          {adpLabel !== '-' ? (
            <span className="adpValue" title={player.adp ? `Overall average rank ${player.adp.toFixed(1)}` : ''}>
              ({adpLabel})
            </span>
          ) : null}
          <span className="projectionValue" style={{ color: tierColor }} title={`${player.projectedPoints.toFixed(1)} projected season points`}>
            {projectedPointsPerGame}
          </span>
          {player.injury ? <span className="injuryDot">I</span> : null}
          {player.rookie ? <span className="rookieDot">R</span> : null}
        </span>
      </div>
      <span className="playerQuickActions compactActions">
        <button aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`} className={isWatched ? 'watched' : ''} onClick={onToggleWatchlist} type="button"><Star size={12} /></button>
        <button aria-label={`Draft ${player.name}`} className="draftQuickButton" onClick={onDraft} type="button">+</button>
      </span>
    </div>
  )
}

function formatAdpRoundPick(adp: number | undefined, teams: number) {
  if (!adp || !teams) return '-'
  const overallPick = Math.max(1, Math.round(adp))
  const round = Math.ceil(overallPick / teams)
  const pick = ((overallPick - 1) % teams) + 1
  return `${round}.${pick.toString().padStart(2, '0')}`
}

function formatProjectedPointsPerGame(projectedPoints: number) {
  if (!Number.isFinite(projectedPoints) || projectedPoints <= 0) return '-'
  return (projectedPoints / NFL_REGULAR_SEASON_GAMES).toFixed(1)
}

function getTierColor(tier: number | undefined) {
  if (!tier || tier === 0) return '#4a5568'
  if (tier <= 2) return '#3182ce'
  if (tier <= 4) return '#38a169'
  if (tier <= 6) return '#d69e2e'
  if (tier <= 8) return '#dd6b20'
  if (tier <= 10) return '#e53e3e'
  return '#718096'
}

function SettingsPanel({
  league,
  profiles,
  selectedLeagueId,
  setSelectedLeagueId,
  updateLeague,
  updateScoring,
  updateLineup,
  draft,
  updateDraft,
  persistenceStatus,
  importStatus,
  isImporting,
  onAddLeague,
  onDuplicateLeague,
  onImportLeague,
  onRemoveLeague,
}: {
  league: LeagueProfile
  profiles: LeagueProfile[]
  selectedLeagueId: string
  setSelectedLeagueId: (leagueId: string) => void
  updateLeague: (patch: Partial<LeagueProfile>) => void
  updateScoring: (patch: Partial<ScoringRules>) => void
  updateLineup: (key: keyof LineupSettings, value: number) => void
  draft: DraftState
  updateDraft: (draft: DraftState) => void
  persistenceStatus: 'Saving' | 'Saved locally' | 'Synced'
  importStatus: string
  isImporting: boolean
  onAddLeague: () => void
  onDuplicateLeague: () => void
  onImportLeague: () => void
  onRemoveLeague: () => void
}) {
  const warnings = getScoringWarnings(league)
  return (
    <section className="settingsGrid">
      <div className="panel wide">
        <div className="settingsHeader">
          <div><h2>Active League</h2><p>Create a league or import its platform ID, then verify scoring before draft day.</p></div>
          <div className="settingsActions">
            <span className="saveStatus"><Check size={13} /> {persistenceStatus}</span>
            <button className="iconTextButton" onClick={onAddLeague} type="button"><Plus size={14} /> New</button>
            <button className="iconTextButton" onClick={onDuplicateLeague} type="button"><Copy size={14} /> Duplicate</button>
            <button className="iconTextButton" disabled={isImporting} onClick={onImportLeague} type="button"><RefreshCw className={isImporting ? 'spin' : ''} size={14} /> {isImporting ? 'Importing' : 'Import settings'}</button>
            <button aria-label={`Delete ${league.name}`} className="iconTextButton dangerButton" onClick={onRemoveLeague} type="button"><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="leagueSwitcher" aria-label="League selector">
          {profiles.map((profile) => (
            <button
              className={profile.id === selectedLeagueId ? 'selected' : ''}
              key={profile.id}
              onClick={() => setSelectedLeagueId(profile.id)}
              aria-pressed={profile.id === selectedLeagueId}
            >
              <span>{profile.platform.toUpperCase()}</span>
              <strong>{profile.name}</strong>
              <small>{profile.rankingPreset.toUpperCase()} rankings</small>
            </button>
          ))}
        </div>
        {importStatus ? <div className="syncStatus" role="status">{importStatus}</div> : null}
      </div>

      <div className="panel wide">
        <h2>League Profile</h2>
        <div className="formGrid">
          <label>
            League Name
            <input value={league.name} onChange={(event) => updateLeague({ name: event.target.value })} />
          </label>
          <label>
            Platform
            <select value={league.platform} onChange={(event) => updateLeague({ platform: event.target.value as Platform })}>
              <option value="sleeper">Sleeper</option>
              <option value="espn">ESPN</option>
            </select>
          </label>
          <label>
            League ID
            <input value={league.externalLeagueId} onChange={(event) => updateLeague({ externalLeagueId: event.target.value })} />
          </label>
          <label>
            Team ID
            <input value={league.externalTeamId || ''} onChange={(event) => updateLeague({ externalTeamId: event.target.value })} />
          </label>
          <NumberField label="Your Draft Slot" min={1} value={clampLeagueDraftSlot(league, league.lineup.teams)} onChange={(value) => updateLeague({ draftSlot: Math.min(league.lineup.teams, Math.max(1, value)) })} />
          <label>
            Ranking Set
            <select value={league.rankingPreset} onChange={(event) => updateLeague({ rankingPreset: event.target.value as Exclude<ScoringPreset, 'custom'> })}>
              <option value="standard">Standard</option>
              <option value="halfPpr">Half PPR</option>
              <option value="ppr">PPR</option>
            </select>
          </label>
        </div>
      </div>

      <div className="panel wide">
        <div className="settingsHeader"><div><h2>Scoring</h2><p>Penalty fields must be negative. Recommendations recalculate immediately.</p></div></div>
        {warnings.length ? (
          <div className="validationAlert" role="alert"><AlertTriangle size={18} /><div><strong>Review scoring before drafting</strong>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>
        ) : null}
        <div className="formGrid compact">
          <NumberField label="Pass TD" value={league.scoring.passingTd} onChange={(value) => updateScoring({ passingTd: value })} />
          <NumberField label="Pass Yds/Pt" value={league.scoring.passingYardsPerPoint} onChange={(value) => updateScoring({ passingYardsPerPoint: value })} />
          <NumberField label="Interception Thrown" value={league.scoring.interception} onChange={(value) => updateScoring({ interception: value })} />
          <NumberField label="Rec" value={league.scoring.reception} step={0.5} onChange={(value) => updateScoring({ reception: value })} />
          <NumberField label="Rush/Rec TD" value={league.scoring.rushReceiveTd} onChange={(value) => updateScoring({ rushReceiveTd: value })} />
          <NumberField label="Rush Yds/Pt" value={league.scoring.rushingYardsPerPoint} onChange={(value) => updateScoring({ rushingYardsPerPoint: value })} />
          <NumberField label="Rec Yds/Pt" value={league.scoring.receivingYardsPerPoint} onChange={(value) => updateScoring({ receivingYardsPerPoint: value })} />
          <NumberField label="Fumble Lost" value={league.scoring.fumbleLost} onChange={(value) => updateScoring({ fumbleLost: value })} />
          <NumberField label="FG" value={league.scoring.fieldGoal} onChange={(value) => updateScoring({ fieldGoal: value })} />
          <NumberField label="XP" value={league.scoring.extraPoint} onChange={(value) => updateScoring({ extraPoint: value })} />
        </div>
      </div>

      <div className="panel wide">
        <h2>Lineup</h2>
        <div className="formGrid compact">
          {(['teams', 'qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'dst', 'bench'] as (keyof LineupSettings)[]).map((key) => (
            <NumberField key={key} label={key.toUpperCase()} min={0} value={league.lineup[key]} onChange={(value) => updateLineup(key, value)} />
          ))}
        </div>
      </div>

      <div className="panel wide">
        <h2>Draft Slots</h2>
        <div className="teamGrid">
          {draft.teamNames.map((teamName, index) => (
            <label key={index}>
              Slot {index + 1}
              <input
                value={teamName}
                onChange={(event) => {
                  const teamNames = [...draft.teamNames]
                  teamNames[index] = event.target.value
                  updateDraft({ ...draft, teamNames })
                }}
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}

function NumberField({
  label,
  min,
  step = 1,
  value,
  onChange,
}: {
  label: string
  min?: number
  step?: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      {label}
      <input min={min} step={step} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function calculateProjectedPoints(player: Player, scoring: ScoringRules) {
  const stats = player.projections
  if (!stats) return player.points || 0

  if (player.position === 'K') {
    return value(stats.fg) * scoring.fieldGoal + value(stats.xpt) * scoring.extraPoint
  }

  if (player.position === 'DST') {
    return (
      value(stats.sack) * scoring.dstSack +
      value(stats.int) * scoring.dstInterception +
      value(stats.fr) * scoring.dstFumbleRecovery +
      value(stats.td) * scoring.dstTouchdown +
      value(stats.safety) * scoring.dstSafety
    )
  }

  return (
    value(stats.passing_yds) / scoring.passingYardsPerPoint +
    value(stats.passing_tds) * scoring.passingTd +
    value(stats.passing_ints) * scoring.interception +
    value(stats.rushing_yds) / scoring.rushingYardsPerPoint +
    value(stats.rushing_tds) * scoring.rushReceiveTd +
    value(stats.receiving_rec) * scoring.reception +
    value(stats.receiving_yds) / scoring.receivingYardsPerPoint +
    value(stats.receiving_tds) * scoring.rushReceiveTd +
    value(stats.fumbles_lost) * scoring.fumbleLost
  )
}

function calculateDraftScore(player: Player, league: LeagueProfile, projectedPoints: number) {
  const scarcity = { QB: 0.88, RB: 1.12, WR: 1.08, TE: 1.02, K: 0.45, DST: 0.48 }[player.position]
  const superflexBoost = player.position === 'QB' && league.lineup.superflex > 0 ? 32 : 0
  const starterDemand = getStarterDemand(player.position, league.lineup)
  const tierBoost = player.tier ? Math.max(0, 12 - player.tier) * 1.5 : 0
  return projectedPoints * scarcity + starterDemand + superflexBoost + tierBoost - (player.adp || player.rank) * 0.15
}

function getStarterDemand(position: Position, lineup: LineupSettings) {
  if (position === 'QB') return lineup.qb * 5 + lineup.superflex * 7
  if (position === 'RB') return lineup.rb * 5 + lineup.flex * 2
  if (position === 'WR') return lineup.wr * 5 + lineup.flex * 2
  if (position === 'TE') return lineup.te * 4 + lineup.flex
  if (position === 'K') return lineup.k
  return lineup.dst
}

function value(input: number | undefined) {
  return Number.isFinite(input) ? Number(input) : 0
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`draft-wizard:${key}`)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

async function persistState(profiles: LeagueProfile[], draftsByLeague: Record<string, DraftState>, draft: DraftState) {
  localStorage.setItem('draft-wizard:league-profiles', JSON.stringify(profiles))
  localStorage.setItem('draft-wizard:drafts-by-league', JSON.stringify(draftsByLeague))
  if (!API_URL) return 'Local'
  try {
    const response = await fetch(`${API_URL}/drafts/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles, draft }),
    })
    return response.ok ? 'Synced' : 'Local'
  } catch {
    return 'Local'
  }
}

createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
