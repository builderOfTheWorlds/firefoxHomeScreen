// New Tab Page Script
// Handles rendering bookmarks and user interactions

const githubSync = new GitHubSync();

// In-memory config mirror — always reflects what's in BookmarkDB
let currentConfig = null;

// Currently active page id — restored from localStorage so refreshes stay on the same page
let currentPageId = localStorage.getItem('activePageId') || null;

function setActivePage(id) {
  currentPageId = id;
  localStorage.setItem('activePageId', id);
}

// DOM elements
const bookmarksContainer = document.getElementById('bookmarks-container');
const noConfigDiv = document.getElementById('no-config');
const statusMessage = document.getElementById('status-message');
const syncBtn = document.getElementById('sync-btn');
const pendingIndicator = document.getElementById('pending-indicator');
const addBtn = document.getElementById('add-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsLink = document.getElementById('settings-link');
const contextMenu = document.getElementById('context-menu');
const ctxRemove = document.getElementById('ctx-remove');
const ctxAddLink = document.getElementById('ctx-add-link');
const ctxEdit = document.getElementById('ctx-edit');
const ctxShrinkToFit = document.getElementById('ctx-shrink-to-fit');
const ctxMovePage = document.getElementById('ctx-move-page');
const ctxRefreshScreenshot = document.getElementById('ctx-refresh-screenshot');
const ctxPageSubmenu = document.getElementById('ctx-page-submenu');
const ctxPageSubmenuList = document.getElementById('ctx-page-submenu-list');
const pageTabs = document.getElementById('page-tabs');

// Context menu state
let ctxTarget = null; // { folderName, bookmarkUrl?, type: 'bookmark'|'folder' }

// Migrate legacy { folders: [...] } config to { pages: [...] } format
function ensurePages(config) {
  if (!config) return config;
  if (!config.pages) {
    config.pages = [{ id: 'page-1', name: 'Bookmarks', folders: config.folders || [] }];
    delete config.folders;
  }
  return config;
}

// Return the active page object; defaults to first page if currentPageId is unset
function getActivePage(config) {
  if (!config || !config.pages || config.pages.length === 0) return null;
  let page = config.pages.find(p => p.id === currentPageId);
  if (!page) {
    page = config.pages[0];
    setActivePage(page.id);
  }
  return page;
}

// Return the current config from memory, BookmarkDB, or GitHub (in that order)
async function getConfig() {
  if (currentConfig) return currentConfig;
  const stored = await BookmarkDB.get();
  if (stored) { currentConfig = ensurePages(stored); return currentConfig; }
  const fetched = await githubSync.fetchConfig();
  ensurePages(fetched);
  await BookmarkDB.put(fetched);
  browser.storage.local.set({ cachedBookmarks: fetched }).catch(() => {});
  currentConfig = fetched;
  return fetched;
}

// ─── Dirty page tracking ─────────────────────────────────────────────────────
// dirtyPages: Set of page IDs whose page-{id}.json files need pushing.
// An empty set with pendingSync='1' means only the index changed.

function getDirtyPageIds() {
  try { return new Set(JSON.parse(localStorage.getItem('dirtyPages') || '[]')); }
  catch { return new Set(); }
}

function markDirtyPages(...ids) {
  const dirty = getDirtyPageIds();
  for (const id of ids) dirty.add(id);
  localStorage.setItem('dirtyPages', JSON.stringify([...dirty]));
  localStorage.setItem('pendingSync', '1');
}

function clearDirtyState() {
  localStorage.removeItem('dirtyPages');
  localStorage.removeItem('pendingSync');
}

// Apply a config mutation locally: write to BookmarkDB, update cache, re-render.
// changedPageIds: string | string[] | Set<string> — page files that changed.
//   Pass nothing / null for index-only changes (page add/delete/rename/reorder).
// GitHub sync happens on the periodic interval or manual button — not here.
async function applyLocalChange(config, changedPageIds) {
  ensurePages(config);
  currentConfig = config;
  await BookmarkDB.put(config);
  browser.storage.local.set({ cachedBookmarks: config }).catch(() => {});
  localStorage.setItem('pendingSync', '1');
  if (changedPageIds) {
    const ids = typeof changedPageIds === 'string' ? [changedPageIds] : [...changedPageIds];
    markDirtyPages(...ids);
  }
  await renderBookmarks(config);
}

// Push the local BookmarkDB config to GitHub
async function syncToGitHub() {
  const config = currentConfig || await BookmarkDB.get();
  if (!config) return;

  syncBtn.classList.add('syncing');
  syncBtn.disabled = true;
  pendingIndicator.classList.remove('hidden');
  pendingIndicator.textContent = 'Syncing…';

  try {
    const dirtyPageIds = getDirtyPageIds();
    // Pass the dirty set (may be empty for index-only changes, or null = write all as fallback).
    const pagesToSync = dirtyPageIds.size > 0 ? dirtyPageIds : null;
    const { sha } = await githubSync.updateConfig(config, pagesToSync);
    clearDirtyState();
    if (sha) localStorage.setItem('lastPushedSha', sha);
    showStatus('Saved to GitHub!', 'success');
    console.log('[Sync] pushed to GitHub successfully');

    // Sync screenshots in the background — failures are non-fatal
    const urls = getAllBookmarkUrls(config);
    if (urls.length > 0) {
      githubSync.syncScreenshots(urls).catch(e => console.warn('[Sync] screenshot sync failed', e));
    }
  } catch (error) {
    console.error('[Sync] push failed', error);
    showStatus(`Sync failed: ${error.message}`, 'error');
  } finally {
    syncBtn.classList.remove('syncing');
    syncBtn.disabled = false;
    pendingIndicator.classList.add('hidden');
    pendingIndicator.textContent = '';
  }
}


function applyScreenshot(bookmarkItem, icon, dataUrl) {
  icon.src = dataUrl;
  icon.onerror = null;
  icon.style.display = '';
  bookmarkItem.classList.add('has-screenshot');
}

// When the background captures a screenshot while this page is open, update the tile immediately
browser.runtime.onMessage.addListener((message) => {
  if (message.type !== 'screenshot-captured') return;
  const item = bookmarksContainer.querySelector(`[data-url="${CSS.escape(message.url)}"]`);
  if (!item) return;
  const icon = item.querySelector('.bookmark-icon');
  if (!icon) return;
  ScreenshotDB.get(message.url).then(dataUrl => {
    if (dataUrl) applyScreenshot(item, icon, dataUrl);
  }).catch(() => {});
});

// Drag-drop state
let dragState = null; // { type: 'bookmark', folderIndex, bookmarkIndex }

// Page tab drag-to-reorder state
let tabDragFromIndex = null;

// Free-floating folder drag state
let folderMoveState = null; // { folderDiv, folderName, startMouseX, startMouseY, startLeft, startTop }

// Folder resize state
let folderResizeState = null; // { folderDiv, folderName, startMouseX, startMouseY, startW, startH }

function ddLog(event, data) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[DnD ${ts}] ${event}`, data || '');
}

async function moveBookmark(srcFolderIdx, srcBmIdx, dstFolderIdx, dstBmIdx, insertBefore) {
  console.group('[DnD] moveBookmark');
  ddLog('called', { srcFolderIdx, srcBmIdx, dstFolderIdx, dstBmIdx, insertBefore });
  try {
    const config = await getConfig();
    const folders = getActivePage(config).folders;
    const srcFolder = folders[srcFolderIdx];
    const dstFolder = folders[dstFolderIdx];
    ddLog('config before', {
      srcFolderName: srcFolder?.name,
      srcBookmarks: srcFolder?.bookmarks?.map(b => b.title),
      dstFolderName: dstFolder?.name,
      dstBookmarks: dstFolder?.bookmarks?.map(b => b.title),
    });
    if (!srcFolder) { console.error('[DnD] srcFolder not found at index', srcFolderIdx); console.groupEnd(); return; }
    if (!dstFolder) { console.error('[DnD] dstFolder not found at index', dstFolderIdx); console.groupEnd(); return; }
    const [bm] = srcFolder.bookmarks.splice(srcBmIdx, 1);
    ddLog('spliced bookmark', bm);
    let insertIdx = dstBmIdx;
    if (srcFolderIdx === dstFolderIdx && srcBmIdx < dstBmIdx) insertIdx--;
    if (!insertBefore) insertIdx++;
    insertIdx = Math.max(0, Math.min(insertIdx, dstFolder.bookmarks.length));
    ddLog('inserting at index', insertIdx);
    dstFolder.bookmarks.splice(insertIdx, 0, bm);
    const now = Date.now();
    srcFolder.lastModified = now;
    dstFolder.lastModified = now;
    ddLog('config after', {
      srcBookmarks: srcFolder.bookmarks.map(b => b.title),
      dstBookmarks: dstFolder.bookmarks.map(b => b.title),
    });
    await applyLocalChange(config, currentPageId);
    ddLog('local change applied');
  } catch (error) {
    console.error('[DnD] moveBookmark error', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
  console.groupEnd();
}

async function moveBookmarkToFolder(srcFolderIdx, srcBmIdx, dstFolderIdx) {
  console.group('[DnD] moveBookmarkToFolder');
  ddLog('called', { srcFolderIdx, srcBmIdx, dstFolderIdx });
  try {
    const config = await getConfig();
    const folders = getActivePage(config).folders;
    const srcFolder = folders[srcFolderIdx];
    const dstFolder = folders[dstFolderIdx];
    ddLog('config before', {
      srcFolderName: srcFolder?.name,
      srcBookmarks: srcFolder?.bookmarks?.map(b => b.title),
      dstFolderName: dstFolder?.name,
      dstBookmarks: dstFolder?.bookmarks?.map(b => b.title),
    });
    if (!srcFolder) { console.error('[DnD] srcFolder not found at index', srcFolderIdx); console.groupEnd(); return; }
    if (!dstFolder) { console.error('[DnD] dstFolder not found at index', dstFolderIdx); console.groupEnd(); return; }
    const [bm] = srcFolder.bookmarks.splice(srcBmIdx, 1);
    ddLog('spliced bookmark', bm);
    dstFolder.bookmarks = dstFolder.bookmarks || [];
    dstFolder.bookmarks.push(bm);
    const now = Date.now();
    srcFolder.lastModified = now;
    dstFolder.lastModified = now;
    ddLog('config after', {
      srcBookmarks: srcFolder.bookmarks.map(b => b.title),
      dstBookmarks: dstFolder.bookmarks.map(b => b.title),
    });
    await applyLocalChange(config, currentPageId);
    ddLog('local change applied');
  } catch (error) {
    console.error('[DnD] moveBookmarkToFolder error', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
  console.groupEnd();
}

async function reorderFolder(srcIdx, dstIdx, insertBefore) {
  console.group('[DnD] reorderFolder');
  ddLog('called', { srcIdx, dstIdx, insertBefore });
  try {
    const config = await getConfig();
    const folders = getActivePage(config).folders;
    ddLog('folders before', folders.map(f => f.name));
    const [folder] = folders.splice(srcIdx, 1);
    ddLog('spliced folder', folder.name);
    let insertIdx = dstIdx;
    if (srcIdx < dstIdx) insertIdx--;
    if (!insertBefore) insertIdx++;
    insertIdx = Math.max(0, Math.min(insertIdx, folders.length));
    ddLog('inserting at index', insertIdx);
    folders.splice(insertIdx, 0, folder);
    folder.lastModified = Date.now();
    ddLog('folders after', folders.map(f => f.name));
    await applyLocalChange(config, currentPageId);
    ddLog('local change applied');
  } catch (error) {
    console.error('[DnD] reorderFolder error', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
  console.groupEnd();
}

function showContextMenu(x, y, target) {
  ctxTarget = target;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  ctxAddLink.classList.toggle('hidden', target.type !== 'folder');
  ctxShrinkToFit.classList.toggle('hidden', target.type !== 'folder');
  ctxMovePage.classList.toggle('hidden', target.type !== 'folder');
  ctxRemove.classList.toggle('hidden', target.type !== 'bookmark');
  ctxRefreshScreenshot.classList.toggle('hidden', target.type !== 'bookmark');
  ctxEdit.classList.remove('hidden');
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  ctxPageSubmenu.classList.add('hidden');
  ctxTarget = null;
}

async function moveFolderToPage(folderName, targetPageId) {
  try {
    const config = await getConfig();
    const srcPage = getActivePage(config);
    const folderIdx = srcPage.folders.findIndex(f => f.name === folderName);
    if (folderIdx === -1) return;
    const dstPage = config.pages.find(p => p.id === targetPageId);
    if (!dstPage) return;
    const [folder] = srcPage.folders.splice(folderIdx, 1);
    dstPage.folders = dstPage.folders || [];
    folder.lastModified = Date.now();
    dstPage.folders.push(folder);
    // Add a tombstone on the source page so other machines remove the folder there.
    srcPage.folderTombstones = srcPage.folderTombstones || [];
    srcPage.folderTombstones.push({ name: folder.name, deletedAt: Date.now() });
    await applyLocalChange(config, [currentPageId, targetPageId]);
    showStatus(`Folder moved to "${dstPage.name}"`, 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  }
}

ctxMovePage.addEventListener('mouseenter', () => {
  if (!ctxTarget || ctxTarget.type !== 'folder' || !currentConfig) return;
  ctxPageSubmenuList.innerHTML = '';
  currentConfig.pages.forEach(page => {
    const li = document.createElement('li');
    li.className = 'ctx-page-option' + (page.id === currentPageId ? ' current-page' : '');
    li.textContent = page.id === currentPageId ? `${page.name} (current)` : page.name;
    if (page.id !== currentPageId) {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderName = ctxTarget.folderName;
        const targetPageId = page.id;
        hideContextMenu();
        moveFolderToPage(folderName, targetPageId);
      });
    }
    ctxPageSubmenuList.appendChild(li);
  });

  const rect = ctxMovePage.getBoundingClientRect();
  ctxPageSubmenu.style.top = `${rect.top}px`;
  ctxPageSubmenu.style.left = `${rect.right + 4}px`;
  ctxPageSubmenu.classList.remove('hidden');
});

ctxMovePage.addEventListener('mouseleave', (e) => {
  if (!ctxPageSubmenu.contains(e.relatedTarget)) {
    ctxPageSubmenu.classList.add('hidden');
  }
});

ctxPageSubmenu.addEventListener('mouseleave', (e) => {
  if (e.relatedTarget !== ctxMovePage) {
    ctxPageSubmenu.classList.add('hidden');
  }
});

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

ctxShrinkToFit.addEventListener('click', async () => {
  if (!ctxTarget) return;
  const { folderName, folderDiv } = ctxTarget;
  hideContextMenu();
  try {
    const config = await getConfig();
    const activePage = getActivePage(config);
    const cfgFolder = activePage.folders.find(f => f.name === folderName);
    if (!cfgFolder || !folderDiv) return;

    const folderBody = folderDiv.querySelector('.folder-body');
    const items = folderDiv.querySelectorAll('.bookmark');

    if (items.length > 0 && folderBody) {
      const folderRect = folderDiv.getBoundingClientRect();
      const bodyStyle = getComputedStyle(folderBody);
      const padRight = parseFloat(bodyStyle.paddingRight);
      const padBottom = parseFloat(bodyStyle.paddingBottom);

      let maxRight = 0;
      let maxBottom = 0;
      for (const item of items) {
        const r = item.getBoundingClientRect();
        maxRight = Math.max(maxRight, r.right - folderRect.left);
        maxBottom = Math.max(maxBottom, r.bottom - folderRect.top);
      }

      const newW = Math.ceil(maxRight + padRight);
      const newH = Math.ceil(maxBottom + padBottom);

      cfgFolder.rw = newW;
      cfgFolder.rh = newH;
      cfgFolder.lastModified = Date.now();
      await applyLocalChange(config, currentPageId);

      folderDiv.style.width = `${newW}px`;
      folderDiv.style.height = `${newH}px`;
      folderDiv.classList.add('has-explicit-size');
    } else {
      delete cfgFolder.rw;
      delete cfgFolder.rh;
      cfgFolder.lastModified = Date.now();
      await applyLocalChange(config, currentPageId);
      folderDiv.style.removeProperty('width');
      folderDiv.style.removeProperty('height');
      folderDiv.classList.remove('has-explicit-size');
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  }
});

ctxAddLink.addEventListener('click', async () => {
  if (!ctxTarget) return;
  const { folderName } = ctxTarget;
  hideContextMenu();
  await openAddModal(folderName);
});

ctxRemove.addEventListener('click', async () => {
  if (!ctxTarget) return;
  const { folderName, bookmarkUrl } = ctxTarget;
  hideContextMenu();

  try {
    const config = await getConfig();
    const activePage = getActivePage(config);
    const folder = activePage.folders.find(f => f.name === folderName);
    if (folder) {
      const now = Date.now();
      folder.bookmarkTombstones = folder.bookmarkTombstones || [];
      folder.bookmarkTombstones.push({ url: bookmarkUrl, deletedAt: now });
      folder.bookmarks = folder.bookmarks.filter(b => b.url !== bookmarkUrl);
      folder.lastModified = now;
      if (folder.bookmarks.length === 0) {
        activePage.folderTombstones = activePage.folderTombstones || [];
        activePage.folderTombstones.push({ name: folderName, deletedAt: now });
        activePage.folders = activePage.folders.filter(f => f.name !== folderName);
      }
    }
    await applyLocalChange(config, currentPageId);
    showStatus('Bookmark removed!', 'success');
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
});

ctxEdit.addEventListener('click', () => {
  if (!ctxTarget) return;
  const target = ctxTarget;
  hideContextMenu();
  openEditModal(target);
});

ctxRefreshScreenshot.addEventListener('click', () => {
  if (!ctxTarget) return;
  const { bookmarkUrl } = ctxTarget;
  hideContextMenu();
  browser.runtime.sendMessage({ type: 'force-capture', url: bookmarkUrl });
  showStatus('Opening page to capture screenshot…', 'success');
});

// Modal elements
const addModal = document.getElementById('add-modal');
const bmTitle = document.getElementById('bm-title');
const bmUrl = document.getElementById('bm-url');
const bmFolder = document.getElementById('bm-folder');
const newFolderGroup = document.getElementById('new-folder-group');
const bmNewFolder = document.getElementById('bm-new-folder');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalStatus = document.getElementById('modal-status');

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

const FOLDER_DEFAULT_COLS = 3;
const FOLDER_DEFAULT_COL_W = 380;
const FOLDER_DEFAULT_ROW_H = 300;

// Render page tabs and the "+" add-page button
function renderPageTabs(config) {
  pageTabs.innerHTML = '';
  if (!config || !config.pages) return;

  config.pages.forEach((page, pageIndex) => {
    const tab = document.createElement('button');
    tab.className = 'page-tab' + (page.id === currentPageId ? ' active' : '');
    tab.draggable = true;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = page.name;
    nameSpan.title = 'Double-click to rename';
    tab.appendChild(nameSpan);

    // Delete button — only shown when more than one page exists
    if (config.pages.length > 1) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'page-tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Delete page';
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete page "${page.name}"? All its folders and bookmarks will be removed.`)) return;
        const cfg = await getConfig();
        cfg.pages = cfg.pages.filter(p => p.id !== page.id);
        if (currentPageId === page.id) setActivePage(cfg.pages[0].id);
        await applyLocalChange(cfg, null); // index-only change
      });
      tab.appendChild(closeBtn);
    }

    tab.addEventListener('click', async () => {
      if (page.id === currentPageId) return;
      setActivePage(page.id);
      const cfg = await getConfig();
      await renderBookmarks(cfg);
    });

    // Double-click tab name to rename
    nameSpan.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      const newName = prompt('Rename page:', page.name);
      if (!newName || newName.trim() === page.name) return;
      const cfg = await getConfig();
      const p = cfg.pages.find(pg => pg.id === page.id);
      if (p) {
        p.name = newName.trim();
        await applyLocalChange(cfg, null); // index-only change
      }
    });

    // Drag-to-reorder tab events
    tab.addEventListener('dragstart', (e) => {
      tabDragFromIndex = pageIndex;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => tab.classList.add('tab-dragging'));
    });

    tab.addEventListener('dragend', () => {
      tabDragFromIndex = null;
      tab.classList.remove('tab-dragging');
      document.querySelectorAll('.page-tab.tab-drag-over-before, .page-tab.tab-drag-over-after')
        .forEach(el => el.classList.remove('tab-drag-over-before', 'tab-drag-over-after'));
    });

    tab.addEventListener('dragover', (e) => {
      if (tabDragFromIndex === null || tabDragFromIndex === pageIndex) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = tab.getBoundingClientRect();
      tab.classList.remove('tab-drag-over-before', 'tab-drag-over-after');
      tab.classList.add(e.clientX < rect.left + rect.width / 2 ? 'tab-drag-over-before' : 'tab-drag-over-after');
    });

    tab.addEventListener('dragleave', (e) => {
      if (!tab.contains(e.relatedTarget)) {
        tab.classList.remove('tab-drag-over-before', 'tab-drag-over-after');
      }
    });

    tab.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      tab.classList.remove('tab-drag-over-before', 'tab-drag-over-after');
      if (tabDragFromIndex === null || tabDragFromIndex === pageIndex) return;
      const rect = tab.getBoundingClientRect();
      const insertBefore = e.clientX < rect.left + rect.width / 2;
      const cfg = await getConfig();
      const [moved] = cfg.pages.splice(tabDragFromIndex, 1);
      let insertIdx = pageIndex;
      if (tabDragFromIndex < pageIndex) insertIdx--;
      if (!insertBefore) insertIdx++;
      insertIdx = Math.max(0, Math.min(insertIdx, cfg.pages.length));
      cfg.pages.splice(insertIdx, 0, moved);
      tabDragFromIndex = null;
      await applyLocalChange(cfg, null); // index-only change
    });

    pageTabs.appendChild(tab);
  });

  const addPageBtn = document.createElement('button');
  addPageBtn.className = 'page-add-btn';
  addPageBtn.textContent = '+';
  addPageBtn.title = 'Add new page';
  addPageBtn.addEventListener('click', async () => {
    const cfg = await getConfig();
    const name = prompt('New page name:', 'Page ' + (cfg.pages.length + 1));
    if (!name || !name.trim()) return;
    const id = 'page-' + Date.now();
    cfg.pages.push({ id, name: name.trim(), folders: [], lastModified: Date.now(), folderTombstones: [] });
    setActivePage(id);
    await applyLocalChange(cfg, id); // new page file + index
  });
  pageTabs.appendChild(addPageBtn);
}

