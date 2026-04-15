/**
 * Database Sync Status Endpoint
 * Returns current sync status and pending operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDBSync } from '@/lib/db-sync';

export async function GET(request: NextRequest) {
  const dbSync = getDBSync();

  if (!dbSync) {
    return NextResponse.json({
      enabled: false,
      message: 'Database sync is not initialized'
    });
  }

  const status = dbSync.getStatus();

  return NextResponse.json({
    enabled: true,
    ...status,
    timestamp: Date.now()
  });
}
