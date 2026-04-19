# Firefox Bookmark Homescreen

A Firefox extension that replaces your new tab page with a customizable homescreen displaying bookmarks organized by folders. Bookmarks are synced across multiple machines using GitHub as the configuration backend.

## Features

- **Custom New Tab Page**: Beautiful, modern homescreen with organized bookmark folders
- **GitHub Sync**: Store your bookmark configuration in a GitHub repository
- **Cross-Device Sync**: Share your homescreen across multiple machines
- **Offline Support**: Cached bookmarks work even when offline
- **Easy Configuration**: Simple settings page for GitHub integration
- **Favicon Support**: Automatic favicon loading for bookmarks

## Screenshots

*Coming soon*

## Installation

### For Development/Testing

1. Clone this repository or download the files
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to the extension directory and select `manifest.json`
5. The extension will be loaded and the settings page will open

### Enabling Developer Mode in Firefox

Firefox doesn't have a single "developer mode" toggle like Chrome — instead, you load unsigned extensions via the debugging page:

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Browse to the extension directory and select `manifest.json`
4. The extension is now active — open a new tab to see it

> **Note:** Temporary add-ons are removed when Firefox restarts. To persist across restarts without signing, use [Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly), which allow unsigned extensions via `about:config` → set `xpinstall.signatures.required` to `false`.

### For Production Use

*Will be available on Firefox Add-ons store once published*

## Setup Instructions

### 1. Create a GitHub Repository

Create a new GitHub repository (can be private) to store your bookmarks configuration.

### 2. Create a Personal Access Token

1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Firefox Bookmark Homescreen")
4. Select the `repo` scope (full control of private repositories)
5. Click "Generate token"
6. **Copy the token** - you won't be able to see it again!

### 3. Create Your Bookmarks Configuration

Create a `bookmarks.json` file in your GitHub repository with the following structure:

```json
{
  "folders": [
    {
      "name": "Work",
      "bookmarks": [
        {
          "title": "Gmail",
          "url": "https://mail.google.com"
        },
        {
          "title": "Calendar",
          "url": "https://calendar.google.com"
        }
      ]
    },
    {
      "name": "Development",
      "bookmarks": [
        {
          "title": "GitHub",
          "url": "https://github.com"
        },
        {
          "title": "Stack Overflow",
          "url": "https://stackoverflow.com"
        }
      ]
    }
  ]
}
```

You can use the included `bookmarks.json` file as a template.

### 4. Configure the Extension

1. Click the extension settings button (gear icon) on the new tab page
2. Enter your GitHub Personal Access Token
3. Enter your repository in the format `username/repository-name`
4. Enter the path to your configuration file (default: `bookmarks.json`)
5. Click "Test Connection" to verify everything works
6. Click "Save Settings"

### 5. Sync Your Bookmarks

- Click the sync button (circular arrows) on the new tab page to fetch the latest bookmarks
- Bookmarks are cached locally for offline access
- The extension automatically loads cached bookmarks when you open a new tab

## Configuration File Format

The `bookmarks.json` file must follow this structure:

```json
{
  "folders": [
    {
      "name": "Folder Name",
      "bookmarks": [
        {
          "title": "Bookmark Title",
          "url": "https://example.com"
        }
      ]
    }
  ]
}
```

- **folders**: Array of folder objects
  - **name**: Display name for the folder
  - **bookmarks**: Array of bookmark objects
    - **title**: Display name for the bookmark
    - **url**: Full URL including protocol (http:// or https://)

## Privacy & Security

- **GitHub Token**: Your GitHub Personal Access Token is stored in Firefox's sync storage (encrypted if you use Firefox Sync)
- **Data Storage**: Bookmark configuration is cached locally in your browser
- **Network Requests**: The extension only makes requests to GitHub's API to fetch/update your configuration
- **No Tracking**: This extension does not collect, transmit, or store any usage data or analytics

## Development

### Project Structure

```
firefoxHomeScreen/
├── manifest.json           # Extension manifest
├── background.js          # Background script
├── newtab.html           # New tab page HTML
├── newtab.css            # New tab page styles
├── newtab.js             # New tab page logic
├── settings.html         # Settings page HTML
├── settings.css          # Settings page styles
├── settings.js           # Settings page logic
├── github-sync.js        # GitHub API integration
├── bookmarks.json        # Sample configuration
├── icons/                # Extension icons
└── README.md            # This file
```

### Python Environment

Tooling scripts (e.g. icon generation) use Python. A `.venv` is included for this:

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate
```

### Technologies Used

- Vanilla JavaScript (no frameworks)
- Firefox WebExtensions API
- GitHub REST API
- CSS Grid for responsive layout

### Future Enhancements

- [ ] Visual bookmark editor
- [ ] Import from Firefox bookmarks
- [ ] Export to other formats
- [ ] Theme customization
- [ ] Custom backgrounds
- [ ] Search functionality
- [ ] Drag-and-drop reordering
- [ ] Multiple configuration profiles
- [ ] Automatic sync intervals

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify as you wish.

## Troubleshooting

### Bookmarks not loading

1. Check your GitHub token is valid and has `repo` scope
2. Verify your repository name is in the correct format: `owner/repo`
3. Make sure `bookmarks.json` exists in your repository
4. Check the browser console for error messages
5. Try clicking the sync button to force a refresh

### "Configuration file not found" error

Make sure you have a `bookmarks.json` file in the root of your repository (or update the configuration path in settings if it's in a different location).

### Sync button keeps spinning

Check your internet connection and GitHub status. The extension will fall back to cached bookmarks if sync fails.

### Settings page won't open

Try right-clicking the extension icon and selecting "Manage Extension", then click "Preferences".

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/builderOfTheWorlds/firefoxHomeScreen/issues) on GitHub.
