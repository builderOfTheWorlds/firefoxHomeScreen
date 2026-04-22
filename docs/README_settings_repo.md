# firefoxHomeScreen_settings

Private settings repository for the [GitHub Bookmark Homescreen](https://github.com/builderOfTheWorlds/firefoxHomeScreen-extension) Firefox extension.

## What's in this repo

This repo stores your personal bookmark configuration, synced automatically by the extension:

- **`bookmarks.json`** — your bookmark folders and links (or whatever path you configured)

The extension reads and writes this file via the GitHub API using a personal access token you provide in the extension settings.

## How syncing works

1. The extension fetches `bookmarks.json` from this repo on every new tab load.
2. When you add, move, or delete bookmarks in the extension, it pushes an updated `bookmarks.json` back to this repo.
3. Because sync goes through GitHub, your bookmarks are available on any Firefox instance where the extension is installed and pointed at this repo.

## Setup

1. Generate a GitHub personal access token with `repo` scope at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Open the extension settings (click the extension icon → settings).
3. Enter your token, this repo's full name (`builderOfTheWorlds/firefoxHomeScreen_settings`), and the config path (`bookmarks.json`).
4. Click **Test Connection** to verify, then **Save**.

## bookmarks.json format

```json
[
  {
    "name": "Folder Name",
    "bookmarks": [
      { "title": "Example", "url": "https://example.com" }
    ]
  }
]
```

## Privacy

This is a private repository. Your bookmarks and token are never shared publicly. The extension requests only the permissions it needs (`storage`, `tabs`, GitHub API access) and collects no data.
