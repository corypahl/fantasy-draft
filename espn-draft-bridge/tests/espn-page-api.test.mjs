import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'


const source = await readFile(new URL('../espn-page-api.js', import.meta.url), 'utf8')

test('requests authenticated draft and player data from ESPN', async () => {
  const listeners = []
  const pageMessages = []
  const requests = []
  const windowRef = {
    location: {
      href: 'https://fantasy.espn.com/football/draft?leagueId=342190061&seasonId=2026',
      origin: 'https://fantasy.espn.com',
    },
    addEventListener(type, listener) {
      if (type === 'message') listeners.push(listener)
    },
    postMessage(message) {
      pageMessages.push(message)
    },
  }
  const context = {
    Date,
    Error,
    URL,
    window: windowRef,
    fetch: async (url, options) => {
      requests.push({ url, options })
      if (url.includes('mDraftDetail')) {
        return {
          ok: true,
          async json() {
            return { draftDetail: { picks: [{ playerId: 101 }] }, teams: [] }
          },
        }
      }
      return {
        ok: true,
        async json() {
          return { players: [{ id: 101, player: { fullName: 'Jahmyr Gibbs' } }] }
        },
      }
    },
  }
  vm.runInNewContext(source, context)
  listeners[0]({
    source: windowRef,
    origin: windowRef.location.origin,
    data: { type: 'FANTASY_DRAFT_ESPN_API_REQUEST', version: 1, requestId: 'request-1' },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(requests.length, 2)
  assert.match(requests[0].url, /seasons\/2026\/segments\/0\/leagues\/342190061/)
  assert.match(requests[0].url, /view=mDraftDetail/)
  assert.equal(requests[0].options.credentials, 'include')
  assert.deepEqual(JSON.parse(requests[1].options.headers['X-Fantasy-Filter']), {
    players: { filterIds: { value: [101] } },
  })
  assert.equal(pageMessages[0].type, 'FANTASY_DRAFT_ESPN_API_RESPONSE')
  assert.equal(pageMessages[0].ok, true)
  assert.equal(pageMessages[0].payload.players[0].player.fullName, 'Jahmyr Gibbs')
})
