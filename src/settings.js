// Settings Page Script
// Handles saving and testing GitHub configuration

const githubSync = new GitHubSync();

const FOLDER_ICONS = ['📁', '📂', '🗂️', '📋', '📌', '⭐', '🔖', '💼', '🎯', '🔥', '❤️', '🌟', '✅', '🚀', '🎮', '📚', '🎵', '🎨', '🏠', '🛠️'];
let defaultFolderIconValue = '📁';

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

// Parse JSONC (JSON with Comments) — many VS Code theme files use this format
function parseJSONC(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments /* ... */
    .replace(/\/\/[^\n\r]*/g, '')        // line comments // ...
    .replace(/,(\s*[}\]])/g, '$1');      // trailing commas before } or ]
  return JSON.parse(stripped);
}

// VSCode theme color key extraction
function extractVSCThemeColors(themeJson) {
  const c = themeJson.colors || {};

  // Strip alpha channel from 8-digit hex, return null for non-hex values
  const hex = (...keys) => {
    for (const key of keys) {
      const val = c[key];
      if (val && /^#[0-9a-fA-F]{6,8}$/.test(val)) return val.slice(0, 7);
    }
    return null;
  };

  return {
    id: `imported_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: themeJson.name || 'Imported Theme',
    titlebarColor1: hex('titleBar.activeBackground', 'activityBar.background', 'statusBar.background', 'editor.background') || '#667eea',
    titlebarColor2: hex('titleBar.activeBackground', 'activityBar.background', 'statusBar.background', 'editor.background') || '#667eea',
    folderBg: hex('editor.background', 'editorGroupHeader.tabsBackground', 'tab.activeBackground') || '#ffffff',
    folderTextColor: hex('editor.foreground', 'foreground') || '#4a5568',
    titleColor: hex('titleBar.activeForeground', 'activityBar.foreground', 'statusBar.foreground') || '#ffffff',
    bgColor: hex('sideBar.background', 'activityBar.background', 'editor.background') || '#1e1e1e',
  };
}

// Typography elements
const folderTitleFontInput = document.getElementById('folder-title-font');
const folderTitleFontPreview = document.getElementById('folder-title-font-preview');
const folderTitleFontSizeInput = document.getElementById('folder-title-font-size');
const folderTitleFontSizeDisplay = document.getElementById('folder-title-font-size-display');
const bookmarkTitleFontInput = document.getElementById('bookmark-title-font');
const bookmarkTitleFontPreview = document.getElementById('bookmark-title-font-preview');
const bookmarkTitleFontSizeInput = document.getElementById('bookmark-title-font-size');
const bookmarkTitleFontSizeDisplay = document.getElementById('bookmark-title-font-size-display');

const FONT_LIST = [
  { group: 'Default',     fonts: ['inherit'] },
  { group: 'Sans-serif',  fonts: ['Arial', 'Arial Black', 'Calibri', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Corbel', 'Franklin Gothic Medium', 'Impact', 'Segoe UI', 'Tahoma', 'Trebuchet MS', 'Verdana'] },
  { group: 'Serif',       fonts: ['Book Antiqua', 'Cambria', 'Constantia', 'Garamond', 'Georgia', 'Palatino Linotype', 'Times New Roman'] },
  { group: 'Monospace',   fonts: ['Cascadia Code', 'Consolas', 'Courier New', 'Lucida Console'] },
];

function buildFontSelect(selectEl, previewEl) {
  FONT_LIST.forEach(({ group, fonts }) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    fonts.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font === 'inherit' ? '' : font;
      opt.textContent = font === 'inherit' ? 'Default (inherit)' : font;
      optgroup.appendChild(opt);
    });
    selectEl.appendChild(optgroup);
  });
  selectEl.addEventListener('change', () => {
    previewEl.style.fontFamily = selectEl.value || 'inherit';
  });
}

buildFontSelect(folderTitleFontInput, folderTitleFontPreview);
buildFontSelect(bookmarkTitleFontInput, bookmarkTitleFontPreview);

// Appearance elements
const bgThemeSelect = document.getElementById('bg-theme');
const bgColorGroup = document.getElementById('bg-color-group');
const bgImageGroup = document.getElementById('bg-image-group');
const bgCustomColorInput = document.getElementById('bg-custom-color');
const bgImageUrlInput = document.getElementById('bg-image-url');
const navbarColor1Input = document.getElementById('navbar-color1');
const navbarColor1Display = document.getElementById('navbar-color1-display');
const navbarColor2Input = document.getElementById('navbar-color2');
const navbarColor2Display = document.getElementById('navbar-color2-display');
const navbarTextColorInput = document.getElementById('navbar-text-color');
const navbarTextColorDisplay = document.getElementById('navbar-text-color-display');
const folderTitlebarColor1Input = document.getElementById('folder-titlebar-color1');
const folderTitlebarColor1Display = document.getElementById('folder-titlebar-color1-display');
const folderTitlebarColor2Input = document.getElementById('folder-titlebar-color2');
const folderTitlebarColor2Display = document.getElementById('folder-titlebar-color2-display');
const folderBgColorInput = document.getElementById('folder-bg-color');
const folderBgColorDisplay = document.getElementById('folder-bg-color-display');
const folderTextColorInput = document.getElementById('folder-text-color');
const folderTextColorDisplay = document.getElementById('folder-text-color-display');
const folderTitleColorInput = document.getElementById('folder-title-color');
const folderTitleColorDisplay = document.getElementById('folder-title-color-display');

// Import elements
const importThemeBtn = document.getElementById('import-theme-btn');
const themeFileInput = document.getElementById('theme-file-input');
const importThemeStatus = document.getElementById('import-theme-status');
const importedThemesList = document.getElementById('imported-themes-list');

folderTitleFontSizeInput.addEventListener('input', () => { folderTitleFontSizeDisplay.textContent = folderTitleFontSizeInput.value; });
bookmarkTitleFontSizeInput.addEventListener('input', () => { bookmarkTitleFontSizeDisplay.textContent = bookmarkTitleFontSizeInput.value; });
bookmarkScaleInput.addEventListener('input', () => { bookmarkScaleDisplay.textContent = bookmarkScaleInput.value; });
folderPaddingInput.addEventListener('input', () => { folderPaddingDisplay.textContent = folderPaddingInput.value; });
bookmarkIconSizeInput.addEventListener('input', () => { bookmarkIconSizeDisplay.textContent = bookmarkIconSizeInput.value; });
screenshotHeightInput.addEventListener('input', () => { screenshotHeightDisplay.textContent = screenshotHeightInput.value; });
screenshotDelayInput.addEventListener('input', () => { screenshotDelayDisplay.textContent = screenshotDelayInput.value; });
defaultFolderMinWidthInput.addEventListener('input', () => { defaultFolderMinWidthDisplay.textContent = defaultFolderMinWidthInput.value; });
defaultFolderMinHeightInput.addEventListener('input', () => { defaultFolderMinHeightDisplay.textContent = defaultFolderMinHeightInput.value; });
defaultBmWidthInput.addEventListener('input', () => { defaultBmWidthDisplay.textContent = defaultBmWidthInput.value; });
defaultBmHeightInput.addEventListener('input', () => { defaultBmHeightDisplay.textContent = defaultBmHeightInput.value; });

// Appearance event listeners
function updateBgGroupVisibility() {
  const val = bgThemeSelect.value;
  bgColorGroup.classList.toggle('visible', val === 'solid');
  bgImageGroup.classList.toggle('visible', val === 'image');
}
bgThemeSelect.addEventListener('change', updateBgGroupVisibility);

// If the user manually edits a color picker while an imported theme is selected,
// switch to solid mode so the manual value actually takes effect on save.
function detachFromImportedThemeIfNeeded() {
  if (bgThemeSelect.value.startsWith('imported:')) {
    bgThemeSelect.value = 'solid';
    updateBgGroupVisibility();
  }
}

navbarColor1Input.addEventListener('input', () => { navbarColor1Display.textContent = navbarColor1Input.value; detachFromImportedThemeIfNeeded(); });
navbarColor2Input.addEventListener('input', () => { navbarColor2Display.textContent = navbarColor2Input.value; detachFromImportedThemeIfNeeded(); });
navbarTextColorInput.addEventListener('input', () => { navbarTextColorDisplay.textContent = navbarTextColorInput.value; detachFromImportedThemeIfNeeded(); });
folderTitlebarColor1Input.addEventListener('input', () => { folderTitlebarColor1Display.textContent = folderTitlebarColor1Input.value; detachFromImportedThemeIfNeeded(); });
folderTitlebarColor2Input.addEventListener('input', () => { folderTitlebarColor2Display.textContent = folderTitlebarColor2Input.value; detachFromImportedThemeIfNeeded(); });
folderBgColorInput.addEventListener('input', () => { folderBgColorDisplay.textContent = folderBgColorInput.value; detachFromImportedThemeIfNeeded(); });
folderTextColorInput.addEventListener('input', () => { folderTextColorDisplay.textContent = folderTextColorInput.value; detachFromImportedThemeIfNeeded(); });
folderTitleColorInput.addEventListener('input', () => { folderTitleColorDisplay.textContent = folderTitleColorInput.value; detachFromImportedThemeIfNeeded(); });

// Rebuild the bg-theme <select> with current imported themes
function rebuildThemeSelect(importedThemes, activeTheme) {
  const presets = [
    { value: 'purple',   label: 'Purple Gradient (default)' },
    { value: 'blue',     label: 'Blue Gradient' },
    { value: 'sunset',   label: 'Sunset' },
    { value: 'ocean',    label: 'Ocean' },
    { value: 'forest',   label: 'Forest' },
    { value: 'dark',     label: 'Dark' },
    { value: 'midnight', label: 'Midnight' },
    { value: 'candy',    label: 'Candy' },
    { value: 'solid',    label: 'Solid Color' },
    { value: 'image',    label: 'Custom Image' },
  ];

  bgThemeSelect.innerHTML = '';

  // Built-in presets
  const presetGroup = document.createElement('optgroup');
  presetGroup.label = 'Built-in';
  presets.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    presetGroup.appendChild(opt);
  });
  bgThemeSelect.appendChild(presetGroup);

  // Imported themes
  if (importedThemes.length > 0) {
    const importedGroup = document.createElement('optgroup');
    importedGroup.label = 'Imported';
    importedThemes.forEach(theme => {
      const opt = document.createElement('option');
      opt.value = `imported:${theme.id}`;
      opt.textContent = theme.name;
      importedGroup.appendChild(opt);
    });
    bgThemeSelect.appendChild(importedGroup);
  }

  bgThemeSelect.value = activeTheme || 'purple';
  updateBgGroupVisibility();
}

// Load an imported theme's colors into the manual folder color pickers
function loadThemeIntoColorPickers(theme) {
  bgThemeSelect.value = 'solid';
  bgCustomColorInput.value = theme.bgColor;
  updateBgGroupVisibility();

  folderTitlebarColor1Input.value = theme.titlebarColor1;
  folderTitlebarColor1Display.textContent = theme.titlebarColor1;
  folderTitlebarColor2Input.value = theme.titlebarColor2;
  folderTitlebarColor2Display.textContent = theme.titlebarColor2;
  folderBgColorInput.value = theme.folderBg;
  folderBgColorDisplay.textContent = theme.folderBg;
  folderTextColorInput.value = theme.folderTextColor;
  folderTextColorDisplay.textContent = theme.folderTextColor;
  folderTitleColorInput.value = theme.titleColor;
  folderTitleColorDisplay.textContent = theme.titleColor;

  // Scroll up to the color pickers so the user can see them
  document.getElementById('folder-titlebar-color1').closest('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Render the imported themes list with color swatches, load and delete buttons
function renderImportedThemesList(importedThemes) {
  importedThemesList.innerHTML = '';
  if (importedThemes.length === 0) return;

  importedThemes.forEach(theme => {
    const row = document.createElement('div');
    row.className = 'imported-theme-row';

    const swatches = document.createElement('div');
    swatches.className = 'imported-theme-swatches';
    [theme.bgColor, theme.titlebarColor1, theme.folderBg, theme.folderTextColor, theme.titleColor].forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'imported-theme-swatch';
      swatch.style.background = color;
      swatches.appendChild(swatch);
    });

    const name = document.createElement('span');
    name.className = 'imported-theme-name';
    name.textContent = theme.name;

    const loadBtn = document.createElement('button');
    loadBtn.className = 'imported-theme-load';
    loadBtn.textContent = 'Edit Colors';
    loadBtn.title = 'Load this theme\'s colors into the pickers above so you can tweak them';
    loadBtn.addEventListener('click', () => loadThemeIntoColorPickers(theme));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'imported-theme-delete';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => deleteImportedTheme(theme.id));

    row.appendChild(swatches);
    row.appendChild(name);
    row.appendChild(loadBtn);
    row.appendChild(deleteBtn);
    importedThemesList.appendChild(row);
  });
}

function showImportStatus(msg, type) {
  importThemeStatus.textContent = msg;
  importThemeStatus.className = `import-theme-status ${type}`;
  setTimeout(() => { importThemeStatus.className = 'import-theme-status hidden'; }, 4000);
}

async function deleteImportedTheme(id) {
  const themes = await githubSync.loadImportedThemes();
  const updated = themes.filter(t => t.id !== id);
  await githubSync.saveImportedThemes(updated);

  const activeTheme = bgThemeSelect.value;
  const newActive = activeTheme === `imported:${id}` ? 'purple' : activeTheme;
  rebuildThemeSelect(updated, newActive);
  renderImportedThemesList(updated);
}

// File import handler
importThemeBtn.addEventListener('click', () => themeFileInput.click());

themeFileInput.addEventListener('change', async () => {
  const file = themeFileInput.files[0];
  if (!file) return;
  themeFileInput.value = '';

  const text = await file.text().catch(() => null);
  if (!text) { showImportStatus('Could not read file.', 'error'); return; }

  let themeJson;
  try { themeJson = parseJSONC(text); } catch (e) {
    showImportStatus(`Could not parse file: ${e.message}`, 'error'); return;
  }

  if (!themeJson || typeof themeJson !== 'object') {
    showImportStatus('File did not contain a JSON object. Make sure you downloaded the raw .json file, not the GitHub page.', 'error'); return;
  }

  if (!themeJson.colors || typeof themeJson.colors !== 'object') {
    showImportStatus('Not a valid VS Code theme file — missing "colors" object. Make sure you download the raw .json from the themes/ folder.', 'error'); return;
  }

  const extracted = extractVSCThemeColors(themeJson);
  const themes = await githubSync.loadImportedThemes();

  // Prevent duplicate names
  if (themes.some(t => t.name === extracted.name)) {
    showImportStatus(`Theme "${extracted.name}" is already imported.`, 'error'); return;
  }

  themes.push(extracted);
  await githubSync.saveImportedThemes(themes);

  rebuildThemeSelect(themes, `imported:${extracted.id}`);
  renderImportedThemesList(themes);
  showImportStatus(`Imported "${extracted.name}" — select it above and save.`, 'success');
});

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

  // Typography
  folderTitleFontInput.value = settings.folderTitleFont || '';
  folderTitleFontPreview.style.fontFamily = settings.folderTitleFont || 'inherit';
  const ftfs = settings.folderTitleFontSize || 13;
  folderTitleFontSizeInput.value = ftfs;
  folderTitleFontSizeDisplay.textContent = ftfs;
  bookmarkTitleFontInput.value = settings.bookmarkTitleFont || '';
  bookmarkTitleFontPreview.style.fontFamily = settings.bookmarkTitleFont || 'inherit';
  const btfs = settings.bookmarkTitleFontSize || 10;
  bookmarkTitleFontSizeInput.value = btfs;
  bookmarkTitleFontSizeDisplay.textContent = btfs;

  // Appearance
  bgCustomColorInput.value = settings.bgCustomColor || '#667eea';
  bgImageUrlInput.value = settings.bgImageUrl || '';
  const nc1 = settings.navbarColor1 || '#3a1a6e';
  const nc2 = settings.navbarColor2 || '#2d1157';
  const ntc = settings.navbarTextColor || '#ffffff';
  navbarColor1Input.value = nc1;
  navbarColor1Display.textContent = nc1;
  navbarColor2Input.value = nc2;
  navbarColor2Display.textContent = nc2;
  navbarTextColorInput.value = ntc;
  navbarTextColorDisplay.textContent = ntc;
  const tc1 = settings.folderTitlebarColor1 || '#667eea';
  const tc2 = settings.folderTitlebarColor2 || '#764ba2';
  const fbc = settings.folderBgColor || '#ffffff';
  const ftc = settings.folderTextColor || '#4a5568';
  const fttc = settings.folderTitleColor || '#ffffff';
  folderTitlebarColor1Input.value = tc1;
  folderTitlebarColor1Display.textContent = tc1;
  folderTitlebarColor2Input.value = tc2;
  folderTitlebarColor2Display.textContent = tc2;
  folderBgColorInput.value = fbc;
  folderBgColorDisplay.textContent = fbc;
  folderTextColorInput.value = ftc;
  folderTextColorDisplay.textContent = ftc;
  folderTitleColorInput.value = fttc;
  folderTitleColorDisplay.textContent = fttc;

  defaultFolderIconValue = settings.defaultFolderIcon !== undefined ? settings.defaultFolderIcon : '📁';
  buildIconPicker(document.getElementById('default-folder-icon-picker'), defaultFolderIconValue, (v) => { defaultFolderIconValue = v; });

  const importedThemes = await githubSync.loadImportedThemes();
  rebuildThemeSelect(importedThemes, settings.bgTheme || 'purple');
  renderImportedThemesList(importedThemes);
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
    defaultBmHeight: parseInt(defaultBmHeightInput.value, 10) || 80,
    bgTheme: bgThemeSelect.value || 'purple',
    bgCustomColor: bgCustomColorInput.value || '#667eea',
    bgImageUrl: bgImageUrlInput.value.trim(),
    navbarColor1: navbarColor1Input.value || '#3a1a6e',
    navbarColor2: navbarColor2Input.value || '#2d1157',
    navbarTextColor: navbarTextColorInput.value || '#ffffff',
    folderTitlebarColor1: folderTitlebarColor1Input.value || '#667eea',
    folderTitlebarColor2: folderTitlebarColor2Input.value || '#764ba2',
    folderBgColor: folderBgColorInput.value || '#ffffff',
    folderTextColor: folderTextColorInput.value || '#4a5568',
    folderTitleColor: folderTitleColorInput.value || '#ffffff',
    folderTitleFont: folderTitleFontInput.value.trim(),
    folderTitleFontSize: parseInt(folderTitleFontSizeInput.value, 10) || 13,
    bookmarkTitleFont: bookmarkTitleFontInput.value.trim(),
    bookmarkTitleFontSize: parseInt(bookmarkTitleFontSizeInput.value, 10) || 10,
    defaultFolderIcon: defaultFolderIconValue,
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
    defaultBmHeight: parseInt(defaultBmHeightInput.value, 10) || 80,
    bgTheme: bgThemeSelect.value || 'purple',
    bgCustomColor: bgCustomColorInput.value || '#667eea',
    bgImageUrl: bgImageUrlInput.value.trim(),
    navbarColor1: navbarColor1Input.value || '#3a1a6e',
    navbarColor2: navbarColor2Input.value || '#2d1157',
    navbarTextColor: navbarTextColorInput.value || '#ffffff',
    folderTitlebarColor1: folderTitlebarColor1Input.value || '#667eea',
    folderTitlebarColor2: folderTitlebarColor2Input.value || '#764ba2',
    folderBgColor: folderBgColorInput.value || '#ffffff',
    folderTextColor: folderTextColorInput.value || '#4a5568',
    folderTitleColor: folderTitleColorInput.value || '#ffffff',
    folderTitleFont: folderTitleFontInput.value.trim(),
    folderTitleFontSize: parseInt(folderTitleFontSizeInput.value, 10) || 13,
    bookmarkTitleFont: bookmarkTitleFontInput.value.trim(),
    bookmarkTitleFontSize: parseInt(bookmarkTitleFontSizeInput.value, 10) || 10,
    defaultFolderIcon: defaultFolderIconValue,
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
