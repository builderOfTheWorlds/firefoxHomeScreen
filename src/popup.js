// Popup script — add the current tab as a bookmark

const bmTitle = document.getElementById('bm-title');
const bmUrl = document.getElementById('bm-url');
const bmPage = document.getElementById('bm-page');
const bmFolder = document.getElementById('bm-folder');
const bmNewFolder = document.getElementById('bm-new-folder');
const newFolderGroup = document.getElementById('new-folder-group');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const statusEl = document.getElementById('status');
const formArea = document.getElementById('form-area');
const noConfig = document.getElementById('no-config');
const settingsLink = document.getElementById('settings-link');
const openHomescreenBtn = document.getElementById('open-homescreen-btn');

let loadedConfig = null;
let capturedScreenshot = null; // dataUrl captured from the active tab on open

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
  window.close();
});

// Firefox for Android doesn't support chrome_url_overrides, so newtab.html
// never appears automatically there. Surface a manual way in from the
// toolbar popup instead, Android-only (desktop already gets it on every
// new tab, so the button would just be redundant clutter there).
(async () => {
  try {
    const { os } = await browser.runtime.getPlatformInfo();
    if (os === 'android') openHomescreenBtn.classList.remove('hidden');
  } catch (e) {
    // getPlatformInfo unavailable; leave the button hidden
  }
})();

openHomescreenBtn.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('newtab.html') });
  window.close();
});

cancelBtn.addEventListener('click', () => window.close());

bmFolder.addEventListener('change', () => {
  newFolderGroup.classList.toggle('hidden', bmFolder.value !== '__new__');
});

bmPage.addEventListener('change', () => {
  populateFolders();
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
}

function ensurePages(config) {
  if (!config.pages) {
    config.pages = [{ id: 'page-1', name: 'Bookmarks', folders: config.folders || [] }];
    delete config.folders;
  }
  return config;
}

function getSelectedPage() {
  if (!loadedConfig) return null;
  return loadedConfig.pages.find(p => p.id === bmPage.value) || loadedConfig.pages[0];
}

function populateFolders() {
  const page = getSelectedPage();
  const folders = (page && page.folders) || [];

  bmFolder.innerHTML = '';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    bmFolder.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New Folder';
  bmFolder.appendChild(newOpt);

  newFolderGroup.classList.toggle('hidden', bmFolder.value !== '__new__');
}

async function init() {
  // Capture screenshot of the current tab immediately before anything else changes focus
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      bmUrl.value = tab.url || '';
      bmTitle.value = tab.title || '';

      // Capture visible tab; the page is still rendered behind the popup
      capturedScreenshot = await browser.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 70,
      });
    }
  } catch (e) {
    // Screenshot capture is best-effort; continue without it
  }

  // Load config
  try {
    loadedConfig = await BookmarkDB.get();
    if (!loadedConfig) {
      const cached = await browser.storage.local.get('cachedBookmarks');
      loadedConfig = cached.cachedBookmarks || null;
    }
  } catch (e) {
    // storage unavailable
  }

  if (!loadedConfig) {
    formArea.classList.add('hidden');
    noConfig.classList.remove('hidden');
    return;
  }

  ensurePages(loadedConfig);

  // Populate page selector
  bmPage.innerHTML = '';
  loadedConfig.pages.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    bmPage.appendChild(opt);
  });

  // Default to the last-active page stored in extension local storage
  try {
    const { activePageId } = await browser.storage.local.get('activePageId');
    if (activePageId && loadedConfig.pages.find(p => p.id === activePageId)) {
      bmPage.value = activePageId;
    }
  } catch (e) {
    // ignore
  }

  populateFolders();

  bmTitle.focus();
  bmTitle.select();
}

saveBtn.addEventListener('click', async () => {
  const title = bmTitle.value.trim();
  let url = bmUrl.value.trim();
  const folderVal = bmFolder.value;
  const newFolderName = bmNewFolder.value.trim();

  if (!title) { showStatus('Please enter a title.', 'error'); return; }
  if (!url) { showStatus('Please enter a URL.', 'error'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (folderVal === '__new__' && !newFolderName) {
    showStatus('Please enter a folder name.', 'error'); return;
  }

  saveBtn.disabled = true;

  try {
    let config = loadedConfig;
    if (!config) {
      config = { pages: [{ id: 'page-1', name: 'Bookmarks', folders: [] }] };
    }
    ensurePages(config);

    const targetPage = getSelectedPage();
    const bookmark = { title, url };

    if (folderVal === '__new__') {
      targetPage.folders.push({ name: newFolderName, bookmarks: [bookmark] });
    } else {
      const folder = targetPage.folders.find(f => f.name === folderVal);
      if (folder) {
        folder.bookmarks = folder.bookmarks || [];
        folder.bookmarks.push(bookmark);
      }
    }

    await BookmarkDB.put(config);
    await browser.storage.local.set({ cachedBookmarks: config });

    // Store the screenshot keyed by URL so the tile can find it on the new tab page
    if (capturedScreenshot) {
      await ScreenshotDB.put(url, capturedScreenshot);
    }

    showStatus('Bookmark added!', 'success');
    setTimeout(() => window.close(), 800);
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
    saveBtn.disabled = false;
  }
});

init();
