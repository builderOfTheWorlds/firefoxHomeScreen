// GitHub Sync Module
// Handles fetching and updating bookmark configuration from GitHub

class GitHubSync {
  constructor() {
    this.config = null;
  }

  // Load settings from browser storage
  async loadSettings() {
    const result = await browser.storage.sync.get(['githubToken', 'githubRepo', 'configPath']);
    return {
      token: result.githubToken || '',
      repo: result.githubRepo || '', // Format: "owner/repo"
      configPath: result.configPath || 'bookmarks.json'
    };
  }

  // Save settings to browser storage
  async saveSettings(settings) {
    await browser.storage.sync.set({
      githubToken: settings.token,
      githubRepo: settings.repo,
      configPath: settings.configPath
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
        'Authorization': `token ${settings.token}`,
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

    // GitHub returns file content as base64
    const content = atob(data.content);
    this.config = JSON.parse(content);

    // Cache the config locally
    await this.cacheConfig(this.config);

    return this.config;
  }

  // Update bookmarks configuration on GitHub
  async updateConfig(newConfig) {
    const settings = await this.loadSettings();

    if (!settings.token || !settings.repo) {
      throw new Error('GitHub token and repository must be configured in settings');
    }

    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Use "owner/repo"');
    }

    // First, get the current file to get its SHA (required for updates)
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;

    const getResponse = await fetch(getUrl, {
      headers: {
        'Authorization': `token ${settings.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getResponse.ok) {
      const currentFile = await getResponse.json();
      sha = currentFile.sha;
    }

    // Update the file
    const content = JSON.stringify(newConfig, null, 2);
    const encodedContent = btoa(content);

    const updateUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;

    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${settings.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update bookmarks configuration',
        content: encodedContent,
        sha: sha // Include SHA if file exists
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update config: ${updateResponse.status} ${updateResponse.statusText}`);
    }

    this.config = newConfig;
    await this.cacheConfig(newConfig);

    return newConfig;
  }

  // Cache config locally for offline access
  async cacheConfig(config) {
    await browser.storage.local.set({ cachedBookmarks: config });
  }

  // Get cached config
  async getCachedConfig() {
    const result = await browser.storage.local.get('cachedBookmarks');
    return result.cachedBookmarks || null;
  }

  // Get config (from cache or fetch from GitHub)
  async getConfig(forceRefresh = false) {
    if (forceRefresh || !this.config) {
      try {
        return await this.fetchConfig();
      } catch (error) {
        // If fetch fails, try to use cached version
        const cached = await this.getCachedConfig();
        if (cached) {
          this.config = cached;
          return cached;
        }
        throw error;
      }
    }
    return this.config;
  }
}

// Export for use in other scripts
window.GitHubSync = GitHubSync;
