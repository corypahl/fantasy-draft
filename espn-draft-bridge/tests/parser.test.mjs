import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../espn-parser.js', import.meta.url), 'utf8')
const context = { URL, Date }
context.globalThis = context
vm.runInNewContext(source, context)
const parser = context.EspnDraftParser

test('parses round-slot ESPN pick text', () => {
  assert.deepEqual(
    { ...parser.parsePickText('1.01 Jahmyr Gibbs RB - DET', {}, 10, []) },
    {
      pick: 1,
      round: 1,
      slot: 1,
      teamName: 'Team 1',
      playerId: 'jahmyr-gibbs-det-rb',
      playerName: 'Jahmyr Gibbs',
      position: 'RB',
      team: 'DET'
    }
  )
})

test('parses overall pick text and normalizes defense', () => {
  const pick = parser.parsePickText('12. (12) Philadelphia Eagles D/ST - PHI', {}, 10, [])
  assert.equal(pick.pick, 12)
  assert.equal(pick.round, 2)
  assert.equal(pick.slot, 9)
  assert.equal(pick.position, 'DST')
  assert.equal(pick.team, 'PHI')
  assert.equal(pick.playerName, 'Philadelphia Eagles')
})

test('prefers structured ESPN data attributes', () => {
  const pick = parser.parsePickText('Selected player', {
    pickNumber: '18',
    draftSlot: '3',
    round: '2',
    playerName: 'Puka Nacua',
    position: 'WR',
    team: 'LAR'
  }, 10, ['One', 'Two', 'Three'])
  assert.equal(pick.pick, 18)
  assert.equal(pick.slot, 3)
  assert.equal(pick.teamName, 'Three')
  assert.equal(pick.playerName, 'Puka Nacua')
})

test('parses the 2026 ESPN practice-draft pick card format', () => {
  const pick = parser.parsePickText("Amon-Ra St. Brown / DET WR R1, P1 - Brent's Daddy", {}, 10, [])

  assert.equal(pick.pick, 1)
  assert.equal(pick.round, 1)
  assert.equal(pick.slot, 1)
  assert.equal(pick.playerName, 'Amon-Ra St. Brown')
  assert.equal(pick.position, 'WR')
  assert.equal(pick.team, 'DET')
})

test('finds generic div pick cards without ESPN class names', () => {
  const pickCard = {
    className: 'css-1dbjc4n',
    dataset: {},
    getAttribute() { return '' },
    id: '',
    parentElement: { className: 'css-1dbjc4n' },
    tagName: 'DIV',
    textContent: "Ja'Marr Chase / CIN WR R1, P2 - Team Mack",
  }
  const documentRef = {
    querySelectorAll(selector) {
      return selector === 'div, li, tr, [role="row"]' ? [pickCard] : []
    },
  }
  const snapshot = parser.scanDocument(
    documentRef,
    'https://fantasy.espn.com/football/draft?leagueId=503883311&seasonId=2026',
    { totalTeams: 10, totalRounds: 13 },
  )

  assert.equal(snapshot.diagnostics.candidateCount, 1)
  assert.equal(snapshot.diagnostics.source, 'dom')
  assert.equal(snapshot.picks.length, 1)
  assert.equal(snapshot.picks[0].pick, 2)
  assert.equal(snapshot.picks[0].playerName, "Ja'Marr Chase")
})

test('parses authenticated ESPN draft data with snake-draft slots', () => {
  const snapshot = parser.parseApiSnapshot({
    league: {
      id: 342190061,
      settings: { size: 4 },
      draftDetail: {
        inProgress: true,
        picks: [
          { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, playerId: 101, teamId: 9 },
          { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, playerId: 102, teamId: 4 },
          { overallPickNumber: 3, roundId: 1, roundPickNumber: 3, playerId: 103, teamId: 7 },
          { overallPickNumber: 4, roundId: 1, roundPickNumber: 4, playerId: 104, teamId: 2 },
          { overallPickNumber: 5, roundId: 2, roundPickNumber: 1, playerId: 105, teamId: 2 }
        ]
      },
      teams: [
        { id: 9, name: 'Team Pahl' },
        { id: 4, name: 'Team Mack' },
        { id: 7, name: 'Team Jordan' },
        { id: 2, name: 'Team Choo' }
      ]
    },
    players: [
      { id: 101, player: { fullName: 'Amon-Ra St. Brown', defaultPositionId: 3, proTeamId: 8 } },
      { id: 102, player: { fullName: 'Jahmyr Gibbs', defaultPositionId: 2, proTeamId: 8 } },
      { id: 103, player: { fullName: 'Josh Allen', defaultPositionId: 1, proTeamId: 2 } },
      { id: 104, player: { fullName: 'Brock Bowers', defaultPositionId: 4, proTeamId: 13 } },
      { id: 105, player: { fullName: 'Brandon Aubrey', defaultPositionId: 5, proTeamId: 6 } }
    ]
  }, 'https://fantasy.espn.com/football/draft?leagueId=342190061&seasonId=2026', { totalTeams: 4, totalRounds: 16 })

  assert.equal(snapshot.picks.length, 5)
  assert.equal(snapshot.picks[0].playerName, 'Amon-Ra St. Brown')
  assert.equal(snapshot.picks[0].position, 'WR')
  assert.equal(snapshot.picks[0].team, 'DET')
  assert.equal(snapshot.picks[4].slot, 4)
  assert.equal(snapshot.picks[4].teamName, 'Team Choo')
  assert.equal(snapshot.diagnostics.source, 'espn-api')
})
