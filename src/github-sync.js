// GitHub Sync Module
// Handles fetching and pushing bookmark configuration to/from GitHub
//
// Schema versions:
//   v1 — single bookmarks.json file (configPath ends in ".json")
//   v2 — per-page files with timestamps + tombstones (configPath is a directory name)
//        index.json lists pages + appSettings; page-{id}.json holds each page's content
//
// Tombstones mark deleted folders/bookmarks so deletions propagate across machines.
// Tombstones older than TOMBSTONE_MAX_AGE_MS are purged on every push.

const TOMBSTONE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

class GitHubSync {
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
      configPath: result.configPath || 'bookmarks',
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

  async loadImportedThemes() {
    const result = await browser.storage.local.get('importedThemes');
    return result.importedThemes || [];
  }

  async saveImportedThemes(themes) {
    await browser.storage.local.set({ importedThemes: themes });
  }

  async applyRemoteSettings(appSettings) {
    const local = await this.loadSettings();
    await this.saveSettings({
      ...local,
      ...appSettings,
      token: local.token,
      repo: local.repo,
      configPath: local.configPath,
    });
  }

  // ─── Path helpers ──────────────────────────────────────────────────────────

  // v1: configPath is a filename like "bookmarks.json"
  // v2: configPath is a directory name like "bookmarks"
  _isV1Path(configPath) {
    return configPath.endsWith('.json');
  }

  _dirPath(configPath) {
    return configPath.endsWith('.json') ? configPath.slice(0, -5) : configPath;
  }

  _indexUrl(owner, repo, configPath) {
    return `https://api.github.com/repos/${owner}/${repo}/contents/${this._dirPath(configPath)}/index.json`;
  }

  _pageUrl(owner, repo, configPath, pageId) {
    return `https://api.github.com/repos/${owner}/${repo}/contents/${this._dirPath(configPath)}/page-${pageId}.json`;
  }

  _authHeaders(settings) {
    return {
      'Authorization': `Bearer ${settings.token}`,
      'Accept': 'application/vnd.github.v3+json',
    };
  }

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  async fetchConfig() {
    const settings = await this.loadSettings();
    if (!settings.token || !settings.repo) {
      throw new Error('GitHub token and repository must be configured in settings');
    }
    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) throw new Error('Invalid repository format. Use "owner/repo"');

