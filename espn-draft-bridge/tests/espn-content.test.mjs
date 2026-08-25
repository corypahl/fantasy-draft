import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'


const source = await readFile(new URL('../espn-content.js', import.meta.url), 'utf8')

test('shuts down quietly when an extension reload invalidates the content script', async () => {
  let disconnected = false
  let removedExtensionListener = false
  let sendCount = 0
  const windowListeners = new Map()
  const windowRef = {
    location: { origin: 'https://fantasy.espn.com' },
    addEventListener(type, listener) { windowListeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (windowListeners.get(type) === listener) windowListeners.delete(type)
    },
    postMessage() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  }
  const chromeRef = {
    runtime: {
      id: 'test-extension',
      async sendMessage() {
        sendCount += 1
        throw new Error('Extension context invalidated.')
      },
      onMessage: {
        addListener() {},
        removeListener() { removedExtensionListener = true },
      },
    },
  }
  const context = {
    chrome: chromeRef,
    document: { body: {}, location: windowRef.location },
    Error,
    globalThis: null,
    location: { href: 'https://fantasy.espn.com/football/draft?leagueId=1' },
    Math,
    MutationObserver: class {
      disconnect() { disconnected = true }
      observe() {}
    },
    setTimeout,
    clearTimeout,
    window: windowRef,
  }
  context.globalThis = context
  context.EspnDraftParser = {
    scanDocument() {
      return { diagnostics: {}, picks: [], status: 'pre_draft', teamNames: [] }
    },
  }

  vm.runInNewContext(source, context)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(sendCount, 1)
  assert.equal(disconnected, true)
  assert.equal(removedExtensionListener, true)
})
