import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  Baby,
  ClipboardList,
  Filter,
  ListTree,
  RotateCcw,
  Search,
  Settings,
} from 'lucide-react'
import './style.css'

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
type ScoringPreset = 'standard' | 'halfPpr' | 'ppr' | 'custom'
type Platform = 'sleeper' | 'espn'
type AppTab = 'players' | 'depth' | 'injuries' | 'rookies' | 'leagues'

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

const DEFAULT_RANKINGS_URL = 'https://corypahl-fantasy-bucket.s3.us-east-1.amazonaws.com/data/fantasy-data.json'
const DEFAULT_DRAFT_API_URL = 'https://dqen8hccb0.execute-api.us-east-1.amazonaws.com'
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
  const [position, setPosition] = useState<Position | 'ALL'>('ALL')
  const [activeTab, setActiveTab] = useState<AppTab>('players')
  const [remoteLoaded, setRemoteLoaded] = useState(!API_URL)

  const selectedLeague = profiles.find((profile) => profile.id === selectedLeagueId) || profiles[0]
  const draft = draftsByLeague[selectedLeague.id] || createDraftState(selectedLeague)

  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
      .then((payload: RankingsFile) => setData(payload))
      .catch(() => setData(seedData))
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
  const currentSlot = getDraftSlot(draft.currentPick, selectedLeague.lineup.teams)
  const currentTeam = draft.teamNames[currentSlot - 1] || `Team ${currentSlot}`
  const availablePlayers = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim()
    return players
      .filter((player) => !draftedIds.has(player.id))
      .filter((player) => position === 'ALL' || player.position === position)
      .filter((player) => !lowerQuery || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.draftScore - a.draftScore)
  }, [draftedIds, players, position, query])

  const depthRows = useMemo(() => flattenDepthCharts(data.depthCharts), [data.depthCharts])
  const injuryRows = useMemo(() => [...(data.injuries || [])].sort((a, b) => `${a.team || ''}${a.name}`.localeCompare(`${b.team || ''}${b.name}`)), [data.injuries])
  const rookieRows = useMemo(() => [...(data.rookies || [])].sort((a, b) => (a.draftPick || 9999) - (b.draftPick || 9999) || a.name.localeCompare(b.name)), [data.rookies])
  const rosterNeeds = useMemo(() => calculateNeeds(selectedLeague, draft, currentTeam), [draft, selectedLeague, currentTeam])

  function updateDraft(nextDraft: DraftState) {
    setDraftsByLeague((current) => ({ ...current, [selectedLeague.id]: nextDraft }))
  }

  function undoPick() {
    if (draft.drafted.length === 0) return
    updateDraft({
      ...draft,
      currentPick: Math.max(1, draft.currentPick - 1),
      drafted: draft.drafted.slice(0, -1),
    })
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
        <section className="draftGrid">
          <aside className="panel">
            <div className="panelHeader">
              <h2>Draft Status</h2>
              <button className="iconButton" onClick={undoPick} title="Undo last pick" aria-label="Undo last pick">
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="clock">
              <span>
                {selectedLeague.platform.toUpperCase()} - Round {Math.ceil(draft.currentPick / selectedLeague.lineup.teams)}
              </span>
              <strong>{currentTeam}</strong>
              <small>
                Slot {currentSlot} - {selectedLeague.lineup.teams} teams
              </small>
            </div>
            <h3>Recent Picks</h3>
            <div className="pickList">
              {draft.drafted.slice(-10).reverse().map((pick) => {
                const player = players.find((item) => item.id === pick.playerId)
                return (
                  <div className="pickRow" key={pick.pick}>
                    <span>{pick.pick}</span>
                    <strong>{player?.name || pick.playerId}</strong>
                    <small>{pick.teamName}</small>
                  </div>
                )
              })}
              {draft.drafted.length === 0 ? <p className="muted">No picks yet.</p> : null}
            </div>
            <h3>Current Team Needs</h3>
            <div className="needList">
              {Object.entries(rosterNeeds).map(([key, value]) => (
                <span key={key} className={value > 0 ? 'needOpen' : 'needFilled'}>
                  {key.toUpperCase()} {value}
                </span>
              ))}
            </div>
          </aside>

          <section className="board">
            <div className="filters">
              <label className="searchBox">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players, teams, positions" />
              </label>
              <label className="selectBox">
                <Filter size={16} />
                <select value={position} onChange={(event) => setPosition(event.target.value as Position | 'ALL')}>
                  <option value="ALL">All positions</option>
                  <option value="QB">QB</option>
                  <option value="RB">RB</option>
                  <option value="WR">WR</option>
                  <option value="TE">TE</option>
                  <option value="K">K</option>
                  <option value="DST">DST</option>
                </select>
              </label>
            </div>

            <div className="table">
              <div className="tableHead">
                <span>Rank</span>
                <span>Player</span>
                <span>Pos</span>
                <span>Proj</span>
                <span>Prev</span>
                <span>Value</span>
                <span>ADP</span>
              </div>
              {availablePlayers.slice(0, 80).map((player) => (
                <div className="playerRow" key={player.id}>
                  <span>{player.rank}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <small className="playerMeta">
                      <span>{player.team}</span>
                      {player.depthChart ? (
                        <span title={`${player.depthChart.source} depth chart`}>
                          {player.depthChart.position}{player.depthChart.order}
                        </span>
                      ) : null}
                      {player.injury ? (
                        <span className="warningTag" title={[player.injury.injury, player.injury.updated].filter(Boolean).join(' - ')}>
                          {player.injury.status}
                        </span>
                      ) : null}
                      {player.rookie ? (
                        <span title={`${player.rookie.source}${player.rookie.college ? ` - ${player.rookie.college}` : ''}`}>
                          Rookie{player.rookie.draftPick ? ` #${player.rookie.draftPick}` : ''}
                        </span>
                      ) : null}
                    </small>
                  </div>
                  <span className={`position position${player.position}`}>{player.posRank || player.position}</span>
                  <span>{player.projectedPoints.toFixed(1)}</span>
                  <span>{player.previousYear?.fpts?.toFixed(1) || '-'}</span>
                  <span>{Math.round(player.draftScore)}</span>
                  <span>{player.adp?.toFixed(1) || '-'}</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'depth' ? <DepthChartsPage rows={depthRows} /> : null}
      {activeTab === 'injuries' ? <InjuriesPage rows={injuryRows} /> : null}
      {activeTab === 'rookies' ? <RookiesPage rows={rookieRows} /> : null}
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

function DepthChartsPage({ rows }: { rows: DepthChartEntry[] }) {
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <h2>Depth Charts</h2>
        <span className="countPill">{rows.length} players</span>
      </div>
      <div className="infoTable depthTable">
        <div className="infoHead">
          <span>Team</span>
          <span>Pos</span>
          <span>Order</span>
          <span>Player</span>
          <span>Source</span>
        </div>
        {rows.map((row) => (
          <div className="infoRow" key={`${row.team}-${row.position}-${row.order}-${row.name}`}>
            <span>{row.team}</span>
            <span className={`position position${row.position}`}>{row.position}</span>
            <span>{row.order}</span>
            <strong>{row.name}</strong>
            <small>{row.source}</small>
          </div>
        ))}
        {rows.length === 0 ? <p className="emptyState">No depth chart data has been published yet.</p> : null}
      </div>
    </section>
  )
}

function InjuriesPage({ rows }: { rows: InjuryDetail[] }) {
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
        {rows.map((row) => (
          <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.status}`}>
            <strong>{row.name}</strong>
            <span>{row.team || '-'}</span>
            <span className={`position position${row.position}`}>{row.position}</span>
            <span className="warningText">{row.status}</span>
            <span>{row.injury || '-'}</span>
            <small>{row.updated || '-'}</small>
            <small>{row.source}</small>
          </div>
        ))}
        {rows.length === 0 ? <p className="emptyState">No injury reports have been published yet.</p> : null}
      </div>
    </section>
  )
}

function RookiesPage({ rows }: { rows: RookieDetail[] }) {
  return (
    <section className="panel pagePanel">
      <div className="panelHeader">
        <h2>Rookies</h2>
        <span className="countPill">{rows.length} players</span>
      </div>
      <div className="infoTable rookiesTable">
        <div className="infoHead">
          <span>Pick</span>
          <span>Player</span>
          <span>Team</span>
          <span>Pos</span>
          <span>College</span>
          <span>Source</span>
        </div>
        {rows.map((row) => (
          <div className="infoRow" key={`${row.name}-${row.team || 'FA'}-${row.draftPick || row.rookieYear || 'rookie'}`}>
            <span>{row.draftPick ? `#${row.draftPick}` : '-'}</span>
            <strong>{row.name}</strong>
            <span>{row.team || '-'}</span>
            <span className={`position position${row.position}`}>{row.position}</span>
            <span>{row.college || '-'}</span>
            <small>{row.source}</small>
          </div>
        ))}
        {rows.length === 0 ? <p className="emptyState">No rookie data has been published yet.</p> : null}
      </div>
    </section>
  )
}

