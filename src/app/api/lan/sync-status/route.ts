/**
 * LAN Sync Status API - GET sync status between instances
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LAN_SYNC_STATUS_FILE = path.join(os.tmpdir(), 'homeopms-lan-sync-status.json');
const LAN_NETWORK_STATE_FILE = path.join(os.tmpdir(), 'homeopms-lan-network-state.json');

export async function GET() {
  try {
    let syncStatus: unknown[] = [];
    let connectedInstances: unknown[] = [];

    if (fs.existsSync(LAN_SYNC_STATUS_FILE)) {
      const content = fs.readFileSync(LAN_SYNC_STATUS_FILE, 'utf-8');
      const data = JSON.parse(content);
      syncStatus = data.instances || [];
    }

    if (fs.existsSync(LAN_NETWORK_STATE_FILE)) {
      const content = fs.readFileSync(LAN_NETWORK_STATE_FILE, 'utf-8');
      const state = JSON.parse(content);
      connectedInstances = state.connectedInstances || [];
    }

    return NextResponse.json({
      syncStatus,
      connectedInstances,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[LAN Sync Status API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status', syncStatus: [], connectedInstances: [] },
      { status: 500 }
    );
  }
}
