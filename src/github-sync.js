// GitHub Sync Module
// Handles fetching and pushing bookmark configuration to/from GitHub

class GitHubSync {
  // Load settings from browser storage
  async loadSettings() {
    const result = await browser.storage.sync.get([
      'githubToken', 'githubRepo', 'configPath',
      'folderColumns', 'folderPadding', 'bookmarkIconSize', 'screenshotHeight', 'screenshotDelay',
      'defaultFolderMinWidth', 'defaultFolderMinHeight', 'defaultBmWidth', 'defaultBmHeight', 'bookmarkScale'
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
      bookmarkScale: result.bookmarkScale || 100
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
      bookmarkScale: settings.bookmarkScale
    });
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
    return JSON.parse(atob(data.content));
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
    const encodedContent = btoa(content);

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
