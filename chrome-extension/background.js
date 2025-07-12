// Service worker for the dny.li URL Shortener extension

// Set up side panel behavior when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Enable side panel for all sites
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Handle extension icon click (optional - the side panel opens automatically)
chrome.action.onClicked.addListener((tab) => {
  // The side panel will open automatically due to setPanelBehavior above
  // This handler is here in case we need custom logic in the future
});


// Optional: Handle tab updates to refresh side panel content
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the URL changed and side panel is open, we could send a message
  // to update the current page info, but for now the side panel
  // handles this on its own when opened
});

// Keep service worker alive (if needed)
// Note: Service workers in MV3 are designed to be ephemeral,
// but this can help during development
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();