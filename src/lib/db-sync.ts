/**
 * Database Sync Manager
 * Handles data synchronization across LAN network
 * 
 * Architecture:
 * - Main Server: Stores authoritative copy of all data
 * - Client Servers: Read from main server, write to main server
 * - All writes go through main server to ensure consistency
 * - Clients cache data locally for performance
 */

import { getLANServer } from './lan-server';
import type { ServerInfo } from './lan-server';

interface SyncOperation {
  id: string;
  timestamp: number;
  type: 'create' | 'update' | 'delete';
  collection: string;
  data: any;
  serverId: string;
}

interface SyncQueue {
  operations: SyncOperation[];
  lastSyncTime: number;
}

class DatabaseSyncManager {
  private isMainServer: boolean = false;
  private mainServerURL: string | null = null;
  private syncQueue: SyncQueue = {
    operations: [],
    lastSyncTime: 0
  };
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL = 5000; // 5 seconds
  private readonly SYNC_TIMEOUT = 10000; // 10 seconds

  constructor() {
    this.loadSyncQueue();
  }

  /**
   * Initialize sync manager
   */
  async initialize(): Promise<void> {
    if (typeof window !== 'undefined') {
      // Browser environment: fetch LAN status from API
      await this.fetchLANStatus();
      
      // Periodic status check
      setInterval(() => this.fetchLANStatus(), 15000);
      
      this.startSync();
      return;
    }

    // Node.js environment: use direct LAN server manager
    const lanServer = getLANServer();
    if (!lanServer) return;

    this.isMainServer = lanServer.isMain();
    const mainServer = lanServer.getMainServer();
    if (mainServer) {
      this.mainServerURL = `http://${mainServer.ip}:${mainServer.port}`;
    }

    // Listen for server changes
    lanServer.on('elected-as-main', () => {
      console.log('[DB Sync] Promoted to main server');
      this.isMainServer = true;
      this.mainServerURL = null;
    });

    lanServer.on('main-server-elected', (server: ServerInfo) => {
      console.log('[DB Sync] New main server elected:', server.hostname);
      this.isMainServer = false;
      this.mainServerURL = `http://${server.ip}:${server.port}`;
      this.syncWithMainServer();
    });

    // Start sync process
    this.startSync();
  }

  /**
   * Fetch LAN status from API (browser only)
   */
  private async fetchLANStatus(): Promise<void> {
    try {
      const response = await fetch('/api/lan/status');
      if (!response.ok) return;
      
      const status = await response.json();
      if (!status.enabled) return;

      const wasMainServer = this.isMainServer;
      this.isMainServer = status.isMainServer;
      
      if (status.mainServer) {
        this.mainServerURL = `http://${status.mainServer.ip}:${status.mainServer.port}`;
        
        // If we just found out we're NOT the main server, sync data
        if (wasMainServer && !this.isMainServer) {
          this.syncWithMainServer();
        }
      } else {
        this.mainServerURL = null;
      }
    } catch (error) {
      console.error('[DB Sync] Failed to fetch LAN status:', error);
    }
  }

  /**
   * Queue a write operation
   */
  queueOperation(type: 'create' | 'update' | 'delete', collection: string, data: any): void {
    const operation: SyncOperation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      collection,
      data,
      serverId: this.getServerId()
    };

    this.syncQueue.operations.push(operation);
    this.saveSyncQueue();

