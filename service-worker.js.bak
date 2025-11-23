const state = {
  connections: new Map(),
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "smart-inspector") return;
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;
  state.connections.set(tabId, port);
  port.onDisconnect.addListener(() => {
    state.connections.delete(tabId);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "smart-inspector:popup") return;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse?.({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse?.(response ?? { ok: true });
  });
  return true;
});
