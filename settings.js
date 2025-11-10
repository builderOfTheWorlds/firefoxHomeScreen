// Settings Page Script
// Handles saving and testing GitHub configuration

const githubSync = new GitHubSync();

// DOM elements
const githubTokenInput = document.getElementById('github-token');
const githubRepoInput = document.getElementById('github-repo');
const configPathInput = document.getElementById('config-path');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const statusMessage = document.getElementById('status-message');

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
}

// Save settings
async function saveSettings() {
  const settings = {
    token: githubTokenInput.value.trim(),
    repo: githubRepoInput.value.trim(),
    configPath: configPathInput.value.trim() || 'bookmarks.json'
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
    configPath: configPathInput.value.trim() || 'bookmarks.json'
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
saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testConnection);

// Handle Enter key in inputs
[githubTokenInput, githubRepoInput, configPathInput].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
});

// Load settings on page load
loadSettings();
