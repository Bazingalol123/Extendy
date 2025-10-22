chrome.runtime.onInstalled.addListener(() => {
console.log('[Extendy] Installed')
})

chrome.action.onClicked.addListener(async (tab) => {
  // If already open, this ensures the panel focuses instead of opening multiple times
  await chrome.sidePanel.open({ windowId: tab.windowId })
  await chrome.sidePanel.setOptions({
    path: 'index.html',
    enabled: true
  })
})