# Mobile (Firefox for Android) — Developer Guide

Support for Firefox on Android is **view + launch only**: you can open the homescreen,
tap bookmarks to launch them, and add new bookmarks from the popup. Renaming,
deleting, reordering, and resizing folders/bookmarks stays a desktop-only task —
that UI is entirely mouse-driven (drag-and-drop, right-click) and touch input
isn't wired up for it.

## Why it can't just work like desktop

Firefox for Android does not support the `chrome_url_overrides` manifest key
([Mozilla's own docs](https://extensionworkshop.com/documentation/develop/differences-between-desktop-and-android-extensions/),
long-standing since [bug 1414785](https://bugzilla.mozilla.org/show_bug.cgi?id=1414785)).
That's the mechanism [manifest.json](../manifest.json) uses to make `newtab.html`
appear automatically on every new tab — on Android it's simply never invoked. There's
no manifest trick or permission that restores it; the page has to be reached some
other way.

## How it's reached instead

- [popup.html](../popup.html) / [popup.js](../popup.js) — the toolbar popup (normally
  just the "Add Current Page" form) gets an **"Open Homescreen ↗"** button at the top,
  shown only when `browser.runtime.getPlatformInfo()` reports `os === 'android'`. It
  opens `newtab.html` in a new tab via `browser.tabs.create` and closes the popup.
- From there, the user can use Firefox's menu → **Add to Home screen** to pin that tab
  as a real icon on the phone's home screen, so day-to-day it behaves like a launcher
  rather than something re-opened from the popup each time.
- The pinned shortcut points at `moz-extension://<install-uuid>/newtab.html`. That UUID
  is stable across updates but is regenerated on a full uninstall/reinstall — reinstalling
  the extension means re-pinning the shortcut.

## Layout: why folders don't use their saved desktop positions on narrow screens

Folders are normally placed with an absolute pixel `x`/`y` saved from desktop drag
positioning (`folder.x` / `folder.y`, applied in `newtab.js` `renderBookmarks()`). Those
coordinates assume a desktop-width canvas — unchanged, most folders would render
off-screen to the right on a phone. [newtab.css](../newtab.css) has a
`@media (max-width: 700px)` block at the end of the file that overrides this with
`!important`, forcing every `.folder` to `position: static; width: 100%`, so folders
stack in a single full-width column in their normal DOM/array order instead. It also
hides the resize handle (drag-resize needs a mouse).

This is pure CSS — `renderBookmarks()` still writes the same inline `left`/`top`/`width`
styles it always has; the media query just outranks them below the breakpoint. Nothing
about the desktop layout or its saved folder positions changes.

## What still doesn't work on mobile (by design, this pass)

- Drag-to-reorder or drag-to-move (`dragstart`/`dragover`/`drop` throughout `newtab.js`)
- Right-click context menu for rename/delete (see [context-menu.md](context-menu.md)) —
  Android doesn't reliably deliver a JS `contextmenu` event from long-press
- Folder resize handle (mouse-drag only; hidden via CSS below the breakpoint)

Editing the bookmark config remains a desktop (or direct GitHub edit of `bookmarks.json`)
task. Extending editing to touch would mean replacing these interactions with
tap-friendly equivalents (e.g. a long-press action sheet, explicit move up/down
buttons) — a separate, larger change from what's described here.

## Manifest requirements

- `browser_specific_settings.gecko_android: {}` — required for AMO/Android to offer
  the install at all; without it the extension is desktop-only regardless of what
  APIs it uses.
- `background.persistent: false` — Android kills persistent background pages.
  [background.js](../background.js) registers its listeners synchronously at
  top-level so Firefox can reload it and redeliver queued events after a suspend.
