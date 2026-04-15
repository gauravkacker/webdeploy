/**
 * Dropbox Sync Service
 * Syncs clinic data to Dropbox as source of truth
 * Multi-computer WiFi sync with local cache
 */

import { exportAsCompactJSON, importFromJSON } from './file-sync';

export interface DropboxSyncConfig {
  accessToken: string;
  syncInterval: number; // minutes
  enabled: boolean;
}

export interface DropboxSyncStatus {
  lastSync: string | null;
  nextSync: string | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
  lastError: string | null;
}

class DropboxSyncService {
  private static instance: DropboxSyncService;
  private syncStatus: DropboxSyncStatus = {
    lastSync: null,
    nextSync: null,
    status: 'idle',
    error: null,
    lastError: null,
  };
  private syncTimer: NodeJS.Timeout | null = null;
  private config: DropboxSyncConfig | null = null;
  private readonly DROPBOX_API_URL = 'https://content.dropboxapi.com/2';
  private readonly SYNC_FOLDER = '/clinic-backups';

  private constructor() {}

  public static getInstance(): DropboxSyncService {
    if (!DropboxSyncService.instance) {
      DropboxSyncService.instance = new DropboxSyncService();
    }
    return DropboxSyncService.instance;
  }

  /**
   * Initialize Dropbox sync with access token
   */
  public async initialize(accessToken: string, syncIntervalMinutes: number = 5): Promise<void> {
    if (typeof window === 'undefined') {
      console.log('Dropbox sync only works in browser');
      return;
    }

    this.config = {
      accessToken,
      syncInterval: syncIntervalMinutes,
      enabled: true,
    };

    // Save config to localStorage
    localStorage.setItem('dropboxSyncConfig', JSON.stringify(this.config));

    console.log('✅ Dropbox token configured and saved');
  }

  /**
   * Load config from localStorage
   */
  public loadConfig(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const saved = localStorage.getItem('dropboxSyncConfig');
      if (saved) {
        this.config = JSON.parse(saved);
        return true;
      }
    } catch (error) {
      console.error('Failed to load Dropbox config:', error);
    }
    return false;
  }

  /**
   * Upload data to Dropbox
   */
  public async uploadToDropbox(): Promise<void> {
    if (!this.config?.accessToken) {
      throw new Error('Dropbox not configured');
    }

    this.syncStatus.status = 'syncing';
    this.syncStatus.error = null;

    try {
      const data = exportAsCompactJSON();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `clinic-backup-${timestamp}.json`;
      const filepath = `${this.SYNC_FOLDER}/${filename}`;

      console.log(`📤 Uploading to Dropbox: ${filename}`);

      const response = await fetch(`${this.DROPBOX_API_URL}/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: filepath,
            mode: 'add',
            autorename: true,
            mute: false,
          }),
          'Content-Type': 'application/octet-stream',
        },
        body: data,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      this.syncStatus.lastSync = new Date().toISOString();
      this.syncStatus.status = 'idle';
      console.log(`✅ Uploaded to Dropbox: ${filename}`);

      // Clean up old backups (keep only 3)
      await this.cleanupOldBackups(3);
    } catch (error) {
      this.syncStatus.status = 'error';
      this.syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
      this.syncStatus.lastError = this.syncStatus.error;
      console.error('❌ Dropbox upload failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old backups, keep only N most recent
   */
  private async cleanupOldBackups(keepCount: number = 3): Promise<void> {
    try {
      console.log(`🧹 Starting cleanup - keeping only ${keepCount} backups...`);

      if (!this.config?.accessToken) {
        console.warn('No access token for cleanup');
        return;
      }

      // Call backend cleanup endpoint (avoids CORS issues)
      const response = await fetch('/api/dropbox/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: this.config.accessToken,
          keepCount,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn('Cleanup failed:', error);
        return;
      }

      const result = (await response.json()) as {
        success: boolean;
        message: string;
        deleted: number;
        remaining: number;
      };

      console.log(`✅ ${result.message}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
      // Don't throw - cleanup is not critical
    }
  }

  /**
   * Download latest data from Dropbox
   */
  public async downloadFromDropbox(): Promise<void> {
    if (!this.config?.accessToken) {
      throw new Error('Dropbox not configured');
    }

    this.syncStatus.status = 'syncing';
    this.syncStatus.error = null;

    try {
      // Get list of files
      const listResponse = await fetch(`${this.DROPBOX_API_URL}/files/list_folder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: this.SYNC_FOLDER,
          recursive: false,
          include_media_info: false,
        }),
      });

      if (!listResponse.ok) {
        throw new Error(`Failed to list files: ${listResponse.statusText}`);
      }

      const listData = (await listResponse.json()) as { entries: Array<{ name: string; path_display: string }> };
      const files = listData.entries.filter((f) => f.name.endsWith('.json')).sort();

      if (files.length === 0) {
        console.log('No backup files found in Dropbox');
        return;
      }

      // Download latest file
      const latestFile = files[files.length - 1];
      const downloadResponse = await fetch(`${this.DROPBOX_API_URL}/files/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: latestFile.path_display,
          }),
        },
      });

      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.statusText}`);
      }

      const content = await downloadResponse.text();
      const result = importFromJSON(content);

      if (!result.success) {
        throw new Error(result.message);
      }

      this.syncStatus.lastSync = new Date().toISOString();
      this.syncStatus.status = 'idle';
      console.log(`✅ Downloaded from Dropbox: ${latestFile.name} (${result.imported} records)`);
    } catch (error) {
      this.syncStatus.status = 'error';
      this.syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
      this.syncStatus.lastError = this.syncStatus.error;
      console.error('❌ Dropbox download failed:', error);
      throw error;
    }
  }

  /**
   * Start automatic sync
   */
  public startAutoSync(): void {
    if (!this.config?.enabled) {
      console.log('Dropbox sync not enabled');
      return;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Sync on startup
    this.uploadToDropbox().catch((error) => {
      console.error('Initial sync failed:', error);
    });

    // Then sync at intervals
    const intervalMs = this.config.syncInterval * 60 * 1000;
    this.syncTimer = setInterval(() => {
      this.uploadToDropbox().catch((error) => {
        console.error('Periodic sync failed:', error);
      });
    }, intervalMs);

    console.log(`🔄 Dropbox auto-sync started (interval: ${this.config.syncInterval} minutes)`);
  }

  /**
   * Stop automatic sync
   */
  public stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('🛑 Dropbox auto-sync stopped');
    }
  }

  /**
   * Get current sync status
   */
  public getStatus(): DropboxSyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Update sync interval
   */
  public updateSyncInterval(minutes: number): void {
    if (this.config) {
      this.config.syncInterval = minutes;
      localStorage.setItem('dropboxSyncConfig', JSON.stringify(this.config));

      // Restart sync with new interval
      this.stopAutoSync();
      this.startAutoSync();
    }
  }

  /**
   * Disable sync
   */
  public disable(): void {
    this.stopAutoSync();
    if (this.config) {
      this.config.enabled = false;
      localStorage.setItem('dropboxSyncConfig', JSON.stringify(this.config));
    }
  }

  /**
   * Enable sync
   */
  public enable(): void {
    if (this.config) {
      this.config.enabled = true;
      localStorage.setItem('dropboxSyncConfig', JSON.stringify(this.config));
      this.startAutoSync();
    }
  }
}

export const dropboxSync = DropboxSyncService.getInstance();
