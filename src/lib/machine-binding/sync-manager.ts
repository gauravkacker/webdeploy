/**
 * Sync Manager
 * Manages synchronization of usage data and license status with server
 */

import fs from 'fs';
import path from 'path';

export interface SyncQueue {
  id: string;
  machineId: string;
  data: any;
  timestamp: Date;
  retries: number;
  lastError?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt?: Date;
  nextSyncAt?: Date;
  pendingItems: number;
  failedItems: number;
}

// Default sync directory
const DEFAULT_SYNC_DIR = '.license-sync';

// Maximum retries for failed sync
const MAX_RETRIES = 3;

// Sync retry interval (in milliseconds)
const SYNC_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Get sync directory path
 */
function getSyncDir(customDir?: string): string {
  return customDir || DEFAULT_SYNC_DIR;
}

/**
 * Ensure sync directory exists
 */
function ensureSyncDir(syncDir: string): boolean {
  try {
    if (!fs.existsSync(syncDir)) {
      fs.mkdirSync(syncDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating sync directory:', error);
    return false;
  }
}

/**
 * Get queue file path
 */
function getQueueFilePath(syncDir: string): string {
  return path.join(syncDir, 'sync-queue.json');
}

/**
 * Get status file path
 */
function getStatusFilePath(syncDir: string): string {
  return path.join(syncDir, 'sync-status.json');
}

/**
 * Queue sync operation
 */
export function queueSync(
  machineId: string,
  data: any,
  syncDir?: string
): boolean {
  try {
    const dir = getSyncDir(syncDir);

    if (!ensureSyncDir(dir)) {
      console.warn('Failed to create sync directory');
      return false;
    }

    const queueFilePath = getQueueFilePath(dir);

    // Load existing queue
    let queue: SyncQueue[] = [];

    if (fs.existsSync(queueFilePath)) {
      try {
        const content = fs.readFileSync(queueFilePath, 'utf-8');
        queue = JSON.parse(content).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      } catch (error) {
        console.warn('Error parsing sync queue:', error);
      }
    }

    // Add new item
    const syncItem: SyncQueue = {
      id: `${machineId}-${Date.now()}`,
      machineId,
      data,
      timestamp: new Date(),
      retries: 0,
    };

    queue.push(syncItem);

    // Save queue
    fs.writeFileSync(
      queueFilePath,
      JSON.stringify(
        queue.map((item) => ({
          ...item,
          timestamp: item.timestamp.toISOString(),
        })),
        null,
        2
      )
    );

    return true;
  } catch (error) {
    console.error('Error queuing sync:', error);
    return false;
  }
}

/**
 * Get pending sync items
 */
export function getPendingSyncItems(syncDir?: string): SyncQueue[] {
  try {
    const dir = getSyncDir(syncDir);
    const queueFilePath = getQueueFilePath(dir);

    if (!fs.existsSync(queueFilePath)) {
      return [];
    }

    const content = fs.readFileSync(queueFilePath, 'utf-8');
    const queue = JSON.parse(content);

    return queue.map((item: any) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    }));
  } catch (error) {
    console.error('Error getting pending sync items:', error);
    return [];
  }
}

/**
 * Mark sync item as synced
 */
export function markSynced(
  syncId: string,
  syncDir?: string
): boolean {
  try {
    const dir = getSyncDir(syncDir);
    const queueFilePath = getQueueFilePath(dir);

    if (!fs.existsSync(queueFilePath)) {
      return false;
    }

    const content = fs.readFileSync(queueFilePath, 'utf-8');
    let queue = JSON.parse(content);

    // Remove synced item
    queue = queue.filter((item: any) => item.id !== syncId);

    fs.writeFileSync(
      queueFilePath,
      JSON.stringify(
        queue.map((item: any) => ({
          ...item,
          timestamp: item.timestamp.toISOString(),
        })),
        null,
        2
      )
    );

    return true;
  } catch (error) {
    console.error('Error marking sync item as synced:', error);
    return false;
  }
}

/**
 * Mark sync item as failed
 */
export function markSyncFailed(
  syncId: string,
  errorMsg: string,
  syncDir?: string
): boolean {
  try {
    const dir = getSyncDir(syncDir);
    const queueFilePath = getQueueFilePath(dir);

    if (!fs.existsSync(queueFilePath)) {
      console.warn('Queue file does not exist');
      return false;
    }

    const content = fs.readFileSync(queueFilePath, 'utf-8');
    let queue = JSON.parse(content);

    // Find and update item
    let found = false;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].id === syncId) {
        queue[i].retries++;
        queue[i].lastError = errorMsg;
        found = true;

        // Remove if max retries exceeded
        if (queue[i].retries >= MAX_RETRIES) {
          queue.splice(i, 1);
        }
        break;
      }
    }

    if (!found) {
      console.warn(`Sync item ${syncId} not found`);
      return false;
    }

    fs.writeFileSync(
      queueFilePath,
      JSON.stringify(
        queue.map((item: any) => ({
          ...item,
          timestamp: item.timestamp.toISOString(),
        })),
        null,
        2
      )
    );

    return true;
  } catch (err) {
    console.error('Error marking sync item as failed:', err);
    return false;
  }
}

