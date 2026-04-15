/**
 * LAN Configuration
 * Centralized configuration for LAN mode
 */

export const LAN_CONFIG = {
  // Enable LAN mode
  enabled: process.env.ENABLE_LAN_MODE === 'true',
  
  // Server port
  port: parseInt(process.env.PORT || '3000'),
  
  // Discovery settings
  discovery: {
    port: 5555,
    broadcastInterval: 5000, // 5 seconds
    peerTimeout: 15000, // 15 seconds
    electionDelay: 2000, // 2 seconds
  },
  
  // Server election settings
  election: {
    // First server to start becomes main (based on timestamp)
    strategy: 'first-start',
    // Failover to next available server if main goes down
    enableFailover: true,
  },
  
  // Database sync settings (for future multi-server sync)
  sync: {
    enabled: false, // Disabled for now - single database per server
    interval: 10000, // 10 seconds
  }
};

export function isLANEnabled(): boolean {
  return LAN_CONFIG.enabled;
}

export function getLANPort(): number {
  return LAN_CONFIG.port;
}
