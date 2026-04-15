"use strict";
/**
 * LAN Server Election and Discovery
 * Handles server election, discovery, and failover for multi-computer setup
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLANServer = initLANServer;
exports.getLANServer = getLANServer;
const events_1 = require("events");
const os_1 = __importDefault(require("os"));
class LANServerManager extends events_1.EventEmitter {
    constructor(port = 3000) {
        super();
        this.discoveryPort = 5555;
        this.mainServer = null;
        this.peers = new Map();
        this.heartbeatInterval = null;
        this.discoveryServer = null;
        this.isMainServer = false;
        this.electionInProgress = false;
        this.serverId = `${os_1.default.hostname()}-${Date.now()}`;
        this.serverPort = port;
    }
    /**
     * Get local IP address
     */
    getLocalIP() {
        const interfaces = os_1.default.networkInterfaces();
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
    getServerInfo() {
        return {
            id: this.serverId,
            hostname: os_1.default.hostname(),
            ip: this.getLocalIP(),
            port: this.serverPort,
            timestamp: Date.now(),
            isMain: this.isMainServer
        };
    }
    /**
     * Start discovery server
     */
    startDiscovery() {
        const dgram = require('dgram');
        const server = dgram.createUdpSocket();
        server.on('message', (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());
                // Ignore own messages
                if (data.id === this.serverId)
                    return;
                // Update peer info
                this.peers.set(data.id, data);
                this.emit('peer-discovered', data);
                // If we're not main server and received main server info, update it
                if (!this.isMainServer && data.isMain) {
                    this.mainServer = data;
                    this.emit('main-server-found', data);
                }
                // If we're main server and received another main server claim, trigger election
                if (this.isMainServer && data.isMain && data.timestamp < this.getServerInfo().timestamp) {
                    this.triggerElection();
                }
            }
            catch (e) {
                console.error('[LAN] Error parsing discovery message:', e);
            }
        });
        server.bind(this.discoveryPort, () => {
            console.log(`[LAN] Discovery server listening on port ${this.discoveryPort}`);
        });
        this.discoveryServer = server;
    }
    /**
     * Broadcast server info
     */
    broadcast() {
        const dgram = require('dgram');
        const client = dgram.createUdpSocket();
        const message = Buffer.from(JSON.stringify(this.getServerInfo()));
        // Broadcast to local network
        const broadcastAddr = this.getBroadcastAddress();
        client.send(message, 0, message.length, this.discoveryPort, broadcastAddr, (err) => {
            if (err) {
                console.error('[LAN] Broadcast error:', err);
            }
            client.close();
        });
    }
    /**
     * Get broadcast address
     */
    getBroadcastAddress() {
        const interfaces = os_1.default.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    // Calculate broadcast address
                    const parts = iface.address.split('.');
                    parts[3] = '255';
                    return parts.join('.');
                }
            }
        }
        return '255.255.255.255';
    }
    /**
     * Start heartbeat
     */
    startHeartbeat() {
        // Broadcast every 5 seconds
        this.heartbeatInterval = setInterval(() => {
            this.broadcast();
            this.checkPeerHealth();
        }, 5000);
        // Initial broadcast
        this.broadcast();
    }
    /**
     * Check peer health and remove dead peers
     */
    checkPeerHealth() {
        const now = Date.now();
        const timeout = 15000; // 15 seconds
        for (const [id, peer] of this.peers.entries()) {
            if (now - peer.timestamp > timeout) {
                console.log(`[LAN] Peer ${peer.hostname} (${peer.ip}) is dead, removing`);
                this.peers.delete(id);
                this.emit('peer-dead', peer);
                // If main server is dead, trigger election
                if (this.mainServer && this.mainServer.id === id) {
                    console.log('[LAN] Main server is dead, triggering election');
                    this.mainServer = null;
                    this.triggerElection();
                }
            }
        }
    }
    /**
     * Trigger server election
     */
    triggerElection() {
        if (this.electionInProgress)
            return;
        this.electionInProgress = true;
        console.log('[LAN] Starting server election...');
        // Collect all servers (including self)
        const allServers = [this.getServerInfo(), ...Array.from(this.peers.values())];
        // Sort by timestamp (oldest first) - first server to start wins
        allServers.sort((a, b) => a.timestamp - b.timestamp);
        const winner = allServers[0];
        if (winner.id === this.serverId) {
            console.log('[LAN] I am the new main server!');
            this.isMainServer = true;
            this.mainServer = this.getServerInfo();
            this.emit('elected-as-main', this.getServerInfo());
        }
        else {
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
    getMainServer() {
        return this.mainServer;
    }
    /**
     * Get all peers
     */
    getPeers() {
        return Array.from(this.peers.values());
    }
    /**
     * Check if this is main server
     */
    isMain() {
        return this.isMainServer;
    }
    /**
     * Get server URL
     */
    getServerURL() {
        if (this.mainServer) {
            return `http://${this.mainServer.ip}:${this.mainServer.port}`;
        }
        return `http://${this.getLocalIP()}:${this.serverPort}`;
    }
    /**
     * Stop all services
     */
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.discoveryServer) {
            this.discoveryServer.close();
        }
    }
}
// Singleton instance
let lanManager = null;
function initLANServer(port = 3000) {
    if (!lanManager) {
        lanManager = new LANServerManager(port);
        lanManager.startDiscovery();
        lanManager.startHeartbeat();
        // Trigger initial election after 2 seconds
        setTimeout(() => {
            lanManager.triggerElection();
        }, 2000);
    }
    return lanManager;
}
function getLANServer() {
    return lanManager;
}
//# sourceMappingURL=lan-server.js.map