// Render bookmarks for the active page
async function renderBookmarks(config) {
  renderPageTabs(config);

  // Pre-load all screenshots before touching the DOM to avoid flash
  const screenshotMap = new Map();
  const activePage = getActivePage(config);
  const folders = (activePage && activePage.folders) || [];

  if (folders.length > 0) {
    const urls = folders.flatMap(f => (f.bookmarks || []).map(b => b.url));
    await Promise.all(urls.map(url =>
      ScreenshotDB.get(url).then(dataUrl => { if (dataUrl) screenshotMap.set(url, dataUrl); }).catch(() => {})
    ));
  }

  bookmarksContainer.innerHTML = '';

  if (!config || !config.pages || folders.length === 0) {
    noConfigDiv.classList.remove('hidden');
    bookmarksContainer.classList.add('hidden');
    return;
  }

  noConfigDiv.classList.add('hidden');
  bookmarksContainer.classList.remove('hidden');

  folders.forEach((folder, fi) => {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';
    if (folder.width) folderDiv.style.minWidth = `${folder.width}px`;
    if (folder.minHeight) folderDiv.style.minHeight = `${folder.minHeight}px`;

    // Position: use saved x/y or fall back to a simple grid default
    const defaultX = (fi % FOLDER_DEFAULT_COLS) * FOLDER_DEFAULT_COL_W + 10;
    const defaultY = Math.floor(fi / FOLDER_DEFAULT_COLS) * FOLDER_DEFAULT_ROW_H + 10;
    folderDiv.style.left = `${folder.x !== undefined ? folder.x : defaultX}px`;
    folderDiv.style.top = `${folder.y !== undefined ? folder.y : defaultY}px`;

    // Explicit resize dimensions
    if (folder.rw || folder.rh) {
      if (folder.rw) folderDiv.style.width = `${folder.rw}px`;
      if (folder.rh) folderDiv.style.height = `${folder.rh}px`;
      folderDiv.classList.add('has-explicit-size');
    }

    if (folder.collapsed) folderDiv.classList.add('collapsed');

    // --- Titlebar (drag handle + title + collapse button) ---
    const titlebar = document.createElement('div');
    titlebar.className = 'folder-titlebar';

    const titleIcon = document.createElement('span');
    titleIcon.className = 'folder-title-icon';
    const resolvedIcon = folder.icon !== undefined ? folder.icon : currentDefaultFolderIcon;
    titleIcon.textContent = resolvedIcon;
    if (!resolvedIcon) titleIcon.style.display = 'none';

    const titleText = document.createElement('span');
    titleText.className = 'folder-title-text';
    titleText.textContent = folder.name;

    const titlebarControls = document.createElement('div');
    titlebarControls.className = 'folder-titlebar-controls';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'folder-collapse-btn';
    collapseBtn.textContent = folder.collapsed ? '+' : '−';
    collapseBtn.title = folder.collapsed ? 'Expand' : 'Collapse';

    collapseBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    collapseBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const config = await getConfig();
      const activePage = getActivePage(config);
      const cfgFolder = activePage.folders.find(f => f.name === folder.name);
      if (cfgFolder) {
        cfgFolder.collapsed = !cfgFolder.collapsed;
        cfgFolder.lastModified = Date.now();
        await applyLocalChange(config, currentPageId);
      }
    });

    titlebarControls.appendChild(collapseBtn);
    titlebar.appendChild(titleIcon);
    titlebar.appendChild(titleText);
    titlebar.appendChild(titlebarControls);

    titlebar.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      // Fix the folder's width before dragging so CSS doesn't auto-constrain it
      // to the remaining container space as it approaches the right edge.
      if (!folderDiv.classList.contains('has-explicit-size')) {
        // Lock to pixels so the folder width doesn't change as left shifts during drag.
        // CSS width:max-content ensures getBoundingClientRect gives the unconstrained width.
        folderDiv.style.width = `${Math.ceil(folderDiv.getBoundingClientRect().width)}px`;
      }
      const containerRect = bookmarksContainer.getBoundingClientRect();
      const folderRect = folderDiv.getBoundingClientRect();
      folderMoveState = {
        folderDiv,
        folderName: folder.name,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLeft: folderRect.left - containerRect.left,
        startTop: folderRect.top - containerRect.top,
      };
      folderDiv.classList.add('is-moving');
    });

    titlebar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, { type: 'folder', folderName: folder.name, folderDiv });
    });

    titlebar.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'bookmark' || dragState.folderIndex === fi) return;
      e.preventDefault();
      e.stopPropagation();
      titlebar.classList.add('drag-over');
    });

    titlebar.addEventListener('dragleave', () => {
      titlebar.classList.remove('drag-over');
    });

    titlebar.addEventListener('drop', (e) => {
      ddLog('titlebar drop', { dstFi: fi, folderName: folder.name, dragState });
      titlebar.classList.remove('drag-over');
      if (!dragState || dragState.type !== 'bookmark' || dragState.folderIndex === fi) {
        ddLog('titlebar drop IGNORED', { reason: !dragState ? 'no dragState' : dragState.type !== 'bookmark' ? `wrong type: ${dragState.type}` : 'same folder' });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const { folderIndex: srcFi, bookmarkIndex: srcBi } = dragState;
      dragState = null;
      ddLog('titlebar drop ACCEPTED', { srcFi, srcBi, dstFi: fi });
      moveBookmarkToFolder(srcFi, srcBi, fi);
    });

    // --- Folder body (collapsible) ---
    const folderBody = document.createElement('div');
    folderBody.className = 'folder-body';

    // --- Bookmarks grid ---
    const bookmarksList = document.createElement('ul');
    bookmarksList.className = 'bookmarks-list';

    bookmarksList.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'bookmark') return;
      if (e.target !== bookmarksList) return;
      e.preventDefault();
      bookmarksList.classList.add('drag-over');
    });

    bookmarksList.addEventListener('dragleave', (e) => {
      if (!bookmarksList.contains(e.relatedTarget)) {
        bookmarksList.classList.remove('drag-over');
      }
    });

    bookmarksList.addEventListener('drop', (e) => {
      ddLog('bookmarksList drop', { dstFi: fi, folderName: folder.name, target: e.target.className, dragState });
      bookmarksList.classList.remove('drag-over');
      if (!dragState || dragState.type !== 'bookmark') {
        ddLog('bookmarksList drop IGNORED', { reason: !dragState ? 'no dragState' : `wrong type: ${dragState.type}` });
        return;
      }
      if (e.target !== bookmarksList) {
        ddLog('bookmarksList drop IGNORED (target is child, not list itself)', e.target.className);
        return;
      }
      e.preventDefault();
      const { folderIndex: srcFi, bookmarkIndex: srcBi } = dragState;
      dragState = null;
      ddLog('bookmarksList drop ACCEPTED', { srcFi, srcBi, dstFi: fi });
      moveBookmarkToFolder(srcFi, srcBi, fi);
    });

    if (folder.bookmarks && folder.bookmarks.length > 0) {
      folder.bookmarks.forEach((bookmark, bi) => {
        const bookmarkItem = document.createElement('li');
        bookmarkItem.className = 'bookmark';
        bookmarkItem.draggable = true;
        if (bookmark.width) bookmarkItem.style.setProperty('--bm-width', `${bookmark.width}px`);
        if (bookmark.height) bookmarkItem.style.setProperty('--bm-height', `${bookmark.height}px`);

        // --- Bookmark drag events ---
        bookmarkItem.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          dragState = { type: 'bookmark', folderIndex: fi, bookmarkIndex: bi };
          ddLog('bookmark dragstart', { fi, bi, title: bookmark.title });
          e.dataTransfer.effectAllowed = 'move';
          document.body.classList.add('is-dragging');
          requestAnimationFrame(() => bookmarkItem.classList.add('dragging'));
        });

        bookmarkItem.addEventListener('dragend', () => {
          ddLog('bookmark dragend', { fi, bi, title: bookmark.title, dragStateAtEnd: dragState });
          bookmarkItem.classList.remove('dragging', 'drag-over-before', 'drag-over-after');
          document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
          document.body.classList.remove('is-dragging');
          dragState = null;
        });

        bookmarkItem.addEventListener('dragover', (e) => {
          if (!dragState || dragState.type !== 'bookmark') return;
          if (dragState.folderIndex === fi && dragState.bookmarkIndex === bi) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = bookmarkItem.getBoundingClientRect();
          bookmarkItem.classList.remove('drag-over-before', 'drag-over-after');
          bookmarkItem.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drag-over-before' : 'drag-over-after');
        });

        bookmarkItem.addEventListener('dragleave', (e) => {
          if (!bookmarkItem.contains(e.relatedTarget)) {
            bookmarkItem.classList.remove('drag-over-before', 'drag-over-after');
          }
        });

        bookmarkItem.addEventListener('drop', (e) => {
          ddLog('bookmark drop on tile', { dstFi: fi, dstBi: bi, title: bookmark.title, dragState });
          bookmarkItem.classList.remove('drag-over-before', 'drag-over-after');
          if (!dragState || dragState.type !== 'bookmark') {
            ddLog('bookmark drop IGNORED', { reason: !dragState ? 'no dragState' : `wrong type: ${dragState.type}` });
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (dragState.folderIndex === fi && dragState.bookmarkIndex === bi) {
            ddLog('bookmark drop IGNORED (same tile)');
            return;
          }
          const rect = bookmarkItem.getBoundingClientRect();
          const insertBefore = e.clientX < rect.left + rect.width / 2;
          const { folderIndex: srcFi, bookmarkIndex: srcBi } = dragState;
          dragState = null;
          ddLog('bookmark drop ACCEPTED', { srcFi, srcBi, dstFi: fi, dstBi: bi, insertBefore });
          moveBookmark(srcFi, srcBi, fi, bi, insertBefore);
        });

        const link = document.createElement('a');
        link.href = bookmark.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.draggable = false;

        const icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        icon.src = getFaviconUrl(bookmark.url);
        icon.alt = '';
        icon.draggable = false;
        icon.onerror = () => { icon.style.display = 'none'; };

        bookmarkItem.dataset.url = bookmark.url;
        const screenshotDataUrl = screenshotMap.get(bookmark.url);
        if (screenshotDataUrl) applyScreenshot(bookmarkItem, icon, screenshotDataUrl);

        const title = document.createElement('span');
        title.className = 'bookmark-title';
        title.textContent = bookmark.title;

        link.appendChild(icon);
        link.appendChild(title);
        bookmarkItem.appendChild(link);

        bookmarkItem.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, { type: 'bookmark', folderName: folder.name, bookmarkUrl: bookmark.url });
        });

        bookmarksList.appendChild(bookmarkItem);
      });
    }

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'folder-resize-handle';
    resizeHandle.title = 'Drag to resize folder';
    resizeHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      folderResizeState = {
        folderDiv,
        folderName: folder.name,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startW: folderDiv.offsetWidth,
        startH: folderDiv.offsetHeight,
      };
      folderDiv.classList.add('is-resizing');
    });

    folderBody.appendChild(bookmarksList);

    folderDiv.appendChild(titlebar);
    folderDiv.appendChild(folderBody);
    folderDiv.appendChild(resizeHandle);
    bookmarksContainer.appendChild(folderDiv);
  });
}

