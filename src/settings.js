// Settings Page Script
// Handles saving and testing GitHub configuration

const githubSync = new GitHubSync();

// DOM elements
const githubTokenInput = document.getElementById('github-token');
const githubRepoInput = document.getElementById('github-repo');
const configPathInput = document.getElementById('config-path');
const folderColumnsInput = document.getElementById('folder-columns');
const folderPaddingInput = document.getElementById('folder-padding');
const folderPaddingDisplay = document.getElementById('folder-padding-display');
const defaultFolderMinWidthInput = document.getElementById('default-folder-min-width');
const defaultFolderMinWidthDisplay = document.getElementById('default-folder-min-width-display');
const defaultFolderMinHeightInput = document.getElementById('default-folder-min-height');
const defaultFolderMinHeightDisplay = document.getElementById('default-folder-min-height-display');
const bookmarkScaleInput = document.getElementById('bookmark-scale');
const bookmarkScaleDisplay = document.getElementById('bookmark-scale-display');
const defaultBmWidthInput = document.getElementById('default-bm-width');
const defaultBmWidthDisplay = document.getElementById('default-bm-width-display');
const defaultBmHeightInput = document.getElementById('default-bm-height');
const defaultBmHeightDisplay = document.getElementById('default-bm-height-display');
const bookmarkIconSizeInput = document.getElementById('bookmark-icon-size');
const bookmarkIconSizeDisplay = document.getElementById('bookmark-icon-size-display');
const screenshotHeightInput = document.getElementById('screenshot-height');
const screenshotHeightDisplay = document.getElementById('screenshot-height-display');
const screenshotDelayInput = document.getElementById('screenshot-delay');
const screenshotDelayDisplay = document.getElementById('screenshot-delay-display');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const backBtn = document.getElementById('back-btn');
const statusMessage = document.getElementById('status-message');

bookmarkScaleInput.addEventListener('input', () => { bookmarkScaleDisplay.textContent = bookmarkScaleInput.value; });
folderPaddingInput.addEventListener('input', () => { folderPaddingDisplay.textContent = folderPaddingInput.value; });
bookmarkIconSizeInput.addEventListener('input', () => { bookmarkIconSizeDisplay.textContent = bookmarkIconSizeInput.value; });
screenshotHeightInput.addEventListener('input', () => { screenshotHeightDisplay.textContent = screenshotHeightInput.value; });
screenshotDelayInput.addEventListener('input', () => { screenshotDelayDisplay.textContent = screenshotDelayInput.value; });
defaultFolderMinWidthInput.addEventListener('input', () => { defaultFolderMinWidthDisplay.textContent = defaultFolderMinWidthInput.value; });
defaultFolderMinHeightInput.addEventListener('input', () => { defaultFolderMinHeightDisplay.textContent = defaultFolderMinHeightInput.value; });
defaultBmWidthInput.addEventListener('input', () => { defaultBmWidthDisplay.textContent = defaultBmWidthInput.value; });
defaultBmHeightInput.addEventListener('input', () => { defaultBmHeightDisplay.textContent = defaultBmHeightInput.value; });

// Show status message
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  setTimeout(() => {
    statusMessage.className = 'status-message hidden';
  }, 5000);
}

// Load current settings
async function loadSettings() {
  const settings = await githubSync.loadSettings();
  githubTokenInput.value = settings.token;
  githubRepoInput.value = settings.repo;
  configPathInput.value = settings.configPath;
  folderColumnsInput.value = settings.folderColumns || 4;
  const fp = settings.folderPadding || 24;
  folderPaddingInput.value = fp;
  folderPaddingDisplay.textContent = fp;
  const fmw = settings.defaultFolderMinWidth || 0;
  defaultFolderMinWidthInput.value = fmw;
  defaultFolderMinWidthDisplay.textContent = fmw;
  const fmh = settings.defaultFolderMinHeight || 0;
  defaultFolderMinHeightInput.value = fmh;
  defaultFolderMinHeightDisplay.textContent = fmh;
  const bs = settings.bookmarkScale || 100;
  bookmarkScaleInput.value = bs;
  bookmarkScaleDisplay.textContent = bs;
  const dbw = settings.defaultBmWidth || 80;
  defaultBmWidthInput.value = dbw;
  defaultBmWidthDisplay.textContent = dbw;
  const dbh = settings.defaultBmHeight || 80;
  defaultBmHeightInput.value = dbh;
  defaultBmHeightDisplay.textContent = dbh;
  const bis = settings.bookmarkIconSize || 28;
  bookmarkIconSizeInput.value = bis;
  bookmarkIconSizeDisplay.textContent = bis;
  const sh = settings.screenshotHeight || 100;
  screenshotHeightInput.value = sh;
  screenshotHeightDisplay.textContent = sh;
  const sd = settings.screenshotDelay != null ? settings.screenshotDelay : 1500;
  screenshotDelayInput.value = sd;
  screenshotDelayDisplay.textContent = sd;
}

