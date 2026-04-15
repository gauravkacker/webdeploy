/**
 * LAN Networks API - GET available networks
 * Returns list of available local networks the user can connect to
 */

import { NextResponse } from 'next/server';
import * as os from 'os';

export async function GET() {
  try {
    const networks: Array<{
      id: string;
      name: string;
      ipRange: string;
      broadcastAddress: string;
      isAvailable: boolean;
    }> = [];

    // Get network interfaces (server-side Node.js)
    const interfaces = os.networkInterfaces();

    for (const [name, ifaces] of Object.entries(interfaces)) {
      if (!ifaces) continue;
      for (const iface of ifaces) {
        if (iface.family !== 'IPv4' || iface.internal) continue;

        const parts = iface.address.split('.');
        const broadcastParts = [...parts];
        broadcastParts[3] = '255';

        networks.push({
          id: `${name}-${iface.address}`,
          name: name,
          ipRange: `${parts[0]}.${parts[1]}.${parts[2]}.0/24`,
          broadcastAddress: broadcastParts.join('.'),
          isAvailable: true,
        });
      }
    }

    // Always include localhost for single-machine / web mode
    if (networks.length === 0) {
      networks.push({
        id: 'localhost',
        name: 'Localhost',
        ipRange: '127.0.0.1/8',
        broadcastAddress: '127.255.255.255',
        isAvailable: true,
      });
    }

    return NextResponse.json({ networks });
  } catch (error) {
    console.error('[LAN Networks API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get networks', networks: [] },
      { status: 500 }
    );
  }
}
