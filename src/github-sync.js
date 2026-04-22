// GitHub Sync Module
// Handles fetching and pushing bookmark configuration to/from GitHub

class GitHubSync {
  // Load settings from browser storage
  async loadSettings() {
    const result = await browser.storage.sync.get([
      'githubToken', 'githubRepo', 'configPath',
      'folderColumns', 'folderPadding', 'bookmarkIconSize', 'screenshotHeight', 'screenshotDelay',
      'defaultFolderMinWidth', 'defaultFolderMinHeight', 'defaultBmWidth', 'defaultBmHeight', 'bookmarkScale', 'defaultFolderIcon',
      'bgTheme', 'bgCustomColor', 'bgImageUrl',
      'navbarColor1', 'navbarColor2', 'navbarTextColor',
      'folderTitlebarColor1', 'folderTitlebarColor2', 'folderBgColor', 'folderTextColor', 'folderTitleColor',
      'folderTitleFont', 'folderTitleFontSize', 'bookmarkTitleFont', 'bookmarkTitleFontSize'
    ]);
    return {
      token: result.githubToken || '',
      repo: result.githubRepo || '',
      configPath: result.configPath || 'bookmarks.json',
      folderColumns: result.folderColumns || 4,
      folderPadding: result.folderPadding || 24,
      bookmarkIconSize: result.bookmarkIconSize || 28,
      screenshotHeight: result.screenshotHeight || 100,
      screenshotDelay: result.screenshotDelay ?? 1500,
      defaultFolderMinWidth: result.defaultFolderMinWidth || 0,
      defaultFolderMinHeight: result.defaultFolderMinHeight || 0,
      defaultBmWidth: result.defaultBmWidth || 80,
      defaultBmHeight: result.defaultBmHeight || 80,
      bookmarkScale: result.bookmarkScale || 100,
      bgTheme: result.bgTheme || 'purple',
      bgCustomColor: result.bgCustomColor || '#667eea',
      bgImageUrl: result.bgImageUrl || '',
      navbarColor1: result.navbarColor1 || '#3a1a6e',
      navbarColor2: result.navbarColor2 || '#2d1157',
      navbarTextColor: result.navbarTextColor || '#ffffff',
      folderTitlebarColor1: result.folderTitlebarColor1 || '#667eea',
      folderTitlebarColor2: result.folderTitlebarColor2 || '#764ba2',
      folderBgColor: result.folderBgColor || '#ffffff',
      folderTextColor: result.folderTextColor || '#4a5568',
      folderTitleColor: result.folderTitleColor || '#ffffff',
      folderTitleFont: result.folderTitleFont || '',
      folderTitleFontSize: result.folderTitleFontSize || 13,
      bookmarkTitleFont: result.bookmarkTitleFont || '',
      bookmarkTitleFontSize: result.bookmarkTitleFontSize || 10,
      defaultFolderIcon: result.defaultFolderIcon !== undefined ? result.defaultFolderIcon : '📁',
    };
  }

  // Save settings to browser storage
  async saveSettings(settings) {
    await browser.storage.sync.set({
      githubToken: settings.token,
      githubRepo: settings.repo,
      configPath: settings.configPath,
      folderColumns: settings.folderColumns,
      folderPadding: settings.folderPadding,
      bookmarkIconSize: settings.bookmarkIconSize,
      screenshotHeight: settings.screenshotHeight,
      screenshotDelay: settings.screenshotDelay,
      defaultFolderMinWidth: settings.defaultFolderMinWidth,
      defaultFolderMinHeight: settings.defaultFolderMinHeight,
      defaultBmWidth: settings.defaultBmWidth,
      defaultBmHeight: settings.defaultBmHeight,
      bookmarkScale: settings.bookmarkScale,
      bgTheme: settings.bgTheme,
      bgCustomColor: settings.bgCustomColor,
      bgImageUrl: settings.bgImageUrl,
      navbarColor1: settings.navbarColor1,
      navbarColor2: settings.navbarColor2,
      navbarTextColor: settings.navbarTextColor,
      folderTitlebarColor1: settings.folderTitlebarColor1,
      folderTitlebarColor2: settings.folderTitlebarColor2,
      folderBgColor: settings.folderBgColor,
      folderTextColor: settings.folderTextColor,
      folderTitleColor: settings.folderTitleColor,
      folderTitleFont: settings.folderTitleFont,
      folderTitleFontSize: settings.folderTitleFontSize,
      bookmarkTitleFont: settings.bookmarkTitleFont,
      bookmarkTitleFontSize: settings.bookmarkTitleFontSize,
      defaultFolderIcon: settings.defaultFolderIcon,
    });
  }

  // Load imported VSCode themes from local storage
  async loadImportedThemes() {
    const result = await browser.storage.local.get('importedThemes');
    return result.importedThemes || [];
  }

  // Save imported VSCode themes to local storage
  async saveImportedThemes(themes) {
    await browser.storage.local.set({ importedThemes: themes });
  }

  // Fetch bookmarks configuration from GitHub
  async fetchConfig() {
    const settings = await this.loadSettings();

    if (!settings.token || !settings.repo) {
      throw new Error('GitHub token and repository must be configured in settings');
    }

    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Use "owner/repo"');
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${settings.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Configuration file not found in repository');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(decodeURIComponent(escape(atob(data.content))));
  }

  // Push bookmarks configuration to GitHub
  // Retries on 409 (SHA conflict) because GitHub's CDN can briefly serve a
  // stale SHA immediately after a commit, causing the next PUT to conflict.
  async updateConfig(newConfig, _attempt = 0) {
    const settings = await this.loadSettings();

    if (!settings.token || !settings.repo) {
      throw new Error('GitHub token and repository must be configured in settings');
    }

    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Use "owner/repo"');
    }

    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;
    const authHeaders = {
      'Authorization': `Bearer ${settings.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    // Always fetch a fresh SHA immediately before the PUT so we have the
    // latest value even if a previous commit changed it.
    const getResponse = await fetch(fileUrl, { headers: authHeaders });
    let sha = null;
    if (getResponse.ok) {
      const currentFile = await getResponse.json();
      sha = currentFile.sha;
    }

    const content = JSON.stringify(newConfig, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const updateResponse = await fetch(fileUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(
        { message: 'Update bookmarks configuration', content: encodedContent },
        sha ? { sha } : {}
      ))
    });

    if (updateResponse.status === 409 && _attempt < 3) {
      const delay = 500 * (_attempt + 1);
      console.warn(`[GitHubSync] 409 SHA conflict (attempt ${_attempt + 1}), retrying in ${delay}ms…`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.updateConfig(newConfig, _attempt + 1);
    }

    if (!updateResponse.ok) {
      throw new Error(`Failed to update config: ${updateResponse.status} ${updateResponse.statusText}`);
    }

    return newConfig;
  }
}

// Export for use in other scripts
window.GitHubSync = GitHubSync;
