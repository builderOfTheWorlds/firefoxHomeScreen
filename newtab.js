// New Tab Page Script
// Handles rendering bookmarks and user interactions

const githubSync = new GitHubSync();

// In-memory config mirror — always reflects what's in BookmarkDB
let currentConfig = null;

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
const ctxRefreshScreenshot = document.getElementById('ctx-refresh-screenshot');

// Context menu state
let ctxTarget = null; // { folderName, bookmarkUrl?, type: 'bookmark'|'folder' }

// Return the current config from memory, BookmarkDB, or GitHub (in that order)
async function getConfig() {
  if (currentConfig) return currentConfig;
  const stored = await BookmarkDB.get();
  if (stored) { currentConfig = stored; return stored; }
  const fetched = await githubSync.fetchConfig();
  await BookmarkDB.put(fetched);
  browser.storage.local.set({ cachedBookmarks: fetched }).catch(() => {});
  currentConfig = fetched;
  return fetched;
}

// Apply a config mutation locally: write to BookmarkDB, update cache, re-render.
// GitHub sync happens on the 60s interval or manual button — not here.
async function applyLocalChange(config) {
  currentConfig = config;
  await BookmarkDB.put(config);
  browser.storage.local.set({ cachedBookmarks: config }).catch(() => {});
  renderBookmarks(config);
}