    return this._isV1Path(settings.configPath)
      ? this._fetchV1(owner, repo, settings)
      : this._fetchV2(owner, repo, settings);
  }

  async _fetchV1(owner, repo, settings) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;
    const response = await fetch(url, { headers: this._authHeaders(settings) });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Configuration file not found in repository');
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const config = JSON.parse(decodeURIComponent(escape(atob(data.content))));
    config._remoteSha = data.sha;
    return config;
  }

  async _fetchV2(owner, repo, settings) {
    const authHeaders = this._authHeaders(settings);
    const cb = `?_=${Date.now()}`;

    const indexResp = await fetch(this._indexUrl(owner, repo, settings.configPath) + cb, { headers: authHeaders });
    if (!indexResp.ok) {
      if (indexResp.status === 404) {
        // Index doesn't exist yet — try the legacy single-file location so the
        // test connection works before the first v2 push, and so a first push can
        // migrate the data rather than starting from scratch.
        const legacyUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${this._dirPath(settings.configPath)}.json`;
        const legacyResp = await fetch(legacyUrl + cb, { headers: authHeaders });
        if (legacyResp.ok) {
          const data = await legacyResp.json();
          const config = JSON.parse(decodeURIComponent(escape(atob(data.content))));
          config._remoteSha = data.sha;
          config._migratingFromV1 = true; // hint to callers that v2 files don't exist yet
          return config;
        }
        throw new Error('Config not found. Sync from this machine first to create the config files.');
      }
      throw new Error(`GitHub API error: ${indexResp.status} ${indexResp.statusText}`);
    }
    const indexData = await indexResp.json();
    const index = JSON.parse(decodeURIComponent(escape(atob(indexData.content))));

    const pages = await Promise.all((index.pages || []).map(async (ref) => {
      const resp = await fetch(this._pageUrl(owner, repo, settings.configPath, ref.id) + cb, { headers: authHeaders });
      if (!resp.ok) {
        return { id: ref.id, name: ref.name, lastModified: 0, folders: [], folderTombstones: [] };
      }
      const data = await resp.json();
      const page = JSON.parse(decodeURIComponent(escape(atob(data.content))));
      page._sha = data.sha;
      return page;
    }));

    return {
      pages,
      appSettings: index.appSettings || {},
      _remoteSha: indexData.sha,
      _schemaVersion: 2,
    };
  }

  // ─── Push ──────────────────────────────────────────────────────────────────

  // dirtyPageIds: Set<string> — which page files need writing.
  //   null  → write all pages (used when dirty tracking is unavailable)
  //   empty → write index only (page renames, reorders, deletions)
  //   {ids} → write those page files + always write index
  async updateConfig(newConfig, dirtyPageIds = null, _attempt = 0) {
    const settings = await this.loadSettings();
    if (!settings.token || !settings.repo) {
      throw new Error('GitHub token and repository must be configured in settings');
    }
    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) throw new Error('Invalid repository format. Use "owner/repo"');

    return this._isV1Path(settings.configPath)
      ? this._updateV1(newConfig, owner, repo, settings, _attempt)
      : this._updateV2(newConfig, dirtyPageIds, owner, repo, settings, _attempt);
  }

  async _updateV1(newConfig, owner, repo, settings, _attempt) {
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settings.configPath}`;
    const authHeaders = this._authHeaders(settings);

    const getResponse = await fetch(`${fileUrl}?_=${Date.now()}`, { headers: authHeaders });
    let sha = null;
    if (getResponse.ok) sha = (await getResponse.json()).sha;

    const content = JSON.stringify({ ...newConfig, appSettings: this._buildAppSettings(settings) }, null, 2);
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
      console.warn(`[GitHubSync] 409 conflict (attempt ${_attempt + 1}), retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      return this._updateV1(newConfig, owner, repo, settings, _attempt + 1);
    }
    if (!updateResponse.ok) {
      throw new Error(`Failed to update config: ${updateResponse.status} ${updateResponse.statusText}`);
    }

    const responseData = await updateResponse.json();
    return { config: newConfig, sha: responseData.content?.sha };
  }

  async _updateV2(newConfig, dirtyPageIds, owner, repo, settings, _attempt) {
    const authHeaders = this._authHeaders(settings);

    const pagesToWrite = (dirtyPageIds === null)
      ? newConfig.pages
      : newConfig.pages.filter(p => dirtyPageIds.has(p.id));

    for (const page of pagesToWrite) {
      const { _sha: knownSha, ...pageData } = this._purgeStaleTombstones(page);
      const pageUrl = this._pageUrl(owner, repo, settings.configPath, page.id);

      // Always fetch the current SHA to avoid 409 conflicts.
      const getResp = await fetch(`${pageUrl}?_=${Date.now()}`, { headers: authHeaders });
      const sha = getResp.ok ? (await getResp.json()).sha : null;

      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(pageData, null, 2))));
      const putResp = await fetch(pageUrl, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(
          { message: `Update page ${page.id}`, content: encoded },
          sha ? { sha } : {}
        )),
      });

      if (putResp.status === 409 && _attempt < 3) {
        const delay = 500 * (_attempt + 1);
        console.warn(`[GitHubSync] 409 conflict on page ${page.id} (attempt ${_attempt + 1}), retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
        return this._updateV2(newConfig, dirtyPageIds, owner, repo, settings, _attempt + 1);
      }
      if (!putResp.ok) throw new Error(`Failed to update page ${page.id}: ${putResp.status} ${putResp.statusText}`);

      const putData = await putResp.json();
      if (putData.content?.sha) page._sha = putData.content.sha;
    }

    // Always write the index (page list + appSettings).
    const index = {
      schemaVersion: 2,
      pages: newConfig.pages.map(p => ({ id: p.id, name: p.name })),
      appSettings: this._buildAppSettings(settings),
    };
    const indexUrl = this._indexUrl(owner, repo, settings.configPath);
    const indexGetResp = await fetch(`${indexUrl}?_=${Date.now()}`, { headers: authHeaders });
    const indexSha = indexGetResp.ok ? (await indexGetResp.json()).sha : null;

    const indexEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(index, null, 2))));
    const indexPutResp = await fetch(indexUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(
        { message: 'Update bookmarks index', content: indexEncoded },
        indexSha ? { sha: indexSha } : {}
      )),
    });
    if (!indexPutResp.ok) throw new Error(`Failed to update index: ${indexPutResp.status} ${indexPutResp.statusText}`);

    const indexPutData = await indexPutResp.json();
    return { sha: indexPutData.content?.sha };
  }

  _buildAppSettings(settings) {
    return {
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
      defaultFolderIcon: settings.defaultFolderIcon,
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
    };
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  // Merge a remote page into a local page using per-entity timestamps.
  // Tombstones from both sides are merged; deletions always win over older edits.
  // The remote _sha is preserved so the next push uses the correct SHA.
  mergePageConfig(local, remote) {
    if (!local) return remote;
    if (!remote) return local;

    const folderTombstones = this._mergeTombstoneArrays(
      local.folderTombstones || [], remote.folderTombstones || [], 'name'
    );
    const folders = this._mergeFolders(
      local.folders || [], remote.folders || [], folderTombstones
    );

    return {
      ...remote,
      folders,
      folderTombstones,
      lastModified: Math.max(local.lastModified || 0, remote.lastModified || 0),
    };
  }

  // Keep the tombstone with the latest deletedAt for each key value.
  _mergeTombstoneArrays(a, b, key) {
    const map = new Map();
    for (const t of [...a, ...b]) {
      const existing = map.get(t[key]);
      if (!existing || t.deletedAt > existing.deletedAt) map.set(t[key], t);
    }
    return Array.from(map.values());
  }

  _mergeFolders(localFolders, remoteFolders, folderTombstones) {
    const tombstoneMap = new Map(folderTombstones.map(t => [t.name, t.deletedAt]));
    const localMap = new Map(localFolders.map(f => [f.name, f]));
    const remoteMap = new Map(remoteFolders.map(f => [f.name, f]));
    const allNames = new Set([...localMap.keys(), ...remoteMap.keys()]);

    const resolved = new Map();
    for (const name of allNames) {
      const local = localMap.get(name);
      const remote = remoteMap.get(name);
      const deletedAt = tombstoneMap.get(name);

      const winner = this._pickWinner(local, remote);
      if (!winner) continue;
      // Deletion wins if it happened after the winner's last edit.
      if (deletedAt !== undefined && deletedAt >= (winner.lastModified || 0)) continue;

      const bmTombstones = this._mergeTombstoneArrays(
        local?.bookmarkTombstones || [], remote?.bookmarkTombstones || [], 'url'
      );
      const bookmarks = this._mergeBookmarks(
        local?.bookmarks || [], remote?.bookmarks || [], bmTombstones
      );
      resolved.set(name, { ...winner, bookmarks, bookmarkTombstones: bmTombstones });
    }

    // Use remote folder order as the base; append local-only folders at the end.
    const order = [
      ...remoteFolders.map(f => f.name).filter(n => resolved.has(n)),
      ...localFolders.map(f => f.name).filter(n => resolved.has(n) && !remoteMap.has(n)),
    ];
    return order.map(n => resolved.get(n));
  }

  _mergeBookmarks(localBms, remoteBms, tombstones) {
    const tombstoneMap = new Map(tombstones.map(t => [t.url, t.deletedAt]));
    const localMap = new Map(localBms.map(b => [b.url, b]));
    const remoteMap = new Map(remoteBms.map(b => [b.url, b]));
    const allUrls = new Set([...localMap.keys(), ...remoteMap.keys()]);

    const resolved = new Map();
    for (const url of allUrls) {
      const winner = this._pickWinner(localMap.get(url), remoteMap.get(url));
      if (!winner) continue;
      const deletedAt = tombstoneMap.get(url);
      if (deletedAt !== undefined && deletedAt >= (winner.lastModified || 0)) continue;
      resolved.set(url, winner);
    }

    const order = [
      ...remoteBms.map(b => b.url).filter(u => resolved.has(u)),
      ...localBms.map(b => b.url).filter(u => resolved.has(u) && !remoteMap.has(u)),
    ];
    return order.map(u => resolved.get(u));
  }

  // Return whichever entity has the later lastModified, preferring remote on tie.
  _pickWinner(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    return (remote.lastModified || 0) >= (local.lastModified || 0) ? remote : local;
  }

  // Remove tombstones older than one week before writing to GitHub.
  _purgeStaleTombstones(page) {
    const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
    return {
      ...page,
      folderTombstones: (page.folderTombstones || []).filter(t => t.deletedAt > cutoff),
      folders: (page.folders || []).map(f => ({
        ...f,
        bookmarkTombstones: (f.bookmarkTombstones || []).filter(t => t.deletedAt > cutoff),
      })),
    };
  }

  // ─── Screenshot sync (unchanged) ──────────────────────────────────────────

  _urlToFilename(url) {
    return btoa(unescape(encodeURIComponent(url)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async _listScreenshots(owner, repo, authHeaders) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/screenshots?_=${Date.now()}`;
    const resp = await fetch(url, { headers: authHeaders });
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`GitHub API error listing screenshots: ${resp.status}`);
    return resp.json();
  }

  async syncScreenshots(allBookmarkUrls) {
    const settings = await this.loadSettings();
    if (!settings.token || !settings.repo) return;
    const [owner, repo] = settings.repo.split('/');
    if (!owner || !repo) return;

    const authHeaders = this._authHeaders(settings);
    const githubFiles = await this._listScreenshots(owner, repo, authHeaders);
    const githubMap = new Map(githubFiles.map(f => [f.name, f]));
    const filenameToUrl = new Map(allBookmarkUrls.map(url => [this._urlToFilename(url), url]));

    for (const url of allBookmarkUrls) {
      const filename = this._urlToFilename(url);
      if (githubMap.has(filename)) continue;
      let dataUrl;
      try { dataUrl = await ScreenshotDB.get(url); } catch { continue; }
      if (!dataUrl) continue;
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) continue;
      const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/screenshots/${filename}`;
      await fetch(fileUrl, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Sync screenshot', content: btoa(base64Data) }),
      }).catch(e => console.warn('[GitHubSync] screenshot upload failed for', url, e));
    }

    for (const [filename, file] of githubMap) {
      const bookmarkUrl = filenameToUrl.get(filename);
      if (!bookmarkUrl) continue;
      let existing;
      try { existing = await ScreenshotDB.get(bookmarkUrl); } catch { continue; }
      if (existing) continue;
      try {
        const resp = await fetch(file.download_url);
        if (!resp.ok) continue;
        const base64 = await resp.text();
        await ScreenshotDB.put(bookmarkUrl, `data:image/jpeg;base64,${base64.trim()}`);
        console.log('[GitHubSync] downloaded screenshot for', bookmarkUrl);
      } catch (e) {
        console.warn('[GitHubSync] screenshot download failed for', bookmarkUrl, e);
      }
    }
  }
}

window.GitHubSync = GitHubSync;
