import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  Baby,
  ClipboardList,
  ListTree,
  Search,
  Settings,
} from 'lucide-react'
import './style.css'

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
type ScoringPreset = 'standard' | 'halfPpr' | 'ppr' | 'custom'
type Platform = 'sleeper' | 'espn'
type AppTab = 'players' | 'depth' | 'injuries' | 'rookies' | 'leagues'
type DepthChartColumn = 'QB' | 'RB' | 'WR' | 'TE' | 'K'
type DepthChartTeamRow = Record<DepthChartColumn, DepthChartEntry[]> & { team: string }

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
  injuries?: InjuryDetail[]
  rookies?: RookieDetail[]
  previousYearResults?: Partial<Record<Position, PreviousYearResult[]>>
}

type ProjectionDetail = {
  points?: number
  projections?: Record<string, number>
}

type SplitDataFiles = {
  rankings: Pick<RankingsFile, 'generatedAt' | 'season' | 'source' | 'scoring'>
  projections: { projections?: Record<string, ProjectionDetail> }
  depthCharts: { depthCharts?: RankingsFile['depthCharts'] }
  injuries: { injuries?: InjuryDetail[] }
  rookies: { rookies?: RookieDetail[] }
  previousYearResults: { previousYearResults?: RankingsFile['previousYearResults']; previousSeason?: number }
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
}

type DraftState = {
  id: string
  leagueId: string
  currentPick: number
  drafted: DraftPick[]
  teamNames: string[]
}

const DEFAULT_DATA_BASE_URL = 'https://corypahl-fantasy-bucket.s3.us-east-1.amazonaws.com/data'
const DEFAULT_RANKINGS_URL = `${DEFAULT_DATA_BASE_URL}/fantasy-data.json`
const DEFAULT_DRAFT_API_URL = 'https://dqen8hccb0.execute-api.us-east-1.amazonaws.com'
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
  const [profiles, setProfiles] = useState<LeagueProfile[]>(API_URL ? leagueProfiles : loadLocal('league-profiles', leagueProfiles))
  const [selectedLeagueId, setSelectedLeagueId] = useState(loadLocal('selected-league-id', leagueProfiles[0].id))
  const [draftsByLeague, setDraftsByLeague] = useState<Record<string, DraftState>>(
    loadLocal(
      'drafts-by-league',
      Object.fromEntries(leagueProfiles.map((profile) => [profile.id, createDraftState(profile)])),
    ),
  )
  const [query, setQuery] = useState('')
  const [visiblePositions, setVisiblePositions] = useState<Record<Position, boolean>>(DEFAULT_VISIBLE_POSITIONS)
  const [activeTab, setActiveTab] = useState<AppTab>('players')
  const [remoteLoaded, setRemoteLoaded] = useState(!API_URL)

  const selectedLeague = profiles.find((profile) => profile.id === selectedLeagueId) || profiles[0]
  const draft = draftsByLeague[selectedLeague.id] || createDraftState(selectedLeague)

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
        if (remoteProfiles?.length) setProfiles(remoteProfiles)
        if (draftPayload?.draft) setDraftsByLeague((current) => ({ ...current, [draftPayload.draft!.leagueId]: draftPayload.draft! }))
      })
      .finally(() => setRemoteLoaded(true))
  }, [])

  useEffect(() => {
    if (!remoteLoaded) return
    persistState(profiles, draftsByLeague, draft).then(() => undefined)
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
  const availablePlayers = useMemo<RankedPlayer[]>(() => {
    const lowerQuery = query.toLowerCase().trim()
    return players
      .filter((player) => !draftedIds.has(player.id))
      .filter((player) => !lowerQuery || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.draftScore - a.draftScore)
  }, [draftedIds, players, query])

  const shortlistPlayers = useMemo(() => availablePlayers.slice(0, 12), [availablePlayers])
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
  const depthRows = useMemo(() => buildDepthChartRows(data.depthCharts), [data.depthCharts])
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

  return (
    <main className="shell">
      <nav className="tabs" aria-label="Draft views">
        <button className={activeTab === 'players' ? 'active' : ''} onClick={() => setActiveTab('players')}>
          <ClipboardList size={16} /> Players
        </button>
        <button className={activeTab === 'depth' ? 'active' : ''} onClick={() => setActiveTab('depth')}>
          <ListTree size={16} /> Depth Charts
        </button>
        <button className={activeTab === 'injuries' ? 'active' : ''} onClick={() => setActiveTab('injuries')}>
          <Activity size={16} /> Injuries
        </button>
        <button className={activeTab === 'rookies' ? 'active' : ''} onClick={() => setActiveTab('rookies')}>
          <Baby size={16} /> Rookies
        </button>
        <button className={activeTab === 'leagues' ? 'active' : ''} onClick={() => setActiveTab('leagues')}>
          <Settings size={16} /> Leagues
        </button>
      </nav>

      {activeTab === 'players' ? (
        <PlayersBoard
          availableCount={availablePlayers.length}
          leagueName={selectedLeague.name}
          leagueTeams={selectedLeague.lineup.teams}
          playersByPosition={playersByPosition}
          query={query}
          shortlistPlayers={shortlistPlayers}
          togglePosition={togglePosition}
          visiblePositions={visiblePositions}
          onQueryChange={setQuery}
        />
      ) : null}

      {activeTab === 'depth' ? (
        <DepthChartsPage
          rows={depthRows}
          injuredNames={injuryNameSet}
          rookieNames={rookieNameSet}
          playerPosRankByKey={playerPosRankByKey}
          playerTierByKey={playerTierByKey}
        />
      ) : null}
      {activeTab === 'injuries' ? <InjuriesPage rows={injuryRows} playerTierByKey={playerTierByKey} /> : null}
      {activeTab === 'rookies' ? <RookiesPage rows={rookieRows} playerTierByKey={playerTierByKey} /> : null}
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
        />
      ) : null}
    </main>
  )
}

