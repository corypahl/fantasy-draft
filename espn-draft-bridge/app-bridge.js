(function connectDraftWizard() {
  function deliver(draft, status) {
    if (!draft) return
    window.postMessage({
      type: 'FANTASY_DRAFT_ESPN_BRIDGE',
      version: 1,
      draft,
      status
    }, window.location.origin)
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ESPN_BRIDGE_DRAFT') deliver(message.draft, message.status)
  })

  function requestLatest() {
    return chrome.runtime.sendMessage({ type: 'GET_LATEST_ESPN_DRAFT' })
      .then((response) => {
        if (response?.enabled) deliver(response.draft, response.status)
      })
      .catch(() => undefined)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    if (event.data?.type === 'FANTASY_DRAFT_ESPN_BRIDGE_REQUEST') void requestLatest()
  })

  void requestLatest()
})()
