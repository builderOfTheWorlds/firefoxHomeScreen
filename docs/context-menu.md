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

// folder right-click
{ type: 'folder', folderName: string }
```

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

| Element ID    | Visible when  | What it does                              |
|---------------|---------------|-------------------------------------------|
| `ctx-add-link`| folder        | Opens add-bookmark modal pre-set to folder |
| `ctx-remove`  | bookmark      | Removes the bookmark from config          |
