import { COLORS, readState, writeState, appendLog, formatDate, showToast, downloadFile, toCSV, copyToClipboard, wait } from "./utils.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const appState = {
  currentUrl: "",
  selectors: [],
  captures: [],
  previewRows: [],
  summary: [],
  templates: [],
  inspectorSyncing: false,
  autoPagination: {
    active: false,
    selector: "",
    page: 0,
    maxPages: 0,
    delay: 0,
    rows: [],
    summaries: new Map(),
  },
};

async function init() {
  const saved = await readState();
  appState.selectors = saved.selectors || [];
  appState.captures = saved.captures || [];
  appState.templates = saved.templates || [];
  renderSelectors();
  renderCaptures();
  renderTemplates();
  renderSummary();
  wireEvents();
  hydrateLog();
  listenMessages();
  setCurrentTabUrl();
  pingInspectorState();
}

function wireEvents() {
  const inspectorToggle = document.getElementById("inspectorToggle");
  inspectorToggle.addEventListener("change", (event) => {
    if (appState.inspectorSyncing) return;
    const enabled = event.target.checked;
    sendToContent({ type: "inspector:toggle", payload: { enabled } });
    appendLog({ type: "inspector", message: enabled ? "Inspector aktif" : "Inspector mati" });
  });

  $("#addSelector").addEventListener("click", () => addSelectorRow());
  $("#selectorForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addSelectorRow(new FormData(event.target));
  });
  $("#clearCaptures").addEventListener("click", () => {
    appState.captures = [];
    writeState({ captures: [] });
    renderCaptures();
  });
  $("#runAutoSelector").addEventListener("click", onRunAutoSelector);
  $("#refreshPreview").addEventListener("click", renderPreview);
  $("#copyPreview").addEventListener("click", () => {
    copyToClipboard(JSON.stringify(appState.previewRows, null, 2));
    showToast("JSON disalin", "success");
  });
  $("#exportPanel").addEventListener("click", onExportClick);
  $("#sendWebhook").addEventListener("click", onSendWebhook);
  $("#saveTemplate").addEventListener("click", onSaveTemplate);
  $("#triggerPagination").addEventListener("click", () => triggerPagination());
  $("#autoPagination").addEventListener("click", onAutoPagination);
  $("#runAutoScroll").addEventListener("click", onAutoScroll);
  $("#clearLog").addEventListener("click", clearLog);
  setAutoPaginationUI(false);
}

async function setCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  appState.currentUrl = tab?.url || "";
  $("#currentUrl").textContent = appState.currentUrl.replace(/^https?:\/\//, "");
}

function addSelectorRow(formData) {
  let payload;
  if (formData instanceof FormData) {
    payload = {
      name: formData.get("name").trim(),
      selector: formData.get("selector").trim(),
      type: formData.get("type"),
      attr: formData.get("attr").trim() || null,
    };
  } else {
    payload = formData;
  }
  if (!payload?.name || !payload?.selector) {
    showToast("Isi nama & selector", "warning");
    return;
  }
  appState.selectors.push(payload);
  writeState({ selectors: appState.selectors });
  renderSelectors();
}

function renderSelectors() {
  const container = $("#selectorList");
  container.innerHTML = "";
  if (!appState.selectors.length) {
    container.classList.add("empty");
    container.innerHTML = '<p class="empty-state">Belum ada selector.</p>';
    return;
  }
  container.classList.remove("empty");
  appState.selectors.forEach((selector, index) => {
    const row = document.createElement("div");
    row.className = "selector-row";
    row.innerHTML = `
      <div>
        <strong>${selector.name}</strong>
        <p>${selector.selector}</p>
      </div>
      <div class="actions">
        <span class="pill">${selector.type}</span>
        ${selector.attr ? `<code>${selector.attr}</code>` : ""}
        <button data-index="${index}" class="btn icon" data-action="remove">✕</button>
      </div>
    `;
    row.querySelector("[data-action='remove']").addEventListener("click", () => {
      appState.selectors.splice(index, 1);
      writeState({ selectors: appState.selectors });
      renderSelectors();
    });
    container.appendChild(row);
  });
}

