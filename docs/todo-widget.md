# Todo List Widget

A second card type on the new-tab grid, alongside bookmark folders: a
per-page todo list rendered as a small table (item / added / completed).
Added so the new-tab page can double as a lightweight daily dashboard, not
just a link launcher.

Implemented across:
- [github-sync.js](../src/github-sync.js) — merge/sync support
- [newtab.html](../src/newtab.html) — toolbar button, context menu items
- [newtab.js](../src/newtab.js) — rendering, interactions, persistence
- [newtab.css](../src/newtab.css) — card styling

See [adding-widget-types.md](adding-widget-types.md) for the general pattern
this feature follows — useful if you want to add a third widget type later.

---

## How it works

Todo widgets are **not** a separate system. They're entries in the same
`page.folders[]` array as bookmark folders, distinguished by a `type: 'todo'`
field (bookmark folders have no `type`). Because nearly everything in
`newtab.js` — drag-move, resize, collapse, page assignment, "Move to Page" —
operates generically on `folderDiv` / `cfgFolder.x/y/rw/rh` / `folder.name`
rather than on folder *content*, a todo card gets all of that for free. Only
the parts that are genuinely content-specific were built new: what renders
inside the card, which context-menu items apply, and how the sync layer
merges the card's children.

### Data shape

```js
{
  type: 'todo',
  name: 'To-Do',
  items: [{ id, text, done, created, completedAt, lastModified }],
  itemTombstones: [{ id, deletedAt }],
  icon: '✅',            // literal default — does NOT inherit the bookmark-folder default icon
  x, y, rw, rh, width, minHeight, collapsed, lastModified   // same generic fields as bookmark folders
}
```

`created` is stamped once, when the item is added (renders in the "Added"
column as date and time on stacked lines via `renderTodoTimestamp()`).
`completedAt` is stamped the
moment an item transitions to `done: true` via double-click; it is **not**
cleared when the item is later reopened — it's a record of the last time the
item was completed, not a mirror of the `done` flag. Items created before
this field existed simply render `—` in that column until they're
double-clicked closed for the first time.

A todo list with 0 items is still meaningful (unlike an emptied bookmark
folder, which auto-deletes) — it's removed only via the explicit "Delete
List" context-menu action.

Folder names are one shared namespace across both types — a todo list and a
bookmark folder on the same page can't share a name, since lookups (`_mergeFolders`
in github-sync.js, `activePage.folders.find(f => f.name === ...)` everywhere
in newtab.js) match purely by name, ignoring `type`.

---

## User-facing behavior

| Action | How |
|---|---|
| Create a list | Click **To-Do** in the header (`#add-todo-btn`) → `prompt()` for a name |
| Add an item | Type in the input row at the bottom of the card, Enter or **+** |
| Toggle complete | Double-click the row (strikethrough via `.todo-item.done`; stamps/keeps the "Completed" column) |
| Edit an item's text | Right-click the item → **Edit Item** → `prompt()` for new text |
| Remove an item | Right-click the item → **Remove Item** |
| Rename / resize / re-icon the list | Right-click the card's titlebar → **Edit** (reuses the folder edit modal) |
| Move to another page | Right-click the card's titlebar → **Move to Page** |
| Auto-size to contents | Right-click the card's titlebar → **Shrink to Fit** |
| Delete the whole list | Right-click the card's titlebar → **Delete List** (confirms first) |

Adding a bookmark to a todo list, or dragging a bookmark tile onto one, is
deliberately blocked — see "Guardrails" below.

The table (`.todo-list`) defaults to a fixed 720px width so an auto-sized
card (no `rw`/`rh` set) shrink-wraps sensibly — `.folder`'s own CSS sizes it
via `width: max-content`, and a table with `overflow-wrap: break-word` cells
left at `width: auto` inside that kind of shrink-to-fit ancestor triggers a
real browser layout bug (observed in Chromium/Edge) that reports the text
column's intrinsic width as several thousand pixels, blowing the card out
to near full-viewport width. `table-layout: fixed` plus an explicit width
sidesteps it. Every column except Notes has an explicit pixel width
(`.todo-col-text` 228px, the two `.todo-col-date` columns 128px each,
`.todo-col-shortdate` 96px) — Notes is the only column left at auto width,
so under `table-layout: fixed` it's the one that absorbs any slack.

Once the card has been manually resized (`.has-explicit-size`, set from
`folder.rw`), `.folder.has-explicit-size .todo-list` switches to `width: 100%`
with a `min-width: 720px` floor — item/date columns hold their pixel widths
exactly (never squeezed, since the floor stops the table from going narrower
than the sum of their widths), the Notes column stretches to fill any extra
width, and `.folder-body` scrolls horizontally (`overflow-x: auto`) if the
card is narrower than the 720px floor.

---

## Sync / merge behavior

Sync piggybacks on the existing per-page, per-entity last-write-wins merge
(`github-sync.js`, `mergePageConfig` → `_mergeFolders`). `_mergeFolders` now
branches on `winner.type`:

- Bookmark folders merge `bookmarks`/`bookmarkTombstones` (keyed by `url`), as before.
- Todo folders merge `items`/`itemTombstones` (keyed by `id`).

Both paths call the same generalized `_mergeEntities(localList, remoteList, tombstones, keyField)`
helper — bookmark behavior is unchanged, just parameterized. `_purgeStaleTombstones`
purges whichever tombstone array applies to the folder's type before every push.

Practical implication: if the same todo item is edited on two machines within
one sync window (e.g. checked on device A, retitled on device B), whichever
edit has the later `lastModified` wins entirely — there's no field-level
merge within a single item. This matches how bookmarks already behave; it's
called out here because todo items (`done`/`completedAt` state) churn much
more often than bookmarks do.

---

## Guardrails (things that would otherwise corrupt data)

Two spots in the existing bookmark code had to be taught to ignore todo
folders, because both would otherwise inject a stray `.bookmarks` array into
a todo-typed folder object:

1. **`openAddModal()`** — the "Add Bookmark" modal's destination-folder
   `<select>` filters out `type: 'todo'` folders, so a todo list can never be
   chosen as a bookmark's home.
2. **Titlebar drag/drop** — dropping a dragged bookmark tile onto a todo
   card's titlebar is a no-op (`folder.type === 'todo'` short-circuits both
   the `dragover` and `drop` handlers).

If you add another widget type later, check whether it needs the same
treatment — see the "Guardrails" section in
[adding-widget-types.md](adding-widget-types.md).

---

## Explicitly out of scope (this iteration)

- `popup.js` (toolbar quick-add) — bookmark-only, unaware todo lists exist.
- `settings.js` / `settings.html` — no todo-specific settings were added.
- `background.js` — no todo-specific side effects (reminders, due dates, etc.).
- Reordering items within a list (drag-and-drop) — items only ever append; removal is the only reordering-adjacent operation.
- Hiding/collapsing completed items — done items stay in place with a strikethrough.

None of these are hard blockers — they just weren't needed for the first
version. See [adding-widget-types.md](adding-widget-types.md) if you want to
extend any of them.
