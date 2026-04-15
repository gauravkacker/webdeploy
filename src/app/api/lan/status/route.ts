/**
 * LAN Status API
 * Returns current LAN server status and peer information
 * 
 * Reads from a shared status file written by the Electron LAN server
 * This allows the Next.js process to know the LAN election result
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function GET(request: NextRequest) {
  try {
    // Try to read LAN status from file written by Electron process
    const statusFile = path.join(os.tmpdir(), 'homeopms-lan-status.json');
    
    if (fs.existsSync(statusFile)) {
      const content = fs.readFileSync(statusFile, 'utf-8');
      const status = JSON.parse(content);
      
      // Check if status is fresh (within 30 seconds)
      const age = Date.now() - status.timestamp;
      if (age < 30000) {
        console.log('[LAN API] Status file found and fresh:', {
          isMainServer: status.isMainServer,
          age: age
        });
        return NextResponse.json({
          enabled: true,
          isMainServer: status.isMainServer,
          mainServer: status.mainServer,
          timestamp: status.timestamp
        });
      } else {
        console.warn('[LAN API] Status file is stale (age:', age, 'ms)');
      }
    } else {
      console.warn('[LAN API] Status file not found at:', statusFile);
    }
  } catch (e) {
    console.error('[LAN API] Error reading status file:', e);
  }

  // Fallback: Assume Main Server if LAN status is not available
  // This is the safe default for single-computer setups
  console.log('[LAN API] Fallback: Assuming Main Server');
  return NextResponse.json({
    enabled: false,
    isMainServer: true,
    message: 'LAN mode is not enabled or status is stale, assuming Main Server'
  });
}