function renderCaptures() {
  const container = $("#captureList");
  container.innerHTML = "";
  if (!appState.captures.length) {
    container.classList.add("empty");
    container.innerHTML = '<p class="empty-state">Belum ada data yang diambil.</p>';
    return;
  }
  container.classList.remove("empty");
  appState.captures.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "capture-card";
    card.innerHTML = `
      <header>
        <strong>${item.customName}</strong>
        <div class="actions">
          <button class="btn ghost sm" data-action="add-selector">Jadikan Selector</button>
          <button class="btn ghost sm" data-action="remove">Hapus</button>
        </div>
      </header>
      <p>${item.selector}</p>
      <pre>${item.value}</pre>
    `;
    card.querySelector("[data-action='remove']").addEventListener("click", () => {
      appState.captures.splice(index, 1);
      writeState({ captures: appState.captures });
      renderCaptures();
    });
    card.querySelector("[data-action='add-selector']").addEventListener("click", () => {
      addSelectorRow({
        name: item.customName,
        selector: item.selector,
        type: item.type,
        attr: item.attr,
      });
    });
    container.appendChild(card);
  });
}

function renderPreview() {
  const container = $("#previewTable");
  container.innerHTML = "";
  if (!appState.previewRows.length) {
    container.innerHTML = '<p class="empty-state">Belum ada data.</p>';
    return;
  }
  const table = document.createElement("table");
  const headers = Array.from(new Set(appState.previewRows.flatMap((row) => Object.keys(row))));
  table.innerHTML = `
    <thead>
      <tr>
        ${headers.map((key) => `<th>${key}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${appState.previewRows
        .slice(0, 20)
        .map((row) => `<tr>${headers.map((key) => `<td>${row[key] ?? ""}</td>`).join("")}</tr>`)
        .join("")}
    </tbody>
  `;
  container.appendChild(table);
}

function renderSummary() {
  const strip = $("#summaryStrip");
  strip.innerHTML = "";
  if (!appState.summary.length) {
    strip.innerHTML = '<p class="empty-state">Tidak ada ringkasan.</p>';
    return;
  }
  appState.summary.forEach((item) => {
    const badge = document.createElement("div");
    badge.className = "summary-card";
    badge.innerHTML = `
      <p>${item.name}</p>
      <strong>${item.count} match</strong>
      <small>${item.selector}</small>
    `;
    strip.appendChild(badge);
  });
}

function sendToContent(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        resolve({ ok: false, error: "TAB_NOT_FOUND" });
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          showToast("Tab belum siap", "warning");
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { ok: true });
      });
    });
  });
}

function onRunAutoSelector() {
  if (!ensureSelectors()) return;
  requestAutoSelectorRun();
  appendLog({ type: "auto", message: `Scrape ${appState.selectors.length} field` });
}

function listenMessages() {
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case "inspector:capture":
        hydrateCaptures();
        appendLog({ type: "inspector", message: `Capture ${message.payload.customName}` });
        syncInspectorToggle(false);
        break;
      case "inspector:status":
        syncInspectorToggle(Boolean(message.payload?.enabled));
        break;
      case "autoSelector:result":
        if (appState.autoPagination.active) {
          handleAutoPaginationResult(message.payload);
        } else {
          appState.previewRows = message.payload.rows;
          appState.summary = message.payload.summary;
          renderPreview();
          renderSummary();
          appendLog({
            type: "auto",
            message: `Scrape menghasilkan ${message.payload.rows.length} baris`,
          });
        }
        break;
      case "content:ready":
        setCurrentTabUrl();
        pingInspectorState();
        break;
      case "pagination:error":
        showToast("Selector pagination tidak ditemukan", "error");
        finishAutoPagination("Selector pagination tidak ditemukan");
        break;
      case "pagination:clicked":
        if (appState.autoPagination.active) {
          appendLog({
            type: "pagination",
            message: `Klik pagination (${message.payload?.selector})`,
          });
        }
        break;
      case "autoPagination:finished":
        finishAutoPagination(message.payload?.reason || "Selesai");
        break;
      default:
        break;
    }
  });
}

function onExportClick(event) {
  const btn = event.target.closest("[data-export]");
  if (!btn) return;
  const type = btn.dataset.export;
  if (!appState.previewRows.length) {
    showToast("Belum ada data", "warning");
    return;
  }
  if (type === "json") {
    downloadFile(`scrape-${Date.now()}.json`, JSON.stringify(appState.previewRows, null, 2));
  } else if (type === "csv") {
    downloadFile(`scrape-${Date.now()}.csv`, toCSV(appState.previewRows), "text/csv");
  } else if (type === "clipboard") {
    copyToClipboard(JSON.stringify(appState.previewRows, null, 2));
    showToast("Disalin ke clipboard", "success");
  }
}

async function onSendWebhook() {
  const url = document.getElementById("webhookInput").value.trim();
  if (!url) {
    showToast("Isi webhook URL", "warning");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: appState.previewRows, summary: appState.summary }),
    });
    showToast("Webhook sukses", "success");
  } catch (error) {
    showToast("Webhook gagal", "error");
  }
}

function onSaveTemplate() {
  const name = document.getElementById("templateName").value.trim();
  if (!name) {
    showToast("Isi nama template", "warning");
    return;
  }
  const template = { id: crypto.randomUUID(), name, selectors: appState.selectors };
  appState.templates.unshift(template);
  writeState({ templates: appState.templates });
  renderTemplates();
  showToast("Template tersimpan", "success");
}

function renderTemplates() {
  const list = document.getElementById("templateList");
  list.innerHTML = "";
  if (!appState.templates.length) {
    list.innerHTML = '<p class="empty-state">Belum ada template.</p>';
    return;
  }
  appState.templates.forEach((tpl, index) => {
    const item = document.createElement("div");
    item.className = "template-row";
    item.innerHTML = `
      <div>
        <strong>${tpl.name}</strong>
        <small>${tpl.selectors.length} field</small>
      </div>
      <div class="actions">
        <button class="btn ghost sm" data-action="load">Load</button>
        <button class="btn ghost sm" data-action="delete">Del</button>
      </div>
    `;
    item.querySelector("[data-action='load']").addEventListener("click", () => {
      appState.selectors = tpl.selectors;
      writeState({ selectors: appState.selectors });
      renderSelectors();
    });
    item.querySelector("[data-action='delete']").addEventListener("click", () => {
      appState.templates.splice(index, 1);
      writeState({ templates: appState.templates });
      renderTemplates();
    });
    list.appendChild(item);
  });
}

function hydrateLog() {
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    const list = document.getElementById("logList");
    list.innerHTML = "";
    logs.forEach((entry) => list.appendChild(renderLogItem(entry)));
  });
}

function hydrateCaptures() {
  chrome.storage.local.get({ captures: [] }, ({ captures }) => {
    appState.captures = captures;
    renderCaptures();
  });
}

function renderLogItem(entry) {
  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML = `
    <span>${formatDate(entry.timestamp)}</span>
    <p>${entry.message}</p>
  `;
  return item;
}

function clearLog() {
  chrome.storage.local.set({ logs: [] });
  document.getElementById("logList").innerHTML = "";
}

function triggerPagination(auto = false) {
  const selector = document.getElementById("paginationSelector").value.trim();
  if (!selector) {
    showToast("Isi selector pagination", "warning");
    return;
  }
  sendToContent({ type: "pagination:next", payload: { selector, auto } });
  appendLog({ type: "pagination", message: `Klik pagination ${selector}` });
}

async function onAutoScroll() {
  const steps = Number(document.getElementById("scrollSteps").value) || 5;
  const delay = Number(document.getElementById("scrollDelay").value) || 1200;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (steps, delay) => {
      for (let i = 0; i < steps; i += 1) {
        window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    },
    args: [steps, delay],
  });
  appendLog({ type: "scroll", message: `Auto scroll ${steps}x` });
}

function pingInspectorState() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "inspector:state" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && typeof response.enabled === "boolean") {
        syncInspectorToggle(response.enabled);
      }
    });
  });
}

function syncInspectorToggle(enabled) {
  const toggle = document.getElementById("inspectorToggle");
  appState.inspectorSyncing = true;
  toggle.checked = !!enabled;
  toggle.closest(".toggle")?.classList.toggle("active", !!enabled);
  requestAnimationFrame(() => {
    appState.inspectorSyncing = false;
  });
}

init();
