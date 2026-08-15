chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    const current = await chrome.tabs.sendMessage(tab.id, { type: "getToolVersion" });
    if (current?.version !== "1.1.0") throw new Error("Update content script");
  } catch {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["page-styles.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // Browser-internal pages and restricted pages cannot host extensions.
      return;
    }
  }
  chrome.tabs.sendMessage(tab.id, { type: "toggleOverlay" }).catch(() => {});
});
