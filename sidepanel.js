const $ = (selector) => document.querySelector(selector);
const keys = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];

const els = {
  codes: $("#codes"), start: $("#start"), current: $("#current"), progress: $("#progress"),
  status: $("#status"), auto: $("#auto-select"), keyButton: $("#key-button"), keySelect: $("#key-select"),
  backKeyButton: $("#back-key-button"), backKeySelect: $("#back-key-select"),
  back: $("#back"), next: $("#next"), selectMode: $("#select-mode"), selectionSelector: $("#selection-selector"),
  selectionColumn: $("#selection-column"), confirmationSelector: $("#confirmation-selector")
};

for (const key of keys) {
  const option = document.createElement("option");
  option.value = option.textContent = key;
  els.keySelect.append(option);
  els.backKeySelect.append(option.cloneNode(true));
}

function render(state = {}) {
  els.current.textContent = state.current || "—";
  els.progress.textContent = `${state.position || 0} / ${state.total || 0}`;
  els.status.textContent = state.status || "Ready";
  if (typeof state.autoSelect === "boolean") els.auto.checked = state.autoSelect;
  if (state.actionKey) {
    els.keyButton.textContent = state.actionKey;
    els.keySelect.value = state.actionKey;
  }
  if (state.backKey) {
    els.backKeyButton.textContent = state.backKey;
    els.backKeySelect.value = state.backKey;
  }
  if (state.selectionConfig) setSelectionConfig(state.selectionConfig);
}

function selectionConfig() {
  return {
    mode: els.selectMode.value,
    selector: els.selectionSelector.value.trim(),
    column: Number(els.selectionColumn.value) || 1,
    confirmationSelector: els.confirmationSelector.value.trim()
  };
}

function setSelectionConfig(config = {}) {
  els.selectMode.value = config.mode || "auto";
  els.selectionSelector.value = config.selector || "";
  els.selectionColumn.value = config.column || 1;
  els.confirmationSelector.value = config.confirmationSelector || "";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function send(message) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("Không tìm thấy tab đang mở.");
  return chrome.tabs.sendMessage(tab.id, message);
}

async function refresh() {
  try { render(await send({ type: "getState" })); }
  catch { render({ status: "Mở trang đăng ký môn học rồi bấm START." }); }
}

els.start.addEventListener("click", async () => {
  els.start.disabled = true;
  try {
    const config = selectionConfig();
    const state = await send({ type: "start", codesText: els.codes.value, autoSelect: els.auto.checked, actionKey: els.keySelect.value, backKey: els.backKeySelect.value, selectionConfig: config });
    await chrome.storage.local.set({ codesText: els.codes.value, autoSelect: els.auto.checked, actionKey: els.keySelect.value, backKey: els.backKeySelect.value, selectionConfig: config });
    render(state);
  } catch (error) {
    render({ status: `Không thể START: ${error.message}` });
  } finally { els.start.disabled = false; }
});

els.back.addEventListener("click", async () => {
  try { render(await send({ type: "back" })); } catch (error) { render({ status: error.message }); }
});

els.next.addEventListener("click", async () => {
  try { render(await send({ type: "action" })); } catch (error) { render({ status: error.message }); }
});

els.auto.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoSelect: els.auto.checked });
  try { render(await send({ type: "setAutoSelect", autoSelect: els.auto.checked })); } catch { /* page not ready */ }
});

els.keyButton.addEventListener("click", () => {
  const visible = els.keySelect.style.display === "inline-block";
  els.keySelect.style.display = visible ? "none" : "inline-block";
  els.keyButton.setAttribute("aria-expanded", String(!visible));
  if (!visible) els.keySelect.focus();
});

els.keySelect.addEventListener("change", async () => {
  els.keyButton.textContent = els.keySelect.value;
  els.keySelect.style.display = "none";
  els.keyButton.setAttribute("aria-expanded", "false");
  await chrome.storage.local.set({ actionKey: els.keySelect.value });
  try { render(await send({ type: "setActionKey", actionKey: els.keySelect.value })); } catch { /* page not ready */ }
});

els.backKeyButton.addEventListener("click", () => {
  const visible = els.backKeySelect.style.display === "inline-block";
  els.backKeySelect.style.display = visible ? "none" : "inline-block";
  els.backKeyButton.setAttribute("aria-expanded", String(!visible));
  if (!visible) els.backKeySelect.focus();
});

els.backKeySelect.addEventListener("change", async () => {
  els.backKeyButton.textContent = els.backKeySelect.value;
  els.backKeySelect.style.display = "none";
  els.backKeyButton.setAttribute("aria-expanded", "false");
  await chrome.storage.local.set({ backKey: els.backKeySelect.value });
  try { render(await send({ type: "setBackKey", backKey: els.backKeySelect.value })); } catch { /* page not ready */ }
});

for (const field of [els.selectMode, els.selectionSelector, els.selectionColumn, els.confirmationSelector]) {
  field.addEventListener("change", async () => {
    const config = selectionConfig();
    await chrome.storage.local.set({ selectionConfig: config });
    try { render(await send({ type: "setSelectionConfig", selectionConfig: config })); } catch { /* saved for later */ }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "stateChanged") render(message.state);
});

(async () => {
  const saved = await chrome.storage.local.get({ codesText: "", autoSelect: false, actionKey: "F8", backKey: "F6", selectionConfig: { mode: "auto", selector: "", column: 1, confirmationSelector: "" } });
  els.codes.value = saved.codesText;
  els.auto.checked = saved.autoSelect;
  els.keySelect.value = saved.actionKey;
  els.keyButton.textContent = saved.actionKey;
  els.backKeySelect.value = saved.backKey;
  els.backKeyButton.textContent = saved.backKey;
  setSelectionConfig(saved.selectionConfig);
  refresh();
})();
