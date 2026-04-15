/**
 * LAN Server Election and Discovery
 * Handles server election, discovery, and failover for multi-computer setup
 */

import { EventEmitter } from 'events';

// These modules are only available in Node.js
// We use dynamic imports or conditional checks to avoid build errors in the browser
let os: any = null;
let dgram: any = null;
let http: any = null;
let BufferPolyfill: any = typeof Buffer !== 'undefined' ? Buffer : null;

if (typeof window === 'undefined') {
  // We're on the server
  os = require('os');
  dgram = require('dgram');
  http = require('http');
  if (!BufferPolyfill) {
    BufferPolyfill = require('buffer').Buffer;
  }
}

interface ServerInfo {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  timestamp: number;
  serverStartTime: number;
  isMain: boolean;
}

/**
 * Mock EventEmitter for browser if needed
 */
class BrowserEventEmitter {
  on() { return this; }
  emit() { return true; }
  once() { return this; }
  off() { return this; }
  removeListener() { return this; }
  removeAllListeners() { return this; }
}

const BaseClass = typeof window === 'undefined' ? EventEmitter : BrowserEventEmitter;

class LANServerManager extends (BaseClass as any) {
  private serverId: string;
  private serverStartTime: number;
  private serverPort: number;
  private discoveryPort: number = 5555;
  private mainServer: ServerInfo | null = null;
  private peers: Map<string, ServerInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private discoveryServer: any = null;
  private isMainServer: boolean = false;
  private electionInProgress: boolean = false;
  private electionDebounceTimer: NodeJS.Timeout | null = null;
  private lastElectionTime: number = 0;

  constructor(port: number = 3000) {
    super();
    // Use hostname as persistent ID, store startup time separately for election
    this.serverId = typeof window === 'undefined' ? os.hostname() : `browser-${window.location.hostname}`;
    this.serverStartTime = Date.now();
    this.serverPort = port;
  }

  /**
   * Get local IP address
   */
  private getLocalIP(): string {
    if (typeof window !== 'undefined') return 'localhost';
    
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  /**
   * Get server info
   */
  private getServerInfo(): ServerInfo {
    return {
      id: this.serverId,
      hostname: typeof window === 'undefined' ? os.hostname() : 'browser',
      ip: this.getLocalIP(),
      port: this.serverPort,
      timestamp: Date.now(),
      serverStartTime: this.serverStartTime,
      isMain: false // Always broadcast as false - election determines actual role
    };
  }

  /**
   * Start discovery server
   */
  startDiscovery(): void {
    if (typeof window !== 'undefined') return;
    
    const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    server.on('message', (msg: Buffer, rinfo: any) => {
      try {
        const data = JSON.parse(msg.toString());
        
        // Ignore own messages
        if (data.id === this.serverId) return;

        // Update peer info
        this.peers.set(data.id, data);
        this.emit('peer-discovered', data);

        // Debounce election to avoid excessive re-elections
        // Only trigger if enough time has passed since last election
        const now = Date.now();
        if (now - this.lastElectionTime > 1000 && !this.electionInProgress) {
          if (this.electionDebounceTimer) {
            clearTimeout(this.electionDebounceTimer);
          }
          this.electionDebounceTimer = setTimeout(() => {
            this.triggerElection();
          }, 500);
        }
      } catch (e) {
        console.error('[LAN] Error parsing discovery message:', e);
      }
    });

    server.bind(this.discoveryPort, () => {
      console.log(`[LAN] Discovery server listening on port ${this.discoveryPort}`);
    });

    this.discoveryServer = server;
  }

  /**
   * Start heartbeat broadcast
   */
  startHeartbeat(): void {
    if (typeof window !== 'undefined') return;
    
    this.heartbeatInterval = setInterval(() => {
      this.broadcastHeartbeat();
      this.checkPeers();
    }, 5000); // Every 5 seconds
  }

  /**
   * Broadcast heartbeat via UDP
   */
  private broadcastHeartbeat(): void {
    if (!this.discoveryServer) return;

    const info = this.getServerInfo();
    const msg = JSON.stringify(info);
    const buffer = Buffer.from(msg);

    // Broadcast to the subnet
    this.discoveryServer.setBroadcast(true);
    this.discoveryServer.send(buffer, 0, buffer.length, this.discoveryPort, '255.255.255.255');
  }

  /**
   * Check for stale peers and trigger election if main server is gone
   */
  private checkPeers(): void {
    const now = Date.now();
    let mainServerGone = false;

    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.timestamp > 15000) { // 15 seconds timeout
        console.log(`[LAN] Peer ${peer.hostname} (${peer.ip}) timed out`);
        this.peers.delete(id);
        
        if (peer.isMain) {
          mainServerGone = true;
          this.mainServer = null;
        }
      }
    }

