// Background Script
// Handles background tasks and extension lifecycle
//
// Runs as a non-persistent event page (see manifest.json "persistent": false).
// This is required on Firefox for Android, which aggressively kills persistent
// background pages. Listeners below are registered synchronously at top-level
// so Firefox can reload this script and redeliver queued events after a
// suspend. One consequence on Android: if the event page is killed mid-flight
// during the setTimeout delay in the screenshot capture below, that capture
// is silently dropped — already handled as best-effort via the existing
// try/catch, so no functional change needed there.

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

// Maps tabId -> original bookmark URL for forced re-captures (survives redirects)
const forceCaptureByTab = new Map();

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== 'force-capture' || !message.url) return false;
  browser.tabs.create({ url: message.url, active: true }).then(tab => {
    forceCaptureByTab.set(tab.id, message.url);
  }).catch(() => {});
  return false;
});

// Capture a screenshot when the user visits a bookmarked URL
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.active || !tab.url) return;
  if (!/^https?:\/\//.test(tab.url)) return;

  let config;
  try {
    const result = await browser.storage.local.get('cachedBookmarks');
    config = result.cachedBookmarks;
  } catch (e) {
    return;
  }

  if (!config) return;

  // Support both legacy { folders } and current { pages } config formats
  const allFolders = config.pages
    ? config.pages.flatMap(p => p.folders || [])
    : (config.folders || []);

  if (allFolders.length === 0) return;

  // Check if this tab was opened for a forced re-capture
  const forcedBookmarkUrl = forceCaptureByTab.get(tabId);
  const isForced = forcedBookmarkUrl !== undefined;
  if (isForced) forceCaptureByTab.delete(tabId);

  const allUrls = new Set(
    allFolders.flatMap(f => (f.bookmarks || []).map(b => b.url))
  );

  // For forced captures, match on the original bookmark URL; otherwise match tab.url
  if (!isForced && !allUrls.has(tab.url)) return;
  if (isForced && !allUrls.has(forcedBookmarkUrl)) return;

  if (!isForced) {
    try {
      const existing = await ScreenshotDB.get(tab.url);
      if (existing) return;
    } catch (e) {
      return;
    }
  }

  // Store the screenshot under the bookmark URL so the tile can find it
  const storeUrl = isForced ? forcedBookmarkUrl : tab.url;

  try {
    const settingsResult = await browser.storage.sync.get('screenshotDelay');
    const delay = settingsResult.screenshotDelay ?? 1500;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 70,
    });
    await ScreenshotDB.put(storeUrl, dataUrl);
    console.log('[Screenshot] captured for', storeUrl);
    browser.runtime.sendMessage({ type: 'screenshot-captured', url: storeUrl }).catch(() => {});
  } catch (e) {
    console.warn('[Screenshot] capture failed for', storeUrl, e);
  }
});
