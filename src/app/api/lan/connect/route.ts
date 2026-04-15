/**
 * LAN Connect API - POST connect to a network
 * Initiates connection to the selected network and starts discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LAN_NETWORK_STATE_FILE = path.join(os.tmpdir(), 'homeopms-lan-network-state.json');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { networkId, networkName, broadcastAddress } = body;

    if (!networkId || !networkName || !broadcastAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: networkId, networkName, broadcastAddress' },
        { status: 400 }
      );
    }

    // Write connecting state to shared file
    const state = {
      state: 'connecting',
      networkId,
      networkName,
      broadcastAddress,
      timestamp: Date.now(),
    };

    fs.writeFileSync(LAN_NETWORK_STATE_FILE, JSON.stringify(state), 'utf-8');

    console.log('[LAN Connect API] Connecting to network:', networkName);

    return NextResponse.json({
      success: true,
      message: `Connecting to ${networkName}`,
      state: 'connecting',
    });
  } catch (error) {
    console.error('[LAN Connect API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to network' },
      { status: 500 }
    );
  }
}