/**
 * Get sync status
 */
export function getSyncStatus(syncDir?: string): SyncStatus {
  try {
    const dir = getSyncDir(syncDir);
    const statusFilePath = getStatusFilePath(dir);
    const queueFilePath = getQueueFilePath(dir);

    let status: SyncStatus = {
      isSyncing: false,
      pendingItems: 0,
      failedItems: 0,
    };

    // Load status
    if (fs.existsSync(statusFilePath)) {
      try {
        const content = fs.readFileSync(statusFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        status = {
          ...parsed,
          lastSyncAt: parsed.lastSyncAt ? new Date(parsed.lastSyncAt) : undefined,
          nextSyncAt: parsed.nextSyncAt ? new Date(parsed.nextSyncAt) : undefined,
        };
      } catch (error) {
        console.warn('Error parsing sync status:', error);
      }
    }

    // Count pending items
    if (fs.existsSync(queueFilePath)) {
      try {
        const content = fs.readFileSync(queueFilePath, 'utf-8');
        const queue = JSON.parse(content);
        status.pendingItems = queue.length;
        status.failedItems = queue.filter((item: any) => item.retries > 0).length;
      } catch (error) {
        console.warn('Error counting queue items:', error);
      }
    }

    return status;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      isSyncing: false,
      pendingItems: 0,
      failedItems: 0,
    };
  }
}

/**
 * Update sync status
 */
export function updateSyncStatus(
  status: Partial<SyncStatus>,
  syncDir?: string
): boolean {
  try {
    const dir = getSyncDir(syncDir);

    if (!ensureSyncDir(dir)) {
      return false;
    }

    const statusFilePath = getStatusFilePath(dir);

    // Load existing status
    let currentStatus: SyncStatus = {
      isSyncing: false,
      pendingItems: 0,
      failedItems: 0,
    };

    if (fs.existsSync(statusFilePath)) {
      try {
        const content = fs.readFileSync(statusFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        currentStatus = {
          ...parsed,
          lastSyncAt: parsed.lastSyncAt ? new Date(parsed.lastSyncAt) : undefined,
          nextSyncAt: parsed.nextSyncAt ? new Date(parsed.nextSyncAt) : undefined,
        };
      } catch (error) {
        console.warn('Error parsing sync status:', error);
      }
    }

    // Merge status
    const newStatus = { ...currentStatus, ...status };

    fs.writeFileSync(
      statusFilePath,
      JSON.stringify(
        {
          ...newStatus,
          lastSyncAt: newStatus.lastSyncAt?.toISOString(),
          nextSyncAt: newStatus.nextSyncAt?.toISOString(),
        },
        null,
        2
      )
    );

    return true;
  } catch (error) {
    console.error('Error updating sync status:', error);
    return false;
  }
}

/**
 * Clear sync queue
 */
export function clearSyncQueue(syncDir?: string): boolean {
  try {
    const dir = getSyncDir(syncDir);
    const queueFilePath = getQueueFilePath(dir);

    if (fs.existsSync(queueFilePath)) {
      fs.unlinkSync(queueFilePath);
    }

    return true;
  } catch (error) {
    console.error('Error clearing sync queue:', error);
    return false;
  }
}

/**
 * Check if sync is needed
 */
export function isSyncNeeded(syncDir?: string): boolean {
  try {
    const status = getSyncStatus(syncDir);
    return status.pendingItems > 0;
  } catch (error) {
    console.error('Error checking if sync is needed:', error);
    return false;
  }
}

/**
 * Get next sync time
 */
export function getNextSyncTime(syncDir?: string): Date {
  try {
    const status = getSyncStatus(syncDir);

    if (status.nextSyncAt) {
      return status.nextSyncAt;
    }

    // Default: sync in 5 minutes
    const nextSync = new Date();
    nextSync.setTime(nextSync.getTime() + SYNC_RETRY_INTERVAL);

    return nextSync;
  } catch (error) {
    console.error('Error getting next sync time:', error);

    const nextSync = new Date();
    nextSync.setTime(nextSync.getTime() + SYNC_RETRY_INTERVAL);

    return nextSync;
  }
}
