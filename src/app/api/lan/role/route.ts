/**
 * LAN Role API - POST assign role (main/child)
 * Assigns the server role (main or child) after discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LAN_NETWORK_STATE_FILE = path.join(os.tmpdir(), 'homeopms-lan-network-state.json');
const LAN_STATUS_FILE = path.join(os.tmpdir(), 'homeopms-lan-status.json');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, mainServerId, mainServerIp, mainServerPort } = body;

    if (!role || !['main', 'child'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "main" or "child"' },
        { status: 400 }
      );
    }

    if (role === 'child' && (!mainServerId || !mainServerIp)) {
      return NextResponse.json(
        { error: 'Child role requires mainServerId and mainServerIp' },
        { status: 400 }
      );
    }

    // Read current network state
    let networkState: Record<string, unknown> = {};
    if (fs.existsSync(LAN_NETWORK_STATE_FILE)) {
      const content = fs.readFileSync(LAN_NETWORK_STATE_FILE, 'utf-8');
      networkState = JSON.parse(content);
    }

    // Update network state with role
    const updatedState = {
      ...networkState,
      state: 'connected',
      role,
      mainServerId: role === 'child' ? mainServerId : undefined,
      mainServerIp: role === 'child' ? mainServerIp : undefined,
      mainServerPort: role === 'child' ? (mainServerPort || 3000) : undefined,
      lastConnectedTime: Date.now(),
      timestamp: Date.now(),
    };

    fs.writeFileSync(LAN_NETWORK_STATE_FILE, JSON.stringify(updatedState), 'utf-8');

    // Also update the legacy LAN status file for backward compatibility
    const legacyStatus = {
      isMainServer: role === 'main',
      mainServer: role === 'child' ? { id: mainServerId, ip: mainServerIp, port: mainServerPort || 3000 } : null,
      timestamp: Date.now(),
    };
    fs.writeFileSync(LAN_STATUS_FILE, JSON.stringify(legacyStatus), 'utf-8');

    // Notify the running LAN server manager of the manual role assignment
    try {
      const { getLANServer } = await import('@/lib/lan-server');
      const lanServer = getLANServer();
      if (lanServer) {
        lanServer.setManualRole(
          role as 'main' | 'child',
          role === 'child' ? { id: mainServerId, ip: mainServerIp, port: mainServerPort || 3000 } : undefined
        );
      }
    } catch {
      // LAN server may not be running in web mode — that's fine
    }

    console.log('[LAN Role API] Role assigned:', role);

    return NextResponse.json({
      success: true,
      role,
      message: `Connected as ${role === 'main' ? 'Main Server' : 'Child Server'}`,
    });
  } catch (error) {
    console.error('[LAN Role API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to assign role' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    if (fs.existsSync(LAN_NETWORK_STATE_FILE)) {
      const content = fs.readFileSync(LAN_NETWORK_STATE_FILE, 'utf-8');
      const state = JSON.parse(content);
      return NextResponse.json({
        role: state.role || null,
        state: state.state || 'disconnected',
      });
    }

    return NextResponse.json({ role: null, state: 'disconnected' });
  } catch (error) {
    console.error('[LAN Role API] Error reading role:', error);
    return NextResponse.json({ role: null, state: 'disconnected' });
  }
}
