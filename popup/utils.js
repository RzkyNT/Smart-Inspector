export const COLORS = {
  accent: "#25D366",
  accentAlt: "#2BE07B",
  link: "#1DA851",
  bg: "#04070D",
  surface: "#0B0F14",
  surfaceAlt: "#11161C",
  text: "#F2F4F6",
  border: "rgba(255,255,255,0.08)",
};

export function readState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => resolve(data));
  });
}

export function writeState(partial) {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, () => resolve(true));
  });
}

export function appendLog(entry) {
  const line = { id: crypto.randomUUID(), timestamp: Date.now(), ...entry };
  chrome.storage.local.get({ logs: [] }, ({ logs }) => {
    logs.unshift(line);
    chrome.storage.local.set({ logs: logs.slice(0, 100) });
  });
}

export function formatDate(ts) {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function showToast(message, variant = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.dataset.variant = variant;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2500);
}

export function downloadFile(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows = []) {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => {
        if (!key.startsWith("__meta_")) set.add(key);
      });
      return set;
    }, new Set())
  );
  const escape = (value) => {
    if (value == null) return "";
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };
  const lines = [headers.map(escape).join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(","));
  });
  return lines.join("\n");
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
