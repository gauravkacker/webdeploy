/**
 * UDP Network Discovery Protocol
 * Handles discovery of other HomeoPMS instances on the LAN
 * 
 * Features:
 * - UDP broadcast/listen on port 5353
 * - 5-second discovery window with auto-completion
 * - Instance deduplication (ignore self via instance_id)
 * - Graceful fallback for web mode (no UDP available)
 * - Event-based discovery notifications
 */

import { EventEmitter } from 'events';
import type { DiscoveryMessage } from '@/types/lan-network';

/**
 * Discovered instance information
 */
export interface DiscoveredInstance {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  version: string;
  role?: 'main' | 'child';
  timestamp: number;
}

/**
 * Discovery service for finding other HomeoPMS instances on the network
 */
export class DiscoveryService extends EventEmitter {
  private instanceId: string;
  private discoveryPort: number = 5353;
  private discoveredInstances: Map<string, DiscoveredInstance> = new Map();
  private isDiscovering: boolean = false;
  private discoveryTimeout: NodeJS.Timeout | null = null;
  private discoverySocket: any = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private isElectron: boolean = false;

  constructor(instanceId: string) {
    super();
    this.instanceId = instanceId;
    this.isElectron = this.checkIfElectron();
  }

  /**
   * Check if running in Electron (Node.js) environment
   */
  private checkIfElectron(): boolean {
    if (typeof window === 'undefined') {
      return true; // Server-side
    }
    return !!(window as any).__ELECTRON__;
  }

  /**
   * Get local IP address (Node.js only)
   */
  private getLocalIP(): string {
    if (!this.isElectron) {
      return 'localhost';
    }

    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
    } catch (error) {
      console.warn('[Discovery] Failed to get local IP:', error);
    }