// Extract all bookmark URLs from a config (used for screenshot sync)
function getAllBookmarkUrls(config) {
  if (!config || !config.pages) return [];
  return config.pages.flatMap(p => (p.folders || []).flatMap(f => (f.bookmarks || []).map(b => b.url)));
}

// Apply appearance CSS vars from a settings object (extracted so it can be
// called after remote settings are applied mid-load).
function applyStyleSettings(s) {
  const root = document.documentElement.style;
  const scale = (s.bookmarkScale || 100) / 100;
  root.setProperty('--screenshot-height', `${Math.round((s.screenshotHeight || 100) * scale)}px`);
  root.setProperty('--folder-padding', `${s.folderPadding}px`);
  root.setProperty('--bookmark-icon-size', `${Math.round((s.bookmarkIconSize || 28) * scale)}px`);
  if (s.defaultFolderMinWidth) root.setProperty('--default-folder-min-width', `${s.defaultFolderMinWidth}px`);
  if (s.defaultFolderMinHeight) root.setProperty('--default-folder-min-height', `${s.defaultFolderMinHeight}px`);
  root.setProperty('--default-bm-width', `${Math.round((s.defaultBmWidth || 80) * scale)}px`);
  root.setProperty('--default-bm-height', `${Math.round((s.defaultBmHeight || 80) * scale)}px`);
  if (s.folderTitleFont) root.setProperty('--folder-title-font-family', s.folderTitleFont);
  root.setProperty('--folder-title-font-size', `${s.folderTitleFontSize || 13}px`);
  if (s.bookmarkTitleFont) root.setProperty('--bookmark-title-font-family', s.bookmarkTitleFont);
  root.setProperty('--bookmark-title-font-size', `${s.bookmarkTitleFontSize || 10}px`);
  const bgTheme = s.bgTheme || 'purple';
  if (!bgTheme.startsWith('imported:')) {
    applyBackground(s);
    root.setProperty('--navbar-color1', s.navbarColor1 || '#3a1a6e');
    root.setProperty('--navbar-color2', s.navbarColor2 || '#2d1157');
    root.setProperty('--navbar-text-color', s.navbarTextColor || '#ffffff');
    root.setProperty('--folder-titlebar-color1', s.folderTitlebarColor1 || '#667eea');
    root.setProperty('--folder-titlebar-color2', s.folderTitlebarColor2 || '#764ba2');
    root.setProperty('--folder-bg', s.folderBgColor || '#ffffff');
    root.setProperty('--folder-text-color', s.folderTextColor || '#4a5568');
    root.setProperty('--folder-text-hover-color', s.folderTitlebarColor1 || '#667eea');
    root.setProperty('--folder-title-color', s.folderTitleColor || '#ffffff');
  }
}