    // If main server, apply immediately
    if (this.isMainServer) {
      this.applyOperation(operation);
    } else {
      // If client, send to main server
      this.sendToMainServer(operation);
    }
  }

  /**
   * Send operation to main server
   */
  private async sendToMainServer(operation: SyncOperation): Promise<void> {
    if (!this.mainServerURL) {
      console.warn('[DB Sync] No main server available, queuing operation');
      return;
    }

    try {
      const response = await fetch(`${this.mainServerURL}/api/db-sync/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation),
        signal: AbortSignal.timeout(this.SYNC_TIMEOUT)
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      // Remove from queue on success
      this.syncQueue.operations = this.syncQueue.operations.filter(op => op.id !== operation.id);
      this.saveSyncQueue();
    } catch (error) {
      console.error('[DB Sync] Failed to send operation to main server:', error);
      // Operation stays in queue for retry
    }
  }

  /**
   * Apply operation locally
   */
  private async applyOperation(operation: SyncOperation): Promise<void> {
    console.log(`[DB Sync] Applying ${operation.type} operation on ${operation.collection}`);
    
    try {
      // Import database stores dynamically to avoid circular dependencies
      const { 
        db,
        patientDb, 
        appointmentDb, 
        billingQueueDb, 
        medicineBillDb,
        feeHistoryDb,
        feesDb,
        feeDb,
        investigationDb,
        billingReceiptDb,
        queueItemDb,
        queueEventDb,
        queueDb,
        patientTagDb,
        slotDb,
        medicineAmountMemoryDb,
      } = await import('@/lib/db/database');
      
      const { 
        doctorVisitDb, 
        doctorPrescriptionDb, 
        pharmacyQueueDb,
        combinationDb,
        medicineMemoryDb,
      } = await import('@/lib/db/doctor-panel');
      
      const { internalMessageDb, messagingModuleUserDb } = await import('@/lib/db/internal-messaging');

      const { collection, type, data } = operation;

      switch (collection) {
        case 'patients':
          if (type === 'create') (patientDb as any).create(data, true);
          else if (type === 'update') (patientDb as any).update(data.id, data, true);
          else if (type === 'delete') (patientDb as any).delete(data.id, true);
          break;

        case 'appointments':
          if (type === 'create') (appointmentDb as any).create(data, true);
          else if (type === 'update') (appointmentDb as any).update(data.id, data, true);
          else if (type === 'delete') (appointmentDb as any).delete(data.id, true);
          break;

        case 'billingQueue':
          if (type === 'create') (billingQueueDb as any).create(data, true);
          else if (type === 'update') (billingQueueDb as any).update(data.id, data, true);
          else if (type === 'delete') (billingQueueDb as any).delete(data.id, true);
          break;

        case 'medicineBills':
          if (type === 'create') (medicineBillDb as any).create(data, true);
          else if (type === 'update') (medicineBillDb as any).update(data.id, data, true);
          else if (type === 'delete') (medicineBillDb as any).delete(data.id, true);
          break;

        case 'fee-history':
          if (type === 'create') (feeHistoryDb as any).create(data, true);
          else if (type === 'update') (feeHistoryDb as any).update(data.id, data, true);
          else if (type === 'delete') (feeHistoryDb as any).delete(data.id, true);
          break;

        case 'fees':
          if (type === 'create') (feesDb as any).create(data, true);
          else if (type === 'update') (feesDb as any).update(data.id, data, true);
          else if (type === 'delete') (feesDb as any).delete(data.id, true);
          break;

        case 'investigations':
          if (type === 'create') (investigationDb as any).create(data, true);
          else if (type === 'delete') (investigationDb as any).delete(data.id, true);
          break;

        case 'billingReceipts':
          if (type === 'create') (billingReceiptDb as any).create(data, true);
          else if (type === 'update') (billingReceiptDb as any).update(data.id, data, true);
          else if (type === 'delete') (billingReceiptDb as any).delete(data.id, true);
          break;

        case 'queueItems':
          if (type === 'create') (queueItemDb as any).create(data, true);
          else if (type === 'update') (queueItemDb as any).update(data.id, data, true);
          else if (type === 'delete') (queueItemDb as any).delete(data.id, true);
          break;

        case 'visits':
          if (type === 'create') (doctorVisitDb as any).create(data, true);
          else if (type === 'update') (doctorVisitDb as any).update(data.id, data, true);
          else if (type === 'delete') (doctorVisitDb as any).delete(data.id, true);
          break;

        case 'prescriptions':
          if (type === 'create') (doctorPrescriptionDb as any).create(data, true);
          else if (type === 'update') (doctorPrescriptionDb as any).update(data.id, data, true);
          else if (type === 'delete') (doctorPrescriptionDb as any).delete(data.id, true);
          break;

        case 'pharmacy':
          if (type === 'create') (pharmacyQueueDb as any).create(data, true);
          else if (type === 'update') (pharmacyQueueDb as any).update(data.id, data, true);
          else if (type === 'delete') (pharmacyQueueDb as any).delete(data.id, true);
          break;

        case 'internalMessages':
          if (type === 'create') internalMessageDb.create(data, true);
          else if (type === 'update') internalMessageDb.markRead(data.id, true);
          else if (type === 'delete') {
            if (data.all) internalMessageDb.clearAll(true);
            else internalMessageDb.delete(data.id, true);
          }
          break;

        case 'messagingModuleUsers':
          if (type === 'update') messagingModuleUserDb.updateStatus(data.module, data.status, true);
          else if (type === 'create') messagingModuleUserDb.updateLastActive(data.module, true);
          break;

        case 'combinations':
          if (type === 'create') (combinationDb as any).create(data, true);
          else if (type === 'update') (combinationDb as any).update(data.id, data, true);
          else if (type === 'delete') (combinationDb as any).delete(data.id, true);
          break;

        case 'medicineUsageMemory':
          if (type === 'create') medicineMemoryDb.create(data);
          else if (type === 'update') medicineMemoryDb.create(data); // incrementUse handles upsert
          else if (type === 'delete') medicineMemoryDb.delete(data.id);
          break;

        case 'medicineAmountMemory':
          if (type === 'create') medicineAmountMemoryDb.create(data);
          else if (type === 'update') medicineAmountMemoryDb.update(data.id, data);
          else if (type === 'delete') db.delete('medicineAmountMemory', data.id);
          break;

        case 'patientTags':
          if (type === 'create') (patientTagDb as any).create(data);
          else if (type === 'update') (patientTagDb as any).update(data.id, data);
          else if (type === 'delete') (patientTagDb as any).delete(data.id);
          break;

        case 'slots':
          if (type === 'create') (slotDb as any).create(data);
          else if (type === 'update') (slotDb as any).update(data.id, data);
          else if (type === 'delete') (slotDb as any).delete(data.id);
          break;

        case 'queueEvents':
          if (type === 'create') (queueEventDb as any).create(data);
          break;

        case 'queueConfigs':
          if (type === 'create') (queueDb as any).create(data, true);
          else if (type === 'update') (queueDb as any).update(data.id, data, true);
          else if (type === 'delete') (queueDb as any).delete(data.id, true);
          break;

        case 'smartParsingRules':
          if (type === 'create') db.create('smartParsingRules', data);
          else if (type === 'update') db.update('smartParsingRules', data.id, data);
          else if (type === 'delete') db.delete('smartParsingRules', data.id);
          break;

        case 'smartParsingTemplates':
          if (type === 'create') db.create('smartParsingTemplates', data);
          else if (type === 'update') db.update('smartParsingTemplates', data.id, data);
          else if (type === 'delete') db.delete('smartParsingTemplates', data.id);
          break;

        case 'feeTypes':
          if (type === 'create') (feeDb as any).create(data, true);
          else if (type === 'update') (feeDb as any).update(data.id, data, true);
          else if (type === 'delete') (feeDb as any).delete(data.id, true);
          break;

        default:
          console.warn('[DB Sync] Unknown collection:', collection);
      }
    } catch (error) {
      console.error('[DB Sync] Error applying operation locally:', error);
    }
  }

  /**
   * Sync with main server
   */
  private async syncWithMainServer(): Promise<void> {
    if (this.isMainServer || !this.mainServerURL) return;

    try {
      // Get all operations from main server's status (or a dedicated pending endpoint)
      const response = await fetch(`${this.mainServerURL}/api/db-sync/status`, {
        signal: AbortSignal.timeout(this.SYNC_TIMEOUT)
      });

      if (!response.ok) return;

      const { operations } = await response.json();
      if (!operations) return;
      
      // Apply operations that happened after our last sync
      const newOps = operations.filter((op: SyncOperation) => op.timestamp > this.syncQueue.lastSyncTime);
      
      for (const op of newOps) {
        this.applyOperation(op);
      }

      this.syncQueue.lastSyncTime = Date.now();
      this.saveSyncQueue();
    } catch (error) {
      console.error('[DB Sync] Failed to sync with main server:', error);
    }
  }

  /**
   * Start periodic sync
   */
  private startSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      if (!this.isMainServer) {
        this.syncWithMainServer();
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * Stop sync
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get pending operations
   */
  getPendingOperations(): SyncOperation[] {
    return this.syncQueue.operations;
  }

  /**
   * Get server ID
   */
  private getServerId(): string {
    const lanServer = getLANServer();
    return lanServer?.getMainServer()?.id || 'unknown';
  }

  /**
   * Save sync queue to localStorage
   */
  private saveSyncQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('dbSyncQueue', JSON.stringify(this.syncQueue));
    } catch (e) {
      console.error('[DB Sync] Failed to save sync queue:', e);
    }
  }

  /**
   * Load sync queue from localStorage
   */
  private loadSyncQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('dbSyncQueue');
      if (saved) {
        this.syncQueue = JSON.parse(saved);
      }
    } catch (e) {
      console.error('[DB Sync] Failed to load sync queue:', e);
    }
  }

  /**
   * Check if this is the main server
   */
  isMain(): boolean {
    return this.isMainServer;
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isMainServer: this.isMainServer,
      mainServerURL: this.mainServerURL,
      pendingOperations: this.syncQueue.operations.length,
      lastSyncTime: this.syncQueue.lastSyncTime,
      operations: this.syncQueue.operations
    };
  }
}

// Singleton instance
let syncManager: DatabaseSyncManager | null = null;

export function initDBSync(): DatabaseSyncManager {
  if (!syncManager) {
    syncManager = new DatabaseSyncManager();
    syncManager.initialize();
  }
  return syncManager;
}

export function getDBSync(): DatabaseSyncManager | null {
  return syncManager;
}

export type { SyncOperation, SyncQueue };
