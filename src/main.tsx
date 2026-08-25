import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import './style.css'

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
type ScoringPreset = 'standard' | 'halfPpr' | 'ppr' | 'custom'
type Platform = 'sleeper' | 'espn'
type AppTab = 'players' | 'board' | 'consistency' | 'depth' | 'injuries' | 'rookies' | 'leagues'
type PlayersView = 'columns' | 'table'
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

type ScheduleGame = {
  week: number
  opponent: string
  home: boolean
  stadium: string
  roof: string
  indoor: boolean
}

type ScheduleData = {
  currentSeason: number
  previousSeason: number
  current: Record<string, ScheduleGame[]>
  previous: Record<string, ScheduleGame[]>
}

type ScheduleStrength = {
  rank: number
  score: number
  label: 'Easy' | 'Neutral' | 'Tough'
  opponentAverage: number
  games: number
}

type DomeRate = {
  indoorGames: number
  totalGames: number
  rate: number
}

type ScheduleMetrics = {
  fullSeason: Record<string, Partial<Record<Position, ScheduleStrength>>>
  earlyDefense: Record<string, ScheduleStrength>
  domeRates: Record<string, DomeRate>
}

type RankedPlayer = Player & {
  projectedPoints: number
  strengthOfSchedule?: ScheduleStrength
  earlySeasonSos?: ScheduleStrength
  domeRate?: DomeRate
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

type DraftPrediction = {
  pick: number
  round: number
  slot: number
  teamName: string
  player: RankedPlayer
  confidence: number
  reason: string
  alternatives: RankedPlayer[]
}

type PredictionCandidate = {
  player: RankedPlayer
  score: number
  marketScore: number
  needScore: number
  scarcityScore: number
  tendencyScore: number
  runScore: number
}

type PositionRunAlert = {
  position: Position
  severity: 'building' | 'active' | 'critical'
  recentPicks: number
  projectedPicks: number
  nextUserPick?: number
  message: string
  threatenedPlayers: RankedPlayer[]
  pressureScore: number
}

type RosterSlotHealth = {
  label: string
  filled: number
  total: number
}

type RosterHealth = {
  status: 'Draft ready' | 'On track' | 'Needs attention' | 'Starters set'
  startersFilled: number
  starterSlots: number
  projectedStarterPpg: number
  byeConflicts: number
  depthPlayers: number
  urgentNeeds: string[]
  coverage: RosterSlotHealth[]
}

type HeaderTierColor = 'blue' | 'green' | 'yellow' | 'orange'
type TierAvailabilityCount = { available: number; total: number }
type PositionTierAvailability = Record<Position, Record<HeaderTierColor, TierAvailabilityCount>>

type DepthChartEntry = {
  name: string
  team: string
  position: Position
  role?: string
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
  detail?: string
  practice?: string
  started?: string
  rosterStatus?: string
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
const HEADER_TIER_COLOR_ORDER: HeaderTierColor[] = ['blue', 'green', 'yellow', 'orange']
const HEADER_TIER_LABELS: Record<HeaderTierColor, string> = {
  blue: 'Blue tier (T1-T2)',
  green: 'Green tier (T3-T4)',
  yellow: 'Yellow tier (T5-T6)',
  orange: 'Orange tier (T7-T8)',
}
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
  schedules?: ScheduleData
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
  schedules?: { schedules?: ScheduleData }
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
  sessionType?: 'live' | 'mock'
  status?: string
  totalRounds?: number
  leagueName?: string
  lastSyncedAt?: string
}

const DEFAULT_DATA_BASE_URL = 'https://corypahl-fantasy-bucket.s3.us-east-1.amazonaws.com/data'
const DEFAULT_RANKINGS_URL = `${DEFAULT_DATA_BASE_URL}/fantasy-data.json`
const DEFAULT_DRAFT_API_URL = 'https://dqen8hccb0.execute-api.us-east-1.amazonaws.com'
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const JACKSON_LEAGUE_ID = '1389737302812553216'
const ACTIVE_SLEEPER_DRAFTS: Partial<Record<string, string>> = {
  jackson: '1389737302812553217',
}
const RETIRED_LEAGUE_IDS = new Set(['fanduel'])
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

const leagueProfiles: LeagueProfile[] = [
  {
    id: 'jackson',
    name: 'Jackson',
    platform: 'sleeper',
    externalLeagueId: JACKSON_LEAGUE_ID,
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
  if (profile.id === 'jackson') return { ...profile, externalLeagueId: JACKSON_LEAGUE_ID }
  if (profile.id !== 'gvsu' && profile.externalLeagueId !== '509557') return profile
  return {
    ...profile,
    scoringPreset: 'halfPpr',
    rankingPreset: 'halfPpr',
    scoring: { ...profile.scoring, ...halfPprScoring },
  }
}

function sanitizeLeagueProfiles(profiles: LeagueProfile[]) {
  const activeProfiles = profiles
    .filter((profile) => !RETIRED_LEAGUE_IDS.has(profile.id))
    .map(normalizeLeagueProfile)
  return activeProfiles.length ? activeProfiles : leagueProfiles
}

function sanitizeDraftsByLeague(drafts: Record<string, DraftState>) {
  return Object.fromEntries(Object.entries(drafts).filter(([leagueId]) => !RETIRED_LEAGUE_IDS.has(leagueId)))
}

function getDraftSessionType(draft: DraftState) {
  return draft.sessionType || (draft.source === 'sleeper' || draft.source === 'espn' ? 'live' : undefined)
}

function App() {
  const [data, setData] = useState<RankingsFile>(seedData)
  const [profiles, setProfiles] = useState<LeagueProfile[]>(() => sanitizeLeagueProfiles(loadLocal<LeagueProfile[]>('league-profiles', leagueProfiles)))
  const [selectedLeagueId, setSelectedLeagueId] = useState(loadLocal('selected-league-id', leagueProfiles[0].id))
  const [draftsByLeague, setDraftsByLeague] = useState<Record<string, DraftState>>(() => (
    sanitizeDraftsByLeague(loadLocal(
      'drafts-by-league',
      Object.fromEntries(leagueProfiles.map((profile) => [profile.id, createDraftState(profile)])),
    ))
  ))
  const [query, setQuery] = useState('')
  const [visiblePositions, setVisiblePositions] = useState<Record<Position, boolean>>(DEFAULT_VISIBLE_POSITIONS)
  const [showDraftedPlayers, setShowDraftedPlayers] = useState(() => loadLocal('show-drafted-players', false))
  const [playersView, setPlayersView] = useState<PlayersView>(() => (
    loadLocal<PlayersView>('players-view', 'columns') === 'table' ? 'table' : 'columns'
  ))
  const [activeTab, setActiveTab] = useState<AppTab>(() => getTabFromHash())
  const [consistencyPosition, setConsistencyPosition] = useState<Position>('QB')
  const [consistencyQuery, setConsistencyQuery] = useState('')
  const [consistencyMinGames, setConsistencyMinGames] = useState(6)
  const [recommendationStrategy, setRecommendationStrategy] = useState<RecommendationStrategy>(() => {
    const stored = loadLocal<RecommendationStrategy>('recommendation-strategy', 'balanced')
    return stored in RECOMMENDATION_STRATEGIES ? stored : 'balanced'
  })
  const [remoteLoaded, setRemoteLoaded] = useState(!API_URL)
  const [remoteDraftReadyByLeague, setRemoteDraftReadyByLeague] = useState<Record<string, boolean>>({})
  const [draftInput, setDraftInput] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [autoSync, setAutoSync] = useState(false)
  const [watchlistIds, setWatchlistIds] = useState<string[]>(loadLocal('watchlist-ids', []))
  const [selectedPlayer, setSelectedPlayer] = useState<RankedPlayer | null>(null)
  const [persistenceStatus, setPersistenceStatus] = useState<'Saving' | 'Saved locally' | 'Synced'>('Saving')
  const [leagueImportStatus, setLeagueImportStatus] = useState('')
  const [isImportingLeague, setIsImportingLeague] = useState(false)
  const autoConnectedLiveDrafts = useRef(new Set<string>())

  const selectedLeague = profiles.find((profile) => profile.id === selectedLeagueId) || profiles[0]
  const draft = draftsByLeague[selectedLeague.id] || createDraftState(selectedLeague)
  const draftSessionType = getDraftSessionType(draft)
  const draftTeamCount = draft.teamNames.length || selectedLeague.lineup.teams
  const selectedDraftSlot = clampLeagueDraftSlot(selectedLeague, draftTeamCount)
  const selectedDraftTeamName = draft.teamNames[selectedDraftSlot - 1] || `Team ${selectedDraftSlot}`
  const selectedRosterSize = getDraftedRosterForSlot(draft, selectedDraftSlot).length

  useEffect(() => {
    setDraftInput(draftSessionType === 'mock' ? draft.sleeperDraftId || '' : '')
  }, [draftSessionType, draft.sleeperDraftId, selectedLeague.id])

  useEffect(() => {
    setSyncStatus('')
    setAutoSync(false)
  }, [selectedLeague.id])

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
    localStorage.setItem('draft-wizard:show-drafted-players', JSON.stringify(showDraftedPlayers))
  }, [showDraftedPlayers])

  useEffect(() => {
    localStorage.setItem('draft-wizard:players-view', JSON.stringify(playersView))
  }, [playersView])

  useEffect(() => {
    fetchSplitData()
      .then((payload) => setData(payload))
      .catch(() =>
        fetch(DATA_URL, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
          .then(async (payload: RankingsFile) => {
            const [scheduleFile, weeklyFile, depthChartFile, injuryFile] = await Promise.all([
              fetchJson<NonNullable<SplitDataFiles['schedules']>>(`${DATA_BASE_URL}/schedules.json`).catch(() => undefined),
              fetchJson<NonNullable<SplitDataFiles['previousYearWeeklyResults']>>(`${DATA_BASE_URL}/previous-year-weekly-results.json`).catch(() => undefined),
              fetchJson<SplitDataFiles['depthCharts']>(`${DATA_BASE_URL}/depth-charts.json`).catch(() => undefined),
              fetchJson<SplitDataFiles['injuries']>(`${DATA_BASE_URL}/injuries.json`).catch(() => undefined),
            ])
            const depthCharts = Object.keys(payload.depthCharts || {}).length ? payload.depthCharts : depthChartFile?.depthCharts
            const teamWinTotals = Object.keys(payload.teamWinTotals || {}).length ? payload.teamWinTotals : depthChartFile?.teamWinTotals
            const injuries = payload.injuries?.length ? payload.injuries : injuryFile?.injuries || []
            const enrichments = buildClientEnrichments(depthCharts, injuries, payload.rookies || [], payload.previousYearResults)
            setData({
              ...payload,
              scoring: Object.fromEntries(Object.entries(payload.scoring).map(([preset, players]) => [
                preset,
                (players || []).map((player) => ({
                  ...player,
                  ...(enrichments.get(playerKey(player.name, player.team)) || enrichments.get(playerKey(player.name)) || {}),
                })),
              ])) as RankingsFile['scoring'],
              depthCharts,
              teamWinTotals,
              injuries,
              schedules: payload.schedules || scheduleFile?.schedules,
              previousYearWeeklyResults: Object.keys(payload.previousYearWeeklyResults || {}).length
                ? payload.previousYearWeeklyResults
                : weeklyFile?.previousYearWeeklyResults,
            })
          })
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
        if (draftPayload?.draft) {
          const draftLeagueId = draftPayload.draft.leagueId || draft.leagueId
          setDraftsByLeague((current) => ({ ...current, [draftLeagueId]: { ...draftPayload.draft!, leagueId: draftLeagueId } }))
          setRemoteDraftReadyByLeague((current) => ({ ...current, [draftLeagueId]: true }))
        }
      })
      .finally(() => setRemoteLoaded(true))
  }, [])

  useEffect(() => {
    if (!API_URL || !remoteLoaded || remoteDraftReadyByLeague[selectedLeague.id]) return
    let cancelled = false
    fetch(`${API_URL}/drafts/${draft.id}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
      .then((payload: { draft?: DraftState }) => {
        if (cancelled || !payload.draft) return
        const nextDraft = { ...payload.draft, leagueId: selectedLeague.id }
        setDraftsByLeague((current) => ({ ...current, [selectedLeague.id]: nextDraft }))
        setRemoteDraftReadyByLeague((current) => ({ ...current, [selectedLeague.id]: true }))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [draft.id, remoteDraftReadyByLeague, remoteLoaded, selectedLeague.id])

  useEffect(() => {
    if (!remoteLoaded) return
    setPersistenceStatus('Saving')
    persistState(profiles, draftsByLeague, draft, Boolean(remoteDraftReadyByLeague[selectedLeague.id])).then((status) => setPersistenceStatus(status === 'Synced' ? 'Synced' : 'Saved locally'))
  }, [profiles, draftsByLeague, draft, remoteDraftReadyByLeague, remoteLoaded, selectedLeague.id])

  const scheduleMetrics = useMemo(
    () => buildScheduleMetrics(data.schedules, data.previousYearWeeklyResults, selectedLeague.scoring),
    [data.previousYearWeeklyResults, data.schedules, selectedLeague.scoring],
  )
  const previousYearSummaryByKey = useMemo(
    () => buildPreviousYearSummaryIndex(data.previousYearWeeklyResults, selectedLeague.scoring),
    [data.previousYearWeeklyResults, selectedLeague.scoring],
  )

  const players = useMemo(() => {
    const fromData = data.scoring[selectedLeague.rankingPreset] || data.scoring.halfPpr || []
    return fromData.map((player) => {
      const projectedPoints = calculateProjectedPoints(player, selectedLeague.scoring)
      const team = normalizeDisplayTeam(player.team)
      const previousYear = player.previousYear
        || previousYearSummaryByKey.get(playerKey(player.name, team))
        || previousYearSummaryByKey.get(playerKey(player.name))
      return {
        ...player,
        projectedPoints,
        previousYear,
        strengthOfSchedule: scheduleMetrics.fullSeason[team]?.[player.position],
        earlySeasonSos: player.position === 'DST' ? scheduleMetrics.earlyDefense[team] : undefined,
        domeRate: player.position === 'K' ? scheduleMetrics.domeRates[team] : undefined,
      }
    })
  }, [data.scoring, previousYearSummaryByKey, scheduleMetrics, selectedLeague.rankingPreset, selectedLeague.scoring])

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
  const displayedPlayers = useMemo<RankedPlayer[]>(() => {
    const lowerQuery = query.toLowerCase().trim()
    const playerPool = showDraftedPlayers ? players : undraftedPlayers
    return playerPool
      .filter((player) => !lowerQuery || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(lowerQuery))
      .sort((a, b) => a.rank - b.rank)
  }, [players, query, showDraftedPlayers, undraftedPlayers])

  const rankedRecommendations = useMemo(
    () => buildRecommendations(undraftedPlayers, players, draft, selectedLeague, recommendationStrategy),
    [draft, players, recommendationStrategy, selectedLeague, undraftedPlayers],
  )
  const recommendations = useMemo(() => rankedRecommendations.slice(0, 8), [rankedRecommendations])
  const draftPredictions = useMemo(
    () => buildDraftPredictions(undraftedPlayers, players, draft, selectedLeague),
    [draft, players, selectedLeague, undraftedPlayers],
  )
  const rosterHealth = useMemo(
    () => buildRosterHealth(players, draft, selectedLeague),
    [draft, players, selectedLeague],
  )
  const positionRunAlerts = useMemo(
    () => buildPositionRunAlerts(undraftedPlayers, draftPredictions, draft, selectedLeague),
    [draft, draftPredictions, selectedLeague, undraftedPlayers],
  )
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
    displayedPlayers.forEach((player) => grouped[player.position].push(player))
    POSITION_ORDER.forEach((item) => grouped[item].sort((a, b) => a.rank - b.rank))
    return grouped
  }, [displayedPlayers])
  const positionTierAvailability = useMemo<PositionTierAvailability>(() => {
    const counts = createEmptyPositionTierAvailability()
    players.forEach((player) => {
      const color = getHeaderTierColor(player.tier)
      if (!color) return
      counts[player.position][color].total += 1
      if (!isDraftedPlayer(player, draftedIds, draftedPlayerKeys)) counts[player.position][color].available += 1
    })
    return counts
  }, [draftedIds, draftedPlayerKeys, players])

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
    const sourceId = draftInput.trim()
    if (!sourceId) {
      setSyncStatus('Enter a Sleeper mock draft ID.')
      return
    }
    if (!quiet) setSyncStatus('Loading Sleeper mock draft...')
    setIsSyncing(true)
    try {
      const nextDraft = await fetchSleeperDraftState(sourceId, selectedLeague, draft, 'mock')
      updateDraft(nextDraft)
      setRemoteDraftReadyByLeague((current) => ({ ...current, [selectedLeague.id]: true }))
      setDraftInput(nextDraft.sleeperDraftId || sourceId)
      setSyncStatus(`Synced ${nextDraft.drafted.length} picks at ${new Date().toLocaleTimeString()}.`)
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Unable to load Sleeper mock draft.')
    } finally {
      setIsSyncing(false)
    }
  }, [draft, draftInput, selectedLeague])

  const syncLeagueDraftState = useCallback(async (quiet = false, sourceOverride?: string) => {
    const sourceId = sourceOverride?.trim() || selectedLeague.externalLeagueId.trim()
    if (!sourceId) {
      setSyncStatus(`Enter the ${selectedLeague.platform.toUpperCase()} league ID on the Leagues page first.`)
      return false
    }
    if (!quiet) setSyncStatus(`Loading ${selectedLeague.platform.toUpperCase()} live draft...`)
    setIsSyncing(true)
    try {
      const baseDraft = draftSessionType === 'mock' ? createDraftState(selectedLeague) : draft
      const nextDraft = selectedLeague.platform === 'sleeper'
        ? await fetchSleeperDraftState(sourceId, selectedLeague, baseDraft, 'live')
        : await fetchManagedDraftState(baseDraft, selectedLeague)
      updateDraft(nextDraft)
      setRemoteDraftReadyByLeague((current) => ({ ...current, [selectedLeague.id]: true }))
      setDraftInput('')
      setSyncStatus(`Synced ${nextDraft.drafted.length} live picks at ${new Date().toLocaleTimeString()}.`)
      return true
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : `Unable to load ${selectedLeague.platform.toUpperCase()} live draft.`)
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [draft, draftSessionType, selectedLeague])

  useEffect(() => {
    const activeDraftId = ACTIVE_SLEEPER_DRAFTS[selectedLeague.id]
    if (activeTab !== 'board' || !activeDraftId || autoConnectedLiveDrafts.current.has(activeDraftId)) return
    autoConnectedLiveDrafts.current.add(activeDraftId)
    void syncLeagueDraftState(false, activeDraftId).then((synced) => {
      if (synced) setAutoSync(true)
      else autoConnectedLiveDrafts.current.delete(activeDraftId)
    })
  }, [activeTab, selectedLeague.id, syncLeagueDraftState])

  function resetMockDraft() {
    if (draft.drafted.length && !window.confirm(`Reset ${selectedLeague.name}'s draft session and restore every player?`)) return
    updateDraft(createDraftState(selectedLeague))
    setDraftInput('')
    setAutoSync(false)
    setSyncStatus('Draft session reset. The full player pool is available again.')
  }

  useEffect(() => {
    if (!autoSync || activeTab !== 'board') return
    const timer = window.setInterval(
      () => void (draftSessionType === 'live' ? syncLeagueDraftState(true) : syncDraftState(true)),
      15000,
    )
    return () => window.clearInterval(timer)
  }, [activeTab, autoSync, draftSessionType, syncDraftState, syncLeagueDraftState])

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
          displayedCount={displayedPlayers.length}
          draftedIds={draftedIds}
          draftedPlayerKeys={draftedPlayerKeys}
          leagueName={selectedLeague.name}
          leagueTeams={selectedLeague.lineup.teams}
          playersByPosition={playersByPosition}
          positionTierAvailability={positionTierAvailability}
          playersView={playersView}
          query={query}
          recommendations={recommendations}
          recommendationRosterLabel={`Pick ${selectedDraftSlot} · ${selectedDraftTeamName} · ${selectedRosterSize} drafted`}
          strategy={recommendationStrategy}
          watchlistIdSet={watchlistIdSet}
          watchlistPlayers={watchlistPlayers}
          watchlistRecommendations={watchlistRecommendations}
          togglePosition={togglePosition}
          visiblePositions={visiblePositions}
          showDraftedPlayers={showDraftedPlayers}
          onPlayerSelect={setSelectedPlayer}
          onPlayersViewChange={setPlayersView}
          onQueryChange={setQuery}
          onShowDraftedPlayersChange={setShowDraftedPlayers}
          onStrategyChange={setRecommendationStrategy}
          onToggleWatchlist={toggleWatchlist}
          onClearWatchlist={clearWatchlist}
        />
      ) : null}

      {activeTab === 'board' ? (
        <DraftBoardPage
          draft={draft}
          league={selectedLeague}
          positionRunAlerts={positionRunAlerts}
          predictions={draftPredictions}
          recommendations={rankedRecommendations}
          rosterHealth={rosterHealth}
          strategy={recommendationStrategy}
          draftInput={draftInput}
          syncStatus={syncStatus}
          autoSync={autoSync}
          isSyncing={isSyncing}
          onAutoSyncChange={setAutoSync}
          onDraftInputChange={setDraftInput}
          onDraftSlotChange={(draftSlot) => updateLeague({ draftSlot })}
          onPlayerSelect={setSelectedPlayer}
          onStrategyChange={setRecommendationStrategy}
          onSyncLiveDraft={() => void syncLeagueDraftState(false)}
          onSyncDraft={() => void syncDraftState(false)}
          onResetDraft={resetMockDraft}
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
          depthCharts={data.depthCharts}
          isWatched={watchlistIdSet.has(selectedPlayer.id)}
          player={selectedPlayer}
          playerByKey={playerByKey}
          recommendation={recommendationByPlayerId.get(selectedPlayer.id)}
          scoring={selectedLeague.scoring}
          weeklyResults={data.previousYearWeeklyResults}
          onClose={() => setSelectedPlayer(null)}
          onPlayerSelect={setSelectedPlayer}
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
        { key: 'adp-value', label: 'Value vs ADP', help: 'Market-value badge based on the rounded pick gap between ranking and ADP', value: formatAdpValue, numeric: getAdpValue, best: 'high' },
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
        { key: 'sos', label: 'Positional SOS', help: 'Ranked easiest to toughest using last season fantasy points allowed and this season opponents', value: (player) => formatScheduleStrength(player.strengthOfSchedule), numeric: (player) => player.strengthOfSchedule?.rank, best: 'low', samePositionOnly: true },
        { key: 'early-sos', label: 'Early Season SOS', help: 'Defense schedule strength for Weeks 1-4', value: (player) => player.position === 'DST' ? formatScheduleStrength(player.earlySeasonSos) : '—', numeric: (player) => player.earlySeasonSos?.rank, best: 'low', samePositionOnly: true },
        { key: 'dome-rate', label: 'Dome rate', help: 'Regular-season games in fixed or retractable roof venues', value: (player) => player.position === 'K' ? formatDomeRate(player.domeRate) : '—', numeric: (player) => player.domeRate?.rate, best: 'high', samePositionOnly: true },
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
                    const positionColor = getPositionColor(player.position)
                    return (
                      <th className="watchComparePlayerHead" key={player.id} scope="col" style={{ borderTopColor: positionColor }}>
                        <div className="watchComparePlayerTitle">
                          <span className={`position position${player.position}`}>{player.position}</span>
                          <button aria-label={`Remove ${player.name} from watchlist`} aria-pressed="true" className="watchCompareRemove watched" onClick={() => onToggleWatchlist(player.id)} type="button"><Star size={14} /></button>
                        </div>
                        <button className="playerNameButton" onClick={() => onPlayerSelect(player)} style={{ color: positionColor }} type="button">{player.name}</button>
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
  if (valueLeader && value !== undefined) insights.push({ label: 'Best ADP value', value: `${valueLeader.name} · ${formatRoundedAdpPickGap(value)}` })

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
  const band = getAdpValueBand(player)
  return `${band.label} (${formatRoundedAdpPickGap(value)})`
}

function formatRoundedAdpPickGap(value: number) {
  const roundedValue = Math.round(value)
  if (roundedValue === 0) return '0 picks'
  return `${roundedValue > 0 ? '+' : ''}${roundedValue} ${Math.abs(roundedValue) === 1 ? 'pick' : 'picks'}`
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
  return [player.injury.status, player.injury.injury, player.injury.detail].filter(Boolean).join(' · ')
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
  depthCharts,
  player,
  playerByKey,
  recommendation,
  scoring,
  weeklyResults,
  isWatched,
  onClose,
  onPlayerSelect,
  onToggleWatchlist,
}: {
  depthCharts: RankingsFile['depthCharts']
  player: RankedPlayer
  playerByKey: Map<string, RankedPlayer>
  recommendation?: Recommendation
  scoring: ScoringRules
  weeklyResults: RankingsFile['previousYearWeeklyResults']
  isWatched: boolean
  onClose: () => void
  onPlayerSelect: (player: RankedPlayer) => void
  onToggleWatchlist: () => void
}) {
  const lastYear = useMemo(() => {
    const nameKey = playerKey(player.name)
    return buildConsistencyRows(weeklyResults, player.position, scoring, 0, '').find((row) => (
      row.id === playerKey(player.name, player.team) || playerKey(row.name) === nameKey
    ))
  }, [player.name, player.position, player.team, scoring, weeklyResults])
  const hasWeeklyHistory = Boolean(lastYear?.games)
  const lastYearPpg = hasWeeklyHistory ? formatComparisonStat(lastYear?.ppg) : formatPreviousYearPointsPerGame(player.previousYear)
  const teamDepthChart = getTeamDepthChart(depthCharts, player.team)

  return (
    <div className="drawerBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }} role="presentation">
      <aside aria-label={`${player.name} details`} aria-modal="true" className="playerDrawer" role="dialog">
        <div className="drawerHeader">
          <div><span className={`position position${player.position}`}>{player.position}</span><h2>{player.name}</h2></div>
          <button aria-label="Close player details" className="drawerClose" onClick={onClose} type="button"><X size={20} /></button>
        </div>

        <section className="drawerSection">
          <h3>Basic</h3>
          <div className="drawerMetricGrid threeColumn">
            <DrawerMetric label="Position" value={player.position} />
            <DrawerMetric label="Team" value={player.team || 'FA'} />
            <DrawerMetric label="Bye" value={player.bye ? String(player.bye) : '—'} />
          </div>
        </section>

        <TeamDepthChart
          chart={teamDepthChart}
          player={player}
          playerByKey={playerByKey}
          onPlayerSelect={onPlayerSelect}
        />

        <section className="drawerSection">
          <h3>Rankings</h3>
          <div className="drawerMetricGrid threeColumn">
            <DrawerMetric label="Overall rank" value={`#${player.rank}`} />
            <DrawerMetric label="Position rank" value={player.posRank || '—'} />
            <DrawerMetric label="Tier" value={player.tier ? String(player.tier) : '—'} />
          </div>
        </section>

        <section className="drawerSection">
          <h3>Projection</h3>
          <div className="drawerMetricGrid">
            <DrawerMetric label="Projected PPG" value={formatProjectedPointsPerGame(player.projectedPoints)} />
            <DrawerMetric label="ADP" value={player.adp?.toFixed(1) || '—'} />
          </div>
        </section>

        <section className="drawerSection">
          <h3>Schedule</h3>
          <div className="drawerMetricGrid">
            <DrawerMetric label="Positional SOS" value={formatScheduleStrength(player.strengthOfSchedule)} />
            {player.position === 'DST' ? <DrawerMetric label="Early Season SOS" value={formatScheduleStrength(player.earlySeasonSos)} /> : null}
            {player.position === 'K' ? <DrawerMetric label="Dome rate" value={formatDomeRate(player.domeRate)} /> : null}
            {player.strengthOfSchedule ? <DrawerMetric label="Opponent allowance" value={`${player.strengthOfSchedule.opponentAverage.toFixed(1)} PPG`} /> : null}
          </div>
        </section>

        <section className="drawerSection">
          <h3>Last Year</h3>
          <div className="drawerMetricGrid lastYearGrid">
            <DrawerMetric label="Position rank" value={player.previousYear?.rank ? `${player.position}${player.previousYear.rank}` : '—'} />
            <DrawerMetric label="PPG" value={lastYearPpg} />
            <DrawerMetric label="T12 finishes" value={hasWeeklyHistory ? String(lastYear!.top12) : '—'} />
            <DrawerMetric label="13–24 finishes" value={hasWeeklyHistory ? String(Math.max(0, lastYear!.top24 - lastYear!.top12)) : '—'} />
            <DrawerMetric label="25+ finishes" value={hasWeeklyHistory ? String(Math.max(0, lastYear!.games - lastYear!.top24)) : '—'} />
          </div>
        </section>

        <section className="drawerSection">
          <h3>News</h3>
          {player.injury ? (
            <div className="drawerNews injuryNotice">
              <AlertTriangle size={16} />
              <div>
                <strong>{player.injury.status} · {player.injury.injury || 'Injury reported'}</strong>
                <span>{formatInjuryDetails(player.injury)}</span>
                <small>Updated {formatInjuryUpdated(player.injury.updated)} · {player.injury.source}</small>
              </div>
            </div>
          ) : (
            <div className="drawerNews healthyNotice"><Check size={16} /><div><strong>No current injury report</strong><span>No active injury flag in the latest data.</span></div></div>
          )}
        </section>

        <section className="drawerSection">
          <h3>Outlook</h3>
          {recommendation ? <div className="drawerRecommendation"><strong>Why now · {RECOMMENDATION_STRATEGIES[recommendation.strategy].label}</strong><span>{recommendation.reason}. {recommendation.outlook}</span><RecommendationSignals recommendation={recommendation} /></div> : <div className="drawerEmptyNotice">No active recommendation context is available.</div>}
        </section>

        <button className={isWatched ? 'iconTextButton drawerWatchButton watched' : 'iconTextButton drawerWatchButton'} onClick={onToggleWatchlist} type="button"><Star size={16} /> {isWatched ? 'Watching' : 'Add to watchlist'}</button>
      </aside>
    </div>
  )
}

function getTeamDepthChart(depthCharts: RankingsFile['depthCharts'], team: string) {
  const normalizedTeam = normalizeDisplayTeam(team)
  return Object.entries(depthCharts || {}).find(([teamCode]) => normalizeDisplayTeam(teamCode) === normalizedTeam)?.[1]
}

function TeamDepthChart({
  chart,
  player,
  playerByKey,
  onPlayerSelect,
}: {
  chart?: Partial<Record<Position, DepthChartEntry[]>>
  player: RankedPlayer
  playerByKey: Map<string, RankedPlayer>
  onPlayerSelect: (player: RankedPlayer) => void
}) {
  const positions: DepthChartColumn[] = ['QB', 'RB', 'WR', 'TE', 'K']
  return (
    <section className="drawerSection teamDepthSection">
      <h3>{player.team || 'Team'} depth chart</h3>
      {chart ? (
        <div className="teamDepthGrid">
          {positions.map((position) => (
            <div className={position === player.position ? 'teamDepthPosition selectedPosition' : 'teamDepthPosition'} key={position}>
              <div className="teamDepthPositionHeader">
                <span className={`positionText${position}`}>{position}</span>
                <small>{chart[position]?.length || 0} listed</small>
              </div>
              <div className="teamDepthPlayers">
                {(chart[position] || []).map((entry) => {
                  const ranked = playerByKey.get(playerKey(entry.name, entry.team)) || playerByKey.get(playerKey(entry.name))
                  const isSelected = playerKey(entry.name) === playerKey(player.name)
                  return (
                    <button
                      aria-current={isSelected ? 'true' : undefined}
                      className={isSelected ? 'teamDepthPlayer selected' : 'teamDepthPlayer'}
                      disabled={!ranked || isSelected}
                      key={`${entry.role || position}-${entry.order}-${entry.name}`}
                      onClick={() => ranked && onPlayerSelect(ranked)}
                      type="button"
                    >
                      <span>{entry.role || `${position}${entry.order}`}</span>
                      <strong>{entry.name}</strong>
                    </button>
                  )
                })}
                {!chart[position]?.length ? <span className="teamDepthEmpty">No listing</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="drawerEmptyNotice">No team depth chart is available.</div>}
    </section>
  )
}

function DrawerMetric({ label, value }: { label: string; value: string }) {
  return <div className="drawerMetric"><span>{label}</span><strong>{value}</strong></div>
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
  positionRunAlerts,
  predictions,
  recommendations,
  rosterHealth,
  strategy,
  draftInput,
  syncStatus,
  autoSync,
  isSyncing,
  onAutoSyncChange,
  onDraftInputChange,
  onDraftSlotChange,
  onPlayerSelect,
  onResetDraft,
  onStrategyChange,
  onSyncLiveDraft,
  onSyncDraft,
}: {
  draft: DraftState
  league: LeagueProfile
  positionRunAlerts: PositionRunAlert[]
  predictions: DraftPrediction[]
  recommendations: Recommendation[]
  rosterHealth: RosterHealth
  strategy: RecommendationStrategy
  draftInput: string
  syncStatus: string
  autoSync: boolean
  isSyncing: boolean
  onAutoSyncChange: (value: boolean) => void
  onDraftInputChange: (value: string) => void
  onDraftSlotChange: (slot: number) => void
  onPlayerSelect: (player: RankedPlayer) => void
  onResetDraft: () => void
  onStrategyChange: (strategy: RecommendationStrategy) => void
  onSyncLiveDraft: () => void
  onSyncDraft: () => void
}) {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const totalRounds = draft.totalRounds || league.lineup.rosterSpots
  const picksBySlotRound = useMemo(() => {
    const picks = new Map<string, DraftPick>()
    draft.drafted.forEach((pick) => picks.set(`${pick.slot}-${pick.round}`, pick))
    return picks
  }, [draft.drafted])
  const predictionsByPick = useMemo(() => new Map(predictions.map((prediction) => [prediction.pick, prediction])), [predictions])
  const positionRecommendations = useMemo(() => POSITION_ORDER.map((position) => ({
    position,
    recommendations: recommendations.filter((item) => item.player.position === position).slice(0, 3),
  })), [recommendations])
  const recommendationRankByPlayerId = useMemo(() => new Map(
    recommendations.map((item, index) => [item.player.id, index + 1]),
  ), [recommendations])
  const recommendationOptionCount = positionRecommendations.reduce((total, group) => total + group.recommendations.length, 0)
  const currentLocation = getSlotRoundForPick(draft.currentPick, totalTeams)
  const currentTeam = draft.teamNames[currentLocation.slot - 1] || `Team ${currentLocation.slot}`
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const userTeamName = draft.teamNames[userSlot - 1] || `Team ${userSlot}`
  const userRoster = getDraftedRosterForSlot(draft, userSlot)
  const isUserPick = currentLocation.slot === userSlot
  const draftSessionType = getDraftSessionType(draft)
  const hasMockDraft = draftSessionType === 'mock'
  const hasActiveDraft = Boolean(draft.drafted.length || draft.lastSyncedAt || draft.sleeperDraftId)

  return (
    <section className="panel pagePanel draftBoardPanel">
      <div className="panelHeader draftBoardHeader">
        <div>
          <h2>Draft Board</h2>
          <div className="draftBoardMeta">
            <span>{league.name}</span>
            <span>{hasMockDraft ? 'Sleeper mock' : draftSessionType === 'live' ? `${league.platform.toUpperCase()} live` : hasActiveDraft ? 'Connected draft' : 'Base player set'}</span>
            {draft.leagueName ? <span>{draft.leagueName}</span> : null}
            {draft.status ? <span>{draft.status.replace(/_/g, ' ')}</span> : null}
            {draft.lastSyncedAt ? <span>Synced {new Date(draft.lastSyncedAt).toLocaleTimeString()}</span> : null}
          </div>
        </div>
        <form className="draftSync" onSubmit={(event) => { event.preventDefault(); onSyncDraft() }}>
          <label className="mockDraftIdField">
            <span>Sleeper mock draft ID</span>
            <input
              inputMode="numeric"
              placeholder="Enter draft ID"
              value={draftInput}
              onChange={(event) => onDraftInputChange(event.target.value)}
            />
          </label>
          <button className="iconTextButton" disabled={isSyncing || !draftInput.trim()} type="submit">
            <RefreshCw className={isSyncing ? 'spin' : ''} size={15} /> {isSyncing ? 'Syncing' : hasMockDraft ? 'Update mock' : 'Start mock'}
          </button>
          <button className="iconTextButton resetDraftButton" disabled={isSyncing || !hasActiveDraft} onClick={onResetDraft} type="button">
            <Trash2 size={15} /> Reset
          </button>
        </form>
      </div>
      <div className={`onClockBanner ${isUserPick ? 'userPick' : ''}`}>
        <div>
          <span className="eyebrow">Pick {draft.currentPick} · Round {currentLocation.round}</span>
          <strong>{isUserPick ? 'You are on the clock' : `${currentTeam} is on the clock`}</strong>
        </div>
        <div className="draftActions">
          <button className="iconTextButton liveDraftButton" disabled={isSyncing || !league.externalLeagueId.trim()} onClick={onSyncLiveDraft} type="button">
            <RefreshCw className={isSyncing && draftSessionType === 'live' ? 'spin' : ''} size={14} /> Sync {league.platform.toUpperCase()} live
          </button>
          <label className="draftSlotSelector">
            <span>Your draft position</span>
            <select aria-label="Your draft position" value={userSlot} onChange={(event) => onDraftSlotChange(Number(event.target.value))}>
              {draft.teamNames.map((teamName, index) => <option key={`${teamName}-${index}`} value={index + 1}>Pick {index + 1} · {teamName}</option>)}
            </select>
          </label>
          <label className="autoSyncToggle">
            <input checked={autoSync} disabled={!hasActiveDraft} onChange={(event) => onAutoSyncChange(event.target.checked)} type="checkbox" />
            Auto-sync {draftSessionType === 'live' ? 'live draft' : 'mock'}
          </label>
        </div>
      </div>
      {syncStatus ? <div className="syncStatus" role="status">{syncStatus}</div> : null}
      <PositionRunAlerts alerts={positionRunAlerts} onPlayerSelect={onPlayerSelect} />
      <div className="draftCommandGrid">
        <section className="commandCard">
          <div className="commandCardHeader recommendationCommandHeader">
            <div><h3>Top recommendations</h3><small>{RECOMMENDATION_STRATEGIES[strategy].description}</small><small className="rosterBasis">Based on {userRoster.length} drafted player{userRoster.length === 1 ? '' : 's'} at Pick {userSlot}.</small></div>
            <div className="recommendationHeaderControls"><StrategySelector value={strategy} onChange={onStrategyChange} /><span>{recommendationOptionCount} options · 3 per position</span></div>
          </div>
          <div className="positionRecommendationGrid">
            {positionRecommendations.map(({ position, recommendations: positionOptions }) => (
              <section className="positionRecommendationGroup" key={position}>
                <div className="positionRecommendationHeader">
                  <span className={`position position${position}`}>{position}</span>
                  <small>{positionOptions.length}/3 available</small>
                </div>
                <div className="positionRecommendationList">
                  {positionOptions.map((item) => (
                    <button className="recommendationCard positionRecommendationCard" key={item.player.id} onClick={() => onPlayerSelect(item.player)} type="button">
                      <span className="recommendationNumber">{recommendationRankByPlayerId.get(item.player.id)}</span>
                      <div className="recommendationCardBody">
                        <strong>{item.player.name}</strong>
                        <small>{item.player.team} · {item.reason}</small>
                        <RecommendationSignals recommendation={item} compact />
                      </div>
                    </button>
                  ))}
                  {positionOptions.length === 0 ? <span className="positionRecommendationEmpty">No available players</span> : null}
                </div>
              </section>
            ))}
          </div>
        </section>
        <RosterHealthCard health={rosterHealth} roster={userRoster} teamLabel={`Pick ${userSlot} · ${userTeamName}`} />
      </div>
      <div className="draftBoardScroller">
        <div className="draftBoardGrid" style={{ gridTemplateColumns: `56px repeat(${totalTeams}, minmax(118px, 1fr))` }}>
          <div className="draftBoardCorner">Rd</div>
          {draft.teamNames.map((teamName, index) => (
            <div className={index + 1 === userSlot ? 'draftBoardTeam userTeam' : 'draftBoardTeam'} key={`${teamName}-${index}`}>
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
                  const prediction = predictionsByPick.get(pickNumber)
                  const isCurrent = pickNumber === draft.currentPick
                  return (
                    <div className={`draftBoardCell ${slot === userSlot ? 'userTeam' : ''} ${isCurrent ? 'current' : ''} ${prediction && !pick ? 'predicted' : ''}`} key={`${slot}-${round}`}>
                      {pick ? (
                        <div className="draftBoardPlayer" style={{ borderLeftColor: getPositionColor(pick.position) }}>
                          <strong style={{ color: getPositionColor(pick.position) }}>{formatShortPlayerName(pick.playerName || pick.playerId)}</strong>
                          <span>{pick.position || '-'} {pick.team || ''}</span>
                        </div>
                      ) : prediction ? (
                        <button className="draftBoardPrediction" onClick={() => onPlayerSelect(prediction.player)} title={`${prediction.reason}. Alternatives: ${prediction.alternatives.map((player) => player.name).join(', ')}`} type="button">
                          <strong style={{ color: getPositionColor(prediction.player.position) }}>{formatShortPlayerName(prediction.player.name)}</strong>
                          <span>{prediction.player.position} · {prediction.confidence} conf.</span>
                        </button>
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

function PositionRunAlerts({
  alerts,
  onPlayerSelect,
}: {
  alerts: PositionRunAlert[]
  onPlayerSelect: (player: RankedPlayer) => void
}) {
  const nextUserPick = alerts.find((alert) => alert.nextUserPick)?.nextUserPick
  return (
    <section className="runAlertsPanel" aria-labelledby="run-alerts-title" aria-live="polite">
      <div className="runAlertsHeader">
        <div>
          <span className="eyebrow">Market pressure</span>
          <h3 id="run-alerts-title">Positional-run alerts</h3>
        </div>
        <span>{nextUserPick ? `Through your pick #${nextUserPick}` : 'Live draft window'}</span>
      </div>
      {alerts.length ? (
        <div className="runAlertGrid">
          {alerts.map((alert) => (
            <article className={`runAlertCard ${alert.severity}`} key={alert.position} style={{ borderLeftColor: getPositionColor(alert.position) }}>
              <div className="runAlertTitle">
                <span className={`runSeverity ${alert.severity}`}>{alert.severity}</span>
                <strong style={{ color: getPositionColor(alert.position) }}>{alert.position} run</strong>
                <small>{alert.recentPicks} recent · {alert.projectedPicks} projected</small>
              </div>
              <p>{alert.message}</p>
              {alert.threatenedPlayers.length ? (
                <div className="runThreats" aria-label={`${alert.position} players threatened`}>
                  {alert.threatenedPlayers.map((player) => (
                    <button key={player.id} onClick={() => onPlayerSelect(player)} type="button">{formatShortPlayerName(player.name)}</button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="runCalm"><Check size={15} /><span>No meaningful positional run is building before your next pick.</span></div>
      )}
    </section>
  )
}

function RosterHealthCard({
  health,
  roster,
  teamLabel,
}: {
  health: RosterHealth
  roster: DraftPick[]
  teamLabel: string
}) {
  const coveragePercent = health.starterSlots ? Math.round((health.startersFilled / health.starterSlots) * 100) : 100
  return (
    <section className="commandCard rosterCard rosterHealthCard" aria-labelledby="roster-health-title">
      <div className="commandCardHeader rosterHealthHeader">
        <div><h3 id="roster-health-title">Live roster health</h3><small>{teamLabel}</small></div>
        <span className={`healthStatus ${health.status.replace(/\s+/g, '').toLowerCase()}`}>{health.status}</span>
      </div>
      <div className="healthMetrics">
        <div><span>Starters</span><strong>{health.startersFilled}/{health.starterSlots}</strong></div>
        <div><span>Projected PPG</span><strong>{health.projectedStarterPpg.toFixed(1)}</strong></div>
        <div><span>Bye conflicts</span><strong>{health.byeConflicts}</strong></div>
      </div>
      <div className="healthProgress" aria-label={`${coveragePercent}% of starting lineup filled`}>
        <span style={{ width: `${coveragePercent}%` }} />
      </div>
      <div className="healthCoverage">
        {health.coverage.map((slot) => (
          <div className={slot.filled >= slot.total ? 'filled' : ''} key={slot.label}>
            <span>{slot.label}</span><strong>{slot.filled}/{slot.total}</strong>
          </div>
        ))}
      </div>
      <div className="healthNeeds">
        <span>Next needs</span>
        <strong>{health.urgentNeeds.length ? health.urgentNeeds.slice(0, 3).join(' · ') : `Depth (${health.depthPlayers})`}</strong>
      </div>
      <div className="rosterPlayers">
        {roster.length ? roster.map((pick) => <span className={`rosterChip positionText${pick.position || ''}`} key={pick.pick}>{pick.position} {formatShortPlayerName(pick.playerName || pick.playerId)}</span>) : <p>No selections yet.</p>}
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
  const filteredRows = rows.filter((row) => (position === 'ALL' || row.position === position) && (!query.trim() || `${row.name} ${row.team} ${row.injury} ${row.status} ${row.detail} ${row.practice}`.toLowerCase().includes(query.toLowerCase().trim())))
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <div><h2>Injuries</h2><p className="panelDescription">Detailed body part, recovery notes and practice participation from the latest player feed.</p></div>
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
          <span>Details</span>
          <span>Updated</span>
          <span>Source</span>
        </div>
        {filteredRows.map((row) => {
          const tierColor = getTierColor(getPlayerTier(row.name, row.team, playerTierByKey))
          const ranked = playerByKey.get(playerKey(row.name, row.team)) || playerByKey.get(playerKey(row.name))
          return (
            <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.status}-${row.updated || ''}`} style={{ borderLeftColor: tierColor }}>
              <strong data-label="Player" style={{ color: tierColor }}><button className="tablePlayerButton" disabled={!ranked} onClick={() => ranked && onPlayerSelect(ranked)} type="button">{row.name}</button></strong>
              <span data-label="Team">{row.team || '-'}</span>
              <span data-label="Position" className={`position position${row.position}`}>{row.position}</span>
              <span data-label="Status" className="warningText">{row.status}</span>
              <span data-label="Injury">{row.injury || '-'}</span>
              <span className="injuryDetailText" data-label="Details">{formatInjuryDetails(row)}</span>
              <small data-label="Updated">{formatInjuryUpdated(row.updated)}</small>
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

function buildPreviousYearSummaryIndex(
  weeklyResults: RankingsFile['previousYearWeeklyResults'],
  scoring: ScoringRules,
) {
  const summaries = new Map<string, PreviousYearResult>()

  POSITION_ORDER.forEach((position) => {
    const players = new Map<string, PreviousYearResult>()
    ;(weeklyResults?.[position] || []).forEach((row) => {
      const key = playerKey(row.name, row.team)
      const current = players.get(key) || {
        name: row.name,
        team: row.team,
        position,
        games: 0,
        fpts: 0,
      }
      current.games = (current.games || 0) + 1
      current.fpts = (current.fpts || 0) + calculatePreviousYearWeeklyPoints(row, scoring)
      players.set(key, current)
    })

    ;[...players.values()]
      .sort((a, b) => (b.fpts || 0) - (a.fpts || 0))
      .forEach((player, index) => {
        const summary: PreviousYearResult = {
          ...player,
          rank: index + 1,
          fpts_per_game: player.games ? (player.fpts || 0) / player.games : 0,
        }
        summaries.set(playerKey(player.name, player.team), summary)
        if (!summaries.has(playerKey(player.name))) summaries.set(playerKey(player.name), summary)
      })
  })

  return summaries
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

function buildScheduleMetrics(
  schedules: ScheduleData | undefined,
  weeklyResults: RankingsFile['previousYearWeeklyResults'],
  scoring: ScoringRules,
): ScheduleMetrics {
  const empty: ScheduleMetrics = { fullSeason: {}, earlyDefense: {}, domeRates: {} }
  if (!schedules || !weeklyResults) return empty

  const opponentByTeamWeek = new Map<string, string>()
  Object.entries(schedules.previous).forEach(([team, games]) => {
    games.forEach((game) => opponentByTeamWeek.set(`${normalizeDisplayTeam(team)}|${game.week}`, normalizeDisplayTeam(game.opponent)))
  })

  const teamWeekPoints = new Map<string, number>()
  POSITION_ORDER.forEach((position) => {
    ;(weeklyResults[position] || []).forEach((row) => {
      const team = normalizeDisplayTeam(row.team)
      if (!opponentByTeamWeek.has(`${team}|${row.week}`)) return
      const key = `${position}|${team}|${row.week}`
      teamWeekPoints.set(key, (teamWeekPoints.get(key) || 0) + calculatePreviousYearWeeklyPoints(row, scoring))
    })
  })

  const allowanceTotals = Object.fromEntries(POSITION_ORDER.map((position) => [position, new Map<string, { total: number; games: number }>()])) as Record<Position, Map<string, { total: number; games: number }>>
  teamWeekPoints.forEach((points, key) => {
    const [position, team, weekValue] = key.split('|') as [Position, string, string]
    const opponent = opponentByTeamWeek.get(`${team}|${weekValue}`)
    if (!opponent) return
    const current = allowanceTotals[position].get(opponent) || { total: 0, games: 0 }
    current.total += points
    current.games += 1
    allowanceTotals[position].set(opponent, current)
  })

  const allowanceAverages = Object.fromEntries(POSITION_ORDER.map((position) => {
    const averages = new Map<string, number>()
    allowanceTotals[position].forEach((value, team) => averages.set(team, value.games ? value.total / value.games : 0))
    return [position, averages]
  })) as Record<Position, Map<string, number>>
  const fullSeason: ScheduleMetrics['fullSeason'] = {}

  POSITION_ORDER.forEach((position) => {
    const opponentValues = [...allowanceAverages[position].values()]
    const fallback = opponentValues.length ? opponentValues.reduce((total, value) => total + value, 0) / opponentValues.length : 0
    const teamAverages = new Map<string, { average: number; games: number }>()
    Object.entries(schedules.current).forEach(([team, games]) => {
      const values = games.map((game) => allowanceAverages[position].get(normalizeDisplayTeam(game.opponent)) ?? fallback)
      if (!values.length) return
      teamAverages.set(normalizeDisplayTeam(team), {
        average: values.reduce((total, value) => total + value, 0) / values.length,
        games: values.length,
      })
    })
    Object.entries(rankScheduleAverages(teamAverages)).forEach(([team, strength]) => {
      fullSeason[team] = { ...(fullSeason[team] || {}), [position]: strength }
    })
  })

  const defenseAllowanceValues = [...allowanceAverages.DST.values()]
  const defenseFallback = defenseAllowanceValues.length
    ? defenseAllowanceValues.reduce((total, value) => total + value, 0) / defenseAllowanceValues.length
    : 0
  const earlyDefenseAverages = new Map<string, { average: number; games: number }>()
  const domeRates: Record<string, DomeRate> = {}
  Object.entries(schedules.current).forEach(([team, games]) => {
    const normalizedTeam = normalizeDisplayTeam(team)
    const earlyValues = games
      .filter((game) => game.week <= 4)
      .map((game) => allowanceAverages.DST.get(normalizeDisplayTeam(game.opponent)) ?? defenseFallback)
    if (earlyValues.length) {
      earlyDefenseAverages.set(normalizedTeam, {
        average: earlyValues.reduce((total, value) => total + value, 0) / earlyValues.length,
        games: earlyValues.length,
      })
    }
    const indoorGames = games.filter((game) => game.indoor).length
    domeRates[normalizedTeam] = {
      indoorGames,
      totalGames: games.length,
      rate: games.length ? indoorGames / games.length : 0,
    }
  })

  return {
    fullSeason,
    earlyDefense: rankScheduleAverages(earlyDefenseAverages),
    domeRates,
  }
}

function rankScheduleAverages(teamAverages: Map<string, { average: number; games: number }>) {
  const ranked = [...teamAverages.entries()].sort((a, b) => b[1].average - a[1].average || a[0].localeCompare(b[0]))
  const values = ranked.map(([, value]) => value.average)
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 0
  return Object.fromEntries(ranked.map(([team, value], index) => {
    const rank = index + 1
    const score = maximum === minimum ? 50 : ((value.average - minimum) / (maximum - minimum)) * 100
    const label: ScheduleStrength['label'] = rank <= 10 ? 'Easy' : rank >= 23 ? 'Tough' : 'Neutral'
    return [team, { rank, score, label, opponentAverage: value.average, games: value.games } satisfies ScheduleStrength]
  }))
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
  if (team === 'JAC') return 'JAX'
  if (team === 'LA') return 'LAR'
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

function getDraftedRosterForSlot(draft: DraftState, slot: number) {
  return draft.drafted.filter((pick) => pick.slot === slot)
}

function getTabFromHash(): AppTab {
  const value = window.location.hash.replace('#', '') as AppTab
  return ['players', 'board', 'consistency', 'depth', 'injuries', 'rookies', 'leagues'].includes(value) ? value : 'players'
}

function mergeLeagueProfiles(remote: LeagueProfile[], local: LeagueProfile[]) {
  const merged = new Map(remote.map((profile) => [profile.id, profile]))
  local.forEach((profile) => merged.set(profile.id, { ...(merged.get(profile.id) || {}), ...profile }))
  return sanitizeLeagueProfiles([...merged.values()])
}

function getScoringWarnings(league: LeagueProfile) {
  const warnings: string[] = []
  if (league.scoring.interception > 0) warnings.push(`Interceptions thrown add ${league.scoring.interception} points; most leagues use a negative penalty.`)
  if (league.scoring.fumbleLost > 0) warnings.push(`Fumbles lost add ${league.scoring.fumbleLost} points; most leagues use a negative penalty.`)
  if (league.scoring.passingYardsPerPoint <= 0 || league.scoring.rushingYardsPerPoint <= 0 || league.scoring.receivingYardsPerPoint <= 0) warnings.push('Yards-per-point values must be greater than zero.')
  if (league.lineup.teams < 2) warnings.push('League size must include at least two teams.')
  return warnings
}

function buildDraftPredictions(
  players: RankedPlayer[],
  allPlayers: RankedPlayer[],
  draft: DraftState,
  league: LeagueProfile,
): DraftPrediction[] {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const totalRounds = draft.totalRounds || league.lineup.rosterSpots
  const finalPick = totalTeams * totalRounds
  if (!players.length || draft.currentPick > finalPick) return []

  const playerLookup = new Map<string, RankedPlayer>()
  allPlayers.forEach((player) => {
    playerLookup.set(player.id, player)
    playerLookup.set(playerKey(player.name), player)
    playerLookup.set(playerKey(player.name, player.team), player)
  })
  const actualPickByNumber = new Map(draft.drafted.map((pick) => [pick.pick, pick]))
  const actualHistoryBySlot = new Map<number, DraftPick[]>()
  const simulatedRostersBySlot = new Map<number, DraftPick[]>()
  draft.teamNames.forEach((_, index) => {
    const slot = index + 1
    const roster = draft.drafted.filter((pick) => pick.slot === slot)
    actualHistoryBySlot.set(slot, roster)
    simulatedRostersBySlot.set(slot, [...roster])
  })

  const remainingPlayers = [...players]
  const recentPositions = draft.drafted
    .slice(-6)
    .map((pick) => pick.position)
    .filter((position): position is Position => Boolean(position))
  const predictionEnd = Math.min(finalPick, draft.currentPick + totalTeams * 2 - 1)
  const predictions: DraftPrediction[] = []

  for (let pickNumber = draft.currentPick; pickNumber <= predictionEnd; pickNumber += 1) {
    if (actualPickByNumber.has(pickNumber)) continue
    const { round, slot } = getSlotRoundForPick(pickNumber, totalTeams)
    const roster = simulatedRostersBySlot.get(slot) || []
    const rosterCounts = getPositionCounts(roster)
    const ownerHistory = actualHistoryBySlot.get(slot) || []
    const bestMarketPick = Math.min(...remainingPlayers.map(getPredictionMarketPick))
    const positionPools = Object.fromEntries(POSITION_ORDER.map((position) => [
      position,
      remainingPlayers.filter((player) => player.position === position).sort((a, b) => getPredictionMarketPick(a) - getPredictionMarketPick(b)),
    ])) as Record<Position, RankedPlayer[]>

    const candidates = remainingPlayers.map<PredictionCandidate>((player) => {
      const marketPick = getPredictionMarketPick(player)
      const marketScore = clampRecommendationScore(100 - Math.max(0, marketPick - bestMarketPick) * 2.25)
      const needScore = getPredictionNeedScore(player.position, rosterCounts, league.lineup, round, totalRounds)
      const scarcityScore = getPredictionScarcityScore(player, positionPools[player.position])
      const tendencyScore = getPredictionOwnerTendency(player.position, ownerHistory, playerLookup, league.lineup)
      const recentPositionCount = recentPositions.filter((position) => position === player.position).length
      const runScore = clampRecommendationScore(24 + recentPositionCount * 18)
      let timingAdjustment = 0
      if (player.position === 'K' || player.position === 'DST') {
        const rostered = rosterCounts.get(player.position) || 0
        const target = getCoreStarterTarget(player.position, league.lineup)
        if (rostered >= target) timingAdjustment -= 45
        else if (round >= totalRounds - 1) timingAdjustment += 46
        else if (round >= totalRounds - 3) timingAdjustment += 22
        else timingAdjustment -= 24
      }
      const score =
        marketScore * 0.50 +
        needScore * 0.31 +
        scarcityScore * 0.08 +
        tendencyScore * 0.07 +
        runScore * 0.04 +
        timingAdjustment
      return { player, score, marketScore, needScore, scarcityScore, tendencyScore, runScore }
    }).sort((a, b) => b.score - a.score || getPredictionMarketPick(a.player) - getPredictionMarketPick(b.player))

    const selected = candidates[0]
    if (!selected) break
    const runnerUp = candidates[1]
    const scoreMargin = runnerUp ? Math.max(0, selected.score - runnerUp.score) : 12
    const confidence = Math.round(Math.min(88, Math.max(48,
      52 + scoreMargin * 2.2 + Math.min(5, ownerHistory.length) + (selected.marketScore >= 88 ? 5 : 0),
    )))
    const prediction: DraftPrediction = {
      pick: pickNumber,
      round,
      slot,
      teamName: draft.teamNames[slot - 1] || `Team ${slot}`,
      player: selected.player,
      confidence,
      reason: getPredictionReason(selected, rosterCounts, league.lineup, round, totalRounds, pickNumber),
      alternatives: candidates.slice(1, 3).map((candidate) => candidate.player),
    }
    predictions.push(prediction)

    const simulatedPick: DraftPick = {
      pick: pickNumber,
      round,
      slot,
      teamName: prediction.teamName,
      playerId: selected.player.id,
      playerName: selected.player.name,
      position: selected.player.position,
      team: selected.player.team,
    }
    simulatedRostersBySlot.set(slot, [...roster, simulatedPick])
    const selectedIndex = remainingPlayers.findIndex((player) => player.id === selected.player.id)
    if (selectedIndex >= 0) remainingPlayers.splice(selectedIndex, 1)
    recentPositions.push(selected.player.position)
    if (recentPositions.length > 6) recentPositions.shift()
  }

  return predictions
}

function getPositionCounts(roster: DraftPick[]) {
  const counts = new Map<Position, number>()
  roster.forEach((pick) => pick.position && counts.set(pick.position, (counts.get(pick.position) || 0) + 1))
  return counts
}

function getPredictionMarketPick(player: RankedPlayer) {
  return player.adp && player.adp > 0 ? player.adp : player.rank
}

function getPredictionNeedScore(
  position: Position,
  counts: Map<Position, number>,
  lineup: LineupSettings,
  round: number,
  totalRounds: number,
) {
  const rostered = counts.get(position) || 0
  const target = getCoreStarterTarget(position, lineup)
  if (position === 'K' || position === 'DST') {
    if (rostered >= target) return 2
    if (round >= totalRounds - 1) return 100
    if (round >= totalRounds - 3) return 78
    return 5
  }
  if (rostered < target) return clampRecommendationScore(98 - (rostered / Math.max(1, target)) * 18)

  const flexEligible = position === 'RB' || position === 'WR' || position === 'TE'
  const flexUsed = (['RB', 'WR', 'TE'] as Position[]).reduce((total, item) => (
    total + Math.max(0, (counts.get(item) || 0) - getCoreStarterTarget(item, lineup))
  ), 0)
  if (flexEligible && flexUsed < lineup.flex) return position === 'TE' ? 66 : 82
  if (position === 'QB') return round <= Math.ceil(totalRounds * 0.55) ? 22 : 36
  if (position === 'TE') return round <= Math.ceil(totalRounds * 0.6) ? 28 : 42
  return clampRecommendationScore(58 - Math.max(0, rostered - target) * 9)
}

function getPredictionScarcityScore(player: RankedPlayer, positionPool: RankedPlayer[]) {
  const index = positionPool.findIndex((candidate) => candidate.id === player.id)
  const nextPlayer = index >= 0 ? positionPool[index + 1] : undefined
  if (!nextPlayer) return 82
  const rankGap = Math.max(0, getPredictionMarketPick(nextPlayer) - getPredictionMarketPick(player))
  const tierGap = player.tier && nextPlayer.tier ? Math.max(0, nextPlayer.tier - player.tier) : 0
  const pointsGap = player.projectedPoints > 0
    ? Math.max(0, player.projectedPoints - nextPlayer.projectedPoints) / player.projectedPoints
    : 0
  return clampRecommendationScore(24 + rankGap * 5 + tierGap * 18 + pointsGap * 120)
}

function getPredictionOwnerTendency(
  position: Position,
  ownerHistory: DraftPick[],
  playerLookup: Map<string, RankedPlayer>,
  lineup: LineupSettings,
) {
  if (!ownerHistory.length) return 50
  const positionPicks = ownerHistory.filter((pick) => pick.position === position)
  const positionShare = positionPicks.length / ownerHistory.length
  const expectedShare = getLeagueStarterShare(position, lineup) / Math.max(1, lineup.rosterSpots)
  const reachValues = positionPicks.map((pick) => {
    const ranked = playerLookup.get(pick.playerId) || (pick.playerName
      ? playerLookup.get(playerKey(pick.playerName, pick.team)) || playerLookup.get(playerKey(pick.playerName))
      : undefined)
    return ranked ? getPredictionMarketPick(ranked) - pick.pick : 0
  })
  const averageReach = reachValues.length ? reachValues.reduce((total, reach) => total + reach, 0) / reachValues.length : 0
  return clampRecommendationScore(48 + (positionShare - expectedShare) * 30 + Math.max(-12, Math.min(18, averageReach * 1.25)))
}

function getPredictionReason(
  candidate: PredictionCandidate,
  rosterCounts: Map<Position, number>,
  lineup: LineupSettings,
  round: number,
  totalRounds: number,
  pickNumber: number,
) {
  const position = candidate.player.position
  const rostered = rosterCounts.get(position) || 0
  const starterTarget = getCoreStarterTarget(position, lineup)
  if ((position === 'K' || position === 'DST') && rostered < starterTarget && round >= totalRounds - 3) return `Late-round ${position} starter need`
  if (rostered < starterTarget && candidate.needScore >= 80) return `Unfilled ${position} starter need`
  if (candidate.runScore >= 72) return `${position} run pressure`
  if (candidate.tendencyScore >= 64) return `Owner's ${position} draft tendency`
  if (candidate.scarcityScore >= 68) return `${position} tier is thinning`
  if (getPredictionMarketPick(candidate.player) <= pickNumber + 5 && candidate.marketScore >= 82) return 'Best player available near ADP'
  return 'Best roster and market fit'
}

function buildPositionRunAlerts(
  availablePlayers: RankedPlayer[],
  predictions: DraftPrediction[],
  draft: DraftState,
  league: LeagueProfile,
): PositionRunAlert[] {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const totalRounds = draft.totalRounds || league.lineup.rosterSpots
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const currentLocation = getSlotRoundForPick(draft.currentPick, totalTeams)
  const predictionStart = currentLocation.slot === userSlot ? draft.currentPick + 1 : draft.currentPick
  const nextUserPick = findNextPickForSlot(predictionStart, userSlot, totalTeams, totalRounds)
  const recentWindowSize = Math.min(8, Math.max(6, totalTeams))
  const recentPicks = draft.drafted.slice(-recentWindowSize)
  const forecastWindow = predictions.filter((prediction) => (
    prediction.pick >= predictionStart && (nextUserPick === undefined || prediction.pick < nextUserPick)
  ))
  const rosterCounts = getPositionCounts(getDraftedRosterForSlot(draft, userSlot))
  const currentRound = Math.min(totalRounds, currentLocation.round)
  const skillPositions: Position[] = ['QB', 'RB', 'WR', 'TE']

  return skillPositions.map((position): PositionRunAlert | null => {
    const recentCount = recentPicks.filter((pick) => pick.position === position).length
    const threatenedPredictions = forecastWindow.filter((prediction) => prediction.player.position === position)
    const projectedCount = threatenedPredictions.length
    const needScore = getPredictionNeedScore(position, rosterCounts, league.lineup, currentRound, totalRounds)
    const pressureScore = recentCount * 1.35 + projectedCount + needScore / 100
    if (recentCount + projectedCount < 2 || pressureScore < 2.75) return null

    const severity: PositionRunAlert['severity'] = (
      recentCount >= 4 || (projectedCount >= 4 && needScore >= 65) || pressureScore >= 7
    ) ? 'critical' : (
      recentCount >= 3 || projectedCount >= 3 || pressureScore >= 4.5
    ) ? 'active' : 'building'
    const starterTarget = getCoreStarterTarget(position, league.lineup)
    const rostered = rosterCounts.get(position) || 0
    const missingStarters = Math.max(0, starterTarget - rostered)
    const topAvailable = availablePlayers.find((player) => player.position === position)
    const activity = recentCount
      ? `${recentCount} of the last ${recentPicks.length} picks were ${position}${projectedCount ? `, with ${projectedCount} more forecast before ${nextUserPick ? `pick #${nextUserPick}` : 'your next turn'}` : ''}.`
      : `${projectedCount} ${position}${projectedCount === 1 ? '' : 's'} are forecast before ${nextUserPick ? `pick #${nextUserPick}` : 'your next turn'}.`
    const impact = missingStarters
      ? `You still need ${missingStarters} starting ${position}${missingStarters === 1 ? '' : 's'}.`
      : needScore >= 65
        ? 'Your flex coverage is still open.'
        : topAvailable?.tier
          ? `The available Tier ${topAvailable.tier} could thin quickly.`
          : 'The remaining tier could thin quickly.'
    return {
      position,
      severity,
      recentPicks: recentCount,
      projectedPicks: projectedCount,
      nextUserPick,
      message: `${activity} ${impact}`,
      threatenedPlayers: threatenedPredictions.slice(0, 3).map((prediction) => prediction.player),
      pressureScore,
    }
  }).filter((alert): alert is PositionRunAlert => Boolean(alert))
    .sort((a, b) => (
      getRunSeverityWeight(b.severity) - getRunSeverityWeight(a.severity) ||
      b.pressureScore - a.pressureScore
    ))
    .slice(0, 3)
}

function getRunSeverityWeight(severity: PositionRunAlert['severity']) {
  if (severity === 'critical') return 3
  if (severity === 'active') return 2
  return 1
}

function getRosterHealthCoreTarget(position: Position, lineup: LineupSettings) {
  if (position === 'QB') return lineup.qb
  if (position === 'RB') return lineup.rb
  if (position === 'WR') return lineup.wr
  if (position === 'TE') return lineup.te
  if (position === 'K') return lineup.k
  return lineup.dst
}

function buildRosterHealth(allPlayers: RankedPlayer[], draft: DraftState, league: LeagueProfile): RosterHealth {
  const totalTeams = draft.teamNames.length || league.lineup.teams
  const userSlot = clampLeagueDraftSlot(league, totalTeams)
  const roster = getDraftedRosterForSlot(draft, userSlot)
  const counts = getPositionCounts(roster)
  const corePositions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
  const coreFilled = new Map<Position, number>()
  corePositions.forEach((position) => coreFilled.set(position, Math.min(counts.get(position) || 0, getRosterHealthCoreTarget(position, league.lineup))))

  const qbExcess = Math.max(0, (counts.get('QB') || 0) - getRosterHealthCoreTarget('QB', league.lineup))
  const skillExcess = (['RB', 'WR', 'TE'] as Position[]).reduce((total, position) => (
    total + Math.max(0, (counts.get(position) || 0) - getRosterHealthCoreTarget(position, league.lineup))
  ), 0)
  const superflexFromQb = Math.min(league.lineup.superflex, qbExcess)
  const superflexFromSkill = Math.min(Math.max(0, league.lineup.superflex - superflexFromQb), skillExcess)
  const superflexFilled = superflexFromQb + superflexFromSkill
  const flexFilled = Math.min(league.lineup.flex, Math.max(0, skillExcess - superflexFromSkill))

  const coverage: RosterSlotHealth[] = [
    ...(['QB', 'RB', 'WR', 'TE'] as Position[]).map((position) => ({
      label: position,
      filled: coreFilled.get(position) || 0,
      total: getRosterHealthCoreTarget(position, league.lineup),
    })),
    { label: 'FLEX', filled: flexFilled, total: league.lineup.flex },
    { label: 'SF', filled: superflexFilled, total: league.lineup.superflex },
    ...(['K', 'DST'] as Position[]).map((position) => ({
      label: position,
      filled: coreFilled.get(position) || 0,
      total: getRosterHealthCoreTarget(position, league.lineup),
    })),
  ].filter((slot) => slot.total > 0)
  const startersFilled = coverage.reduce((total, slot) => total + slot.filled, 0)
  const starterSlots = coverage.reduce((total, slot) => total + slot.total, 0)

  const playerLookup = new Map<string, RankedPlayer>()
  allPlayers.forEach((player) => {
    playerLookup.set(player.id, player)
    playerLookup.set(playerKey(player.name), player)
    playerLookup.set(playerKey(player.name, player.team), player)
  })
  const rankedRoster = roster.map((pick) => (
    playerLookup.get(pick.playerId) || (pick.playerName
      ? playerLookup.get(playerKey(pick.playerName, pick.team)) || playerLookup.get(playerKey(pick.playerName))
      : undefined)
  )).filter((player): player is RankedPlayer => Boolean(player))
  const selectedStarterIds = new Set<string>()
  const takeBest = (eligible: (player: RankedPlayer) => boolean, count: number) => {
    const selected = rankedRoster
      .filter((player) => !selectedStarterIds.has(player.id) && eligible(player))
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .slice(0, count)
    selected.forEach((player) => selectedStarterIds.add(player.id))
    return selected
  }
  const selectedStarters: RankedPlayer[] = []
  corePositions.forEach((position) => selectedStarters.push(...takeBest((player) => player.position === position, getRosterHealthCoreTarget(position, league.lineup))))
  selectedStarters.push(...takeBest((player) => ['QB', 'RB', 'WR', 'TE'].includes(player.position), league.lineup.superflex))
  selectedStarters.push(...takeBest((player) => ['RB', 'WR', 'TE'].includes(player.position), league.lineup.flex))
  const projectedStarterPpg = selectedStarters.reduce((total, player) => total + player.projectedPoints, 0) / NFL_REGULAR_SEASON_GAMES

  const byeCounts = new Map<number, number>()
  rankedRoster.forEach((player) => player.bye && byeCounts.set(player.bye, (byeCounts.get(player.bye) || 0) + 1))
  const byeConflicts = [...byeCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0)
  const needPriority = ['RB', 'WR', 'QB', 'TE', 'FLEX', 'SF', 'K', 'DST']
  const urgentNeeds = [...coverage]
    .filter((slot) => slot.filled < slot.total)
    .sort((a, b) => needPriority.indexOf(a.label) - needPriority.indexOf(b.label))
    .map((slot) => slot.total - slot.filled > 1 ? `${slot.label} ×${slot.total - slot.filled}` : slot.label)
  const expectedCoverage = Math.min(starterSlots, roster.length)
  const status: RosterHealth['status'] = roster.length === 0
    ? 'Draft ready'
    : startersFilled === starterSlots
      ? 'Starters set'
      : startersFilled + 1 < expectedCoverage
        ? 'Needs attention'
        : 'On track'

  return {
    status,
    startersFilled,
    starterSlots,
    projectedStarterPpg,
    byeConflicts,
    depthPlayers: Math.max(0, roster.length - startersFilled),
    urgentNeeds,
    coverage,
  }
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
  const roster = getDraftedRosterForSlot(draft, userSlot)
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
  const direct = Date.parse(value)
  if (Number.isFinite(direct)) return direct
  const now = new Date()
  const parsed = Date.parse(`${value} ${now.getFullYear()}`)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatInjuryDetails(injury: InjuryDetail) {
  const details = [
    injury.detail,
    injury.practice ? `Practice: ${injury.practice}` : null,
    injury.started ? `Since ${injury.started}` : null,
  ].filter(Boolean)
  return details.length ? details.join(' · ') : 'No additional notes'
}

function formatInjuryUpdated(value: string | undefined) {
  if (!value) return 'Update pending'
  const timestamp = parseInjuryDate(value)
  if (!timestamp) return value
  const date = new Date(timestamp)
  return date.getFullYear() === new Date().getFullYear()
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
  return { ...payload.draft, leagueId: league.id, source: 'espn', sessionType: 'live', lastSyncedAt: new Date().toISOString() }
}

async function fetchSleeperDraftState(sourceId: string, league: LeagueProfile, currentDraft: DraftState, sessionType: 'live' | 'mock' = 'live'): Promise<DraftState> {
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
    sessionType,
    status: draftData.status || 'unknown',
    totalRounds,
    leagueName: draftData.metadata?.name || draftData.league_id || (sessionType === 'mock' ? `${league.name} mock` : league.name),
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
  const [rankings, projections, depthCharts, injuries, rookies, previousYearResults, previousYearWeeklyResults, schedules] = await Promise.all([
    fetchJson<SplitDataFiles['rankings']>(`${DATA_BASE_URL}/rankings.json`),
    fetchJson<SplitDataFiles['projections']>(`${DATA_BASE_URL}/projections.json`),
    fetchJson<SplitDataFiles['depthCharts']>(`${DATA_BASE_URL}/depth-charts.json`),
    fetchJson<SplitDataFiles['injuries']>(`${DATA_BASE_URL}/injuries.json`),
    fetchJson<SplitDataFiles['rookies']>(`${DATA_BASE_URL}/rookies.json`),
    fetchJson<SplitDataFiles['previousYearResults']>(`${DATA_BASE_URL}/previous-year-results.json`),
    fetchJson<NonNullable<SplitDataFiles['previousYearWeeklyResults']>>(`${DATA_BASE_URL}/previous-year-weekly-results.json`).catch(() => ({
      previousYearWeeklyResults: {},
    })),
    fetchJson<NonNullable<SplitDataFiles['schedules']>>(`${DATA_BASE_URL}/schedules.json`).catch(() => ({ schedules: undefined })),
  ])

  return composeSplitData({ rankings, projections, depthCharts, injuries, rookies, previousYearResults, previousYearWeeklyResults, schedules })
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
    source: 'Split data files: FantasyPros rankings/projections/stats, Sleeper injuries/depth charts, rookie draft results',
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
    schedules: files.schedules?.schedules,
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
  displayedCount,
  draftedIds,
  draftedPlayerKeys,
  leagueName,
  leagueTeams,
  playersByPosition,
  positionTierAvailability,
  playersView,
  query,
  recommendations,
  recommendationRosterLabel,
  strategy,
  watchlistIdSet,
  watchlistPlayers,
  watchlistRecommendations,
  togglePosition,
  visiblePositions,
  showDraftedPlayers,
  onPlayerSelect,
  onPlayersViewChange,
  onQueryChange,
  onShowDraftedPlayersChange,
  onStrategyChange,
  onToggleWatchlist,
  onClearWatchlist,
}: {
  availableCount: number
  displayedCount: number
  draftedIds: ReadonlySet<string>
  draftedPlayerKeys: ReadonlySet<string>
  leagueName: string
  leagueTeams: number
  playersByPosition: Record<Position, RankedPlayer[]>
  positionTierAvailability: PositionTierAvailability
  playersView: PlayersView
  query: string
  recommendations: Recommendation[]
  recommendationRosterLabel: string
  strategy: RecommendationStrategy
  watchlistIdSet: ReadonlySet<string>
  watchlistPlayers: RankedPlayer[]
  watchlistRecommendations: Recommendation[]
  togglePosition: (position: Position) => void
  visiblePositions: Record<Position, boolean>
  showDraftedPlayers: boolean
  onPlayerSelect: (player: RankedPlayer) => void
  onPlayersViewChange: (view: PlayersView) => void
  onQueryChange: (query: string) => void
  onShowDraftedPlayersChange: (showDrafted: boolean) => void
  onStrategyChange: (strategy: RecommendationStrategy) => void
  onToggleWatchlist: (playerId: string) => void
  onClearWatchlist: () => void
}) {
  const activePositions = POSITION_ORDER.filter((position) => visiblePositions[position])
  const visiblePlayers = activePositions
    .flatMap((position) => playersByPosition[position])
    .sort((a, b) => a.rank - b.rank)

  return (
    <div className="playersBoard">
      <section className="playerListPanel">
        <div className="playerListHeader">
          <h2>Available Players - {leagueName}</h2>
          <div className="playerCount">
            {showDraftedPlayers
              ? `${displayedCount} shown · ${availableCount} available`
              : `${availableCount} player${availableCount === 1 ? '' : 's'} available`}
          </div>
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
          <div className="playerControlActions">
            <div className="playerViewToggle" aria-label="Players display">
              <button aria-pressed={playersView === 'columns'} className={playersView === 'columns' ? 'active' : ''} onClick={() => onPlayersViewChange('columns')} type="button">
                <LayoutGrid size={13} /> Columns
              </button>
              <button aria-pressed={playersView === 'table'} className={playersView === 'table' ? 'active' : ''} onClick={() => onPlayersViewChange('table')} type="button">
                <Table2 size={13} /> Table
              </button>
            </div>
            <button
              aria-pressed={showDraftedPlayers}
              className={`draftedVisibilityToggle ${showDraftedPlayers ? 'active' : ''}`}
              onClick={() => onShowDraftedPlayersChange(!showDraftedPlayers)}
              type="button"
            >
              {showDraftedPlayers ? 'Hide drafted' : 'Show drafted'}
            </button>
            <div className="positionToggles" aria-label="Visible positions">
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
        </div>

        <div className={`playersContainer ${playersView === 'table' ? 'tableView' : ''}`}>
          {activePositions.length === 0 ? (
            <div className="noPlayers">Select at least one position.</div>
          ) : visiblePlayers.length === 0 ? (
            <div className="noPlayers">{query ? 'No matching players in the selected positions.' : 'All players in the selected positions have been drafted.'}</div>
          ) : playersView === 'table' ? (
            <PlayersDataTable
              draftedIds={draftedIds}
              draftedPlayerKeys={draftedPlayerKeys}
              leagueTeams={leagueTeams}
              players={visiblePlayers}
              watchlistIdSet={watchlistIdSet}
              onPlayerSelect={onPlayerSelect}
              onToggleWatchlist={onToggleWatchlist}
            />
          ) : (
            <section className="positionColumns">
              {activePositions.map((position) => (
                <div className={`positionColumn positionColumn${position}`} key={position}>
                  <div className="positionHeader">
                    <span className="positionLabel">{position}</span>
                    <div className="positionTierCounts" aria-label={`${position} tier availability`}>
                      {HEADER_TIER_COLOR_ORDER.map((color) => {
                        const count = positionTierAvailability[position][color]
                        return (
                          <span
                            className={`positionTierCount ${color}`}
                            key={color}
                            title={`${HEADER_TIER_LABELS[color]}: ${count.available} of ${count.total} available`}
                          >
                            {count.available}/{count.total}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="positionPlayers">
                    {playersByPosition[position].map((player) => (
                      <PlayerSummary
                        isDrafted={isDraftedPlayer(player, draftedIds, draftedPlayerKeys)}
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
          <div><h3>Recommendations</h3><small>{RECOMMENDATION_STRATEGIES[strategy].description}</small><small className="rosterBasis">{recommendationRosterLabel}</small></div>
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

function PlayersDataTable({
  draftedIds,
  draftedPlayerKeys,
  leagueTeams,
  players,
  watchlistIdSet,
  onPlayerSelect,
  onToggleWatchlist,
}: {
  draftedIds: ReadonlySet<string>
  draftedPlayerKeys: ReadonlySet<string>
  leagueTeams: number
  players: RankedPlayer[]
  watchlistIdSet: ReadonlySet<string>
  onPlayerSelect: (player: RankedPlayer) => void
  onToggleWatchlist: (playerId: string) => void
}) {
  return (
    <div className="playersTableScroller" tabIndex={0}>
      <table className="playersDataTable">
        <caption className="srOnly">Players ranked across the selected positions</caption>
        <thead>
          <tr>
            <th aria-label="Watchlist" className="playersTableWatchHead" scope="col"><Star size={12} /></th>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col">Pos</th>
            <th scope="col">Team</th>
            <th scope="col">Bye</th>
            <th scope="col">Tier</th>
            <th scope="col">Proj PPG</th>
            <th scope="col">Proj total</th>
            <th scope="col">ADP</th>
            <th scope="col">SOS</th>
            <th scope="col">Early / Dome</th>
            <th scope="col">Last PPG</th>
            <th scope="col">Last finish</th>
            <th scope="col">Depth</th>
            <th scope="col">Injury</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const adpValueBand = getAdpValueBand(player)
            const isDrafted = isDraftedPlayer(player, draftedIds, draftedPlayerKeys)
            const isWatched = watchlistIdSet.has(player.id)
            const tierColor = getTierColor(player.tier)
            const positionColor = getPositionColor(player.position)
            const specialSchedule = player.position === 'DST'
              ? `W1-4 ${formatScheduleStrength(player.earlySeasonSos)}`
              : player.position === 'K'
                ? formatDomeRate(player.domeRate)
                : '—'
            const depthLabel = player.depthChart
              ? `${player.position}${player.depthChart.order}${player.depthChart.role ? ` · ${player.depthChart.role}` : ''}`
              : '—'
            const injuryParts = player.injury
              ? [...new Set([player.injury.injury, player.injury.status].filter((item): item is string => Boolean(item)))]
              : []
            const injuryLabel = injuryParts.length ? injuryParts.join(' · ') : '—'

            return (
              <tr className={`${isDrafted ? 'draftedPlayerRow ' : ''}${isWatched ? 'watchedPlayerRow' : ''}`} key={player.id}>
                <td className="playersTableWatch" style={{ boxShadow: `inset 3px 0 0 ${tierColor}` }}>
                  <button
                    aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`}
                    aria-pressed={isWatched}
                    className={isWatched ? 'watched' : ''}
                    onClick={() => onToggleWatchlist(player.id)}
                    type="button"
                  >
                    <Star size={12} />
                  </button>
                </td>
                <td className="playersTableRank">
                  <strong style={{ color: tierColor }}>#{player.rank}</strong>
                  <small>{player.posRank || '—'}</small>
                </td>
                <td className="playersTablePlayer">
                  <button className="playerNameButton" onClick={() => onPlayerSelect(player)} style={{ color: positionColor }} type="button">{player.name}</button>
                  <span>
                    {isDrafted ? <small className="draftedPlayerBadge">Drafted</small> : null}
                    {player.rookie ? <small className="rookieTableBadge">Rookie</small> : null}
                  </span>
                </td>
                <td><span className={`position playersTablePosition position${player.position}`}>{player.position}</span></td>
                <td>{player.team || 'FA'}</td>
                <td>{player.bye || '—'}</td>
                <td><strong style={{ color: tierColor }}>{player.tier ? `T${player.tier}` : '—'}</strong></td>
                <td><strong style={{ color: tierColor }}>{formatProjectedPointsPerGame(player.projectedPoints)}</strong></td>
                <td>{player.projectedPoints > 0 ? player.projectedPoints.toFixed(1) : '—'}</td>
                <td className="playersTableAdp" title={getAdpValueTitle(player)}>
                  <strong className={`adpValueText ${adpValueBand.tone}`}>{formatAdpRoundPick(player.adp, leagueTeams)}</strong>
                  <small>{player.adp ? `#${player.adp.toFixed(1)}` : '—'}</small>
                </td>
                <td title={player.strengthOfSchedule ? `${player.strengthOfSchedule.games} schedule games evaluated` : undefined}>{formatScheduleStrength(player.strengthOfSchedule)}</td>
                <td>{specialSchedule}</td>
                <td>{formatPreviousYearPointsPerGame(player.previousYear)}</td>
                <td>{player.previousYear?.rank ? `${player.position}${player.previousYear.rank}` : '—'}</td>
                <td title={player.depthChart?.source}>{depthLabel}</td>
                <td className={player.injury ? 'playersTableInjury' : ''} title={player.injury?.detail}>{injuryLabel}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type PlayerSummaryProps = {
  player: RankedPlayer
  leagueTeams: number
  variant: 'shortlist' | 'column'
  isWatched: boolean
  isDrafted?: boolean
  onPlayerSelect: (player: RankedPlayer) => void
  onToggleWatchlist: (playerId: string) => void
}

const PlayerSummary = React.memo(function PlayerSummary({
  player,
  leagueTeams,
  variant,
  isWatched,
  isDrafted = false,
  onPlayerSelect,
  onToggleWatchlist,
}: PlayerSummaryProps) {
  const tierColor = getTierColor(player.tier)
  const positionColor = getPositionColor(player.position)
  const adpLabel = formatAdpRoundPick(player.adp, leagueTeams)
  const adpValueBand = getAdpValueBand(player)
  const projectedPointsPerGame = formatProjectedPointsPerGame(player.projectedPoints)
  const compactScheduleStats = getCompactScheduleStats(player)
  if (variant === 'shortlist') {
    return (
      <div className={isWatched ? 'shortlistItem watchedPlayerItem' : 'shortlistItem'} style={{ borderLeftColor: positionColor }}>
        <span className="shortlistRank" style={{ color: positionColor }}>
          #{player.rank}
        </span>
        <button className="playerNameButton shortlistName" onClick={() => onPlayerSelect(player)} style={{ color: positionColor }} type="button">{player.name}</button>
        <span className="shortlistMeta">
          {player.position}{player.posRank ? ` ${player.posRank.replace(player.position, '')}` : ''} | {projectedPointsPerGame} | <span className={`adpValueText compact ${adpValueBand.tone}`} title={getAdpValueTitle(player)}>{adpLabel}</span>
          {compactScheduleStats.length ? ` | ${compactScheduleStats.join(' | ')}` : ''}
        </span>
        <span className="playerQuickActions">
          <button aria-label={`${isWatched ? 'Remove' : 'Add'} ${player.name} ${isWatched ? 'from' : 'to'} watchlist`} aria-pressed={isWatched} className={isWatched ? 'watched' : ''} onClick={() => onToggleWatchlist(player.id)} type="button"><Star size={13} /></button>
        </span>
      </div>
    )
  }

  return (
    <div className={`playerItem${isWatched ? ' watchedPlayerItem' : ''}${isDrafted ? ' draftedPlayerItem' : ''}`} style={{ borderLeftColor: tierColor }}>
      <div className="playerRank" style={{ color: tierColor }}>
        <strong>#{player.rank}</strong>
        <small>{player.posRank || '—'}</small>
      </div>
      <div className="playerIdentity" style={{ color: tierColor }}>
        <button className="playerNameButton" onClick={() => onPlayerSelect(player)} type="button">{player.name}</button>
        <span className="playerSecondaryMeta">
          {isDrafted ? <span className="draftedPlayerBadge">Drafted</span> : null}
          {compactScheduleStats.map((stat) => <span className="scheduleValue" key={stat}>{stat}</span>)}
          {player.injury ? <span className="injuryDot">I</span> : null}
          {player.rookie ? <span className="rookieDot">R</span> : null}
        </span>
      </div>
      <div className="playerStatStack">
        <span title={`${player.projectedPoints.toFixed(1)} projected season points`}>
          <small>Proj</small>
          <strong style={{ color: tierColor }}>{projectedPointsPerGame}</strong>
        </span>
        <span title={getAdpValueTitle(player)}>
          <small>ADP</small>
          <strong className={`adpValueText ${adpValueBand.tone}`}>{adpLabel}</strong>
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

function getAdpValueBand(player: RankedPlayer) {
  const value = getAdpValue(player)
  if (value === undefined) return { label: '—', tone: 'unavailable' as const }
  const pickGap = Math.round(value)
  if (pickGap >= 4) return { label: 'STEAL', tone: 'steal' as const }
  if (pickGap >= 2) return { label: 'VALUE', tone: 'value' as const }
  if (pickGap <= -4) return { label: 'FADE', tone: 'fade' as const }
  if (pickGap <= -2) return { label: 'PRICEY', tone: 'pricey' as const }
  return { label: 'FAIR', tone: 'fair' as const }
}

function getAdpValueTitle(player: RankedPlayer) {
  if (!player.adp) return 'Rank vs ADP unavailable'
  const value = getAdpValue(player) || 0
  const band = getAdpValueBand(player)
  const roundedValue = Math.round(value)
  const explanation = roundedValue > 0
    ? `ranked ${roundedValue} ${roundedValue === 1 ? 'pick' : 'picks'} ahead of ADP`
    : roundedValue < 0
      ? `ranked ${Math.abs(roundedValue)} ${Math.abs(roundedValue) === 1 ? 'pick' : 'picks'} behind ADP`
      : 'ranking and ADP are aligned'
  return `${band.label}: ${explanation} (rank #${player.rank}, ADP #${player.adp.toFixed(1)})`
}

function formatScheduleStrength(strength: ScheduleStrength | undefined) {
  return strength ? `#${strength.rank} · ${strength.label}` : '—'
}

function formatDomeRate(domeRate: DomeRate | undefined) {
  return domeRate ? `${domeRate.indoorGames}/${domeRate.totalGames} · ${Math.round(domeRate.rate * 100)}%` : '—'
}

function getCompactScheduleStats(player: RankedPlayer) {
  const stats = player.strengthOfSchedule ? [`SOS #${player.strengthOfSchedule.rank}`] : []
  if (player.position === 'DST' && player.earlySeasonSos) stats.push(`W1-4 #${player.earlySeasonSos.rank}`)
  if (player.position === 'K' && player.domeRate) stats.push(`Dome ${player.domeRate.indoorGames}/${player.domeRate.totalGames}`)
  return stats
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

function getHeaderTierColor(tier: number | undefined): HeaderTierColor | undefined {
  if (!tier || tier > 8) return undefined
  if (tier <= 2) return 'blue'
  if (tier <= 4) return 'green'
  if (tier <= 6) return 'yellow'
  return 'orange'
}

function createEmptyPositionTierAvailability(): PositionTierAvailability {
  const createCounts = (): Record<HeaderTierColor, TierAvailabilityCount> => ({
    blue: { available: 0, total: 0 },
    green: { available: 0, total: 0 },
    yellow: { available: 0, total: 0 },
    orange: { available: 0, total: 0 },
  })
  return {
    QB: createCounts(),
    RB: createCounts(),
    WR: createCounts(),
    TE: createCounts(),
    K: createCounts(),
    DST: createCounts(),
  }
}

function isDraftedPlayer(player: RankedPlayer, draftedIds: ReadonlySet<string>, draftedPlayerKeys: ReadonlySet<string>) {
  return draftedIds.has(player.id) || draftedPlayerKeys.has(playerKey(player.name))
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

async function persistState(profiles: LeagueProfile[], draftsByLeague: Record<string, DraftState>, draft: DraftState, remoteDraftReady: boolean) {
  localStorage.setItem('draft-wizard:league-profiles', JSON.stringify(profiles))
  localStorage.setItem('draft-wizard:drafts-by-league', JSON.stringify(draftsByLeague))
  if (!API_URL || !remoteDraftReady) return 'Local'
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
