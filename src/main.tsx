import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  Baby,
  BarChart3,
  Check,
  ChevronDown,
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
  X,
} from 'lucide-react'
import './style.css'

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
type ScoringPreset = 'standard' | 'halfPpr' | 'ppr' | 'custom'
type Platform = 'sleeper' | 'espn'
type AppTab = 'players' | 'board' | 'consistency' | 'depth' | 'injuries' | 'rookies' | 'leagues'
type RecommendationStrategy = 'balanced' | 'upside' | 'safeFloor' | 'zeroRb'
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
}

type Recommendation = {
  player: RankedPlayer
  reason: string
  outlook: string
  score: number
  strategy: RecommendationStrategy
  metrics: {
    replacementValue: number
    replacementPoints: number
    tierDrop: number
    availabilityAtNextPick?: number
    nextUserPick?: number
    rosterFit: number
    floor: number
    upside: number
    injuryRisk: number
    byeConflicts: number
  }
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
const RECOMMENDATION_STRATEGIES: Record<RecommendationStrategy, {
  label: string
  description: string
  weights: { rank: number; vor: number; tier: number; urgency: number; roster: number; floor: number; upside: number; value: number; bye: number }
}> = {
  balanced: {
    label: 'Balanced',
    description: 'Anchors to expert rank, then adjusts for league value, roster fit and urgency.',
    weights: { rank: 0.28, vor: 0.28, tier: 0.08, urgency: 0.10, roster: 0.14, floor: 0.04, upside: 0.02, value: 0.06, bye: 0.03 },
  },
  upside: {
    label: 'Upside',
    description: 'Prioritizes ceiling, breakouts and players before a tier drop.',
    weights: { rank: 0.22, vor: 0.22, tier: 0.15, urgency: 0.08, roster: 0.10, floor: 0.02, upside: 0.16, value: 0.05, bye: 0.02 },
  },
  safeFloor: {
    label: 'Safe Floor',
    description: 'Favors expert consensus and proven production without adding a separate injury penalty.',
    weights: { rank: 0.28, vor: 0.25, tier: 0.06, urgency: 0.08, roster: 0.14, floor: 0.12, upside: 0, value: 0.07, bye: 0.06 },
  },
  zeroRb: {
    label: 'Zero-RB',
    description: 'Builds WR/TE strength early without passing on elite consensus RB value.',
    weights: { rank: 0.24, vor: 0.25, tier: 0.10, urgency: 0.10, roster: 0.10, floor: 0.03, upside: 0.08, value: 0.10, bye: 0.04 },
  },
}
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
    scoringPreset: 'halfPpr',
    rankingPreset: 'halfPpr',
    lineup: {
      ...defaultLineup,
      teams: 10,
      flex: 1,
      bench: 7,
    },
    scoring: halfPprScoring,
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

function normalizeLeagueProfile(profile: LeagueProfile): LeagueProfile {
  if (profile.id !== 'gvsu' && profile.externalLeagueId !== '509557') return profile
  return {
    ...profile,
    scoringPreset: 'halfPpr',
    rankingPreset: 'halfPpr',
    scoring: { ...profile.scoring, ...halfPprScoring },
  }
}

function App() {
  const [data, setData] = useState<RankingsFile>(seedData)
  const [profiles, setProfiles] = useState<LeagueProfile[]>(() => loadLocal<LeagueProfile[]>('league-profiles', leagueProfiles).map(normalizeLeagueProfile))
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
  const [recommendationStrategy, setRecommendationStrategy] = useState<RecommendationStrategy>(() => {
    const stored = loadLocal<RecommendationStrategy>('recommendation-strategy', 'balanced')
    return stored in RECOMMENDATION_STRATEGIES ? stored : 'balanced'
  })
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
    localStorage.setItem('draft-wizard:recommendation-strategy', JSON.stringify(recommendationStrategy))
  }, [recommendationStrategy])

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
      }
    })
  }, [data, selectedLeague])

  const draftedIds = useMemo(() => new Set(draft.drafted.map((pick) => pick.playerId)), [draft.drafted])
  const draftedPlayerKeys = useMemo(() => new Set(draft.drafted.map((pick) => pick.playerName).filter(Boolean).map((name) => playerKey(name!))), [draft.drafted])
  const undraftedPlayers = useMemo<RankedPlayer[]>(() => (
    players
      .filter((player) => !draftedIds.has(player.id) && !draftedPlayerKeys.has(playerKey(player.name)))
      .sort((a, b) => a.rank - b.rank)
  ), [draftedIds, draftedPlayerKeys, players])
  const availablePlayers = useMemo<RankedPlayer[]>(() => {
    const lowerQuery = query.toLowerCase().trim()
    return undraftedPlayers
      .filter((player) => !lowerQuery || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(lowerQuery))
  }, [query, undraftedPlayers])

  const rankedRecommendations = useMemo(
    () => buildRecommendations(undraftedPlayers, players, draft, selectedLeague, recommendationStrategy),
    [draft, players, recommendationStrategy, selectedLeague, undraftedPlayers],
  )
  const recommendations = useMemo(() => rankedRecommendations.slice(0, 8), [rankedRecommendations])
  const watchlistIdSet = useMemo(() => new Set(watchlistIds), [watchlistIds])
  const undraftedPlayerById = useMemo(() => new Map(undraftedPlayers.map((player) => [player.id, player])), [undraftedPlayers])
  const recommendationByPlayerId = useMemo(() => new Map(rankedRecommendations.map((recommendation) => [recommendation.player.id, recommendation])), [rankedRecommendations])
  const watchlistPlayers = useMemo(
    () => watchlistIds.map((id) => undraftedPlayerById.get(id)).filter((player): player is RankedPlayer => Boolean(player)),
    [undraftedPlayerById, watchlistIds],
  )
  const watchlistRecommendations = useMemo(
    () => watchlistIds.map((id) => recommendationByPlayerId.get(id)).filter((recommendation): recommendation is Recommendation => Boolean(recommendation)),
    [recommendationByPlayerId, watchlistIds],
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
    const nextLeague = normalizeLeagueProfile({ ...selectedLeague, ...patch })
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

  const toggleWatchlist = useCallback((playerId: string) => {
    setWatchlistIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId])
  }, [])

  const clearWatchlist = useCallback(() => setWatchlistIds([]), [])

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
          strategy={recommendationStrategy}
          watchlistIdSet={watchlistIdSet}
          watchlistPlayers={watchlistPlayers}
          watchlistRecommendations={watchlistRecommendations}
          togglePosition={togglePosition}
          visiblePositions={visiblePositions}
          onPlayerSelect={setSelectedPlayer}
          onQueryChange={setQuery}
          onStrategyChange={setRecommendationStrategy}
          onToggleWatchlist={toggleWatchlist}
          onClearWatchlist={clearWatchlist}
        />
      ) : null}

      {activeTab === 'board' ? (
        <DraftBoardPage
          draft={draft}
          league={selectedLeague}
          recommendations={recommendations}
          strategy={recommendationStrategy}
          draftInput={draftInput}
          syncStatus={syncStatus}
          autoSync={autoSync}
          isSyncing={isSyncing}
          onAutoSyncChange={setAutoSync}
          onDraftInputChange={setDraftInput}
          onStrategyChange={setRecommendationStrategy}
          onSyncDraft={() => void syncDraftState(false)}
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
          isWatched={watchlistIdSet.has(selectedPlayer.id)}
          player={selectedPlayer}
          recommendation={recommendations.find((item) => item.player.id === selectedPlayer.id)}
          onClose={() => setSelectedPlayer(null)}
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
  const [showWarnings, setShowWarnings] = useState(false)
  return (
    <section className={`dataHealth ${ageHours > 48 || warnings.length ? 'dataHealthWarning' : ''}`} aria-label="Draft data status">
      <div className="dataHealthSummary">
        <div className="dataHealthPrimary">
          {ageHours <= 48 && !warnings.length ? <Check size={16} /> : <AlertTriangle size={16} />}
          <strong>{data.season} data</strong>
          <span>{ageHours <= 48 ? `Updated ${formatRelativeTime(generated)}` : 'Data may be stale'}</span>
          <span>{data.source}</span>
        </div>
        <div className="dataHealthSecondary">
          {warnings.length ? (
            <button
              aria-controls="scoring-warning-details"
              aria-expanded={showWarnings}
              className="healthWarningButton"
              onClick={() => setShowWarnings((current) => !current)}
              type="button"
            >
              {warnings.length} scoring warning{warnings.length === 1 ? '' : 's'}
              <ChevronDown aria-hidden="true" className={showWarnings ? 'expanded' : ''} size={14} />
            </button>
          ) : <span>Scoring verified</span>}
          <span>{persistenceStatus}</span>
        </div>
      </div>
      {warnings.length && showWarnings ? (
        <div aria-label="Scoring warning details" className="healthWarningDetails" id="scoring-warning-details" role="region">
          <div><strong>Review scoring</strong><span>Update this value on the Leagues tab before draft day.</span></div>
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
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

function StrategySelector({ value, onChange }: { value: RecommendationStrategy; onChange: (strategy: RecommendationStrategy) => void }) {
  return (
    <label className="strategySelector">
      <span className="srOnly">Recommendation strategy</span>
      <select aria-label="Recommendation strategy" onChange={(event) => onChange(event.target.value as RecommendationStrategy)} value={value}>
        {(Object.entries(RECOMMENDATION_STRATEGIES) as [RecommendationStrategy, (typeof RECOMMENDATION_STRATEGIES)[RecommendationStrategy]][]).map(([key, strategy]) => (
          <option key={key} value={key}>{strategy.label}</option>
        ))}
      </select>
    </label>
  )
}

function RecommendationSignals({ recommendation, compact = false }: { recommendation: Recommendation; compact?: boolean }) {
  const { metrics } = recommendation
  const signals = [
    metrics.replacementValue > 0 ? `VOR +${Math.round(metrics.replacementValue)}` : 'At replacement',
    metrics.nextUserPick && metrics.availabilityAtNextPick !== undefined
      ? `${Math.round(metrics.availabilityAtNextPick * 100)}% to pick ${metrics.nextUserPick}`
      : 'Final turn',
    metrics.tierDrop >= NFL_REGULAR_SEASON_GAMES * 0.5 ? `${(metrics.tierDrop / NFL_REGULAR_SEASON_GAMES).toFixed(1)} PPG cliff` : null,
  ].filter((signal): signal is string => Boolean(signal))

  return <div className={compact ? 'recommendationSignals compact' : 'recommendationSignals'}>{signals.slice(0, compact ? 2 : 4).map((signal) => <span key={signal}>{signal}</span>)}</div>
}

type ComparisonRow = {
  key: string
  label: string
  help?: string
  value: (player: RankedPlayer) => string
  numeric?: (player: RankedPlayer) => number | undefined
  best?: 'high' | 'low'
  samePositionOnly?: boolean
}

const PROJECTION_COMPARISON_FIELDS: { key: string; label: string; best?: 'high' | 'low' }[] = [
  { key: 'passing_att', label: 'Pass attempts', best: 'high' },
  { key: 'passing_cmp', label: 'Completions', best: 'high' },
  { key: 'passing_yds', label: 'Pass yards', best: 'high' },
  { key: 'passing_tds', label: 'Pass TD', best: 'high' },
  { key: 'passing_ints', label: 'Interceptions', best: 'low' },
  { key: 'rushing_att', label: 'Rush attempts', best: 'high' },
  { key: 'rushing_yds', label: 'Rush yards', best: 'high' },
  { key: 'rushing_tds', label: 'Rush TD', best: 'high' },
  { key: 'receiving_rec', label: 'Receptions', best: 'high' },
  { key: 'receiving_yds', label: 'Receiving yards', best: 'high' },
  { key: 'receiving_tds', label: 'Receiving TD', best: 'high' },
  { key: 'fumbles_lost', label: 'Fumbles lost', best: 'low' },
  { key: 'fg', label: 'Field goals', best: 'high' },
  { key: 'fga', label: 'Field-goal attempts', best: 'high' },
  { key: 'xpt', label: 'Extra points', best: 'high' },
  { key: 'sack', label: 'Sacks', best: 'high' },
  { key: 'int', label: 'Defensive INT', best: 'high' },
  { key: 'ff', label: 'Forced fumbles', best: 'high' },
  { key: 'fr', label: 'Fumble recoveries', best: 'high' },
  { key: 'td', label: 'Defensive TD', best: 'high' },
  { key: 'safety', label: 'Safeties', best: 'high' },
  { key: 'pa', label: 'Points allowed', best: 'low' },
  { key: 'yds_agn', label: 'Yards allowed', best: 'low' },
]

function WatchlistComparison({
  players,
  recommendations,
  leagueTeams,
  onPlayerSelect,
  onToggleWatchlist,
  onClearWatchlist,
}: {
  players: RankedPlayer[]
  recommendations: Recommendation[]
  leagueTeams: number
  onPlayerSelect: (player: RankedPlayer) => void
  onToggleWatchlist: (playerId: string) => void
  onClearWatchlist: () => void
}) {
  const [showAllDetails, setShowAllDetails] = useState(false)
  useEffect(() => { if (!players.length) setShowAllDetails(false) }, [players.length])
  const samePosition = players.length > 0 && players.every((player) => player.position === players[0].position)
  const recommendationById = new Map(recommendations.map((recommendation) => [recommendation.player.id, recommendation]))
  const recommendationFor = (player: RankedPlayer) => recommendationById.get(player.id)
  const projectionRows = PROJECTION_COMPARISON_FIELDS
    .filter((field) => players.some((player) => Number.isFinite(player.projections?.[field.key])))
    .map<ComparisonRow>((field) => ({
      key: `projection-${field.key}`,
      label: field.label,
      value: (player) => formatComparisonStat(player.projections?.[field.key]),
      numeric: (player) => getFiniteComparisonValue(player.projections?.[field.key]),
      best: field.best,
    }))

  if (!players.length) return null

  const comparisonSections: { label: string; rows: ComparisonRow[] }[] = [
    {
      label: 'Draft decision',
      rows: [
        { key: 'model-score', label: 'Model score', help: 'Relative recommendation score using the selected strategy', value: (player) => recommendationFor(player) ? Math.round(recommendationFor(player)!.score).toString() : '—', numeric: (player) => recommendationFor(player)?.score, best: 'high' },
        { key: 'vor', label: 'Value over replacement', help: 'Projected season points above the current replacement player at this position', value: (player) => recommendationFor(player) ? `+${formatComparisonStat(recommendationFor(player)!.metrics.replacementValue)} pts` : '—', numeric: (player) => recommendationFor(player)?.metrics.replacementValue, best: 'high' },
        { key: 'replacement', label: 'Replacement level', value: (player) => recommendationFor(player) ? `${formatProjectedPointsPerGame(recommendationFor(player)!.metrics.replacementPoints)} PPG` : '—' },
        { key: 'tier-drop', label: 'Tier cliff', help: 'Projected PPG lost by waiting for the next tier at this position', value: (player) => recommendationFor(player) ? `${(recommendationFor(player)!.metrics.tierDrop / NFL_REGULAR_SEASON_GAMES).toFixed(1)} PPG` : '—', numeric: (player) => recommendationFor(player)?.metrics.tierDrop, best: 'high' },
        { key: 'availability', label: 'Chance at next pick', value: (player) => formatNextPickAvailability(recommendationFor(player)) },
        { key: 'roster-fit', label: 'Roster fit', value: (player) => recommendationFor(player) ? `${Math.round(recommendationFor(player)!.metrics.rosterFit)}/100` : '—', numeric: (player) => recommendationFor(player)?.metrics.rosterFit, best: 'high' },
        { key: 'floor', label: 'Floor score', value: (player) => recommendationFor(player) ? `${Math.round(recommendationFor(player)!.metrics.floor)}/100` : '—', numeric: (player) => recommendationFor(player)?.metrics.floor, best: 'high' },
        { key: 'upside', label: 'Upside score', value: (player) => recommendationFor(player) ? `${Math.round(recommendationFor(player)!.metrics.upside)}/100` : '—', numeric: (player) => recommendationFor(player)?.metrics.upside, best: 'high' },
        { key: 'why-now', label: 'Why now', value: (player) => recommendationFor(player)?.reason || '—' },
        { key: 'outlook', label: 'Pick outlook', value: (player) => recommendationFor(player)?.outlook || '—' },
      ],
    },
    {
      label: 'Draft value',
      rows: [
        { key: 'rank', label: 'Overall rank', value: (player) => `#${player.rank}`, numeric: (player) => player.rank, best: 'low' },
        { key: 'position-rank', label: 'Position rank', value: (player) => player.posRank || '—', numeric: getPositionRankNumber, best: 'low', samePositionOnly: true },
        { key: 'tier', label: 'Tier', value: (player) => player.tier ? `Tier ${player.tier}` : '—', numeric: (player) => getFiniteComparisonValue(player.tier), best: 'low' },
        { key: 'adp', label: 'ADP', help: 'Round.pick with overall ADP in parentheses', value: (player) => player.adp ? `${formatAdpRoundPick(player.adp, leagueTeams)} (#${player.adp.toFixed(1)})` : '—' },
        { key: 'adp-value', label: 'Value vs ADP', help: 'Positive means the player is ranked ahead of market cost', value: formatAdpValue, numeric: getAdpValue, best: 'high' },
      ],
    },
    {
      label: 'Projected output',
      rows: [
        { key: 'projected-points', label: 'Season points', value: (player) => formatComparisonStat(player.projectedPoints), numeric: (player) => getFiniteComparisonValue(player.projectedPoints), best: 'high' },
        { key: 'projected-ppg', label: 'Projected PPG', value: (player) => formatProjectedPointsPerGame(player.projectedPoints), numeric: (player) => player.projectedPoints > 0 ? player.projectedPoints / NFL_REGULAR_SEASON_GAMES : undefined, best: 'high' },
        { key: 'projection-trend', label: 'Year-over-year', help: 'Projected PPG compared with last season', value: formatProjectionTrend, numeric: getProjectionTrend, best: 'high' },
      ],
    },
    {
      label: 'Last season',
      rows: [
        { key: 'previous-ppg', label: 'Fantasy PPG', value: (player) => formatPreviousYearPointsPerGame(player.previousYear), numeric: (player) => getPreviousYearPointsPerGame(player.previousYear), best: 'high' },
        { key: 'previous-points', label: 'Fantasy points', value: (player) => formatComparisonStat(player.previousYear?.fpts), numeric: (player) => getFiniteComparisonValue(player.previousYear?.fpts), best: 'high' },
        { key: 'previous-games', label: 'Games played', value: (player) => player.previousYear?.games ? String(player.previousYear.games) : '—', numeric: (player) => getFiniteComparisonValue(player.previousYear?.games), best: 'high' },
        { key: 'previous-finish', label: 'Position finish', value: (player) => player.previousYear?.rank ? `${player.position}${player.previousYear.rank}` : '—', numeric: (player) => getFiniteComparisonValue(player.previousYear?.rank), best: 'low', samePositionOnly: true },
      ],
    },
    {
      label: 'Availability & risk',
      rows: [
        { key: 'health', label: 'Health', value: formatHealth, numeric: (player) => getPlayerInjuryRisk(player), best: 'low' },
        { key: 'bye', label: 'Bye week', value: (player) => player.bye ? `Week ${player.bye}` : '—' },
        { key: 'depth', label: 'Depth-chart role', value: (player) => player.depthChart ? `${player.position}${player.depthChart.order}` : '—', numeric: (player) => getFiniteComparisonValue(player.depthChart?.order), best: 'low', samePositionOnly: true },
        { key: 'experience', label: 'Age / experience', value: formatExperience },
        { key: 'rookie', label: 'Rookie profile', value: formatRookieProfile },
        { key: 'status', label: 'Roster status', value: (player) => player.sleeper?.status ? titleCase(player.sleeper.status) : '—' },
      ],
    },
  ]
  const populatedSections = comparisonSections.map((section) => ({ ...section, rows: section.rows.filter((row) => players.some((player) => row.value(player) !== '—')) }))
  const sections = populatedSections
  const hasDetails = populatedSections.some((section) => section.rows.length) || projectionRows.length > 0

  const insights = getComparisonInsights(players, recommendationById)

  return (
    <section className="watchComparePanel" aria-label="Watched player comparison" id="watchlist-comparison">
      <div className="watchCompareHeader">
        <div>
          <h3>Watchlist Compare</h3>
          <small aria-live="polite">
            {players.length === 1 ? 'Star another player to compare side by side.' : `${players.length} players compared · aligned rows show the differences.`}
          </small>
        </div>
        <div className="watchCompareActions">
          {hasDetails ? (
            <button aria-expanded={showAllDetails} className="watchCompareToggle" onClick={() => setShowAllDetails((current) => !current)} type="button">
              {showAllDetails ? 'Hide details' : 'Show all details'}
            </button>
          ) : null}
          <button aria-label="Clear all watched players" className="watchCompareClear" onClick={onClearWatchlist} type="button">Clear all</button>
        </div>
      </div>

      {insights.length ? (
        <div className="watchCompareInsights" aria-label="Comparison highlights">
          {insights.map((insight) => <div key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong></div>)}
        </div>
      ) : null}

      {showAllDetails ? (
        <>
          <div className="watchCompareScroller" tabIndex={0}>
            <table className="watchCompareTable">
              <caption className="srOnly">Side-by-side details for starred players</caption>
              <thead>
                <tr>
                  <th className="watchCompareMetricHead" scope="col">Metric</th>
                  {players.map((player) => {
                    const tierColor = getTierColor(player.tier)
                    return (
                      <th className="watchComparePlayerHead" key={player.id} scope="col" style={{ borderTopColor: tierColor }}>
                        <div className="watchComparePlayerTitle">
                          <span className={`position position${player.position}`}>{player.position}</span>
                          <button aria-label={`Remove ${player.name} from watchlist`} aria-pressed="true" className="watchCompareRemove watched" onClick={() => onToggleWatchlist(player.id)} type="button"><Star size={14} /></button>
                        </div>
                        <button className="playerNameButton" onClick={() => onPlayerSelect(player)} style={{ color: tierColor }} type="button">{player.name}</button>
                        <small>{player.team || 'FA'} · {player.posRank || 'Unranked'} · Tier {player.tier || '—'}</small>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => section.rows.length ? (
                  <React.Fragment key={section.label}>
                    <tr className="watchCompareSectionRow"><th colSpan={players.length + 1} scope="colgroup">{section.label}</th></tr>
                    {section.rows.map((row) => <ComparisonTableRow key={row.key} players={players} row={row} samePosition={samePosition} />)}
                  </React.Fragment>
                ) : null)}
                {projectionRows.length ? (
                  <React.Fragment>
                    <tr className="watchCompareSectionRow"><th colSpan={players.length + 1} scope="colgroup">Full projection breakdown</th></tr>
                    {projectionRows.map((row) => <ComparisonTableRow key={row.key} players={players} row={row} samePosition={samePosition} />)}
                  </React.Fragment>
                ) : null}
              </tbody>
            </table>
          </div>
          {players.length > 3 ? <p className="watchCompareScrollHint">Scroll sideways to compare every starred player.</p> : null}
        </>
      ) : null}
    </section>
  )
}

function ComparisonTableRow({ players, row, samePosition }: { players: RankedPlayer[]; row: ComparisonRow; samePosition: boolean }) {
  const bestValue = getBestComparisonValue(row, players, samePosition)
  return (
    <tr>
      <th className="watchCompareMetric" scope="row"><span title={row.help}>{row.label}</span></th>
      {players.map((player) => {
        const numericValue = row.numeric?.(player)
        const isBest = bestValue !== undefined && numericValue !== undefined && Math.abs(numericValue - bestValue) < 0.001
        return (
          <td className={isBest ? 'watchCompareValue best' : 'watchCompareValue'} key={player.id}>
            <strong>{row.value(player)}</strong>
            {isBest ? <span className="watchCompareBest"><Check size={10} /> Best</span> : null}
          </td>
        )
      })}
    </tr>
  )
}

function getBestComparisonValue(row: ComparisonRow, players: RankedPlayer[], samePosition: boolean) {
  if (!row.numeric || !row.best || (row.samePositionOnly && !samePosition)) return undefined
  const values = players.map((player) => row.numeric?.(player)).filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (values.length < 2 || new Set(values.map((value) => value.toFixed(3))).size < 2) return undefined
  return row.best === 'high' ? Math.max(...values) : Math.min(...values)
}

function getComparisonInsights(players: RankedPlayer[], recommendationById: Map<string, Recommendation>) {
  const insights: { label: string; value: string }[] = []
  const vorLeader = [...players]
    .filter((player) => recommendationById.get(player.id))
    .sort((a, b) => (recommendationById.get(b.id)?.metrics.replacementValue || 0) - (recommendationById.get(a.id)?.metrics.replacementValue || 0))[0]
  if (vorLeader) insights.push({ label: 'VOR leader', value: `${vorLeader.name} · +${formatComparisonStat(recommendationById.get(vorLeader.id)!.metrics.replacementValue)} pts` })

  const projectionLeader = [...players].filter((player) => player.projectedPoints > 0).sort((a, b) => b.projectedPoints - a.projectedPoints)[0]
  if (projectionLeader) insights.push({ label: 'Projection leader', value: `${projectionLeader.name} · ${formatProjectedPointsPerGame(projectionLeader.projectedPoints)} PPG` })

  const valueLeader = [...players].filter((player) => getAdpValue(player) !== undefined).sort((a, b) => (getAdpValue(b) || 0) - (getAdpValue(a) || 0))[0]
  const value = valueLeader ? getAdpValue(valueLeader) : undefined
  if (valueLeader && value !== undefined) insights.push({ label: 'Best ADP value', value: `${valueLeader.name} · ${value >= 0 ? '+' : ''}${value.toFixed(1)} picks` })

  const safest = [...players].sort((a, b) => getPlayerInjuryRisk(a) - getPlayerInjuryRisk(b) || (b.previousYear?.games || 0) - (a.previousYear?.games || 0))[0]
  if (safest) insights.push({ label: 'Safest profile', value: `${safest.name} · ${getPlayerInjuryRisk(safest) ? `${Math.round(getPlayerInjuryRisk(safest))}% risk` : 'no injury flag'}` })
  return insights
}

function formatNextPickAvailability(recommendation: Recommendation | undefined) {
  if (!recommendation) return '—'
  const { availabilityAtNextPick, nextUserPick } = recommendation.metrics
  if (availabilityAtNextPick === undefined || !nextUserPick) return 'Final turn'
  return `${Math.round(availabilityAtNextPick * 100)}% to pick ${nextUserPick}`
}

function getFiniteComparisonValue(input: number | undefined) {
  return Number.isFinite(input) ? Number(input) : undefined
}

function getPositionRankNumber(player: RankedPlayer) {
  const rank = Number(player.posRank?.replace(/\D/g, ''))
  return Number.isFinite(rank) && rank > 0 ? rank : undefined
}

function getAdpValue(player: RankedPlayer) {
  return player.adp ? player.adp - player.rank : undefined
}

function formatAdpValue(player: RankedPlayer) {
  const value = getAdpValue(player)
  if (value === undefined) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} picks`
}

function getProjectionTrend(player: RankedPlayer) {
  const previousPpg = getPreviousYearPointsPerGame(player.previousYear)
  const projectedPpg = player.projectedPoints > 0 ? player.projectedPoints / NFL_REGULAR_SEASON_GAMES : 0
  if (!previousPpg || !projectedPpg) return undefined
  return ((projectedPpg - previousPpg) / previousPpg) * 100
}

function formatProjectionTrend(player: RankedPlayer) {
  const trend = getProjectionTrend(player)
  if (trend === undefined) return '—'
  return `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`
}

function formatComparisonStat(input: number | undefined) {
  if (!Number.isFinite(input)) return '—'
  const number = Number(input)
  return number.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: Math.abs(number - Math.round(number)) > 0.04 ? 1 : 0 })
}

function formatHealth(player: RankedPlayer) {
  if (!player.injury) return 'No injury flag'
  return `${player.injury.status}${player.injury.injury ? ` · ${player.injury.injury}` : ''}`
}

function formatExperience(player: RankedPlayer) {
  const details = [
    player.sleeper?.age ? `Age ${player.sleeper.age}` : null,
    player.sleeper?.yearsExp !== undefined ? `${player.sleeper.yearsExp} yr exp` : null,
  ].filter(Boolean)
  return details.length ? details.join(' · ') : '—'
}

function formatRookieProfile(player: RankedPlayer) {
  if (!player.rookie) return '—'
  const draft = player.rookie.draftRound ? `Round ${player.rookie.draftRound}${player.rookie.draftPick ? ` · Pick ${player.rookie.draftPick}` : ''}` : 'Undrafted'
  return `${draft}${player.rookie.college ? ` · ${player.rookie.college}` : ''}`
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function PlayerDrawer({
  player,
  recommendation,
  isWatched,
  onClose,
  onToggleWatchlist,
}: {
  player: RankedPlayer
  recommendation?: Recommendation
  isWatched: boolean
  onClose: () => void
  onToggleWatchlist: () => void
}) {
  return (
    <div className="drawerBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }} role="presentation">
      <aside aria-label={`${player.name} details`} aria-modal="true" className="playerDrawer" role="dialog">
        <div className="drawerHeader">
          <div><span className={`position position${player.position}`}>{player.position}</span><h2>{player.name}</h2><p>{player.team} · {player.posRank || 'Unranked'} · Tier {player.tier || '-'}</p></div>
          <button aria-label="Close player details" className="drawerClose" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        {recommendation ? <div className="drawerRecommendation"><strong>Why now · {RECOMMENDATION_STRATEGIES[recommendation.strategy].label}</strong><span>{recommendation.reason}. {recommendation.outlook}</span><RecommendationSignals recommendation={recommendation} /></div> : null}
        <div className="playerMetricGrid">
          <div><span>Overall rank</span><strong>#{player.rank}</strong></div>
          <div><span>ADP</span><strong>{player.adp?.toFixed(1) || '-'}</strong></div>
          <div><span>Projected PPG</span><strong>{formatProjectedPointsPerGame(player.projectedPoints)}</strong></div>
          <div><span>Bye</span><strong>{player.bye || '-'}</strong></div>
        </div>
        {player.injury ? <div className="detailNotice injuryNotice"><AlertTriangle size={16} /><div><strong>{player.injury.status}</strong><span>{player.injury.injury || 'Injury reported'} · {player.injury.updated || 'Update pending'}</span></div></div> : null}
        {player.rookie ? <div className="detailNotice"><Baby size={16} /><div><strong>Rookie · Pick #{player.rookie.draftPick || '-'}</strong><span>{player.rookie.college || 'College unavailable'} · {player.rookie.source}</span></div></div> : null}
        {player.depthChart ? <div className="detailNotice"><ListTree size={16} /><div><strong>{player.position}{player.depthChart.order} on the depth chart</strong><span>{player.depthChart.source}</span></div></div> : null}
        <button className={isWatched ? 'iconTextButton drawerWatchButton watched' : 'iconTextButton drawerWatchButton'} onClick={onToggleWatchlist} type="button"><Star size={16} /> {isWatched ? 'Watching' : 'Add to watchlist'}</button>
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
  strategy,
  draftInput,
  syncStatus,
  autoSync,
  isSyncing,
  onAutoSyncChange,
  onDraftInputChange,
  onStrategyChange,
  onSyncDraft,
}: {
  draft: DraftState
  league: LeagueProfile
  recommendations: Recommendation[]
  strategy: RecommendationStrategy
  draftInput: string
  syncStatus: string
  autoSync: boolean
  isSyncing: boolean
  onAutoSyncChange: (value: boolean) => void
  onDraftInputChange: (value: string) => void
  onStrategyChange: (strategy: RecommendationStrategy) => void
  onSyncDraft: () => void
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
        </div>
      </div>
      {syncStatus ? <div className="syncStatus" role="status">{syncStatus}</div> : null}
      <div className="draftCommandGrid">
        <section className="commandCard">
          <div className="commandCardHeader recommendationCommandHeader">
            <div><h3>Top recommendations</h3><small>{RECOMMENDATION_STRATEGIES[strategy].description}</small></div>
            <div className="recommendationHeaderControls"><StrategySelector value={strategy} onChange={onStrategyChange} /><span>{recommendations.length} options</span></div>
          </div>
          <div className="recommendationStrip">
            {recommendations.slice(0, 4).map((item, index) => (
              <article className="recommendationCard" key={item.player.id}>
                <span className="recommendationNumber">{index + 1}</span>
                <div className="recommendationCardBody">
                  <strong>{item.player.name}</strong>
                  <small>{item.player.position} · {item.player.team} · {item.reason}</small>
                  <RecommendationSignals recommendation={item} compact />
                </div>
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
  return [...merged.values()].map(normalizeLeagueProfile)
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

function buildRecommendations(
  players: RankedPlayer[],
  allPlayers: RankedPlayer[],
  draft: DraftState,
  league: LeagueProfile,
  strategy: RecommendationStrategy,
): Recommendation[] {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const roster = draft.drafted.filter((pick) => pick.slot === userSlot)
  const rosterCounts = new Map<Position, number>()
  roster.forEach((pick) => pick.position && rosterCounts.set(pick.position, (rosterCounts.get(pick.position) || 0) + 1))
  const draftedPositionCounts = new Map<Position, number>()
  draft.drafted.forEach((pick) => pick.position && draftedPositionCounts.set(pick.position, (draftedPositionCounts.get(pick.position) || 0) + 1))
  const playerLookup = new Map<string, RankedPlayer>()
  allPlayers.forEach((player) => {
    playerLookup.set(player.id, player)
    playerLookup.set(playerKey(player.name), player)
    playerLookup.set(playerKey(player.name, player.team), player)
  })
  const byeCounts = new Map<number, number>()
  roster.forEach((pick) => {
    const ranked = playerLookup.get(pick.playerId) || (pick.playerName ? playerLookup.get(playerKey(pick.playerName, pick.team)) || playerLookup.get(playerKey(pick.playerName)) : undefined)
    if (ranked?.bye) byeCounts.set(ranked.bye, (byeCounts.get(ranked.bye) || 0) + 1)
  })
  const positionPools = Object.fromEntries(POSITION_ORDER.map((position) => [
    position,
    players.filter((player) => player.position === position).sort((a, b) => a.rank - b.rank),
  ])) as Record<Position, RankedPlayer[]>
  const replacementByPosition = new Map<Position, RankedPlayer | undefined>()
  POSITION_ORDER.forEach((position) => {
    const leagueDemand = Math.max(1, Math.round(totalTeams * getLeagueStarterShare(position, league.lineup)))
    const remainingDemand = Math.max(1, leagueDemand - (draftedPositionCounts.get(position) || 0))
    replacementByPosition.set(position, positionPools[position][Math.min(positionPools[position].length - 1, remainingDemand - 1)])
  })
  const nextUserPick = findNextPickForSlot(draft.currentPick + 1, userSlot, totalTeams, draft.totalRounds || league.lineup.rosterSpots)
  const currentRound = getSlotRoundForPick(draft.currentPick, totalTeams).round
  const totalRounds = draft.totalRounds || league.lineup.rosterSpots
  const weights = RECOMMENDATION_STRATEGIES[strategy].weights
  const bestAvailableRank = Math.min(...players.map((player) => player.rank))
  const replacementValueByPlayerId = new Map(players.map((player) => {
    const replacementPoints = replacementByPosition.get(player.position)?.projectedPoints || 0
    return [player.id, Math.max(0, player.projectedPoints - replacementPoints)] as const
  }))
  const maxReplacementValue = Math.max(0, ...replacementValueByPlayerId.values())

  return players.map((player) => {
    const pool = positionPools[player.position]
    const poolIndex = pool.findIndex((candidate) => candidate.id === player.id)
    const replacement = replacementByPosition.get(player.position)
    const replacementPoints = replacement?.projectedPoints || 0
    const replacementValue = replacementValueByPlayerId.get(player.id) || 0
    const replacementRankGap = replacement ? Math.max(0, replacement.rank - player.rank) : 0
    const rankScore = clampRecommendationScore(100 - Math.max(0, player.rank - bestAvailableRank) * 5)
    const vorScore = player.projectedPoints > 0 && maxReplacementValue > 0
      ? clampRecommendationScore((replacementValue / maxReplacementValue) * 100)
      : clampRecommendationScore(replacementRankGap * 3)
    const nextTierPlayer = pool.slice(poolIndex + 1).find((candidate) => (
      player.tier && candidate.tier ? candidate.tier > player.tier : candidate.rank >= player.rank + 4
    ))
    const tierDrop = nextTierPlayer ? Math.max(0, player.projectedPoints - nextTierPlayer.projectedPoints) : 0
    const tierRankGap = nextTierPlayer ? Math.max(0, nextTierPlayer.rank - player.rank) : 0
    const tierScore = clampRecommendationScore(
      (tierDrop / Math.max(1, player.projectedPoints)) * 500 + tierRankGap * 3,
    )
    const availabilityAtNextPick = nextUserPick ? estimateAvailabilityAtPick(player, nextUserPick, totalTeams) : undefined
    const urgencyScore = availabilityAtNextPick === undefined ? 100 : (1 - availabilityAtNextPick) * 100
    const rosterFit = getRosterFitScore(player.position, rosterCounts, league.lineup, roster.length, currentRound, totalRounds)
    const floor = getPlayerFloorScore(player)
    const upside = getPlayerUpsideScore(player, poolIndex, pool.length)
    const injuryRisk = getPlayerInjuryRisk(player)
    const byeConflicts = player.bye ? byeCounts.get(player.bye) || 0 : 0
    const byeRisk = clampRecommendationScore(byeConflicts * (currentRound <= 5 ? 18 : 32))
    const referenceRank = player.adp || player.rank
    const valueScore = clampRecommendationScore(50 + (draft.currentPick - referenceRank) * 4)
    let strategyAdjustment = 0

    if ((player.position === 'K' || player.position === 'DST') && currentRound < Math.max(8, totalRounds - 3)) strategyAdjustment -= 45
    if (strategy === 'zeroRb') {
      if (player.position === 'RB' && currentRound <= 5) {
        const eliteConsensusException = player.rank <= bestAvailableRank + 1 && (!player.tier || player.tier <= 1)
        strategyAdjustment -= eliteConsensusException ? 0 : player.tier && player.tier <= 1 ? 18 : 38
      }
      if ((player.position === 'WR' || player.position === 'TE') && currentRound <= 5) strategyAdjustment += 8
      if (player.position === 'RB' && currentRound >= 6) strategyAdjustment += 18
    }

    const score =
      rankScore * weights.rank +
      vorScore * weights.vor +
      tierScore * weights.tier +
      urgencyScore * weights.urgency +
      rosterFit * weights.roster +
      floor * weights.floor +
      upside * weights.upside +
      valueScore * weights.value -
      byeRisk * weights.bye +
      strategyAdjustment

    const factors: { score: number; text: string }[] = [
      { score: rankScore, text: `Expert consensus ranks him #${player.rank} overall` },
      { score: vorScore, text: replacementValue > 0 ? `${Math.round(replacementValue)} projected points over ${player.position} replacement` : `Strong ${player.position} replacement value` },
      { score: tierScore, text: tierDrop >= NFL_REGULAR_SEASON_GAMES * 0.5 ? `${(tierDrop / NFL_REGULAR_SEASON_GAMES).toFixed(1)} PPG tier cliff behind him` : `Last strong option in his ${player.position} tier` },
      { score: rosterFit, text: getRosterFitReason(player.position, rosterCounts, league.lineup) },
      { score: strategy === 'safeFloor' ? floor + 24 : strategy === 'upside' ? upside + 24 : Math.max(floor, upside) * 0.6, text: strategy === 'safeFloor' ? getFloorReason(player) : getUpsideReason(player) },
      { score: valueScore, text: draft.currentPick > referenceRank ? `${Math.round(draft.currentPick - referenceRank)} picks of value versus market` : `Market-aligned value at pick ${draft.currentPick}` },
    ]
    if (strategy === 'zeroRb' && currentRound <= 5 && (player.position === 'WR' || player.position === 'TE')) {
      factors.push({ score: 110, text: `Builds early ${player.position} strength for Zero-RB` })
    }
    if (strategy === 'zeroRb' && currentRound >= 6 && player.position === 'RB') {
      factors.push({ score: 110, text: 'Targets the post–Round 5 RB value window' })
    }
    const reason = factors.sort((a, b) => b.score - a.score).slice(0, 2).map((factor) => factor.text).join(' · ')
    const outlookParts = [
      nextUserPick && availabilityAtNextPick !== undefined ? `Estimated ${Math.round(availabilityAtNextPick * 100)}% chance to reach pick ${nextUserPick}` : 'No later user pick remains',
      byeConflicts > 0 && player.bye ? `would add a ${ordinal(byeConflicts + 1)} Week ${player.bye} bye` : null,
      byeConflicts === 0 && player.bye && roster.length > 0 ? `no current Week ${player.bye} bye conflict` : null,
    ].filter((part): part is string => Boolean(part))
    const outlook = outlookParts.join('; ')
    return {
      player,
      reason,
      outlook,
      score,
      strategy,
      metrics: {
        replacementValue,
        replacementPoints,
        tierDrop,
        availabilityAtNextPick,
        nextUserPick,
        rosterFit,
        floor,
        upside,
        injuryRisk,
        byeConflicts,
      },
    }
  }).sort((a, b) => b.score - a.score)
}

function getLeagueStarterShare(position: Position, lineup: LineupSettings) {
  if (position === 'QB') return lineup.qb + lineup.superflex
  if (position === 'RB') return lineup.rb + lineup.flex * 0.45
  if (position === 'WR') return lineup.wr + lineup.flex * 0.45
  if (position === 'TE') return lineup.te + lineup.flex * 0.1
  if (position === 'K') return lineup.k
  return lineup.dst
}

function getCoreStarterTarget(position: Position, lineup: LineupSettings) {
  if (position === 'QB') return lineup.qb + lineup.superflex
  if (position === 'RB') return lineup.rb
  if (position === 'WR') return lineup.wr
  if (position === 'TE') return lineup.te
  if (position === 'K') return lineup.k
  return lineup.dst
}

function getRosterFitScore(position: Position, counts: Map<Position, number>, lineup: LineupSettings, rosterSize: number, round: number, totalRounds: number) {
  const rostered = counts.get(position) || 0
  const coreTarget = getCoreStarterTarget(position, lineup)
  if (rostered < coreTarget) return clampRecommendationScore(96 - (rostered / Math.max(1, coreTarget)) * 20)
  const flexEligible = position === 'RB' || position === 'WR' || position === 'TE'
  const flexUsed = (['RB', 'WR', 'TE'] as Position[]).reduce((total, item) => total + Math.max(0, (counts.get(item) || 0) - getCoreStarterTarget(item, lineup)), 0)
  if (flexEligible && flexUsed < lineup.flex) return 72
  if ((position === 'K' || position === 'DST') && round < Math.max(8, totalRounds - 3)) return 4
  if (rosterSize < lineup.rosterSpots) return clampRecommendationScore(42 - Math.max(0, rostered - coreTarget) * 10)
  return 0
}

function getRosterFitReason(position: Position, counts: Map<Position, number>, lineup: LineupSettings) {
  const rostered = counts.get(position) || 0
  const target = getCoreStarterTarget(position, lineup)
  if (rostered < target) return `Strengthens an unfilled ${position} starter slot`
  if (position === 'RB' || position === 'WR' || position === 'TE') return `Adds flexible ${position} depth without overloading the roster`
  return `Adds ${position} depth at the right roster stage`
}

function estimateAvailabilityAtPick(player: RankedPlayer, pick: number, teams: number) {
  const marketPick = player.adp || player.rank
  const spread = Math.max(4, teams * 0.42)
  return Math.min(0.98, Math.max(0.02, 1 / (1 + Math.exp((pick - marketPick) / spread))))
}

function getPlayerInjuryRisk(player: RankedPlayer) {
  if (!player.injury) return 0
  const report = `${player.injury.status} ${player.injury.injury || ''}`.toLowerCase()
  if (/acl|achilles|injured reserve|\bir\b|pup|out for (the )?season/.test(report)) return 95
  if (/\bout\b|doubtful|surgery/.test(report)) return 80
  if (/questionable|week-to-week/.test(report)) return 45
  if (/limited|day-to-day|probable/.test(report)) return 22
  return 35
}

function getPlayerFloorScore(player: RankedPlayer) {
  const previous = player.previousYear
  const games = previous?.games || 0
  const previousPpg = previous?.fpts_per_game || (previous?.fpts && games ? previous.fpts / games : 0)
  const projectedPpg = player.projectedPoints / NFL_REGULAR_SEASON_GAMES
  const availability = Math.min(1, games / NFL_REGULAR_SEASON_GAMES)
  const productionRetention = previousPpg && projectedPpg ? Math.min(1, previousPpg / projectedPpg) : 0.45
  const depthSecurity = player.depthChart?.order === 1 ? 15 : player.depthChart?.order === 2 ? 7 : 0
  const experience = (player.sleeper?.yearsExp || 0) >= 3 ? 10 : 0
  return clampRecommendationScore(availability * 48 + productionRetention * 32 + depthSecurity + experience)
}

function getPlayerUpsideScore(player: RankedPlayer, positionIndex: number, positionPoolSize: number) {
  const positionPercentile = positionPoolSize > 1 ? (1 - positionIndex / (positionPoolSize - 1)) * 48 : 48
  const previous = player.previousYear
  const previousPpg = previous?.fpts_per_game || (previous?.fpts && previous.games ? previous.fpts / previous.games : 0)
  const projectedPpg = player.projectedPoints / NFL_REGULAR_SEASON_GAMES
  const growth = previousPpg > 0 ? clampRecommendationScore(((projectedPpg - previousPpg) / previousPpg) * 100) * 0.22 : 10
  const youth = player.rookie ? 24 : (player.sleeper?.yearsExp || 99) <= 2 ? 15 : (player.sleeper?.age || 99) <= 25 ? 9 : 0
  const role = player.depthChart?.order === 1 ? 10 : 0
  const eliteTier = player.tier ? Math.max(0, 12 - player.tier) * 1.5 : 0
  return clampRecommendationScore(positionPercentile + growth + youth + role + eliteTier)
}

function getFloorReason(player: RankedPlayer) {
  const games = player.previousYear?.games || 0
  if (games >= 14) return `Proven production across ${games} games last season`
  if (player.depthChart?.order === 1) return `Secure ${player.position}1 depth-chart role`
  return 'Projection and role support a stable weekly floor'
}

function getUpsideReason(player: RankedPlayer) {
  if (player.rookie) return `Rookie draft capital creates breakout upside`
  if ((player.sleeper?.yearsExp || 99) <= 2) return `Early-career profile offers a higher ceiling`
  return `Top-end ${player.position} projection supports ceiling potential`
}

function clampRecommendationScore(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function ordinal(value: number) {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? 'st' : value % 10 === 2 && value % 100 !== 12 ? 'nd' : value % 10 === 3 && value % 100 !== 13 ? 'rd' : 'th'
  return `${value}${suffix}`
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
  if (!API_URL) throw new Error('ESPN live sync requires the managed draft service.')
  const response = await fetch(`${API_URL}/drafts/${currentDraft.id}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`ESPN draft sync failed (${response.status}). Keep drafting in ESPN and retry sync here.`)
  const payload: { draft?: DraftState } = await response.json()
  if (!payload.draft) throw new Error('No ESPN draft feed is published yet. Recommendations will update when the managed feed starts.')
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
  strategy,
  watchlistIdSet,
  watchlistPlayers,
  watchlistRecommendations,
  togglePosition,
  visiblePositions,
  onPlayerSelect,
  onQueryChange,
  onStrategyChange,
  onToggleWatchlist,
  onClearWatchlist,
}: {
  availableCount: number
  leagueName: string
  leagueTeams: number
  playersByPosition: Record<Position, RankedPlayer[]>
  query: string
  recommendations: Recommendation[]
  strategy: RecommendationStrategy
  watchlistIdSet: ReadonlySet<string>
  watchlistPlayers: RankedPlayer[]
  watchlistRecommendations: Recommendation[]
  togglePosition: (position: Position) => void
  visiblePositions: Record<Position, boolean>
  onPlayerSelect: (player: RankedPlayer) => void
  onQueryChange: (query: string) => void
  onStrategyChange: (strategy: RecommendationStrategy) => void
  onToggleWatchlist: (playerId: string) => void
  onClearWatchlist: () => void
}) {
  const activePositions = POSITION_ORDER.filter((position) => visiblePositions[position])

  return (
    <div className="playersBoard">
      <section className="playerListPanel">
        <div className="playerListHeader">
          <h2>Available Players - {leagueName}</h2>
          <div className="playerCount">{availableCount} player{availableCount === 1 ? '' : 's'} available</div>
        </div>

        <WatchlistComparison
          leagueTeams={leagueTeams}
          players={watchlistPlayers}
          recommendations={watchlistRecommendations}
          onPlayerSelect={onPlayerSelect}
          onToggleWatchlist={onToggleWatchlist}
          onClearWatchlist={onClearWatchlist}
        />

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
                        isWatched={watchlistIdSet.has(player.id)}
                        key={player.id}
                        leagueTeams={leagueTeams}
                        player={player}
                        variant="column"
                        onPlayerSelect={onPlayerSelect}
                        onToggleWatchlist={onToggleWatchlist}
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
          <div><h3>Recommendations</h3><small>{RECOMMENDATION_STRATEGIES[strategy].description}</small></div>
          <div className="recommendationHeaderControls"><StrategySelector value={strategy} onChange={onStrategyChange} /><div className="shortlistCount">{recommendations.length} ranked</div></div>
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
              onPlayerSelect={onPlayerSelect}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
          <div className="railSectionLabel">Best available</div>
          {recommendations.map((item) => (
            <PlayerSummary
              isWatched={watchlistIdSet.has(item.player.id)}
              key={item.player.id}
              leagueTeams={leagueTeams}
              player={item.player}
              variant="shortlist"
              onPlayerSelect={onPlayerSelect}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
          {recommendations.length === 0 ? <p className="muted">No matching players.</p> : null}
        </div>
      </aside>
    </div>
  )
}

type PlayerSummaryProps = {
  player: RankedPlayer
  leagueTeams: number
  variant: 'shortlist' | 'column'
  isWatched: boolean
  onPlayerSelect: (player: RankedPlayer) => void
  onToggleWatchlist: (playerId: string) => void
}

const PlayerSummary = React.memo(function PlayerSummary({
  player,
  leagueTeams,
  variant,
  isWatched,
  onPlayerSelect,
  onToggleWatchlist,
}: PlayerSummaryProps) {
  const tierColor = getTierColor(player.tier)
  const adpLabel = formatAdpRoundPick(player.adp, leagueTeams)
  const projectedPointsPerGame = formatProjectedPointsPerGame(player.projectedPoints)
  if (variant === 'shortlist') {
    return (
      <div className={isWatched ? 'shortlistItem watchedPlayerItem' : 'shortlistItem'} style={{ borderLeftColor: tierColor }}>
        <span className="shortlistRank" style={{ color: tierColor }}>
          #{player.rank}
        </span>
        <button className="playerNameButton shortlistName" onClick={() => onPlayerSelect(player)} style={{ color: tierColor }} type="button">{player.name}</button>
        <span className="shortlistMeta">
          {player.position}{player.posRank ? ` ${player.posRank.replace(player.position, '')}` : ''} | {projectedPointsPerGame} | {adpLabel}
        </span>
        <span className="playerQuickActions">
          <button aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`} aria-pressed={isWatched} className={isWatched ? 'watched' : ''} onClick={() => onToggleWatchlist(player.id)} type="button"><Star size={13} /></button>
        </span>
      </div>
    )
  }

  return (
    <div className={isWatched ? 'playerItem watchedPlayerItem' : 'playerItem'} style={{ borderLeftColor: tierColor }}>
      <div className="playerRank" style={{ color: tierColor }}>
        #{player.rank}
      </div>
      <div className="playerName" style={{ color: tierColor }}>
        <button className="playerNameButton" onClick={() => onPlayerSelect(player)} type="button">{player.name}</button>
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
        <button aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`} aria-pressed={isWatched} className={isWatched ? 'watched' : ''} onClick={() => onToggleWatchlist(player.id)} type="button"><Star size={12} /></button>
      </span>
    </div>
  )
})

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

function formatPreviousYearPointsPerGame(previousYear?: PreviousYearResult) {
  const pointsPerGame = getPreviousYearPointsPerGame(previousYear)
  return pointsPerGame ? pointsPerGame.toFixed(1) : '—'
}

function getPreviousYearPointsPerGame(previousYear?: PreviousYearResult) {
  if (!previousYear) return undefined
  const pointsPerGame = previousYear.fpts_per_game || (previousYear.fpts && previousYear.games ? previousYear.fpts / previousYear.games : 0)
  if (!Number.isFinite(pointsPerGame) || pointsPerGame <= 0) return undefined
  return pointsPerGame
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
