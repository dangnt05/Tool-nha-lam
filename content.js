(() => {
  "use strict";
  const TOOL_VERSION = "1.1.0";
  if (window.__vnuRegistrationToolVersion === TOOL_VERSION) return;
  window.__vnuRegistrationToolVersion = TOOL_VERSION;
  const CLASS_NAMES = ["course-nav-active-row", "course-nav-active-code", "course-nav-selection-target"];
  const state = {
    targets: [], matches: [], index: -1, active: null, autoSelect: false, actionKey: "F8", backKey: "F6", status: "Ready", busy: false,
    selectionConfig: { mode: "auto", selector: "", column: 1, confirmationSelector: "" },
    splitConfig: { newline: true, comma: false, semicolon: false, space: false }
  };
  const overlay = { root: null, codes: null, current: null, status: null, auto: null, mode: null, selector: null, column: null, confirmation: null, splitType: null, splitHint: null, error: null, errorText: null };
  let errorAudioContext = null;

  const normalize = (value) => String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim().replace(/\s+/g, " ").toUpperCase();

  function splitConfig(config = {}) {
    return { newline: config.newline !== false, comma: Boolean(config.comma), semicolon: Boolean(config.semicolon), space: Boolean(config.space) };
  }

  function parseCodes(text, config = state.splitConfig) {
    const settings = splitConfig(config);
    const separators = [];
    if (settings.newline) separators.push("\\r?\\n");
    if (settings.comma) separators.push(",");
    if (settings.semicolon) separators.push(";");
    if (settings.space) separators.push("[ \\t]+");
    if (!separators.length) return [normalize(text)].filter(Boolean);
    return String(text || "").split(new RegExp(`(?:${separators.join("|")})+`)).map(normalize).filter(Boolean);
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getClientRects().length > 0;
  }

  function pageErrorMessage() {
    const selectors = ["[role='alert']", "[role='alertdialog']", ".alert-danger", ".alert-error", ".toast-error", ".swal2-popup", ".modal", ".notification-error", ".error-message", ".iziToast", "[class*='pnotify']", "[class*='notify']", "[class*='notice']", "[class*='popup']"];
    const errorWords = /(ngoài thời hạn|lỗi|thất bại|không thể|không được|hết chỗ|đã đầy|trùng lịch|đăng ký không thành công)/i;
    for (const element of document.querySelectorAll(selectors.join(","))) {
      if (!isVisible(element)) continue;
      const message = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (message && errorWords.test(message)) return message.slice(0, 300);
    }
    return "";
  }

  function primeErrorAudio() {
    try {
      errorAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      errorAudioContext.resume?.().catch(() => {});
    } catch { /* Sound is optional when the browser blocks audio. */ }
  }

  function playErrorTone() {
    try {
      primeErrorAudio();
      if (!errorAudioContext) return;
      const oscillator = errorAudioContext.createOscillator();
      const gain = errorAudioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, errorAudioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, errorAudioContext.currentTime + .17);
      gain.gain.setValueAtTime(.001, errorAudioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.12, errorAudioContext.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.001, errorAudioContext.currentTime + .25);
      oscillator.connect(gain).connect(errorAudioContext.destination);
      oscillator.start();
      oscillator.stop(errorAudioContext.currentTime + .27);
    } catch { /* Keep navigation usable if audio is unavailable. */ }
  }

  function showError(message) {
    createOverlay();
    overlay.root.hidden = false;
    overlay.errorText.textContent = message || "Không thể chọn môn hiện tại. Hãy kiểm tra thông báo của trang rồi thử lại.";
    overlay.error.hidden = false;
    playErrorTone();
  }

  function enabledControl(element) {
    return isVisible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true";
  }

  function cellTextIsNumber(cell) { return /^\d+$/.test(normalize(cell.textContent)); }

  function selectionConfig(config = {}) {
    return {
      mode: ["auto", "selector", "column"].includes(config.mode) ? config.mode : "auto",
      selector: String(config.selector || "").trim().slice(0, 300),
      column: Math.min(30, Math.max(1, Number.parseInt(config.column, 10) || 1)),
      confirmationSelector: String(config.confirmationSelector || "").trim().slice(0, 300)
    };
  }

  function safeQuery(container, selector) {
    if (!selector) return null;
    try { return container.querySelector(selector); } catch { return null; }
  }

  function findSelection(row, codeCell) {
    const cells = [...row.cells];
    const codeIndex = cells.indexOf(codeCell);
    const leftCells = cells.slice(0, Math.max(0, codeIndex));
    const searchCells = leftCells.slice(0, 5);
    if (state.selectionConfig.mode === "selector" && state.selectionConfig.selector) {
      const control = safeQuery(row, state.selectionConfig.selector);
      if (control?.isConnected && !control.disabled && control.getAttribute("aria-disabled") !== "true") {
        return { cell: control.closest("td, th") || searchCells[0] || null, control, autoSafe: true, confidence: "custom-selector" };
      }
      return { cell: null, control: null, autoSafe: false, confidence: "custom-selector-not-found" };
    }
    if (state.selectionConfig.mode === "column") {
      const cell = cells[state.selectionConfig.column - 1];
      if (cell && isVisible(cell) && cell.getAttribute("aria-disabled") !== "true") {
        const control = [...cell.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"], [aria-checked], button, a')].find(enabledControl) || cell;
        return { cell, control, autoSafe: true, confidence: "custom-column" };
      }
      return { cell: null, control: null, autoSafe: false, confidence: "custom-column-not-found" };
    }
    for (const cell of searchCells) {
      const nativeControl = [...cell.querySelectorAll('input[type="checkbox"], input[type="radio"]')].find(enabledControl);
      if (nativeControl) return { cell, control: nativeControl, autoSafe: true, confidence: "explicit" };
    }
    for (const cell of searchCells) {
      const accessible = [...cell.querySelectorAll('[role="checkbox"], [role="radio"], [aria-checked], label')]
        .find((element) => {
          if (element.tagName === "LABEL") {
            const input = element.control || (element.htmlFor && document.getElementById(element.htmlFor));
            return input && enabledControl(input);
          }
          return enabledControl(element);
        });
      if (accessible) {
        const labelInput = accessible.tagName === "LABEL" ? (accessible.control || document.getElementById(accessible.htmlFor)) : null;
        return { cell, control: labelInput || accessible, autoSafe: true, confidence: "explicit" };
      }
    }

    const scored = searchCells.map((cell, index) => {
      const text = normalize(cell.textContent);
      const marker = `${cell.className || ""} ${cell.id || ""} ${cell.getAttribute("data-field") || ""} ${cell.getAttribute("aria-label") || ""}`;
      const rect = cell.getBoundingClientRect();
      let score = index === 0 ? 12 : 0;
      if (/(select|check|choose|tick|register)/i.test(marker)) score += 70;
      if (cell.matches("[onclick], [role=button], [tabindex]:not([tabindex='-1'])")) score += 55;
      if (cell.querySelector("button, a, [onclick], [role=button]")) score += 50;
      if (!text) score += 14;
      if (cellTextIsNumber(cell)) score -= 60;
      if (rect.width > 0 && rect.width <= 90) score += 10;
      return { cell, score, emptyNarrowFirst: index === 0 && !text && rect.width > 0 && rect.width <= 90 };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return { cell: null, control: null, autoSafe: false, confidence: "none" };
    if (best.score >= 55) return { cell: best.cell, control: best.cell, autoSafe: true, confidence: "interactive-cell" };
    if (best.emptyNarrowFirst) return { cell: best.cell, control: null, autoSafe: false, confidence: "manual-only" };
    return { cell: null, control: null, autoSafe: false, confidence: "none" };
  }

  function removeAllExtensionHighlight() {
    for (const name of CLASS_NAMES) document.querySelectorAll(`.${name}`).forEach((element) => element.classList.remove(name));
  }

  function removeActiveHighlight() {
    const active = state.active;
    if (!active) return;
    active.row?.classList.remove("course-nav-active-row");
    active.codeCell?.classList.remove("course-nav-active-code");
    active.selectionCell?.classList.remove("course-nav-selection-target");
    state.active = null;
  }

  function publicState() {
    const match = state.matches[state.index];
    return { current: match?.code || "", position: state.index >= 0 ? state.index + 1 : 0, total: state.matches.length, autoSelect: state.autoSelect, actionKey: state.actionKey, backKey: state.backKey, selectionConfig: state.selectionConfig, splitConfig: state.splitConfig, status: state.status };
  }

  function announce() {
    renderOverlay();
    chrome.runtime.sendMessage({ type: "stateChanged", state: publicState() }).catch(() => {});
  }

  function renderOverlay() {
    if (!overlay.root) return;
    const view = publicState();
    overlay.current.textContent = view.current ? `${view.current} · ${view.position}/${view.total}` : "Chưa có danh sách môn";
    overlay.status.textContent = view.status || "Sẵn sàng";
    overlay.auto.checked = view.autoSelect;
    if (view.autoSelect) overlay.root.dataset.configOpen = "true";
    overlay.mode.value = view.selectionConfig.mode;
    overlay.selector.value = view.selectionConfig.selector;
    overlay.column.value = view.selectionConfig.column;
    overlay.confirmation.value = view.selectionConfig.confirmationSelector;
    overlay.splitType.value = view.splitConfig.space ? "space" : view.splitConfig.newline ? "newline" : view.splitConfig.comma ? "comma" : "semicolon";
    updateSplitExample();
  }

  function configFromOverlay() {
    return selectionConfig({ mode: overlay.mode.value, selector: overlay.selector.value, column: overlay.column.value, confirmationSelector: overlay.confirmation.value });
  }

  function splitConfigFromOverlay() {
    const type = overlay.splitType.value;
    return splitConfig({ newline: type === "newline", comma: type === "comma", semicolon: type === "semicolon", space: type === "space" });
  }

  function updateSplitExample() {
    if (!overlay.codes || !overlay.splitType) return;
    const examples = {
      newline: { placeholder: "Ví dụ: mỗi mã một dòng\nENG2056 10\nENG2052 14", hint: "Mỗi mã môn trên một dòng." },
      comma: { placeholder: "Ví dụ: ENG2056 10, ENG2052 14, PSF3008 3", hint: "Tách các mã bằng dấu phẩy (,)." },
      semicolon: { placeholder: "Ví dụ: ENG2056 10; ENG2052 14; PSF3008 3", hint: "Tách các mã bằng dấu chấm phẩy (;)." },
      space: { placeholder: "Ví dụ: ENG2056 ENG2052 PSF3008", hint: "Chỉ dùng Space khi mỗi mã không chứa khoảng trắng." }
    };
    const example = examples[overlay.splitType.value] || examples.newline;
    overlay.codes.placeholder = example.placeholder;
    overlay.splitHint.textContent = example.hint;
  }

  async function saveOverlaySettings() {
    const config = configFromOverlay();
    state.selectionConfig = config;
    state.splitConfig = splitConfigFromOverlay();
    state.autoSelect = overlay.auto.checked;
    await chrome.storage.local.set({ codesText: overlay.codes.value, autoSelect: state.autoSelect, actionKey: state.actionKey, backKey: state.backKey, selectionConfig: config, splitConfig: state.splitConfig });
  }

  function createOverlay() {
    if (overlay.root) return;
    const root = document.createElement("section");
    root.id = "vnu-registration-tool";
    root.hidden = true;
    root.setAttribute("aria-label", "Đăng ký học VNU tool");
    root.innerHTML = `
      <div class="vnu-tool-shell">
        <div class="vnu-tool-header">
          <div class="vnu-tool-brand"><div class="vnu-tool-name">Đăng ký học VNU tool</div><div class="vnu-tool-current"></div></div>
          <div class="vnu-tool-header-actions"><button class="vnu-tool-button vnu-tool-icon vnu-tool-close" type="button" aria-label="Đóng">×</button></div>
        </div>
        <div class="vnu-tool-body">
          <label class="vnu-tool-codes-label" for="vnu-tool-codes">Danh sách mã môn</label>
          <textarea class="vnu-tool-codes" id="vnu-tool-codes" rows="8" aria-label="Danh sách mã môn" placeholder="Dán mã môn vào đây&#10;ENG2056 10&#10;ENG2052 14"></textarea>
          <div class="vnu-tool-split"><label for="vnu-tool-split-type">Tách theo</label><select class="vnu-tool-split-type" id="vnu-tool-split-type"><option value="newline">Xuống dòng</option><option value="comma">Dấu phẩy (,)</option><option value="semicolon">Dấu chấm phẩy (;)</option><option value="space">Khoảng trắng (Space)</option></select></div>
          <div class="vnu-tool-split-hint"></div>
          <button class="vnu-tool-button vnu-tool-start" type="button">START</button>
          <div class="vnu-tool-actions"><button class="vnu-tool-button vnu-tool-key" type="button">← BACK · F6</button><button class="vnu-tool-button vnu-tool-next" type="button">NEXT · F8 →</button></div>
          <div class="vnu-tool-options"><input class="vnu-tool-auto" id="vnu-tool-auto" type="checkbox"><label for="vnu-tool-auto">Auto-select môn hiện tại</label><button class="vnu-tool-button vnu-tool-icon vnu-tool-settings" type="button" aria-label="Mở cài đặt auto-select">⚙</button></div>
          <div class="vnu-tool-status" aria-live="polite"></div>
        </div>
        <div class="vnu-tool-config">
          <div class="vnu-tool-field"><label>Cách tìm ô</label><select class="vnu-tool-mode"><option value="auto">Tự dò an toàn</option><option value="selector">CSS selector</option><option value="column">Số cột</option></select></div>
          <div class="vnu-tool-field"><label>Selector cần click</label><input class="vnu-tool-selector" placeholder="input[type=checkbox]"></div>
          <div class="vnu-tool-field"><label>Cột chọn</label><input class="vnu-tool-column" type="number" min="1" max="30"></div>
          <div class="vnu-tool-field"><label>Selector xác nhận</label><input class="vnu-tool-confirmation" placeholder="input:checked"></div>
        </div>
        <div class="vnu-tool-error" role="alertdialog" aria-label="Lỗi đăng ký" hidden><div class="vnu-tool-error-title">Không thể chọn môn</div><div class="vnu-tool-error-text"></div><button class="vnu-tool-error-close" type="button">Đã hiểu</button></div>
      </div>`;
    document.documentElement.append(root);
    overlay.root = root;
    overlay.codes = root.querySelector(".vnu-tool-codes");
    overlay.current = root.querySelector(".vnu-tool-current");
    overlay.status = root.querySelector(".vnu-tool-status");
    overlay.auto = root.querySelector(".vnu-tool-auto");
    overlay.mode = root.querySelector(".vnu-tool-mode");
    overlay.selector = root.querySelector(".vnu-tool-selector");
    overlay.column = root.querySelector(".vnu-tool-column");
    overlay.confirmation = root.querySelector(".vnu-tool-confirmation");
    overlay.splitType = root.querySelector(".vnu-tool-split-type");
    overlay.splitHint = root.querySelector(".vnu-tool-split-hint");
    overlay.error = root.querySelector(".vnu-tool-error");
    overlay.errorText = root.querySelector(".vnu-tool-error-text");
    root.querySelector(".vnu-tool-close").addEventListener("click", () => { root.hidden = true; });
    root.querySelector(".vnu-tool-error-close").addEventListener("click", () => { overlay.error.hidden = true; });
    root.querySelector(".vnu-tool-settings").addEventListener("click", () => { root.dataset.configOpen = root.dataset.configOpen === "true" ? "false" : "true"; });
    root.querySelector(".vnu-tool-start").addEventListener("click", async () => {
      startNavigation({ codesText: overlay.codes.value, autoSelect: overlay.auto.checked, actionKey: state.actionKey, backKey: state.backKey, selectionConfig: configFromOverlay(), splitConfig: splitConfigFromOverlay() });
      await saveOverlaySettings();
    });
    root.querySelector(".vnu-tool-key").addEventListener("click", () => back());
    root.querySelector(".vnu-tool-next").addEventListener("click", () => action());
    overlay.splitType.addEventListener("change", () => { updateSplitExample(); saveOverlaySettings().catch(() => {}); });
    overlay.auto.addEventListener("change", () => {
      root.dataset.configOpen = overlay.auto.checked ? "true" : "false";
      saveOverlaySettings().catch(() => {});
    });
    for (const field of [overlay.mode, overlay.selector, overlay.column, overlay.confirmation]) field.addEventListener("change", () => saveOverlaySettings().catch(() => {}));
    chrome.storage.local.get({ codesText: "", autoSelect: false, actionKey: "F8", backKey: "F6", selectionConfig: state.selectionConfig, splitConfig: state.splitConfig }).then((saved) => {
      overlay.codes.value = saved.codesText;
      state.autoSelect = saved.autoSelect;
      state.actionKey = saved.actionKey;
      state.backKey = saved.backKey;
      state.selectionConfig = selectionConfig(saved.selectionConfig);
      state.splitConfig = splitConfig(saved.splitConfig);
      renderOverlay();
    }).catch(() => renderOverlay());
    renderOverlay();
  }

  function toggleOverlay() {
    createOverlay();
    overlay.root.hidden = !overlay.root.hidden;
    if (!overlay.root.hidden) renderOverlay();
  }

  function activate(index, scroll = true) {
    const match = state.matches[index];
    if (!match) return;
    removeActiveHighlight();
    state.index = index;
    match.row.classList.add("course-nav-active-row");
    match.codeCell.classList.add("course-nav-active-code");
    match.selectionCell?.classList.add("course-nav-selection-target");
    state.active = match;
    const rect = match.row.getBoundingClientRect();
    const alreadyVisible = rect.top >= 56 && rect.bottom <= window.innerHeight - 56;
    if (scroll && !alreadyVisible) match.row.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    state.status = match.selectionCell ? `Ready — ${match.confidence === "manual-only" ? "click the highlighted cell manually." : "course located."}` : "Course located — selection cell not identified; click manually.";
  }

  function buildIndex() {
    const candidatesByCode = new Map();
    const wanted = new Set(state.targets);
    for (const row of document.querySelectorAll("tr")) {
      if (!row.cells?.length) continue;
      for (const cell of row.cells) {
        const code = normalize(cell.textContent);
        if (!wanted.has(code)) continue;
        const selection = findSelection(row, cell);
        const match = { code, row, codeCell: cell, selectionCell: selection.cell, selectionControl: selection.control, autoSafe: selection.autoSafe, confidence: selection.confidence };
        if (!candidatesByCode.has(code)) candidatesByCode.set(code, []);
        candidatesByCode.get(code).push(match);
      }
    }
    const consumed = new Map();
    state.matches = state.targets.map((code) => {
      const next = consumed.get(code) || 0;
      const found = candidatesByCode.get(code)?.[next];
      consumed.set(code, next + 1);
      return found || { code, missing: true };
    });
  }

  function validMatch(match) {
    return Boolean(match?.row?.isConnected && match.codeCell?.isConnected && normalize(match.codeCell.textContent) === match.code);
  }

  function selected(match) {
    const controls = [match.selectionControl, match.selectionCell, match.row].filter(Boolean);
    return controls.some((element) => element.checked === true || element.getAttribute("aria-checked") === "true" || element.getAttribute("aria-selected") === "true" || /(^|\s)(selected|checked|active)(\s|$)/i.test(element.className || ""));
  }

  function customConfirmationSatisfied(match) {
    const selector = state.selectionConfig.confirmationSelector;
    return Boolean(selector && safeQuery(match.row, selector));
  }

  function waitForSelection(match) {
    const outcome = () => {
      const error = pageErrorMessage();
      if (error) return { selected: false, error };
      return { selected: selected(match) || customConfirmationSatisfied(match), error: "" };
    };
    const initial = outcome();
    if (initial.selected || initial.error) return Promise.resolve(initial);
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        const next = outcome();
        if (next.selected || next.error) finish(next);
      });
      observer.observe(match.row, { subtree: true, childList: true, attributes: true, characterData: true });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      const timeout = setTimeout(() => finish(outcome()), 650);
    });
  }

  function recoverCurrent() {
    const currentCode = state.matches[state.index]?.code;
    buildIndex();
    const recovered = state.matches.findIndex((match, index) => index >= state.index && match.code === currentCode && !match.missing);
    state.index = recovered >= 0 ? recovered : Math.max(0, state.index);
    if (state.matches[state.index] && !state.matches[state.index].missing) activate(state.index);
  }

  function firstAvailableAfter(index) {
    for (let offset = 1; offset <= state.matches.length; offset += 1) {
      const next = (index + offset) % state.matches.length;
      if (!state.matches[next].missing) return next;
    }
    return -1;
  }

  function previousAvailableBefore(index) {
    for (let offset = 1; offset <= state.matches.length; offset += 1) {
      const previous = (index - offset + state.matches.length) % state.matches.length;
      if (!state.matches[previous].missing) return previous;
    }
    return -1;
  }

  async function action() {
    if (state.busy || state.index < 0) return publicState();
    const match = state.matches[state.index];
    if (match?.missing) {
      state.status = `Not found: ${match.code}`;
      return publicState();
    }
    if (!validMatch(match)) {
      recoverCurrent();
      state.status = "Table changed — index rebuilt. Auto-select skipped; click manually.";
      return publicState();
    }
    if (!state.autoSelect) {
      const existingError = pageErrorMessage();
      if (existingError) {
        state.status = "Trang vừa báo lỗi — chưa chuyển sang môn tiếp theo.";
        showError(existingError);
        return publicState();
      }
    }
    state.busy = true;
    try {
      if (state.autoSelect) {
        if (!match.manualFallbackArmed && (!match.autoSafe || !match.selectionControl?.isConnected)) {
          match.manualFallbackArmed = true;
          state.status = "Auto-select unavailable for this row — click manually.";
          return publicState();
        }
        if (!match.manualFallbackArmed) {
          try {
            primeErrorAudio();
            match.selectionControl.click();
            const selectionResult = await waitForSelection(match);
            if (selectionResult.error) {
              match.manualFallbackArmed = true;
              state.status = "Trang từ chối chọn môn hiện tại.";
              showError(selectionResult.error);
              return publicState();
            }
            if (!selectionResult.selected) {
              match.manualFallbackArmed = true;
              state.status = "Auto-select was not confirmed — click manually, then press the Action Key again.";
              showError("Auto-select không nhận được xác nhận từ trang. Hãy tự tick ô đang được highlight, rồi bấm F8 để đi tiếp.");
              return publicState();
            }
          } catch {
            match.manualFallbackArmed = true;
            state.status = "Auto-select failed — click manually, then press the Action Key again.";
            showError("Auto-select gặp lỗi. Hãy tự tick ô đang được highlight, rồi bấm F8 để đi tiếp.");
            return publicState();
          }
        }
      }
      const currentIndex = state.index;
      const next = firstAvailableAfter(currentIndex);
      if (next < 0) {
        state.status = "No available course to navigate to.";
        return publicState();
      }
      activate(next);
      if (next <= currentIndex) state.status = "Ready — returned to the first course.";
      return publicState();
    } finally {
      state.busy = false;
      announce();
    }
  }

  function back() {
    if (state.index < 0) { state.status = "Press START first."; announce(); return publicState(); }
    const currentIndex = state.index;
    const previous = previousAvailableBefore(currentIndex);
    if (previous < 0) { state.status = "No available course to navigate to."; announce(); return publicState(); }
    activate(previous);
    if (previous >= currentIndex) state.status = "Ready — returned to the last course.";
    announce();
    return publicState();
  }

  function startNavigation(message) {
    state.splitConfig = splitConfig(message.splitConfig || state.splitConfig);
    state.targets = parseCodes(message.codesText, state.splitConfig);
    state.autoSelect = Boolean(message.autoSelect);
    state.actionKey = message.actionKey || "F8";
    state.backKey = message.backKey || "F6";
    state.selectionConfig = selectionConfig(message.selectionConfig);
    removeAllExtensionHighlight();
    state.active = null;
    if (!state.targets.length) {
      state.matches = [];
      state.index = -1;
      state.status = "Nhập ít nhất một mã môn.";
      announce();
      return publicState();
    }
    buildIndex();
    const firstFound = state.matches.findIndex((match) => !match.missing);
    if (firstFound < 0) {
      state.index = 0;
      state.status = "Không tìm thấy mã môn nào trong các dòng của bảng.";
      announce();
      return publicState();
    }
    state.index = firstFound;
    activate(firstFound);
    const missing = state.matches.filter((match) => match.missing).map((match) => match.code);
    if (missing.length) state.status += ` Không tìm thấy: ${missing.join(", ")}.`;
    announce();
    return publicState();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "getToolVersion") { sendResponse({ version: TOOL_VERSION }); return; }
    if (message.type === "getState") { sendResponse(publicState()); return; }
    if (message.type === "setAutoSelect") { state.autoSelect = Boolean(message.autoSelect); announce(); sendResponse(publicState()); return; }
    if (message.type === "setActionKey") { state.actionKey = message.actionKey || "F8"; announce(); sendResponse(publicState()); return; }
    if (message.type === "setBackKey") { state.backKey = message.backKey || "F6"; announce(); sendResponse(publicState()); return; }
    if (message.type === "setSelectionConfig") {
      state.selectionConfig = selectionConfig(message.selectionConfig);
      state.status = state.targets.length ? "Auto-select setting saved. Press START to rebuild the table index." : "Auto-select setting saved.";
      announce();
      sendResponse(publicState());
      return;
    }
    if (message.type === "setSplitConfig") {
      state.splitConfig = splitConfig(message.splitConfig);
      state.status = "Đã lưu cách tách mã môn. Bấm START để áp dụng.";
      announce();
      sendResponse(publicState());
      return;
    }
    if (message.type === "start") { sendResponse(startNavigation(message)); return; }
    if (message.type === "back") { sendResponse(back()); return; }
    if (message.type === "action") { action().then(sendResponse); return true; }
    if (message.type === "toggleOverlay") { toggleOverlay(); sendResponse({ open: !overlay.root.hidden }); return; }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable=true]")) return;
    if (event.key !== state.actionKey && event.key !== state.backKey) return;
    event.preventDefault();
    if (event.key === state.backKey) back();
    else action();
  }, true);
})();
