# Adding a New Widget Type — Developer Guide

The new-tab grid supports more than one kind of card. Bookmark folders were
the original (and only, implicit) type; the [todo list widget](todo-widget.md)
was added as a second type without building any parallel
positioning/sync/context-menu system. This doc extracts that pattern so a
third widget (notes, a link/RSS feed, a countdown, whatever) can be added the
same way.

Read this alongside [todo-widget.md](todo-widget.md), which is the worked
example every step below points back to.

---

## The core idea

**A widget is just another entry in `page.folders[]`, tagged with a `type`
field.** Bookmark folders have no `type` (`undefined`). Everything in
`newtab.js` that handles position, resizing, collapsing, page membership,
and "Move to Page" operates generically on the folder's *shell*
(`folderDiv`, `cfgFolder.x/y/rw/rh`, `folder.name`) — it never inspects
folder *content*. So a new type gets drag-move, resize, collapse, and
cross-page moves for free, just by living in the same array.

What is **not** free, and what you have to build per type:
1. What renders inside the card (the content-specific part of `renderBookmarks`).
2. Which context-menu items apply to it, and their handlers.
3. Whether it reuses the folder edit modal, needs its own, or needs none.
4. How its children (if it has any — todo items, notes, etc.) sync/merge in `github-sync.js`.
5. Its CSS.

Everything else — the "shell" — you should *not* touch.

---

## Step-by-step

Below, `WIDGET_TYPE` is a stand-in for your new type string (e.g. `'notes'`).
Concrete line/function references point at how the todo widget (`'todo'`)
did it — read the referenced function fresh, since exact line numbers drift.

### 1. Define your data shape

Decide the fields your folder object needs beyond the generic ones every
folder already has (`name, x, y, rw, rh, width, minHeight, icon, collapsed,
lastModified`). If your widget has a list of child entities that need to
sync independently (like todo `items`), give them:
- A stable `id` per entity (see `generateItemId()` in `newtab.js`, used as a `crypto.randomUUID()` wrapper with a fallback).
- Their own `lastModified` per entity, for last-write-wins merge.
- A parallel `<yourEntity>Tombstones` array (`[{ id, deletedAt }]`) if entities can be deleted — this is what lets deletions propagate correctly across devices instead of getting silently resurrected by a stale sync.

If your widget has no child entities (e.g. a single block of freeform text),
you don't need entity IDs or tombstones at all — the folder's own
`lastModified` already gives you last-write-wins merge for the whole widget.

**Pick a default `icon` explicitly** (a literal emoji string) rather than
leaving it `undefined` — `undefined` means "inherit the global default
bookmark-folder icon" (`currentDefaultFolderIcon`), which will look wrong on
a non-bookmark card.

### 2. Add a creation entry point

The todo widget added a new toolbar button (`#add-todo-btn` in
`newtab.html`, wired near the existing `addBtn.addEventListener('click', ...)`
in `newtab.js`) using `prompt()` for the name — the same lightweight pattern
already used for page rename/creation (search `prompt(` in `newtab.js`).

Whatever your entry point looks like, the handler needs to:
1. Load config: `const config = await getConfig() || { pages: [...] };`
2. `ensurePages(config);` then `const activePage = getActivePage(config);`
3. **Check for a name collision against ALL folders, not just your type** — `activePage.folders.find(f => f.name === trimmed)`. Folder names are one shared namespace regardless of `type`.
4. Push your new folder object (per your data shape from step 1), leaving `x/y/rw/rh/width/minHeight/collapsed` unset so the grid-default fallback in `renderBookmarks` positions it.
5. `await applyLocalChange(config, currentPageId);` — this is the single funnel every mutation goes through (writes IndexedDB via `BookmarkDB.put`, mirrors to `browser.storage.local`, marks the page dirty for sync, and re-renders). Reuse it; don't invent a new persistence path.

