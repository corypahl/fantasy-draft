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
