/**
 * LAN Network Database Tests
 * Tests for dual-mode storage (localStorage + SQLite)
 */

import { lanNetworkDb, lanConnectionStateDb, lanSyncDb } from '@/lib/db/database';
import type { LANNetworkConfig, LANConnectionState, SyncStatusRecord } from '@/types/lan-network';

// Mock localStorage for Node.js environment
const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem(key: string) {
    return this.data[key] || null;
  },
  setItem(key: string, value: string) {
    this.data[key] = value;
  },
  removeItem(key: string) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Set up mock window and localStorage globally
Object.defineProperty(global, 'window', {
  value: {
    localStorage: mockLocalStorage,
    electronAPI: undefined
  },
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

describe('LAN Network Database - Web Mode (localStorage)', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    mockLocalStorage.clear();
  });

  it('should have localStorage available', () => {
    expect(typeof window).not.toBe('undefined');
    expect(localStorage).toBeDefined();
    localStorage.setItem('test', 'value');
    expect(localStorage.getItem('test')).toBe('value');
  });

  describe('lanNetworkDb', () => {
    it('should save and retrieve network config', () => {
      const config: LANNetworkConfig = {
        selectedNetworkId: 'network-1',
        selectedNetworkName: 'Home Network',
        broadcastAddress: '192.168.1.255',
        role: 'main',
        mainServerId: undefined,
        mainServerIp: undefined,
        mainServerPort: undefined,
        lastConnectedTime: Date.now(),
        connectionAttempts: 0
      };

      lanNetworkDb.saveConfig(config);
      
      // Verify localStorage was updated
      const stored = localStorage.getItem('lanNetworkConfig');
      expect(stored).toBeTruthy();
      
      const retrieved = lanNetworkDb.getConfig();
      expect(retrieved).toEqual(config);
    });

    it('should return null when no config exists', () => {
      const retrieved = lanNetworkDb.getConfig();
      expect(retrieved).toBeNull();
    });

    it('should clear config', () => {
      const config: LANNetworkConfig = {
        selectedNetworkId: 'network-1',
        selectedNetworkName: 'Home Network',
        broadcastAddress: '192.168.1.255',
        role: 'main',
        lastConnectedTime: Date.now(),
        connectionAttempts: 0
      };

      lanNetworkDb.saveConfig(config);
      lanNetworkDb.clearConfig();
      const retrieved = lanNetworkDb.getConfig();

      expect(retrieved).toBeNull();
    });

    it('should increment connection attempts', () => {
      const config: LANNetworkConfig = {
        selectedNetworkId: 'network-1',
        selectedNetworkName: 'Home Network',
        broadcastAddress: '192.168.1.255',
        role: 'main',
        lastConnectedTime: Date.now(),
        connectionAttempts: 0
      };

      lanNetworkDb.saveConfig(config);
      lanNetworkDb.incrementConnectionAttempts();
      const retrieved = lanNetworkDb.getConfig();

      expect(retrieved?.connectionAttempts).toBe(1);
    });

    it('should reset connection attempts', () => {
      const config: LANNetworkConfig = {
        selectedNetworkId: 'network-1',
        selectedNetworkName: 'Home Network',
        broadcastAddress: '192.168.1.255',
        role: 'main',
        lastConnectedTime: Date.now(),
        connectionAttempts: 5
      };

      lanNetworkDb.saveConfig(config);
      lanNetworkDb.resetConnectionAttempts();
      const retrieved = lanNetworkDb.getConfig();

      expect(retrieved?.connectionAttempts).toBe(0);
    });

    it('should set and clear last error', () => {
      const config: LANNetworkConfig = {
        selectedNetworkId: 'network-1',
        selectedNetworkName: 'Home Network',
        broadcastAddress: '192.168.1.255',
        role: 'main',
        lastConnectedTime: Date.now(),
        connectionAttempts: 0
      };

      lanNetworkDb.saveConfig(config);
      lanNetworkDb.setLastError('Connection timeout');
      let retrieved = lanNetworkDb.getConfig();
      expect(retrieved?.lastError).toBe('Connection timeout');

      lanNetworkDb.setLastError(null);
      retrieved = lanNetworkDb.getConfig();
      expect(retrieved?.lastError).toBeUndefined();
    });
  });

  describe('lanConnectionStateDb', () => {
    it('should save and retrieve connection state', () => {
      const state: LANConnectionState = {
        state: 'connected',
        role: 'main',
        mainServerId: 'server-1',
        connectedInstances: [],
        lastStateChange: Date.now()
      };

      lanConnectionStateDb.setState(state);
      const retrieved = lanConnectionStateDb.getState();

      expect(retrieved).toEqual(state);
    });

    it('should return null when no state exists', () => {
      const retrieved = lanConnectionStateDb.getState();
      expect(retrieved).toBeNull();
    });

    it('should clear connection state', () => {
      const state: LANConnectionState = {
        state: 'connected',
        role: 'main',
        mainServerId: 'server-1',
        connectedInstances: [],
        lastStateChange: Date.now()
      };

      lanConnectionStateDb.setState(state);
      lanConnectionStateDb.clearState();
      const retrieved = lanConnectionStateDb.getState();

      expect(retrieved).toBeNull();
    });

    it('should handle error state', () => {
      const state: LANConnectionState = {
        state: 'error',
        connectedInstances: [],
        lastStateChange: Date.now(),
        error: {
          code: 'NETWORK_UNAVAILABLE',
          message: 'Network is not reachable',
          timestamp: Date.now()
        }
      };

      lanConnectionStateDb.setState(state);
      const retrieved = lanConnectionStateDb.getState();

      expect(retrieved?.state).toBe('error');
      expect(retrieved?.error?.code).toBe('NETWORK_UNAVAILABLE');
    });
  });

  describe('lanSyncDb', () => {
    it('should save and retrieve sync status', () => {
      const record: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now(),
        lastSyncDuration: 1000,
        bytesTransferred: 5000,
        syncStatus: 'synced'
      };

      lanSyncDb.upsert(record);
      const retrieved = lanSyncDb.getByInstanceId('instance-1');

      expect(retrieved).toEqual(record);
    });

    it('should return empty array when no records exist', () => {
      const records = lanSyncDb.getAll();
      expect(records).toEqual([]);
    });

    it('should get all sync records', () => {
      const record1: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now(),
        lastSyncDuration: 1000,
        bytesTransferred: 5000,
        syncStatus: 'synced'
      };

      const record2: SyncStatusRecord = {
        instanceId: 'instance-2',
        lastSyncTime: Date.now(),
        lastSyncDuration: 2000,
        bytesTransferred: 10000,
        syncStatus: 'syncing'
      };

      lanSyncDb.upsert(record1);
      lanSyncDb.upsert(record2);
      const records = lanSyncDb.getAll();

      expect(records).toHaveLength(2);
      expect(records).toContainEqual(record1);
      expect(records).toContainEqual(record2);
    });

    it('should update existing sync record', () => {
      const record: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now(),
        lastSyncDuration: 1000,
        bytesTransferred: 5000,
        syncStatus: 'synced'
      };

      lanSyncDb.upsert(record);

      const updated: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now() + 1000,
        lastSyncDuration: 2000,
        bytesTransferred: 10000,
        syncStatus: 'syncing'
      };

      lanSyncDb.upsert(updated);
      const records = lanSyncDb.getAll();

      expect(records).toHaveLength(1);
      expect(records[0].lastSyncDuration).toBe(2000);
    });

    it('should delete sync record by instance id', () => {
      const record: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now(),
        lastSyncDuration: 1000,
        bytesTransferred: 5000,
        syncStatus: 'synced'
      };

      lanSyncDb.upsert(record);
      lanSyncDb.deleteByInstanceId('instance-1');
      const retrieved = lanSyncDb.getByInstanceId('instance-1');

      expect(retrieved).toBeNull();
    });

    it('should clear all sync records', () => {
      const record1: SyncStatusRecord = {
        instanceId: 'instance-1',
        lastSyncTime: Date.now(),
        lastSyncDuration: 1000,
        bytesTransferred: 5000,
        syncStatus: 'synced'
      };

      const record2: SyncStatusRecord = {
        instanceId: 'instance-2',
        lastSyncTime: Date.now(),
        lastSyncDuration: 2000,
        bytesTransferred: 10000,
        syncStatus: 'syncing'
      };

      lanSyncDb.upsert(record1);
      lanSyncDb.upsert(record2);
      lanSyncDb.clearAll();
      const records = lanSyncDb.getAll();

      expect(records).toEqual([]);
    });
  });
});