If adding an *item* to your widget (not the widget itself) needs its own UI
(like the todo card's inline "add item" row), build that inline inside your
card's content block from step 3, not as a new global modal — the existing
`#add-modal` is tightly coupled to bookmark `{title, url}` fields and isn't
worth generalizing for a second content type.

### 3. Render your card's content

`renderBookmarks(config)` in `newtab.js` has one `folders.forEach((folder, fi) => {...})`
loop. It builds the **shared shell** first (folderDiv position/size/collapse
state, the titlebar with its drag-move/collapse/context-menu wiring, and —
at the very end — the resize handle). In the middle, there's a branch:

```js
if (folder.type === 'todo') {
  // todo-specific content, appended to folderBody
} else {
  // bookmark-specific content (unchanged)
}
```

Add another arm for your type:

```js
} else if (folder.type === 'WIDGET_TYPE') {
  // build your DOM, append it to folderBody
} else {
  // bookmarks (default / no type)
}
```

Rules to follow, learned from the todo implementation:
- Build DOM via `document.createElement` (this file never uses `innerHTML` for content), matching the existing convention.
- Everything you build lives inside `folderBody` — you do **not** touch `titlebar` or the resize handle.
- Controls inside `folderBody` (checkboxes, inputs, buttons) do **not** need `e.stopPropagation()` on `mousedown` — `folderBody` is a sibling of `titlebar`, not a descendant, so nothing inside it can bubble into the folder-drag handler. (Compare: `collapseBtn` *does* need `stopPropagation()`, because it's nested inside `titlebar`.)
- Every mutation your content triggers (checking a box, editing text, adding/removing a child entity) follows the same pattern: `getConfig()` → find your folder by name in `activePage.folders` → mutate → bump `lastModified` on both the entity and the folder → `applyLocalChange(config, currentPageId)`.
- Check the empty-page gate near the top of `renderBookmarks` (`if (!config || !config.pages || folders.length === 0)`) — it's a pure array-length check, so a page containing only your new widget type already renders correctly. No change needed there unless you're doing something unusual.

### 4. Wire the context menu

The shared `#context-menu` in `newtab.html`, driven by `showContextMenu(x, y, target)`
and the module-level `ctxTarget` in `newtab.js`, shows/hides `<li>` items
based on `target.type`. The type union is currently
`'bookmark' | 'folder' | 'todo' | 'todo-item'` — extend it with your own
(e.g. `'WIDGET_TYPE'`, and `'WIDGET_TYPE-item'` if you have child entities).

1. In `newtab.html`, add any new `<li id="ctx-...">` items you need.
2. In `newtab.js`, grab them as DOM refs near the other `ctx*` consts.
3. In `showContextMenu()`, decide which existing items your card-level type should share. The todo widget reused `ctxEdit`, `ctxShrinkToFit`, and `ctxMovePage` outright (folder-level operations that are already content-agnostic) by widening their guards to `target.type === 'folder' || target.type === 'todo'` — do the same for yours if applicable.
4. Add `.toggle('hidden', target.type !== 'WIDGET_TYPE')` (or similar) for any menu items unique to your type.
5. **If you add a `'WIDGET_TYPE-item'` target type, make sure `ctxEdit` is hidden for it** unless you've also taught `openEditModal`/`saveEdit` to handle that type — otherwise "Edit" will be shown but will crash trying to read bookmark-shaped fields off an object that doesn't have them. (This was a real bug caught during todo-item implementation — `ctxEdit.classList.toggle('hidden', target.type === 'todo-item')`.)
6. Fire `showContextMenu` from your new elements' `contextmenu` listeners, same as the titlebar (`titlebar.addEventListener('contextmenu', ...)`) and per-item listeners in the todo branch.
7. Add `click` handlers for your new menu items near the existing `ctxRemove` / `ctxRemoveItem` / `ctxDeleteList` handlers, following their exact shape (look up folder by name, mutate, tombstone if deleting, `applyLocalChange`, `showStatus`).

See [context-menu.md](context-menu.md) for the general context-menu mechanics doc (now updated to include the todo-item type as a second worked example alongside bookmark/folder).

### 5. Decide what the edit modal does for your type

`openEditModal(target)` / `saveEdit()` already branch on `target.type`. The
"folder" branch shows generic fields (name / width / min-height / icon) —
these aren't bookmark-specific, so the todo widget just widened the checks
to `target.type === 'folder' || target.type === 'todo'` and got a working
"Edit Todo List" dialog for free (right down to reusing `FOLDER_ICONS` /
`buildIconPicker`).

If your widget needs genuinely new fields (not just name/width/height/icon),
you have two choices: add new hidden `.modal-group` blocks to `#edit-modal`
and a new branch in `openEditModal`/`saveEdit`, or build a separate small
modal if the fields are unrelated enough that sharing one modal would be
more conditional-logic than reuse. The folder/bookmark split in the existing
modal is a reasonable model for either approach.

### 6. Check the two known "corruption risk" spots

Two places in the bookmark-only code assume every folder in
`activePage.folders` can safely receive a bookmark, and will silently inject
a stray `.bookmarks` array into any folder that doesn't expect one:

1. **`openAddModal()`** — populates the "Add Bookmark" destination
   `<select>` from *all* folders. It now filters `f.type !== 'todo'`; if your
   widget also shouldn't accept bookmarks, add it to that filter
   (`f.type !== 'todo' && f.type !== 'WIDGET_TYPE'`, or generalize to
   `!f.type` if bookmark folders remain the only valid destination).
2. **Titlebar drag/drop** (in the titlebar's `dragover`/`drop` listeners
   inside `renderBookmarks`) — dropping a dragged bookmark tile onto a
   folder's titlebar moves it there via `moveBookmarkToFolder`. This is now
   guarded with `|| folder.type === 'todo'`; extend the guard for your type
   too unless you deliberately want bookmarks droppable onto it.

If a future widget type *should* accept bookmarks (unlikely, but possible),
skip these guards for it and make sure your content-rendering branch (step 3)
actually has something that renders `folder.bookmarks` sensibly.

### 7. Add sync/merge support

`github-sync.js`'s `_mergeFolders` picks a winning folder version
(`_pickWinner`, by `lastModified`) then merges its children. It branches on
`winner.type`:

```js
if (winner.type === 'todo') {
  // merge items/itemTombstones, keyed by 'id'
} else {
  // merge bookmarks/bookmarkTombstones, keyed by 'url'
}
```

Both branches call the same generic `_mergeEntities(localList, remoteList, tombstones, keyField)`
— a last-write-wins-per-entity merge with tombstone support, parameterized
on the id field. If your widget has child entities, add a branch here the
same way, calling `_mergeEntities` with your own key field. If your widget
has no child entities (just folder-level fields), you don't need a branch
here at all — the folder-level `_pickWinner` already covers it.

Also extend `_purgeStaleTombstones` if you added a new tombstone array, so
old tombstones get pruned before every push (mirroring how it already
branches between `bookmarkTombstones` and `itemTombstones`).

`fetchConfig`/`updateConfig` and their v1/v2 variants need **no changes** —
they round-trip the whole config as opaque JSON with no per-type
serialization logic. This should stay true for any new widget type; if you
find yourself needing to touch those functions, something has gone wrong.

### 8. Style it

Add your CSS in `newtab.css`, building on the existing theme custom
properties (`--folder-bg`, `--folder-text-color`, `--folder-titlebar-color1`,
etc., defined in `:root` and set at runtime by `applyStyleSettings()`) so
your widget automatically matches whatever theme the user has configured,
the same way `.todo-list`/`.todo-item` do. Don't hardcode colors.

If you add a new toolbar button, give it `class="add-btn"` — the shared
`.add-btn, .sync-btn, .settings-btn, .reset-positions-btn` rule already
styles any element with that class; you don't need a new button rule.

---

## Checklist

- [ ] Data shape decided (step 1) — entity IDs + tombstones only if you have child entities
- [ ] Creation entry point (step 2) — name-collision check against **all** folders
- [ ] `renderBookmarks` content branch (step 3) — shell untouched, mutations go through `applyLocalChange`
- [ ] Context menu (step 4) — `ctxTarget` type union extended, `ctxEdit` hidden for any new "item" sub-type unless handled
- [ ] Edit modal (step 5) — reuse folder fields or add new ones deliberately
- [ ] Corruption-risk guards (step 6) — `openAddModal` filter, titlebar bookmark-drop guard
- [ ] Sync/merge (step 7) — `_mergeFolders` branch + `_mergeEntities` call, `_purgeStaleTombstones` branch
- [ ] CSS (step 8) — theme variables, not hardcoded colors
- [ ] Manual test pass: create, mutate, resize/move/collapse, move-to-page, delete, and a sync round-trip if you have GitHub sync configured

For the fully worked example this guide is extracted from, see
[todo-widget.md](todo-widget.md).