// Pull config from GitHub, merge with local state, and re-render if anything changed.
// For v2 configs, dirty pages (local unpushed changes) are preserved during merge.
// For v1 configs, local changes are preserved if pendingSync is set.
async function refreshFromGitHub() {
  try {
    const remote = await githubSync.fetchConfig();
    if (!remote) return;

    const isV2 = remote._schemaVersion === 2 && !remote._migratingFromV1;
    const remoteSha = remote._remoteSha;
    delete remote._remoteSha;
    delete remote._schemaVersion;
    delete remote._migratingFromV1;

    if (!isV2) {
      // v1: protect local uncommitted changes from being overwritten.
      if (localStorage.getItem('pendingSync')) return;

      const lastPushedSha = localStorage.getItem('lastPushedSha');
      if (remoteSha && lastPushedSha && remoteSha === lastPushedSha) {
        console.log('[Sync] background refresh: remote SHA matches last push, skipping');
        return;
      }
      if (remoteSha) localStorage.setItem('lastPushedSha', remoteSha);

      ensurePages(remote);
      if (currentConfig && JSON.stringify(remote.pages) === JSON.stringify(currentConfig.pages)) return;
      currentConfig = remote;
      await BookmarkDB.put(remote);
      browser.storage.local.set({ cachedBookmarks: remote }).catch(() => {});
      if (remote.appSettings) {
        await githubSync.applyRemoteSettings(remote.appSettings).catch(() => {});
        const merged = await githubSync.loadSettings();
        currentDefaultFolderIcon = merged.defaultFolderIcon !== undefined ? merged.defaultFolderIcon : '📁';
        applyStyleSettings(merged);
      }
      await renderBookmarks(remote);
      const urls = getAllBookmarkUrls(remote);
      if (urls.length > 0) githubSync.syncScreenshots(urls).catch(() => {});
      console.log('[Sync] background refresh applied v1 config from GitHub');
      return;
    }

    // v2: per-page merge. Dirty pages keep their local version; clean pages are merged.
    const dirtyPageIds = getDirtyPageIds();
    const localPageMap = new Map((currentConfig?.pages || []).map(p => [p.id, p]));
    const remotePageMap = new Map(remote.pages.map(p => [p.id, p]));

    const mergedPages = [];
    for (const [id, remotePage] of remotePageMap) {
      if (dirtyPageIds.has(id)) {
        // Keep local version — it has unpushed edits.
        mergedPages.push(localPageMap.get(id) || remotePage);
      } else {
        const localPage = localPageMap.get(id);
        mergedPages.push(localPage ? githubSync.mergePageConfig(localPage, remotePage) : remotePage);
      }
    }
    // Append pages that only exist locally (new pages not yet pushed).
    for (const [id, localPage] of localPageMap) {
      if (!remotePageMap.has(id)) mergedPages.push(localPage);
    }

    // Strip internal _sha fields for comparison to avoid false positives.
    const strip = pages => JSON.stringify(pages.map(({ _sha, ...rest }) => rest));
    if (currentConfig && strip(mergedPages) === strip(currentConfig.pages)) return;

    const mergedConfig = { ...remote, pages: mergedPages };
    currentConfig = mergedConfig;
    await BookmarkDB.put(mergedConfig);
    browser.storage.local.set({ cachedBookmarks: mergedConfig }).catch(() => {});

    if (remote.appSettings) {
      await githubSync.applyRemoteSettings(remote.appSettings).catch(() => {});
      const settings = await githubSync.loadSettings();
      currentDefaultFolderIcon = settings.defaultFolderIcon !== undefined ? settings.defaultFolderIcon : '📁';
      applyStyleSettings(settings);
    }
    await renderBookmarks(mergedConfig);
    const urls = getAllBookmarkUrls(mergedConfig);
    if (urls.length > 0) githubSync.syncScreenshots(urls).catch(() => {});
    console.log('[Sync] background refresh: merged v2 config from GitHub');
  } catch (e) {
    console.warn('[Sync] background refresh failed', e);
  }
}

