/**
 * LAN Network Selection Types
 * Interfaces for manual LAN network selection feature
 */

export interface LANNetworkConfig {
  selectedNetworkId: string;
  selectedNetworkName: string;
  broadcastAddress: string;
  role: 'main' | 'child';
  mainServerId?: string;
  mainServerIp?: string;
  mainServerPort?: number;
  lastConnectedTime: number;
  connectionAttempts: number;
  lastError?: string;
}

export interface LANConnectionState {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  role?: 'main' | 'child';
  mainServerId?: string;
  connectedInstances: ConnectedInstance[];
  lastStateChange: number;
  error?: {
    code: string;
    message: string;
    timestamp: number;
  };
}

export interface ConnectedInstance {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  role: 'main' | 'child';
  lastSyncTime: number;
  lastSyncDuration: number;
  bytesTransferred: number;
  syncStatus: 'synced' | 'syncing' | 'error' | 'stale';
}

export interface SyncStatusRecord {
  instanceId: string;
  lastSyncTime: number;
  lastSyncDuration: number;
  bytesTransferred: number;
  syncStatus: 'synced' | 'syncing' | 'error' | 'stale';
  errorDetails?: string;
}

export interface DiscoveryMessage {
  type: 'discovery-request' | 'discovery-response';
  instanceId: string;
  hostname: string;
  ip: string;
  port: number;
  version: string;
  role?: 'main' | 'child';
  timestamp: number;
}

export interface NetworkInfo {
  id: string;
  name: string;
  ipRange: string;
  broadcastAddress: string;
  isAvailable: boolean;
}
