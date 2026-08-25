import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'


const source = await readFile(new URL('../app-bridge.js', import.meta.url), 'utf8')

test('delivers the stored draft and answers a page handshake', async () => {
  const pageMessages = []
  const windowListeners = []
  let latestDraftRequests = 0
  const windowRef = {
    location: { origin: 'https://corypahl.github.io' },
    addEventListener(type, listener) {
      if (type === 'message') windowListeners.push(listener)
    },
    postMessage(message, targetOrigin) {
      pageMessages.push({ message, targetOrigin })
    },
  }
  const context = {
    window: windowRef,
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage(message) {
          assert.equal(message.type, 'GET_LATEST_ESPN_DRAFT')
          latestDraftRequests += 1
          return {
            enabled: true,
            draft: { id: 'gvsu-draft', leagueId: 'gvsu', drafted: [] },
            status: { state: 'local' },
          }
        },
      },
    },
  }
  vm.runInNewContext(source, context)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(latestDraftRequests, 1)
  assert.equal(pageMessages[0].message.type, 'FANTASY_DRAFT_ESPN_BRIDGE')
  assert.equal(pageMessages[0].targetOrigin, windowRef.location.origin)

  windowListeners[0]({
    source: windowRef,
    origin: windowRef.location.origin,
    data: { type: 'FANTASY_DRAFT_ESPN_BRIDGE_REQUEST' },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(latestDraftRequests, 2)
})