// Push the local BookmarkDB config to GitHub
async function syncToGitHub() {
  const config = await BookmarkDB.get();
  if (!config) return;

  syncBtn.classList.add('syncing');
  syncBtn.disabled = true;
  pendingIndicator.classList.remove('hidden');
  pendingIndicator.textContent = 'Syncing…';

  try {
    await githubSync.updateConfig(config);
    showStatus('Saved to GitHub!', 'success');
    console.log('[Sync] pushed to GitHub successfully');
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
    const srcFolder = config.folders[srcFolderIdx];
    const dstFolder = config.folders[dstFolderIdx];
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
    ddLog('config after', {
      srcBookmarks: srcFolder.bookmarks.map(b => b.title),
      dstBookmarks: dstFolder.bookmarks.map(b => b.title),
    });
    await applyLocalChange(config);
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
    const srcFolder = config.folders[srcFolderIdx];
    const dstFolder = config.folders[dstFolderIdx];
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
    ddLog('config after', {
      srcBookmarks: srcFolder.bookmarks.map(b => b.title),
      dstBookmarks: dstFolder.bookmarks.map(b => b.title),
    });
    await applyLocalChange(config);
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
    ddLog('folders before', config.folders.map(f => f.name));
    const [folder] = config.folders.splice(srcIdx, 1);
    ddLog('spliced folder', folder.name);
    let insertIdx = dstIdx;
    if (srcIdx < dstIdx) insertIdx--;
    if (!insertBefore) insertIdx++;
    insertIdx = Math.max(0, Math.min(insertIdx, config.folders.length));
    ddLog('inserting at index', insertIdx);
    config.folders.splice(insertIdx, 0, folder);
    ddLog('folders after', config.folders.map(f => f.name));
    await applyLocalChange(config);
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
  ctxRemove.classList.toggle('hidden', target.type !== 'bookmark');
  ctxRefreshScreenshot.classList.toggle('hidden', target.type !== 'bookmark');
  ctxEdit.classList.remove('hidden');
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  ctxTarget = null;
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

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
    const folder = config.folders.find(f => f.name === folderName);
    if (folder) {
      folder.bookmarks = folder.bookmarks.filter(b => b.url !== bookmarkUrl);
      if (folder.bookmarks.length === 0) {
        config.folders = config.folders.filter(f => f.name !== folderName);
      }
    }
    await applyLocalChange(config);
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

  config.folders.forEach((folder, fi) => {
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

    // --- Folder name (context menu + bookmark drop-into-folder target) ---
    const folderName = document.createElement('div');
    folderName.className = 'folder-name';

    const nameText = document.createElement('span');
    nameText.textContent = folder.name;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'folder-drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.title = 'Drag to move folder';

    dragHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
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

    folderName.appendChild(nameText);
    folderName.appendChild(dragHandle);

    folderName.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, { type: 'folder', folderName: folder.name });
    });

    folderName.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'bookmark' || dragState.folderIndex === fi) return;
      e.preventDefault();
      e.stopPropagation();
      folderName.classList.add('drag-over');
    });

    folderName.addEventListener('dragleave', () => {
      folderName.classList.remove('drag-over');
    });

    folderName.addEventListener('drop', (e) => {
      ddLog('folderName drop', { dstFi: fi, folderName: folder.name, dragState });
      folderName.classList.remove('drag-over');
      if (!dragState || dragState.type !== 'bookmark' || dragState.folderIndex === fi) {
        ddLog('folderName drop IGNORED', { reason: !dragState ? 'no dragState' : dragState.type !== 'bookmark' ? `wrong type: ${dragState.type}` : 'same folder' });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const { folderIndex: srcFi, bookmarkIndex: srcBi } = dragState;
      dragState = null;
      ddLog('folderName drop ACCEPTED', { srcFi, srcBi, dstFi: fi });
      moveBookmarkToFolder(srcFi, srcBi, fi);
    });

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
        ScreenshotDB.get(bookmark.url).then(dataUrl => {
          if (dataUrl) applyScreenshot(bookmarkItem, icon, dataUrl);
        }).catch(() => {});

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

    folderDiv.appendChild(folderName);
    folderDiv.appendChild(bookmarksList);
    folderDiv.appendChild(resizeHandle);
    bookmarksContainer.appendChild(folderDiv);
  });
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
    }

    currentConfig = config;
    renderBookmarks(config);
  } catch (error) {
    console.error('Error loading bookmarks:', error);

    // Migrate legacy cachedBookmarks into BookmarkDB on first run
    const result = await browser.storage.local.get('cachedBookmarks').catch(() => ({}));
    const cached = result.cachedBookmarks || null;
    if (cached) {
      currentConfig = cached;
      renderBookmarks(cached);
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
    folders = (config && config.folders) || [];
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
const editBmWidthGroup = document.getElementById('edit-bm-width-group');
const editBmWidthInput = document.getElementById('edit-bm-width');
const editBmHeightGroup = document.getElementById('edit-bm-height-group');
const editBmHeightInput = document.getElementById('edit-bm-height');
const editModalSaveBtn = document.getElementById('edit-modal-save-btn');
const editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
const editModalStatus = document.getElementById('edit-modal-status');

let editTarget = null;

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
    const folder = currentConfig && currentConfig.folders.find(f => f.name === target.folderName);
    editFolderNameInput.value = target.folderName;
    editFolderWidthInput.value = (folder && folder.width) || '';
    editFolderMinHeightInput.value = (folder && folder.minHeight) || '';
  } else {
    editModalTitle.textContent = 'Edit Bookmark';
    editFolderNameGroup.classList.add('hidden');
    editFolderWidthGroup.classList.add('hidden');
    editFolderMinHeightGroup.classList.add('hidden');
    editBmTitleGroup.classList.remove('hidden');
    editBmUrlGroup.classList.remove('hidden');
    editBmWidthGroup.classList.remove('hidden');
    editBmHeightGroup.classList.remove('hidden');
    const folder = currentConfig && currentConfig.folders.find(f => f.name === target.folderName);
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

    if (editTarget.type === 'folder') {
      const newName = editFolderNameInput.value.trim();
      if (!newName) { showEditModalError('Please enter a folder name.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (newName !== editTarget.folderName && config.folders.find(f => f.name === newName)) {
        showEditModalError('A folder with that name already exists.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return;
      }
      const folder = config.folders.find(f => f.name === editTarget.folderName);
      if (folder) {
        folder.name = newName;
        const fw = parseInt(editFolderWidthInput.value, 10);
        folder.width = fw > 0 ? fw : undefined;
        const fh = parseInt(editFolderMinHeightInput.value, 10);
        folder.minHeight = fh > 0 ? fh : undefined;
      }
    } else {
      const newTitle = editBmTitleInput.value.trim();
      let newUrl = editBmUrlInput.value.trim();
      if (!newTitle) { showEditModalError('Please enter a title.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (!newUrl) { showEditModalError('Please enter a URL.'); editModalSaveBtn.disabled = false; editModalSaveBtn.textContent = 'Save'; return; }
      if (!/^https?:\/\//i.test(newUrl)) newUrl = 'https://' + newUrl;
      const folder = config.folders.find(f => f.name === editTarget.folderName);
      const bookmark = folder && folder.bookmarks.find(b => b.url === editTarget.bookmarkUrl);
      if (bookmark) {
        bookmark.title = newTitle;
        bookmark.url = newUrl;
        const bw = parseInt(editBmWidthInput.value, 10);
        bookmark.width = bw > 0 ? bw : undefined;
        const bh = parseInt(editBmHeightInput.value, 10);
        bookmark.height = bh > 0 ? bh : undefined;
      }
    }

    await applyLocalChange(config);
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
    const config = await getConfig() || { folders: [] };
    const bookmark = { title, url };

    if (folderVal === '__new__') {
      config.folders.push({ name: newFolderName, bookmarks: [bookmark] });
    } else {
      const folder = config.folders.find(f => f.name === folderVal);
      if (folder) {
        folder.bookmarks = folder.bookmarks || [];
        folder.bookmarks.push(bookmark);
      }
    }

    await applyLocalChange(config);
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
      const cfgFolder = config.folders.find(f => f.name === folderName);
      if (cfgFolder) { cfgFolder.x = newX; cfgFolder.y = newY; await applyLocalChange(config); }
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
      const cfgFolder = config.folders.find(f => f.name === folderName);
      if (cfgFolder) { cfgFolder.rw = newW; cfgFolder.rh = newH; await applyLocalChange(config); }
    } catch (err) { console.error('[FolderResize] failed to save size', err); }
  }
});

// Load bookmarks on page load
async function initialize() {
  const settings = await githubSync.loadSettings();
  const root = document.documentElement.style;
  const scale = (settings.bookmarkScale || 100) / 100;
  root.setProperty('--screenshot-height', `${Math.round((settings.screenshotHeight || 100) * scale)}px`);
  root.setProperty('--folder-padding', `${settings.folderPadding}px`);
  root.setProperty('--bookmark-icon-size', `${Math.round((settings.bookmarkIconSize || 28) * scale)}px`);
  if (settings.defaultFolderMinWidth) root.setProperty('--default-folder-min-width', `${settings.defaultFolderMinWidth}px`);
  if (settings.defaultFolderMinHeight) root.setProperty('--default-folder-min-height', `${settings.defaultFolderMinHeight}px`);
  root.setProperty('--default-bm-width', `${Math.round((settings.defaultBmWidth || 80) * scale)}px`);
  root.setProperty('--default-bm-height', `${Math.round((settings.defaultBmHeight || 80) * scale)}px`);

  await loadBookmarks();

  // Auto-sync to GitHub every 60 seconds
  setInterval(() => syncToGitHub().catch(e => console.warn('[AutoSync] failed', e)), 60_000);
}

initialize();