// Save settings
async function saveSettings() {
  const settings = {
    token: githubTokenInput.value.trim(),
    repo: githubRepoInput.value.trim(),
    configPath: configPathInput.value.trim() || 'bookmarks.json',
    folderColumns: parseInt(folderColumnsInput.value, 10) || 4,
    folderPadding: parseInt(folderPaddingInput.value, 10) || 24,
    bookmarkIconSize: parseInt(bookmarkIconSizeInput.value, 10) || 28,
    screenshotHeight: parseInt(screenshotHeightInput.value, 10) || 100,
    screenshotDelay: parseInt(screenshotDelayInput.value, 10) || 0,
    defaultFolderMinWidth: parseInt(defaultFolderMinWidthInput.value, 10) || 0,
    defaultFolderMinHeight: parseInt(defaultFolderMinHeightInput.value, 10) || 0,
    bookmarkScale: parseInt(bookmarkScaleInput.value, 10) || 100,
    defaultBmWidth: parseInt(defaultBmWidthInput.value, 10) || 80,
    defaultBmHeight: parseInt(defaultBmHeightInput.value, 10) || 80
  };

  if (!settings.token) {
    showStatus('Please enter a GitHub Personal Access Token', 'error');
    return;
  }

  if (!settings.repo) {
    showStatus('Please enter a repository in the format "owner/repo"', 'error');
    return;
  }

  // Validate repo format
  const repoParts = settings.repo.split('/');
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    showStatus('Invalid repository format. Use "owner/repository"', 'error');
    return;
  }

  try {
    await githubSync.saveSettings(settings);
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus(`Error saving settings: ${error.message}`, 'error');
  }
}

// Test connection
async function testConnection() {
  const settings = {
    token: githubTokenInput.value.trim(),
    repo: githubRepoInput.value.trim(),
    configPath: configPathInput.value.trim() || 'bookmarks.json',
    folderColumns: parseInt(folderColumnsInput.value, 10) || 4,
    folderPadding: parseInt(folderPaddingInput.value, 10) || 24,
    bookmarkIconSize: parseInt(bookmarkIconSizeInput.value, 10) || 28,
    screenshotHeight: parseInt(screenshotHeightInput.value, 10) || 100,
    screenshotDelay: parseInt(screenshotDelayInput.value, 10) || 0,
    defaultFolderMinWidth: parseInt(defaultFolderMinWidthInput.value, 10) || 0,
    defaultFolderMinHeight: parseInt(defaultFolderMinHeightInput.value, 10) || 0,
    bookmarkScale: parseInt(bookmarkScaleInput.value, 10) || 100,
    defaultBmWidth: parseInt(defaultBmWidthInput.value, 10) || 80,
    defaultBmHeight: parseInt(defaultBmHeightInput.value, 10) || 80
  };

  if (!settings.token || !settings.repo) {
    showStatus('Please enter both token and repository', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    // Save settings temporarily
    await githubSync.saveSettings(settings);

    // Try to fetch config
    const config = await githubSync.fetchConfig();

    if (config && config.folders) {
      showStatus(
        `Connection successful! Found ${config.folders.length} folder(s) with bookmarks.`,
        'success'
      );
    } else {
      showStatus('Connection successful, but config format is invalid', 'error');
    }
  } catch (error) {
    showStatus(`Connection failed: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

// Event listeners
backBtn.addEventListener('click', () => {
  window.location.href = browser.runtime.getURL('newtab.html');
});

saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testConnection);

// Handle Enter key in inputs
[githubTokenInput, githubRepoInput, configPathInput, folderColumnsInput].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
});

// Load settings on page load
loadSettings();
