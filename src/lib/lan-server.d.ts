/**
 * LAN Server Election and Discovery
 * Handles server election, discovery, and failover for multi-computer setup
 */
import { EventEmitter } from 'events';
interface ServerInfo {
    id: string;
    hostname: string;
    ip: string;
    port: number;
    timestamp: number;
    isMain: boolean;
}
declare class LANServerManager extends EventEmitter {
    private serverId;
    private serverPort;
    private discoveryPort;
    private mainServer;
    private peers;
    private heartbeatInterval;
    private discoveryServer;
    private isMainServer;
    private electionInProgress;
    constructor(port?: number);
    /**
     * Get local IP address
     */
    private getLocalIP;
    /**
     * Get server info
     */
    private getServerInfo;
    /**
     * Start discovery server
     */
    startDiscovery(): void;
    /**
     * Broadcast server info
     */
    private broadcast;
    /**
     * Get broadcast address
     */
    private getBroadcastAddress;
    /**
     * Start heartbeat
     */
    startHeartbeat(): void;
    /**
     * Check peer health and remove dead peers
     */
    private checkPeerHealth;
    /**
     * Trigger server election
     */
    triggerElection(): void;
    /**
     * Get main server info
     */
    getMainServer(): ServerInfo | null;
    /**
     * Get all peers
     */
    getPeers(): ServerInfo[];
    /**
     * Check if this is main server
     */
    isMain(): boolean;
    /**
     * Get server URL
     */
    getServerURL(): string;
    /**
     * Stop all services
     */
    stop(): void;
}
export declare function initLANServer(port?: number): LANServerManager;
export declare function getLANServer(): LANServerManager | null;
export type { ServerInfo };
