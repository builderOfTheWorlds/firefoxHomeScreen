// Background Script
// Handles background tasks and extension lifecycle

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

// URLs explicitly queued for a forced re-capture (bypasses the "skip if exists" check)
const forceCaptureUrls = new Set();

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== 'force-capture' || !message.url) return false;
  forceCaptureUrls.add(message.url);
  browser.tabs.create({ url: message.url, active: true }).catch(() => {
    forceCaptureUrls.delete(message.url);
  });
  return false;
});

// Capture a screenshot when the user visits a bookmarked URL
browser.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
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

  if (!config || !config.folders) return;

  const allUrls = new Set(
    config.folders.flatMap(f => (f.bookmarks || []).map(b => b.url))
  );
  if (!allUrls.has(tab.url)) return;

  const isForced = forceCaptureUrls.has(tab.url);
  if (!isForced) {
    try {
      const existing = await ScreenshotDB.get(tab.url);
      if (existing) return;
    } catch (e) {
      return;
    }
  }
  forceCaptureUrls.delete(tab.url);

  try {
    const settingsResult = await browser.storage.sync.get('screenshotDelay');
    const delay = settingsResult.screenshotDelay ?? 1500;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 70,
    });
    await ScreenshotDB.put(tab.url, dataUrl);
    console.log('[Screenshot] captured for', tab.url);
    browser.runtime.sendMessage({ type: 'screenshot-captured', url: tab.url }).catch(() => {});
  } catch (e) {
    console.warn('[Screenshot] capture failed for', tab.url, e);
  }
});