// Load and display bookmarks
async function loadBookmarks() {
  try {
    // Try local DB first (fast, no network)
    let config = await BookmarkDB.get();

    if (!config) {
      // No local data — fetch from GitHub and seed the local DB
      config = await githubSync.fetchConfig();
      await BookmarkDB.put(config);
      browser.storage.local.set({ cachedBookmarks: config }).catch(() => {});

      // Apply appearance settings embedded by the source machine, then download
      // any screenshots that were synced to GitHub but aren't local yet.
      if (config.appSettings) {
        await githubSync.applyRemoteSettings(config.appSettings).catch(() => {});
        const merged = await githubSync.loadSettings();
        currentDefaultFolderIcon = merged.defaultFolderIcon !== undefined ? merged.defaultFolderIcon : '📁';
        applyStyleSettings(merged);
      }
      const urls = getAllBookmarkUrls(config);
      if (urls.length > 0) {
        githubSync.syncScreenshots(urls).catch(e => console.warn('[Sync] screenshot download failed', e));
      }
    } else {
      // Local cache exists — render immediately, then merge from GitHub in the background.
      // refreshFromGitHub handles dirty-page protection internally (v2) or pendingSync (v1).
      ensurePages(config);
      currentConfig = config;
      await renderBookmarks(config);
      refreshFromGitHub();
      return;
    }

    ensurePages(config);
    currentConfig = config;
    await renderBookmarks(config);
  } catch (error) {
    console.error('Error loading bookmarks:', error);

    // Migrate legacy cachedBookmarks into BookmarkDB on first run
    const result = await browser.storage.local.get('cachedBookmarks').catch(() => ({}));
    const cached = result.cachedBookmarks || null;
    if (cached) {
      ensurePages(cached);
      currentConfig = cached;
      await renderBookmarks(cached);
      await BookmarkDB.put(cached).catch(() => {});
    } else {
      noConfigDiv.classList.remove('hidden');
      bookmarksContainer.classList.add('hidden');
    }
  }
}