    return 'localhost';
  }

  /**
   * Get broadcast address for the network (Node.js only)
   */
  private getBroadcastAddress(): string {
    if (!this.isElectron) {
      return '255.255.255.255';
    }

    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            const parts = iface.address.split('.');
            parts[3] = '255';
            return parts.join('.');
          }
        }
      }
    } catch (error) {
      console.warn('[Discovery] Failed to get broadcast address:', error);
    }

    return '255.255.255.255';
  }

  /**
   * Get hostname (Node.js only)
   */
  private getHostname(): string {
    if (!this.isElectron) {
      return 'web-client';
    }

    try {
      const os = require('os');
      return os.hostname();
    } catch (error) {
      console.warn('[Discovery] Failed to get hostname:', error);
    }

    return 'unknown';
  }

  /**
   * Serialize discovery message to JSON
   */
  private serializeMessage(message: DiscoveryMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Deserialize discovery message from JSON
   */
  private deserializeMessage(data: string): DiscoveryMessage | null {
    try {
      return JSON.parse(data) as DiscoveryMessage;
    } catch (error) {
      console.warn('[Discovery] Failed to deserialize message:', error);
      return null;
    }
  }

  /**
   * Start discovery process
   * Broadcasts discovery request and listens for responses for 5 seconds
   */
  public async startDiscovery(broadcastAddress: string): Promise<DiscoveredInstance[]> {
    if (this.isDiscovering) {
      console.warn('[Discovery] Discovery already in progress');
      return Array.from(this.discoveredInstances.values());
    }

    this.isDiscovering = true;
    this.discoveredInstances.clear();

    console.log('[Discovery] Starting discovery process on port', this.discoveryPort);

    if (!this.isElectron) {
      console.log('[Discovery] Web mode detected - UDP not available, skipping discovery');
      this.emit('discovery-complete', []);
      this.isDiscovering = false;
      return [];
    }

    try {
      // Setup listener
      this.setupListener();

      // Start broadcasting discovery requests
      this.startBroadcasting(broadcastAddress);

      // Wait for 5 seconds
      await new Promise((resolve) => {
        this.discoveryTimeout = setTimeout(() => {
          this.stopDiscovery();
          resolve(null);
        }, 5000);
      });
    } catch (error) {
      console.error('[Discovery] Error during discovery:', error);
      this.stopDiscovery();
    }

    return Array.from(this.discoveredInstances.values());
  }

  /**
   * Setup UDP listener for discovery responses
   */
  private setupListener(): void {
    if (!this.isElectron) {
      return;
    }

    try {
      const dgram = require('dgram');
      const server = dgram.createSocket('udp4');

      server.on('error', (err: any) => {
        console.error('[Discovery] Listener socket error:', err.message);
      });

      server.on('message', (msg: Buffer, rinfo: any) => {
        try {
          const messageStr = msg.toString();
          const message = this.deserializeMessage(messageStr);

          if (!message) {
            return;
          }

          // Ignore messages from self
          if (message.instanceId === this.instanceId) {
            return;
          }

          // Ignore discovery requests (only process responses)
          if (message.type !== 'discovery-response') {
            return;
          }

          // Add or update discovered instance
          const instance: DiscoveredInstance = {
            id: message.instanceId,
            hostname: message.hostname,
            ip: message.ip,
            port: message.port,
            version: message.version,
            role: message.role,
            timestamp: message.timestamp,
          };

          const isNew = !this.discoveredInstances.has(instance.id);
          this.discoveredInstances.set(instance.id, instance);

          if (isNew) {
            console.log(
              `[Discovery] New instance discovered: ${instance.hostname} (${instance.ip}:${instance.port})`
            );
            this.emit('instance-discovered', instance);
          }
        } catch (error) {
          console.warn('[Discovery] Error processing message:', error);
        }
      });

      server.bind(this.discoveryPort, () => {
        server.setBroadcast(true);
        console.log(`[Discovery] Listener bound to port ${this.discoveryPort}`);
      });

      this.discoverySocket = server;
    } catch (error) {
      console.error('[Discovery] Failed to setup listener:', error);
    }
  }

  /**
   * Start broadcasting discovery requests
   */
  private startBroadcasting(broadcastAddress: string): void {
    if (!this.isElectron) {
      return;
    }

    try {
      const dgram = require('dgram');

      // Send initial broadcast
      this.sendBroadcast(dgram, broadcastAddress);

      // Send broadcasts every 500ms for 5 seconds
      this.broadcastInterval = setInterval(() => {
        this.sendBroadcast(dgram, broadcastAddress);
      }, 500);
    } catch (error) {
      console.error('[Discovery] Failed to start broadcasting:', error);
    }
  }

  /**
   * Send a single broadcast message
   */
  private sendBroadcast(dgram: any, broadcastAddress: string): void {
    try {
      const client = dgram.createSocket('udp4');

      const message: DiscoveryMessage = {
        type: 'discovery-request',
        instanceId: this.instanceId,
        hostname: this.getHostname(),
        ip: this.getLocalIP(),
        port: 3000, // Default port, can be overridden
        version: '1.0.0',
        timestamp: Date.now(),
      };

      const messageBuffer = Buffer.from(this.serializeMessage(message));

      client.bind(() => {
        try {
          client.setBroadcast(true);
          client.send(messageBuffer, 0, messageBuffer.length, this.discoveryPort, broadcastAddress, (err: any) => {
            if (err) {
              console.warn('[Discovery] Broadcast error:', err.message);
            }
            client.close();
          });
        } catch (error) {
          console.warn('[Discovery] Error sending broadcast:', error);
          try {
            client.close();
          } catch {}
        }
      });
    } catch (error) {
      console.warn('[Discovery] Failed to send broadcast:', error);
    }
  }

  /**
   * Stop discovery process
   */
  public stopDiscovery(): void {
    console.log('[Discovery] Stopping discovery process');

    this.isDiscovering = false;

    // Clear timeout
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }

    // Stop broadcasting
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    // Close listener socket
    if (this.discoverySocket) {
      try {
        this.discoverySocket.close();
        this.discoverySocket = null;
      } catch (error) {
        console.warn('[Discovery] Error closing socket:', error);
      }
    }

    // Emit completion event
    const instances = Array.from(this.discoveredInstances.values());
    console.log(`[Discovery] Discovery complete - found ${instances.length} instance(s)`);
    this.emit('discovery-complete', instances);
  }

  /**
   * Get discovered instances
   */
  public getDiscoveredInstances(): DiscoveredInstance[] {
    return Array.from(this.discoveredInstances.values());
  }

  /**
   * Clear discovered instances
   */
  public clearDiscoveredInstances(): void {
    this.discoveredInstances.clear();
  }

  /**
   * Check if discovery is in progress
   */
  public isDiscoveryInProgress(): boolean {
    return this.isDiscovering;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopDiscovery();
    this.removeAllListeners();
  }
}

/**
 * Create a discovery service instance
 */
export function createDiscoveryService(instanceId: string): DiscoveryService {
  return new DiscoveryService(instanceId);
}
