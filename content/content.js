(() => {
  const COLORS = {
    accent: "#25D366",
    accentAlt: "#2BE07B",
    surface: "#0B0F14",
    surfaceAlt: "#11161C",
    text: "#F2F4F6",
    link: "#1DA851",
    bg: "#04070D",
    border: "rgba(255,255,255,0.08)",
  };

  const state = {
    inspectorEnabled: false,
    overlay: null,
    tooltip: null,
    tooltipTarget: null,
    hoverTarget: null,
    awaitingLabel: false,
    shouldAutoResume: false,
  };

  function sendToPopup(message) {
    try {
      console.log("content.js: sendToPopup - Sending message:", message);
      chrome.runtime.sendMessage({
        source: "smart-inspector:content",
        ...message,
      });
    } catch (_) {}
  }

  function createOverlay() {
    if (state.overlay) return state.overlay;
    const overlay = document.createElement("div");
    overlay.id = "sis-overlay";
    overlay.style.position = "absolute";
    overlay.style.border = `2px solid ${COLORS.accentAlt}`;
    overlay.style.background = "rgba(37, 211, 102, 0.15)";
    overlay.style.borderRadius = "4px";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483646";
    overlay.style.transition = "all 60ms ease-out";
    overlay.style.display = "none";
    document.documentElement.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function removeOverlay() {
    state.overlay?.remove();
    state.overlay = null;
  }

  function positionOverlay(element) {
    const overlay = createOverlay();
    if (!element) {
      overlay.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function ensureTooltip() {
    if (state.tooltip) return state.tooltip;
    const tooltip = document.createElement("div");
    tooltip.id = "sis-tooltip";
    tooltip.innerHTML = `
      <header>
        <strong>Labelkan elemen</strong>
        <button type="button" class="sis-close" data-action="close">?</button>
      </header>
      <form>
        <label>
          Nama Field
          <input name="fieldName" placeholder="misal: harga" maxlength="64" required />
        </label>
        <label>
          Tipe Nilai
          <select name="fieldType">
            <option value="auto">Auto</option>
            <option value="text">Text</option>
            <option value="html">HTML</option>
            <option value="attribute">Attribute</option>
          </select>
        </label>
        <label data-attr-field>
          Nama Attribute
          <input name="fieldAttr" placeholder="href / src / data-id" />
        </label>
        <div class="actions">
          <button type="submit" class="sis-btn primary">Kirim ke popup</button>
          <button type="button" class="sis-btn ghost" data-action="cancel">Batal</button>
        </div>
      </form>
    `;
    tooltip.addEventListener("input", (event) => {
      if (event.target.name === "fieldType") {
        const attrField = tooltip.querySelector("[data-attr-field]");
        attrField.style.display = event.target.value === "attribute" ? "flex" : "none";
      }
    });
    tooltip.addEventListener("click", (event) => {
      if (event.target.closest("[data-action='cancel']")) {
        event.preventDefault();
        console.log("content.js: Tooltip cancel button clicked.");
        closeTooltip(true);
        return;
      }
      if (event.target.closest("[data-action='close']")) {
        event.preventDefault();
        closeTooltip();
        return;
      }
    });
    tooltip.addEventListener("submit", onTooltipSubmit);
    document.documentElement.appendChild(tooltip);
    state.tooltip = tooltip;
    return tooltip;
  }

  function openTooltip(target, baseData) {
    const tooltip = ensureTooltip();
    state.tooltipTarget = target;
    state.awaitingLabel = true;
    state.shouldAutoResume = state.inspectorEnabled;
    const rect = target.getBoundingClientRect();
    tooltip.style.display = "block";
    tooltip.style.top = `${rect.bottom + window.scrollY + 12}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.querySelector("input[name='fieldName']").value = baseData.customName || "";
    tooltip.querySelector("select[name='fieldType']").value = baseData.type || "auto";
    tooltip.querySelector("input[name='fieldAttr']").value = baseData.attr || "";
    tooltip.querySelector("[data-attr-field]").style.display =
      (baseData.type || "auto") === "attribute" ? "flex" : "none";
  }

  function closeTooltip(resume = false) {
    if (!state.tooltip) return;
    state.tooltip.style.display = "none";
    state.tooltipTarget = null;
    state.awaitingLabel = false;
    if (state.overlay && !state.inspectorEnabled) {
      state.overlay.style.display = "none";
    }
    if (resume) {
      resumeInspector(true);
    }
  }

  function resumeInspector(force = false) {
    const shouldResume = force || (state.shouldAutoResume && state.inspectorEnabled);
    state.awaitingLabel = false;
    state.shouldAutoResume = false;
    if (shouldResume) {
      enableInspector();
    }
  }

  function onTooltipSubmit(event) {
    event.preventDefault();
    console.log("content.js: onTooltipSubmit - Form submitted.");
    const form = event.target;
    const name = form.fieldName.value.trim();
    if (!name || !state.tooltipTarget) {
      console.log("content.js: onTooltipSubmit - Invalid name or no tooltip target. Name:", name, "Tooltip Target:", state.tooltipTarget);
      return;
    }
    const type = form.fieldType.value;
    const attr = form.fieldAttr.value.trim();
    const data = collectElementData(state.tooltipTarget, {
      name,
      type: type === "auto" ? undefined : type,
      attr: attr || undefined,
    });
    console.log("content.js: onTooltipSubmit - Data collected:", data);
    sendToPopup({ type: "inspector:capture", payload: data });
    closeTooltip(true);
  }

  function enableInspector() {
    if (state.inspectorEnabled) return;
    state.inspectorEnabled = true;
    state.awaitingLabel = false;
    createOverlay();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll, true);
    sendToPopup({ type: "inspector:status", payload: { enabled: true } });
  }

  function disableInspector(options = {}) {
    if (!state.inspectorEnabled && !options.force) return;
    state.inspectorEnabled = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll, true);
    state.awaitingLabel = false;
    if (!options.keepOverlay) removeOverlay();
    if (!options.keepTooltip) closeTooltip();
    if (!options.silent) {
      sendToPopup({ type: "inspector:status", payload: { enabled: false } });
    }
  }

  function onMouseMove(event) {
    if (!state.inspectorEnabled) return;
    if (state.awaitingLabel) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    state.hoverTarget = target;
    positionOverlay(target);
  }

  function onScroll() {
    if (state.hoverTarget) positionOverlay(state.hoverTarget);
    if (state.tooltipTarget && state.tooltip) {
      const rect = state.tooltipTarget.getBoundingClientRect();
      state.tooltip.style.top = `${rect.bottom + window.scrollY + 12}px`;
      state.tooltip.style.left = `${rect.left + window.scrollX}px`;
    }
  }

  function onClick(event) {
    console.log("content.js: onClick - Event target:", event.target, "inspectorEnabled:", state.inspectorEnabled, "awaitingLabel:", state.awaitingLabel);
    if (!state.inspectorEnabled) return;
    if (!(event.target instanceof Element)) return;
    if (state.awaitingLabel) {
      if (!(state.tooltip && state.tooltip.contains(event.target))) {
        console.log("content.js: onClick - Click outside tooltip while awaiting label, closing tooltip.");
        closeTooltip(true);
      } else {
        console.log("content.js: onClick - Click inside tooltip while awaiting label. Allowing event to propagate to tooltip's listeners.");
        // Allow event to propagate to tooltip's own listeners for buttons
        return;
      }
      event.preventDefault(); // Prevent default if click was outside the tooltip
      event.stopPropagation();
      return;
    }
    // Original logic to open tooltip on click if not awaiting label
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const data = collectElementData(event.target, { includeOuter: true });
    openTooltip(event.target, data);
  }

  function collectElementData(element, overrides = {}) {
    const selector = getCssSelector(element);
    const xpath = getXPath(element);
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    const baseName = overrides.name || inferName(element) || element.tagName.toLowerCase();
    const type = overrides.type || inferType(element, overrides.attr);
    const attr = overrides.attr || inferAttribute(element, type);
    const value = computeValue(element, type, attr);
    return {
      id: crypto.randomUUID(),
      url: location.href,
      timestamp: Date.now(),
      selector,
      xpath,
      customName: baseName,
      type,
      attr: attr || null,
      value,
      innerText: element.innerText.trim(),
      innerHTML: element.innerHTML.trim(),
      outerHTML: overrides.includeOuter ? element.outerHTML : undefined,
      attributes,
      tagName: element.tagName.toLowerCase(),
    };
  }

  function inferName(element) {
    const label =
      element.getAttribute("aria-label") ||
      element.getAttribute("data-name") ||
      element.getAttribute("name");
    if (label) return label;
    if (element.id) return element.id;
    const text = (element.innerText || "").trim();
    if (text && text.length <= 30) {
      return text.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/gi, "");
    }
    if (element.classList.length) return element.classList[0];
    return null;
  }

  function inferType(element, attr) {
    if (attr) return "attribute";
    const tag = element.tagName.toLowerCase();
    if (["img", "video", "audio", "source"].includes(tag)) return "attribute";
    if (tag === "a" && element.getAttribute("href")) return "text";
    return "text";
  }

  function inferAttribute(element, type) {
    if (type !== "attribute") return null;
    const tag = element.tagName.toLowerCase();
    if (tag === "img" && element.getAttribute("src")) return "src";
    if (tag === "a" && element.getAttribute("href")) return "href";
    if (element.getAttribute("data-value")) return "data-value";
    if (element.getAttribute("content")) return "content";
    return "href";
  }

  function computeValue(element, type, attr) {
    if (type === "html") return element.innerHTML.trim();
    if (type === "attribute") {
      return attr ? element.getAttribute(attr) || "" : "";
    }
    return element.innerText.trim();
  }

  function getCssSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const path = [];
    let el = element;
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.classList.length) {
        selector += `.${Array.from(el.classList)
          .slice(0, 2)
          .map((c) => CSS.escape(c))
          .join(".")}`;
      }
      const siblings = el.parentNode
        ? Array.from(el.parentNode.children).filter((node) => node.nodeName === el.nodeName)
        : [];
      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(el) + 1})`;
      }
      path.unshift(selector);
      if (el.parentElement && el.parentElement.id) {
        path.unshift(`#${CSS.escape(el.parentElement.id)}`);
        break;
      }
      el = el.parentElement;
      if (path.length > 6) break;
    }
    return path.join(" > ");
  }

  function getXPath(element) {
    if (element.id) return `//*[@id='${element.id}']`;
    const parts = [];
    let el = element;
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = el.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === el.nodeName) {
          index += 1;
        }
        sibling = sibling.previousSibling;
      }
      const part = `${el.nodeName.toLowerCase()}${index > 1 ? `[${index}]` : ""}`;
      parts.unshift(part);
      el = el.parentNode;
    }
    return `/${parts.join("/")}`;
  }

  function handleAutoSelector(payload = {}) {
    const { selectors = [], options = {} } = payload;
    if (!selectors.length) {
      sendToPopup({ type: "autoSelector:error", payload: { message: "Tidak ada selector" } });
      return { ok: false, reason: "NO_SELECTORS" };
    }
    const prepared = selectors.map((config) => ({
      ...config,
      nodes: Array.from(document.querySelectorAll(config.selector || "")),
    }));
    const maxLen = prepared.reduce((acc, item) => Math.max(acc, item.nodes.length), 0);
    const rows = [];
    for (let i = 0; i < maxLen; i += 1) {
      const row = {};
      prepared.forEach((config) => {
        const node = config.nodes[i];
        if (!node) return;
        const data = collectElementData(node, {
          name: config.name,
          type: config.type === "auto" ? undefined : config.type,
          attr: config.attr,
          includeOuter: options.includeOuter,
        });
        row[config.name] = data.value;
        if (options.includeMeta) {
          row[`__meta_${config.name}`] = {
            selector: data.selector,
            xpath: data.xpath,
            attr: data.attr,
            type: data.type,
          };
        }
      });
      if (Object.keys(row).length) rows.push(row);
    }
    sendToPopup({
      type: "autoSelector:result",
      payload: {
        rows,
        summary: prepared.map((item) => ({
          name: item.name,
          selector: item.selector,
          count: item.nodes.length,
          type: item.type || "auto",
          attr: item.attr || null,
        })),
        url: location.href,
        timestamp: Date.now(),
      },
    });
    return { ok: true, rows: rows.length };
  }

  function handlePagination(payload = {}) {
    const btn = document.querySelector(payload.selector || "");
    if (!btn) {
      sendToPopup({ type: "pagination:error", payload: { selector: payload.selector } });
      return { ok: false };
    }
    btn.click();
    sendToPopup({ type: "pagination:clicked", payload: { selector: payload.selector } });
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
      case "inspector:toggle":
        message.payload?.enabled ? enableInspector() : disableInspector();
        sendResponse?.({ ok: true, enabled: state.inspectorEnabled });
        return true;
      case "autoSelector:run":
        sendResponse?.(handleAutoSelector(message.payload));
        return true;
      case "pagination:next":
        sendResponse?.(handlePagination(message.payload));
        return true;
      case "inspector:state":
        sendResponse?.({ enabled: state.inspectorEnabled && !state.awaitingLabel });
        return true;
      case "ping":
        sendResponse?.({ ok: true });
        return true;
      default:
        return false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state.inspectorEnabled && !state.awaitingLabel) return;
    if (event.key === "Escape") {
      if (state.awaitingLabel) {
        closeTooltip(true);
      } else {
        disableInspector();
      }
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (!state.awaitingLabel) return;
    if (state.tooltip && state.tooltip.contains(event.target)) return;
    closeTooltip(true);
  }, true);

  sendToPopup({ type: "content:ready", payload: { url: location.href } });
})();

