# Context Menu — Developer Guide

The right-click context menu is implemented across two files:
- [newtab.html](../newtab.html) — menu markup
- [newtab.js](../newtab.js) — state, show/hide logic, and item handlers

---

## How it works

The menu is a single `<div id="context-menu">` with `<li>` items inside a `<ul>`. Items are shown or hidden based on what was right-clicked using the `.hidden` CSS class.

`ctxTarget` holds the state of the current right-click:
```js
// bookmark right-click
{ type: 'bookmark', folderName: string, bookmarkUrl: string }

// bookmark-folder right-click
{ type: 'folder', folderName: string }

// todo-list-card right-click (see docs/todo-widget.md)
{ type: 'todo', folderName: string }

// todo-item right-click
{ type: 'todo-item', folderName: string, itemId: string }
```

`'folder'` and `'todo'` are both "folder-like" — actions that don't care
about content (Edit, Move to Page, Shrink to Fit) are shown for both via an
`isFolderLike` check in `showContextMenu`. See
[adding-widget-types.md](adding-widget-types.md) if you're adding a third
card type and need to extend this union further.

`showContextMenu(x, y, target)` positions the menu, sets `ctxTarget`, and toggles item visibility based on `target.type`.

---

## Adding a new menu item

### 1. Add the markup — [newtab.html](../newtab.html)

Inside `<div id="context-menu"> > <ul>`, add a new `<li>`:

```html
<li id="ctx-my-action">My Action</li>
```

### 2. Grab the element — [newtab.js](../newtab.js) near line 14

```js
const ctxMyAction = document.getElementById('ctx-my-action');
```

### 3. Control visibility in `showContextMenu`

Show/hide based on context type:

```js
// show only for bookmarks
ctxMyAction.classList.toggle('hidden', target.type !== 'bookmark');

// show only for folders
ctxMyAction.classList.toggle('hidden', target.type !== 'folder');

// show for both — omit the toggle line entirely (always visible)

// show for any "folder-like" card type (folder, todo, and any future widget)
const isFolderLike = target.type === 'folder' || target.type === 'todo';
ctxMyAction.classList.toggle('hidden', !isFolderLike);
```

### 4. Add a right-click source (if needed)

To trigger the menu from a new element, add a `contextmenu` listener in `renderBookmarks`:

```js
myElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, { type: 'folder', folderName: folder.name });
});
```

### 5. Handle the click — [newtab.js](../newtab.js) after the other `ctx*` handlers

```js
ctxMyAction.addEventListener('click', async () => {
  if (!ctxTarget) return;
  const { folderName, bookmarkUrl } = ctxTarget;
  hideContextMenu();
  // your logic here
});
```

---

## Current items

| Element ID           | Visible when         | What it does                                     |
|----------------------|----------------------|---------------------------------------------------|
| `ctx-add-link`       | folder                | Opens add-bookmark modal pre-set to folder        |
| `ctx-edit`           | folder, todo          | Opens the edit modal (name/width/height/icon)     |
| `ctx-shrink-to-fit`  | folder, todo          | Resizes the card to fit its content               |
| `ctx-move-page`      | folder, todo          | Opens the "move to page" submenu                  |
| `ctx-refresh-screenshot` | bookmark          | Re-captures the bookmark's screenshot             |
| `ctx-remove`         | bookmark              | Removes the bookmark from config                  |
| `ctx-remove-item`    | todo-item              | Removes a single todo item                        |
| `ctx-delete-list`    | todo                   | Deletes the whole todo list (with confirm)        |
