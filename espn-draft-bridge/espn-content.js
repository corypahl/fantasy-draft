(function startEspnDraftWatcher() {
  const parser = globalThis.EspnDraftParser
  if (!parser) return

  let debounceTimer
  let lastFingerprint = ''
  let lastDeliveryAt = 0

  async function scan(force = false) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_CONFIG' })
      const config = response?.config || {}
      const snapshot = parser.scanDocument(document, location.href, config)
      const fingerprint = JSON.stringify({ picks: snapshot.picks, status: snapshot.status, teamNames: snapshot.teamNames })
      const now = Date.now()
      if (!force && fingerprint === lastFingerprint && now - lastDeliveryAt < 15000) return
      lastFingerprint = fingerprint
      lastDeliveryAt = now
      await chrome.runtime.sendMessage({ type: 'ESPN_DRAFT_SNAPSHOT', snapshot })
    } catch (error) {
      await chrome.runtime.sendMessage({
        type: 'ESPN_DRAFT_SCAN_ERROR',
        error: error instanceof Error ? error.message : String(error),
        pageUrl: location.href
      }).catch(() => undefined)
    }
  }

  function scheduleScan() {
    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => void scan(false), 350)
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SCAN_ESPN_DRAFT_NOW') return false
    void scan(true).then(() => sendResponse({ ok: true }))
    return true
  })

  const observer = new MutationObserver(scheduleScan)
  const start = () => {
    if (!document.body) return window.setTimeout(start, 100)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    void scan(true)
    window.setInterval(() => void scan(false), 10000)
  }
  start()
})()