function flattenDepthCharts(depthCharts: RankingsFile['depthCharts']) {
  if (!depthCharts) return []
  return Object.entries(depthCharts)
    .flatMap(([team, positions]) =>
      Object.entries(positions || {}).flatMap(([position, entries]) =>
        (entries || []).map((entry) => ({
          ...entry,
          team: entry.team || team,
          position: position as Position,
        })),
      ),
    )
    .sort((a, b) => a.team.localeCompare(b.team) || a.position.localeCompare(b.position) || a.order - b.order)
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

function calculateNeeds(league: LeagueProfile, draft: DraftState, teamName: string) {
  const ownPicks = draft.drafted.filter((pick) => pick.teamName === teamName)
  const counts = { qb: 0, rb: 0, wr: 0, te: 0, k: 0, dst: 0 }
  ownPicks.forEach((pick) => {
    const position = pick.playerId.split('-').at(-1)
    if (position === 'qb') counts.qb += 1
    if (position === 'rb') counts.rb += 1
    if (position === 'wr') counts.wr += 1
    if (position === 'te') counts.te += 1
    if (position === 'k') counts.k += 1
    if (position === 'dst') counts.dst += 1
  })
  return {
    qb: Math.max(0, league.lineup.qb + league.lineup.superflex - counts.qb),
    rb: Math.max(0, league.lineup.rb - counts.rb),
    wr: Math.max(0, league.lineup.wr - counts.wr),
    te: Math.max(0, league.lineup.te - counts.te),
    flex: Math.max(0, league.lineup.flex - Math.max(0, counts.rb + counts.wr + counts.te - league.lineup.rb - league.lineup.wr - league.lineup.te)),
    k: Math.max(0, league.lineup.k - counts.k),
    dst: Math.max(0, league.lineup.dst - counts.dst),
  }
}

function getDraftSlot(pick: number, teams: number) {
  const zeroBasedRound = Math.floor((pick - 1) / teams)
  const index = (pick - 1) % teams
  return zeroBasedRound % 2 === 0 ? index + 1 : teams - index
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
