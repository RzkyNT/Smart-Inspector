// background.js
chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'https://rizqiahsansetiawan.ct.ws/ext/welcome.html' });
    }
});

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

async function persistCapture(capture) {
  console.log("service-worker.js: Before saving capture to storage:", capture);
  const { captures = [] } = await chrome.storage.local.get({ captures: [] });
  const next = [capture, ...captures].slice(0, 50);
  await chrome.storage.local.set({ captures: next });
}

function broadcast(message) {
  console.log("service-worker.js: Broadcasting message:", message);
  chrome.runtime.sendMessage({
    ...message,
    source: "smart-inspector:background",
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("service-worker.js: Received message:", message, "from sender:", sender);
  if (message?.source === "smart-inspector:background") return;

  if (message?.source === "smart-inspector:popup") {
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
  }

  if (message?.source === "smart-inspector:content") {
    if (message.type === "inspector:capture" && message.payload) {
      persistCapture(message.payload)
        .then(() => {
          broadcast(message);
          sendResponse?.({ ok: true });
        })
        .catch((error) => {
          console.error("Failed to persist capture", error);
          sendResponse?.({ ok: false, error: error.message });
        });
      return true;
    }
    broadcast(message);
    sendResponse?.({ ok: true });
  }
});
