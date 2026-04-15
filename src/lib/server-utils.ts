/**
 * Server-only utilities
 * This file should only be imported in API routes or server components
 */

import os from 'os';

/**
 * Get computer information (server-only)
 */
export function getComputerInfo(): { name: string; ip: string } {
  const hostname = os.hostname();
  const networkInterfaces = os.networkInterfaces();
  
  // Find first non-internal IPv4 address
  let ip = '127.0.0.1';
  for (const [name, addresses] of Object.entries(networkInterfaces)) {
    if (!addresses) continue;
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ip = addr.address;
        break;
      }
    }
    if (ip !== '127.0.0.1') break;
  }
  
  return {
    name: hostname,
    ip,
  };
}
