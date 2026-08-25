(function startEspnDraftWatcher() {
  const parser = globalThis.EspnDraftParser
  if (!parser) return

  let debounceTimer
  let lastFingerprint = ''
  let lastDeliveryAt = 0
  let lastApiFetchAt = 0
  let lastApiSnapshot
  let scanInProgress = false
  let scanAgain = false

  function requestApiPayload() {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', receiveResponse)
        reject(new Error('ESPN draft data timed out'))
      }, 6000)
      function receiveResponse(event) {
        if (event.source !== window || event.origin !== window.location.origin) return
        if (event.data?.type !== 'FANTASY_DRAFT_ESPN_API_RESPONSE' || event.data.version !== 1 || event.data.requestId !== requestId) return
        window.clearTimeout(timeout)
        window.removeEventListener('message', receiveResponse)
        if (event.data.ok) resolve(event.data.payload)
        else reject(new Error(event.data.error || 'ESPN draft data was unavailable'))
      }
      window.addEventListener('message', receiveResponse)
      window.postMessage({
        type: 'FANTASY_DRAFT_ESPN_API_REQUEST',
        version: 1,
        requestId
      }, window.location.origin)
    })
  }

  async function scan(force = false) {
    if (scanInProgress) {
      scanAgain = scanAgain || force
      return
    }
    scanInProgress = true
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_CONFIG' })
      const config = response?.config || {}
      const domSnapshot = parser.scanDocument(document, location.href, config)
      let apiError
      if (force || !lastApiSnapshot || Date.now() - lastApiFetchAt >= 3000) {
        try {
          const apiPayload = await requestApiPayload()
          lastApiSnapshot = parser.parseApiSnapshot(apiPayload, location.href, config)
          lastApiFetchAt = Date.now()
          if (!lastApiSnapshot) apiError = 'ESPN structured draft data contained no usable picks'
        } catch (error) {
          apiError = error instanceof Error ? error.message : String(error)
        }
      }
      const snapshot = lastApiSnapshot?.picks?.length >= domSnapshot.picks.length ? lastApiSnapshot : domSnapshot
      if (apiError && snapshot === domSnapshot) snapshot.diagnostics.apiError = apiError
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
    } finally {
      scanInProgress = false
      if (scanAgain) {
        scanAgain = false
        window.setTimeout(() => void scan(true), 0)
      }
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
