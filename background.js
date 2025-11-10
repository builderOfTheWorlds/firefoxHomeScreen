// Background Script
// Handles background tasks and extension lifecycle

// Listen for extension installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open settings page on first install
    browser.runtime.openOptionsPage();
  }
});

// Handle messages from other parts of the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Future: Handle background sync, notifications, etc.
  return false;
});
