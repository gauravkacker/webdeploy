/**
 * LAN Discover API - POST trigger discovery
 * Triggers UDP discovery to find other HomeoPMS instances on the network
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LAN_DISCOVERY_STATE_FILE = path.join(os.tmpdir(), 'homeopms-lan-discovery-state.json');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { broadcastAddress } = body;

    if (!broadcastAddress) {
      return NextResponse.json(
        { error: 'Missing required field: broadcastAddress' },
        { status: 400 }
      );
    }

    // Write discovery request to shared file
    // The Electron main process will pick this up and start discovery
    const discoveryRequest = {
      action: 'start-discovery',
      broadcastAddress,
      timestamp: Date.now(),
    };

    fs.writeFileSync(LAN_DISCOVERY_STATE_FILE, JSON.stringify(discoveryRequest), 'utf-8');

    console.log('[LAN Discover API] Discovery requested for:', broadcastAddress);

    return NextResponse.json({
      success: true,
      message: 'Discovery started',
      discoveryInProgress: true,
    });
  } catch (error) {
    console.error('[LAN Discover API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start discovery' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Read discovery results from shared file
    if (fs.existsSync(LAN_DISCOVERY_STATE_FILE)) {
      const content = fs.readFileSync(LAN_DISCOVERY_STATE_FILE, 'utf-8');
      const state = JSON.parse(content);

      // Check if discovery is complete
      if (state.action === 'discovery-complete') {
        return NextResponse.json({
          discoveryComplete: true,
          instances: state.instances || [],
          timestamp: state.timestamp,
        });
      }

      // Discovery still in progress
      return NextResponse.json({
        discoveryComplete: false,
        discoveryInProgress: true,
        timestamp: state.timestamp,
      });
    }

    // No discovery state found
    return NextResponse.json({
      discoveryComplete: false,
      discoveryInProgress: false,
      instances: [],
    });
  } catch (error) {
    console.error('[LAN Discover API] Error reading discovery state:', error);
    return NextResponse.json(
      { error: 'Failed to get discovery status' },
      { status: 500 }
    );
  }
}
