chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup only listens through chrome.runtime.onMessage in app.js
  sendResponse({ ok: true });
});
