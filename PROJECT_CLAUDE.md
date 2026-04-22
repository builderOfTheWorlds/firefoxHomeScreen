# Project-Specific Notes

## Adding New Settings

Every new setting must be wired up in **four** places. Missing any one of them means the value won't persist or won't apply:

1. **`settings.html`** — add the input element(s)
2. **`settings.js`** — add DOM ref, event listener (for range displays), load into input in `loadSettings()`, and include in the settings object in both `saveSettings()` and `testConnection()`
3. **`github-sync.js`** — add the key to the `browser.storage.sync.get([...])` array in `loadSettings()`, add it to the returned object with a default value, and add it to the `browser.storage.sync.set({...})` call in `saveSettings()`
4. **`newtab.js`** — read the value from the settings object and apply it (CSS variable, DOM attribute, etc.)

The most common mistake is forgetting step 3 (`github-sync.js`), which causes values to appear to save but never actually persist or be returned.