// Modal helpers
async function openAddModal(preselectFolder = null) {
  bmTitle.value = '';
  bmUrl.value = '';
  bmNewFolder.value = '';
  modalStatus.className = 'modal-status hidden';
  modalStatus.textContent = '';
  modalSaveBtn.disabled = false;

  addModal.classList.remove('hidden');

  let folders = [];
  try {
    const config = await getConfig();
    const activePage = getActivePage(config);
    folders = (activePage && activePage.folders) || [];
  } catch (e) {
    // no folders yet
  }

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

  if (preselectFolder) bmFolder.value = preselectFolder;
  newFolderGroup.classList.toggle('hidden', bmFolder.value !== '__new__');
  bmTitle.focus();
}

function closeAddModal() {
  addModal.classList.add('hidden');
}

const FOLDER_ICONS = ['📁', '📂', '🗂️', '📋', '📌', '⭐', '🔖', '💼', '🎯', '🔥', '❤️', '🌟', '✅', '🚀', '🎮', '📚', '🎵', '🎨', '🏠', '🛠️'];
let currentDefaultFolderIcon = '📁';

function buildIconPicker(container, selectedValue, onChange) {
  container.innerHTML = '';
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className = 'icon-picker-btn' + (selectedValue === '' ? ' active' : '');
  noneBtn.textContent = '∅';
  noneBtn.title = 'No icon';
  noneBtn.addEventListener('click', () => {
    container.querySelectorAll('.icon-picker-btn').forEach(b => b.classList.remove('active'));
    noneBtn.classList.add('active');
    onChange('');
  });
  container.appendChild(noneBtn);
  for (const icon of FOLDER_ICONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-btn' + (selectedValue === icon ? ' active' : '');
    btn.textContent = icon;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.icon-picker-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(icon);
    });
    container.appendChild(btn);
  }
}

