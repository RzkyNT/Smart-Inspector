(() => {
  const port = chrome.runtime.connect({ name: "smart-inspector" });

  window.__sis = {
    dispatch(type, payload) {
      port.postMessage({ type, payload });
    },
  };
})();
