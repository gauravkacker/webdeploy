/**
 * LAN Disconnect API - POST disconnect from network
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LAN_NETWORK_STATE_FILE = path.join(os.tmpdir(), 'homeopms-lan-network-state.json');
const LAN_STATUS_FILE = path.join(os.tmpdir(), 'homeopms-lan-status.json');

export async function POST() {
  try {
    // Clear network state
    const disconnectedState = {
      state: 'disconnected',
      role: null,
      timestamp: Date.now(),
    };

    fs.writeFileSync(LAN_NETWORK_STATE_FILE, JSON.stringify(disconnectedState), 'utf-8');

    // Clear legacy status file
    const legacyStatus = {
      isMainServer: true, // Default to main when disconnected
      mainServer: null,
      timestamp: Date.now(),
    };
    fs.writeFileSync(LAN_STATUS_FILE, JSON.stringify(legacyStatus), 'utf-8');

    console.log('[LAN Disconnect API] Disconnected from network');

    return NextResponse.json({
      success: true,
      message: 'Disconnected from network',
      state: 'disconnected',
    });
  } catch (error) {
    console.error('[LAN Disconnect API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