// Edit modal elements
const editModal = document.getElementById('edit-modal');
const editModalTitle = document.getElementById('edit-modal-title');
const editFolderNameGroup = document.getElementById('edit-folder-name-group');
const editFolderNameInput = document.getElementById('edit-folder-name');
const editBmTitleGroup = document.getElementById('edit-bm-title-group');
const editBmTitleInput = document.getElementById('edit-bm-title');
const editBmUrlGroup = document.getElementById('edit-bm-url-group');
const editBmUrlInput = document.getElementById('edit-bm-url');
const editFolderWidthGroup = document.getElementById('edit-folder-width-group');
const editFolderWidthInput = document.getElementById('edit-folder-width');
const editFolderMinHeightGroup = document.getElementById('edit-folder-min-height-group');
const editFolderMinHeightInput = document.getElementById('edit-folder-min-height');
const editFolderIconGroup = document.getElementById('edit-folder-icon-group');
const editFolderIconPicker = document.getElementById('edit-folder-icon-picker');
const editBmWidthGroup = document.getElementById('edit-bm-width-group');
const editBmWidthInput = document.getElementById('edit-bm-width');
const editBmHeightGroup = document.getElementById('edit-bm-height-group');
const editBmHeightInput = document.getElementById('edit-bm-height');
const editModalSaveBtn = document.getElementById('edit-modal-save-btn');
const editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
const editModalStatus = document.getElementById('edit-modal-status');

let editTarget = null;
let editFolderIconValue = '📁';

function openEditModal(target) {
  editTarget = target;
  editModalStatus.className = 'modal-status hidden';
  editModalStatus.textContent = '';
  editModalSaveBtn.disabled = false;
  editModalSaveBtn.textContent = 'Save';

  if (target.type === 'folder') {
    editModalTitle.textContent = 'Edit Folder';
    editFolderNameGroup.classList.remove('hidden');
    editFolderWidthGroup.classList.remove('hidden');
    editFolderMinHeightGroup.classList.remove('hidden');
    editBmTitleGroup.classList.add('hidden');
    editBmUrlGroup.classList.add('hidden');
    editBmWidthGroup.classList.add('hidden');
    editBmHeightGroup.classList.add('hidden');
    editFolderIconGroup.classList.remove('hidden');
    const activePage = currentConfig && getActivePage(currentConfig);
    const folder = activePage && activePage.folders.find(f => f.name === target.folderName);
    editFolderNameInput.value = target.folderName;
    editFolderWidthInput.value = (folder && folder.width) || '';
    editFolderMinHeightInput.value = (folder && folder.minHeight) || '';
    editFolderIconValue = (folder && folder.icon !== undefined) ? folder.icon : currentDefaultFolderIcon;
    buildIconPicker(editFolderIconPicker, editFolderIconValue, (v) => { editFolderIconValue = v; });
  } else {
    editModalTitle.textContent = 'Edit Bookmark';
    editFolderNameGroup.classList.add('hidden');
    editFolderWidthGroup.classList.add('hidden');
    editFolderMinHeightGroup.classList.add('hidden');
    editFolderIconGroup.classList.add('hidden');
    editBmTitleGroup.classList.remove('hidden');
    editBmUrlGroup.classList.remove('hidden');
    editBmWidthGroup.classList.remove('hidden');
    editBmHeightGroup.classList.remove('hidden');
    const activePage = currentConfig && getActivePage(currentConfig);
    const folder = activePage && activePage.folders.find(f => f.name === target.folderName);
    const bookmark = folder && folder.bookmarks.find(b => b.url === target.bookmarkUrl);
    editBmTitleInput.value = bookmark ? bookmark.title : '';
    editBmUrlInput.value = target.bookmarkUrl;
    editBmWidthInput.value = (bookmark && bookmark.width) || '';
    editBmHeightInput.value = (bookmark && bookmark.height) || '';
  }

  editModal.classList.remove('hidden');
  if (target.type === 'folder') {
    editFolderNameInput.focus();
    editFolderNameInput.select();
  } else {
    editBmTitleInput.focus();
    editBmTitleInput.select();
  }
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editTarget = null;
}

function showEditModalError(msg) {
  editModalStatus.textContent = msg;
  editModalStatus.className = 'modal-status error';
}

