console.info("[SMOKE] Background script loaded");

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[SMOKE] onInstalled", details);
  console.log("[Extendy] Installed");
});

chrome.runtime.onStartup.addListener(() => {
  console.info("[SMOKE] onStartup");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "PING") {
    console.info("[SMOKE] Received PING; replying PONG");
    sendResponse({ type: "PONG" });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  // If already open, this ensures the panel focuses instead of opening multiple times
  await chrome.sidePanel.open({ windowId: tab.windowId });
  await chrome.sidePanel.setOptions({
    path: 'index.html',
    enabled: true
  });
});