    if (mainServerGone && !this.isMainServer && !this.electionInProgress) {
      console.log('[LAN] Main server gone, triggering election...');
      this.triggerElection();
    }
  }

  /**
   * Simple election strategy: server that started first (lowest serverStartTime) wins
   */
  triggerElection(): void {
    if (this.electionInProgress) return;
    this.electionInProgress = true;
    this.lastElectionTime = Date.now();

    console.log('[LAN] Starting server election...');
    
    const allServers = [this.getServerInfo(), ...this.getPeers()];
    
    // If only this server on network, it's the main server
    if (allServers.length === 1) {
      console.log('[LAN] Only server on network - I am the main server!');
      this.isMainServer = true;
      this.mainServer = this.getServerInfo();
      this.emit('elected-as-main');
      this.electionInProgress = false;
      return;
    }
    
    // Sort by serverStartTime (earliest/lowest wins)
    const sorted = allServers.sort((a, b) => a.serverStartTime - b.serverStartTime);
    const winner = sorted[0];

    if (winner.id === this.serverId) {
      console.log('[LAN] This computer elected as main server');
      this.isMainServer = true;
      this.mainServer = this.getServerInfo();
      this.emit('elected-as-main');
    } else { 
      console.log(`[LAN] ${winner.hostname} (${winner.ip}) is the main server`);
      this.isMainServer = false;
      this.mainServer = winner;
      this.emit('main-server-elected', winner);
    }

    this.electionInProgress = false;
  }

  /**
   * Get main server info
   */
  getMainServer(): ServerInfo | null {
    return this.mainServer;
  }

  /**
   * Get all peers
   */
  getPeers(): ServerInfo[] {
    return Array.from(this.peers.values());
  }

  /**
   * Check if this is main server
   */
  isMain(): boolean {
    return this.isMainServer;
  }

  /**
   * Get server URL
   */
  getServerURL(): string {
    if (this.mainServer) {
      return `http://${this.mainServer.ip}:${this.mainServer.port}`;
    }
    return `http://${this.getLocalIP()}:${this.serverPort}`;
  }

  /**
   * Manual role assignment — replaces automatic election result.
   * Called when the user explicitly selects their role via the UI.
   * Preserves all existing sync/heartbeat functionality.
   */
  setManualRole(role: 'main' | 'child', mainServerInfo?: { id: string; ip: string; port: number }): void {
    console.log(`[LAN] Manual role assignment: ${role}`);

    if (role === 'main') {
      this.isMainServer = true;
      this.mainServer = this.getServerInfo();
    } else {
      this.isMainServer = false;
      if (mainServerInfo) {
        this.mainServer = {
          id: mainServerInfo.id,
          hostname: mainServerInfo.id,
          ip: mainServerInfo.ip,
          port: mainServerInfo.port,
          timestamp: Date.now(),
          serverStartTime: 0,
          isMain: true,
        };
      }
    }

    this.emit('election-complete', {
      isMainServer: this.isMainServer,
      mainServer: this.mainServer,
    });
  }

  /**
   * Stop all services
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.discoveryServer) {
      this.discoveryServer.close();
    }
    if (this.electionDebounceTimer) {
      clearTimeout(this.electionDebounceTimer);
    }
  }
}

// Singleton instance
let lanManager: LANServerManager | null = null;

export function initLANServer(port: number = 3000): LANServerManager {
  if (typeof window !== 'undefined') {
    // Return a dummy manager for the browser
    return new LANServerManager(port);
  }
  
  if (!lanManager) {
    lanManager = new LANServerManager(port);
    lanManager.startDiscovery();
    lanManager.startHeartbeat();

    // Wait longer for discovery to find other servers before triggering election
    // This prevents a single server from incorrectly thinking it's the only one
    setTimeout(() => {
      lanManager!.triggerElection();
    }, 5000);
  }
  return lanManager;
}

export function getLANServer(): LANServerManager | null {
  return lanManager;
}

export type { ServerInfo };
