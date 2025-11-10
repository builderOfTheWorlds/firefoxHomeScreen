// New Tab Page Script
// Handles rendering bookmarks and user interactions

const githubSync = new GitHubSync();

// DOM elements
const bookmarksContainer = document.getElementById('bookmarks-container');
const noConfigDiv = document.getElementById('no-config');
const statusMessage = document.getElementById('status-message');
const syncBtn = document.getElementById('sync-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsLink = document.getElementById('settings-link');

// Show status message
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  setTimeout(() => {
    statusMessage.className = 'status-message hidden';
  }, 3000);
}

// Get favicon URL for a bookmark
function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}

// Render bookmarks
function renderBookmarks(config) {
  bookmarksContainer.innerHTML = '';

  if (!config || !config.folders || config.folders.length === 0) {
    noConfigDiv.classList.remove('hidden');
    bookmarksContainer.classList.add('hidden');
    return;
  }

  noConfigDiv.classList.add('hidden');
  bookmarksContainer.classList.remove('hidden');

  config.folders.forEach(folder => {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';

    const folderName = document.createElement('div');
    folderName.className = 'folder-name';
    folderName.textContent = folder.name;

    const bookmarksList = document.createElement('ul');
    bookmarksList.className = 'bookmarks-list';

    if (folder.bookmarks && folder.bookmarks.length > 0) {
      folder.bookmarks.forEach(bookmark => {
        const bookmarkItem = document.createElement('li');
        bookmarkItem.className = 'bookmark';

        const link = document.createElement('a');
        link.href = bookmark.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        icon.src = getFaviconUrl(bookmark.url);
        icon.alt = '';
        icon.onerror = () => {
          icon.style.display = 'none';
        };

        const title = document.createElement('span');
        title.className = 'bookmark-title';
        title.textContent = bookmark.title;

        link.appendChild(icon);
        link.appendChild(title);
        bookmarkItem.appendChild(link);
        bookmarksList.appendChild(bookmarkItem);
      });
    }

    folderDiv.appendChild(folderName);
    folderDiv.appendChild(bookmarksList);
    bookmarksContainer.appendChild(folderDiv);
  });
}

// Load and display bookmarks
async function loadBookmarks(forceRefresh = false) {
  try {
    const config = await githubSync.getConfig(forceRefresh);
    renderBookmarks(config);

    if (forceRefresh) {
      showStatus('Bookmarks synced successfully!', 'success');
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);

    // Try to show cached bookmarks
    const cached = await githubSync.getCachedConfig();
    if (cached) {
      renderBookmarks(cached);
      if (forceRefresh) {
        showStatus('Using cached bookmarks (sync failed)', 'error');
      }
    } else {
      noConfigDiv.classList.remove('hidden');
      bookmarksContainer.classList.add('hidden');
      if (forceRefresh) {
        showStatus(`Error: ${error.message}`, 'error');
      }
    }
  }
}

// Sync button click handler
syncBtn.addEventListener('click', async () => {
  syncBtn.classList.add('syncing');
  syncBtn.disabled = true;

  await loadBookmarks(true);

  syncBtn.classList.remove('syncing');
  syncBtn.disabled = false;
});

// Settings button click handler
settingsBtn.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

// Settings link click handler
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

// Load bookmarks on page load
loadBookmarks();