async function saveEdit() {
  if (!editTarget) return;
  try {
    const config = await getConfig();
    const activePage = getActivePage(config);

    if (editTarget.type === 'folder') {
      const newName = editFolderNameInput.value.trim();
      if (!newName) { showEditModalError('Please enter a folder name.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (newName !== editTarget.folderName && activePage.folders.find(f => f.name === newName)) {
        showEditModalError('A folder with that name already exists.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return;
      }
      const folder = activePage.folders.find(f => f.name === editTarget.folderName);
      if (folder) {
        folder.name = newName;
        const fw = parseInt(editFolderWidthInput.value, 10);
        folder.width = fw > 0 ? fw : undefined;
        const fh = parseInt(editFolderMinHeightInput.value, 10);
        folder.minHeight = fh > 0 ? fh : undefined;
        folder.icon = editFolderIconValue;
        folder.lastModified = Date.now();
      }
    } else {
      const newTitle = editBmTitleInput.value.trim();
      let newUrl = editBmUrlInput.value.trim();
      if (!newTitle) { showEditModalError('Please enter a title.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (!newUrl) { showEditModalError('Please enter a URL.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (!/^https?:\/\//i.test(newUrl)) newUrl = 'https://' + newUrl;
      const folder = activePage.folders.find(f => f.name === editTarget.folderName);
      const bookmark = folder && folder.bookmarks.find(b => b.url === editTarget.bookmarkUrl);
      if (bookmark) {
        bookmark.title = newTitle;
        bookmark.url = newUrl;
        const bw = parseInt(editBmWidthInput.value, 10);
        bookmark.width = bw > 0 ? bw : undefined;
        const bh = parseInt(editBmHeightInput.value, 10);
        bookmark.height = bh > 0 ? bh : undefined;
        bookmark.lastModified = Date.now();
        if (folder) folder.lastModified = Date.now();
      }
    }

    await applyLocalChange(config, currentPageId);
    closeEditModal();
    showStatus('Saved!', 'success');
  } catch (error) {
    showEditModalError(`Error: ${error.message}`);
    editModalSaveBtn.disabled = false;
    editModalSaveBtn.textContent = 'Save';
  }
}

editModalSaveBtn.addEventListener('click', saveEdit);
editModalCancelBtn.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

function showModalError(msg) {
  modalStatus.textContent = msg;
  modalStatus.className = 'modal-status error';
}

async function saveNewBookmark() {
  const title = bmTitle.value.trim();
  let url = bmUrl.value.trim();
  const folderVal = bmFolder.value;
  const newFolderName = bmNewFolder.value.trim();

  if (!title) { showModalError('Please enter a title.'); return; }
  if (!url) { showModalError('Please enter a URL.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (folderVal === '__new__' && !newFolderName) {
    showModalError('Please enter a folder name.'); return;
  }

  try {
    const config = await getConfig() || { pages: [{ id: 'page-1', name: 'Bookmarks', folders: [] }] };
    ensurePages(config);
    const activePage = getActivePage(config);
    const now = Date.now();
    const bookmark = { title, url, lastModified: now };

    if (folderVal === '__new__') {
      activePage.folders.push({ name: newFolderName, bookmarks: [bookmark], lastModified: now, bookmarkTombstones: [] });
    } else {
      const folder = activePage.folders.find(f => f.name === folderVal);
      if (folder) {
        folder.bookmarks = folder.bookmarks || [];
        folder.bookmarks.push(bookmark);
        folder.lastModified = now;
      }
    }

    await applyLocalChange(config, currentPageId);
    closeAddModal();
    showStatus('Bookmark added!', 'success');
  } catch (error) {
    showModalError(`Error: ${error.message}`);
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = 'Save';
  }
}

// Add bookmark button
addBtn.addEventListener('click', openAddModal);
modalCancelBtn.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddModal(); });
modalSaveBtn.addEventListener('click', saveNewBookmark);
bmFolder.addEventListener('change', () => {
  newFolderGroup.classList.toggle('hidden', bmFolder.value !== '__new__');
});

// Sync button: push local config to GitHub immediately
syncBtn.addEventListener('click', () => syncToGitHub());

// Settings button click handler
settingsBtn.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

// Settings link click handler
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

// Reset all folder positions on the active page
document.getElementById('reset-positions-btn').addEventListener('click', async () => {
  const config = await getConfig();
  const activePage = getActivePage(config);
  const now = Date.now();
  activePage.folders.forEach(f => {
    delete f.x; delete f.y; delete f.rw; delete f.rh;
    f.lastModified = now;
  });
  await applyLocalChange(config, currentPageId);
  showStatus('Folder positions reset!', 'success');
});

const FOLDER_MIN_W = 150;
const FOLDER_MIN_H = 80;

// Free-floating folder move + resize via mouse drag
document.addEventListener('mousemove', (e) => {
  if (folderMoveState) {
    const { folderDiv, startMouseX, startMouseY, startLeft, startTop } = folderMoveState;
    folderDiv.style.left = `${startLeft + (e.clientX - startMouseX)}px`;
    folderDiv.style.top = `${startTop + (e.clientY - startMouseY)}px`;
  }
  if (folderResizeState) {
    const { folderDiv, startMouseX, startMouseY, startW, startH } = folderResizeState;
    folderDiv.style.width = `${Math.max(FOLDER_MIN_W, startW + (e.clientX - startMouseX))}px`;
    folderDiv.style.height = `${Math.max(FOLDER_MIN_H, startH + (e.clientY - startMouseY))}px`;
  }
});

document.addEventListener('mouseup', async (e) => {
  if (e.button !== 0) return;

  if (folderMoveState) {
    const { folderDiv, folderName, startMouseX, startMouseY, startLeft, startTop } = folderMoveState;
    folderMoveState = null;
    folderDiv.classList.remove('is-moving');
    const newX = Math.round(startLeft + (e.clientX - startMouseX));
    const newY = Math.round(startTop + (e.clientY - startMouseY));
    try {
      const config = await getConfig();
      const activePage = getActivePage(config);
      const cfgFolder = activePage.folders.find(f => f.name === folderName);
      if (cfgFolder) { cfgFolder.x = newX; cfgFolder.y = newY; cfgFolder.lastModified = Date.now(); await applyLocalChange(config, currentPageId); }
    } catch (err) { console.error('[FolderMove] failed to save position', err); }
  }

  if (folderResizeState) {
    const { folderDiv, folderName, startMouseX, startMouseY, startW, startH } = folderResizeState;
    folderResizeState = null;
    folderDiv.classList.remove('is-resizing');
    const newW = Math.round(Math.max(FOLDER_MIN_W, startW + (e.clientX - startMouseX)));
    const newH = Math.round(Math.max(FOLDER_MIN_H, startH + (e.clientY - startMouseY)));
    try {
      const config = await getConfig();
      const activePage = getActivePage(config);
      const cfgFolder = activePage.folders.find(f => f.name === folderName);
      if (cfgFolder) { cfgFolder.rw = newW; cfgFolder.rh = newH; cfgFolder.lastModified = Date.now(); await applyLocalChange(config, currentPageId); }
    } catch (err) { console.error('[FolderResize] failed to save size', err); }
  }
});

const BG_THEMES = {
  purple:   'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  blue:     'linear-gradient(135deg, #2196F3 0%, #0d47a1 100%)',
  sunset:   'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  ocean:    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  forest:   'linear-gradient(135deg, #48bb78 0%, #276749 100%)',
  dark:     'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
  midnight: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
  candy:    'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
};

function applyBackground(settings) {
  const theme = settings.bgTheme || 'purple';
  if (theme === 'solid') {
    document.body.style.background = settings.bgCustomColor || '#667eea';
  } else if (theme === 'image' && settings.bgImageUrl) {
    document.body.style.background = `url("${settings.bgImageUrl.replace(/"/g, '%22')}") center/cover no-repeat fixed`;
  } else {
    document.body.style.background = BG_THEMES[theme] || BG_THEMES.purple;
  }
}

async function applyImportedTheme(themeId, root) {
  const themes = await githubSync.loadImportedThemes();
  const theme = themes.find(t => t.id === themeId);
  if (!theme) return;
  document.body.style.background = theme.bgColor;
  root.setProperty('--folder-titlebar-color1', theme.titlebarColor1);
  root.setProperty('--folder-titlebar-color2', theme.titlebarColor2);
  root.setProperty('--folder-bg', theme.folderBg);
  root.setProperty('--folder-text-color', theme.folderTextColor);
  root.setProperty('--folder-text-hover-color', theme.titlebarColor1);
  root.setProperty('--folder-title-color', theme.titleColor);
}

// Load bookmarks on page load
async function initialize() {
  const settings = await githubSync.loadSettings();
  currentDefaultFolderIcon = settings.defaultFolderIcon !== undefined ? settings.defaultFolderIcon : '📁';

  const bgTheme = settings.bgTheme || 'purple';
  if (bgTheme.startsWith('imported:')) {
    await applyImportedTheme(bgTheme.slice('imported:'.length), document.documentElement.style);
  }
  applyStyleSettings(settings);

  await loadBookmarks();

  // Push local changes to GitHub every hour.
  setInterval(() => syncToGitHub().catch(e => console.warn('[AutoSync] failed', e)), 3_600_000);
  // Pull remote changes every 60 seconds so edits from other machines appear promptly.
  setInterval(() => refreshFromGitHub().catch(e => console.warn('[AutoRefresh] failed', e)), 60_000);
}

initialize();
