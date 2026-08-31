import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8')
const context = {
  URL,
  chrome: {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        async get() { return {} },
        async set() {},
      },
    },
  },
  fetch,
  globalThis: null,
}
context.globalThis = context
vm.runInNewContext(source, context)

const worker = context.EspnDraftBridgeWorker
const config = {
  draftId: 'gvsu-draft',
  leagueId: 'gvsu',
  leagueName: 'GVSU',
  totalTeams: 10,
  totalRounds: 16,
}

function snapshot(pageUrl, picks) {
  return {
    capturedAt: '2026-08-30T12:00:00.000Z',
    detectedLeagueId: new URL(pageUrl).searchParams.get('leagueId'),
    pageUrl,
    picks,
    status: 'drafting',
    teamNames: Array.from({ length: 10 }, (_, index) => `Team ${index + 1}`),
    totalRounds: 16,
    totalTeams: 10,
  }
}

function pick(pickNumber, playerName) {
  const round = Math.ceil(pickNumber / 10)
  const withinRound = (pickNumber - 1) % 10
  const slot = round % 2 === 1 ? withinRound + 1 : 10 - withinRound
  return {
    pick: pickNumber,
    round,
    slot,
    playerId: playerName.toLowerCase().replaceAll(' ', '-'),
    playerName,
    position: 'RB',
    team: 'DET',
  }
}

test('restores saved picks when a post-restart scan only contains later rounds', () => {
  const pageUrl = 'https://fantasy.espn.com/football/draft?leagueId=503883311&seasonId=2026'
  const previous = worker.buildDraft(snapshot(pageUrl, [pick(1, 'First Player'), pick(2, 'Second Player')]), config)
  const incomingSnapshot = snapshot(pageUrl, [pick(31, 'Thirty First'), pick(32, 'Thirty Second')])
  const incoming = worker.buildDraft(incomingSnapshot, config)
  const merged = worker.mergeDraftHistory(previous, incoming, {}, incomingSnapshot)

  assert.deepEqual([...merged.drafted.map((entry) => entry.pick)], [1, 2, 31, 32])
  assert.equal(merged.currentPick, 33)
})

test('does not carry picks into a different ESPN league or season', () => {
  const oldUrl = 'https://fantasy.espn.com/football/draft?leagueId=111&seasonId=2026'
  const newUrl = 'https://fantasy.espn.com/football/draft?leagueId=222&seasonId=2026'
  const previous = worker.buildDraft(snapshot(oldUrl, [pick(1, 'Old Player')]), config)
  const incomingSnapshot = snapshot(newUrl, [pick(21, 'New Player')])
  const incoming = worker.buildDraft(incomingSnapshot, config)
  const merged = worker.mergeDraftHistory(previous, incoming, {}, incomingSnapshot)

  assert.deepEqual([...merged.drafted.map((entry) => entry.playerName)], ['New Player'])
})

test('new scan data wins when a pick is corrected', () => {
  const pageUrl = 'https://fantasy.espn.com/football/draft?leagueId=503883311&seasonId=2026'
  const previous = worker.buildDraft(snapshot(pageUrl, [pick(1, 'Wrong Player')]), config)
  const incomingSnapshot = snapshot(pageUrl, [pick(1, 'Correct Player'), pick(2, 'Second Player')])
  const incoming = worker.buildDraft(incomingSnapshot, config)
  const merged = worker.mergeDraftHistory(previous, incoming, {}, incomingSnapshot)

  assert.deepEqual([...merged.drafted.map((entry) => entry.playerName)], ['Correct Player', 'Second Player'])
})

test('identifies holes in a partial post-restart history', () => {
  assert.deepEqual([...worker.getMissingPickNumbers([pick(1, 'First'), pick(4, 'Fourth')])], [2, 3])
})