function DepthChartsPage({
  rows,
  injuredNames,
  rookieNames,
  playerPosRankByKey,
  playerTierByKey,
}: {
  rows: DepthChartTeamRow[]
  injuredNames: Set<string>
  rookieNames: Set<string>
  playerPosRankByKey: Map<string, string>
  playerTierByKey: Map<string, number>
}) {
  const columns: DepthChartColumn[] = ['QB', 'RB', 'WR', 'TE', 'K']
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <h2>Depth Charts</h2>
        <span className="countPill">{rows.length} teams</span>
      </div>
      <div className="depthMatrix">
        <div className="depthMatrixHead">
          <span>Team</span>
          {columns.map((column) => (
            <span key={column} className={`depthHeading depthHeading${column.replace(/\d/g, '')}`}>
              {column}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div className="depthMatrixRow" key={row.team}>
            <strong>{row.team}</strong>
            {columns.map((column) => {
              const players = row[column]
              return (
                <div
                  className="depthCell"
                  key={`${row.team}-${column}`}
                >
                  {players.length ? (
                    players.map((player) => {
                      const isInjured = injuredNames.has(playerKey(player.name))
                      const isRookie = rookieNames.has(playerKey(player.name))
                      const posRank = getDepthPlayerPosRank(player, playerPosRankByKey)
                      return (
                        <span
                          className={depthPlayerClass(player)}
                          key={`${row.team}-${column}-${player.order}-${player.name}`}
                          style={{ color: getTierColor(getDepthPlayerTier(player, playerTierByKey)) }}
                          title={`${player.source} ${player.position}${player.order}`}
                        >
                          <span className="depthPlayerName">
                            {player.name}{posRank ? ` (${formatPositionRank(posRank)})` : ''}
                          </span>
                          {isInjured ? <span className="depthMarker depthMarkerInjury" title="Injured">I</span> : null}
                          {isRookie ? <span className="depthMarker depthMarkerRookie" title="Rookie">R</span> : null}
                        </span>
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
        {rows.length === 0 ? <p className="emptyState">No depth chart data has been published yet.</p> : null}
      </div>
    </section>
  )
}

function InjuriesPage({ rows, playerTierByKey }: { rows: InjuryDetail[]; playerTierByKey: Map<string, number> }) {
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <h2>Injuries</h2>
        <span className="countPill">{rows.length} reports</span>
      </div>
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
        {rows.map((row) => {
          const tierColor = getTierColor(getPlayerTier(row.name, row.team, playerTierByKey))
          return (
            <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.status}`} style={{ borderLeftColor: tierColor }}>
              <strong style={{ color: tierColor }}>{row.name}</strong>
              <span>{row.team || '-'}</span>
              <span className={`position position${row.position}`}>{row.position}</span>
              <span className="warningText">{row.status}</span>
              <span>{row.injury || '-'}</span>
              <small>{row.updated || '-'}</small>
              <small>{row.source}</small>
            </div>
          )
        })}
        {rows.length === 0 ? <p className="emptyState">No injury reports have been published yet.</p> : null}
      </div>
    </section>
  )
}

function RookiesPage({ rows, playerTierByKey }: { rows: RookieDetail[]; playerTierByKey: Map<string, number> }) {
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <h2>Rookies</h2>
        <span className="countPill">{rows.length} players</span>
      </div>
      <div className="infoTable rookiesTable">
        <div className="infoHead">
          <span>Round</span>
          <span>Pick</span>
          <span>Player</span>
          <span>Team</span>
          <span>Pos</span>
          <span>College</span>
        </div>
        {rows.map((row) => {
          const tierColor = getTierColor(getPlayerTier(row.name, row.team, playerTierByKey))
          return (
            <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.draftPick || row.rookieYear || 'rookie'}`} style={{ borderLeftColor: tierColor }}>
              <span>{row.draftRound || '-'}</span>
              <span>{row.draftPick ? `#${row.draftPick}` : '-'}</span>
              <strong style={{ color: tierColor }}>{row.name}</strong>
              <span>{row.team || '-'}</span>
              <span className={`position position${row.position}`}>{row.position}</span>
              <span>{row.college || '-'}</span>
            </div>
          )
        })}
        {rows.length === 0 ? <p className="emptyState">No rookie data has been published yet.</p> : null}
      </div>
    </section>
  )
}

function buildDepthChartRows(depthCharts: RankingsFile['depthCharts']): DepthChartTeamRow[] {
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

async function fetchSplitData(): Promise<RankingsFile> {
  const [rankings, projections, depthCharts, injuries, rookies, previousYearResults] = await Promise.all([
    fetchJson<SplitDataFiles['rankings']>(`${DATA_BASE_URL}/rankings.json`),
    fetchJson<SplitDataFiles['projections']>(`${DATA_BASE_URL}/projections.json`),
    fetchJson<SplitDataFiles['depthCharts']>(`${DATA_BASE_URL}/depth-charts.json`),
    fetchJson<SplitDataFiles['injuries']>(`${DATA_BASE_URL}/injuries.json`),
    fetchJson<SplitDataFiles['rookies']>(`${DATA_BASE_URL}/rookies.json`),
    fetchJson<SplitDataFiles['previousYearResults']>(`${DATA_BASE_URL}/previous-year-results.json`),
  ])

  return composeSplitData({ rankings, projections, depthCharts, injuries, rookies, previousYearResults })
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.statusText}`)
  return response.json()
}

function composeSplitData(files: SplitDataFiles): RankingsFile {
  const depthCharts = files.depthCharts.depthCharts
  const injuries = files.injuries.injuries || []
  const rookies = files.rookies.rookies || []
  const previousYearResults = files.previousYearResults.previousYearResults || {}
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
    injuries,
    rookies,
    previousYearResults,
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
  shortlistPlayers,
  togglePosition,
  visiblePositions,
  onQueryChange,
}: {
  availableCount: number
  leagueName: string
  leagueTeams: number
  playersByPosition: Record<Position, RankedPlayer[]>
  query: string
  shortlistPlayers: RankedPlayer[]
  togglePosition: (position: Position) => void
  visiblePositions: Record<Position, boolean>
  onQueryChange: (query: string) => void
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
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search players, teams, positions" />
          </label>
          <div className="positionToggles" aria-label="Visible position columns">
            {POSITION_ORDER.map((position) => (
              <button
                className={`positionToggle positionToggle${position} ${visiblePositions[position] ? 'active' : ''}`}
                key={position}
                onClick={() => togglePosition(position)}
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
                      <PlayerSummary key={player.id} leagueTeams={leagueTeams} player={player} variant="column" />
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
          <h3>Shortlist</h3>
          <div className="shortlistCount">{shortlistPlayers.length} shown</div>
        </div>
        <div className="shortlistContainer">
          {shortlistPlayers.map((player) => (
            <PlayerSummary key={player.id} leagueTeams={leagueTeams} player={player} variant="shortlist" />
          ))}
          {shortlistPlayers.length === 0 ? <p className="muted">No matching players.</p> : null}
        </div>
      </aside>
    </div>
  )
}

function PlayerSummary({ player, leagueTeams, variant }: { player: RankedPlayer; leagueTeams: number; variant: 'shortlist' | 'column' }) {
  const tierColor = getTierColor(player.tier)
  const adpLabel = formatAdpRoundPick(player.adp, leagueTeams)
  const projectedPointsPerGame = formatProjectedPointsPerGame(player.projectedPoints)
  if (variant === 'shortlist') {
    return (
      <div className="shortlistItem" style={{ borderLeftColor: tierColor }}>
        <span className="shortlistRank" style={{ color: tierColor }}>
          #{player.rank}
        </span>
        <span className="shortlistName" style={{ color: tierColor }}>
          {player.name}
        </span>
        <span className="shortlistMeta">
          {player.position}{player.posRank ? ` ${player.posRank.replace(player.position, '')}` : ''} | {projectedPointsPerGame} | {adpLabel}
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
        <span>{player.name}</span>
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
}) {
  return (
    <section className="settingsGrid">
      <div className="panel wide">
        <h2>Active League</h2>
        <div className="leagueSwitcher" aria-label="League selector">
          {profiles.map((profile) => (
            <button
              className={profile.id === selectedLeagueId ? 'selected' : ''}
              key={profile.id}
              onClick={() => setSelectedLeagueId(profile.id)}
            >
              <span>{profile.platform.toUpperCase()}</span>
              <strong>{profile.name}</strong>
              <small>{profile.rankingPreset.toUpperCase()} rankings</small>
            </button>
          ))}
        </div>
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
        <h2>Scoring</h2>
        <div className="formGrid compact">
          <NumberField label="Pass TD" value={league.scoring.passingTd} onChange={(value) => updateScoring({ passingTd: value })} />
          <NumberField label="Pass Yds/Pt" value={league.scoring.passingYardsPerPoint} onChange={(value) => updateScoring({ passingYardsPerPoint: value })} />
          <NumberField label="INT" value={league.scoring.interception} onChange={(value) => updateScoring({ interception: value })} />
          <NumberField label="Rec" value={league.scoring.reception} step={0.5} onChange={(value) => updateScoring({ reception: value })} />
          <NumberField label="Rush/Rec TD" value={league.scoring.rushReceiveTd} onChange={(value) => updateScoring({ rushReceiveTd: value })} />
          <NumberField label="Rush Yds/Pt" value={league.scoring.rushingYardsPerPoint} onChange={(value) => updateScoring({ rushingYardsPerPoint: value })} />
          <NumberField label="Rec Yds/Pt" value={league.scoring.receivingYardsPerPoint} onChange={(value) => updateScoring({ receivingYardsPerPoint: value })} />
          <NumberField label="Fumble" value={league.scoring.fumbleLost} onChange={(value) => updateScoring({ fumbleLost: value })} />
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
