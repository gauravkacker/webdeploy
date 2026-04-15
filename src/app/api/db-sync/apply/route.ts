/**
 * Database Sync Apply Endpoint
 * Main server receives write operations from client servers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLANServer } from '@/lib/lan-server';
import { getDBSync } from '@/lib/db-sync';
import type { SyncOperation } from '@/lib/db-sync';

export async function POST(request: NextRequest) {
  const lanServer = getLANServer();

  // Only main server can apply operations
  if (!lanServer || !lanServer.isMain()) {
    return NextResponse.json(
      { error: 'Only main server can apply operations' },
      { status: 403 }
    );
  }

  try {
    const operation: SyncOperation = await request.json();

    console.log('[DB Sync API] Received operation:', {
      type: operation.type,
      collection: operation.collection,
      serverId: operation.serverId
    });

    // Validate operation
    if (!operation.id || !operation.type || !operation.collection) {
      return NextResponse.json(
        { error: 'Invalid operation format' },
        { status: 400 }
      );
    }

    // Apply operation to database
    // This is where the actual database write happens
    await applyOperationToDatabase(operation);

    // Broadcast to other servers
    broadcastOperation(operation);

    return NextResponse.json({
      success: true,
      operationId: operation.id,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[DB Sync API] Error applying operation:', error);
    return NextResponse.json(
      { error: 'Failed to apply operation' },
      { status: 500 }
    );
  }
}

/**
 * Apply operation to database
 */
async function applyOperationToDatabase(operation: SyncOperation): Promise<void> {
  // Import database stores
  const { 
    patientDb, 
    appointmentDb, 
    billingQueueDb, 
    medicineBillDb,
    feeHistoryDb
  } = await import('@/lib/db/database');
  
  const { internalMessageDb, messagingModuleUserDb } = await import('@/lib/db/internal-messaging');
  const { serverDb } = await import('@/lib/db/server-database');

  const { collection, type, data } = operation;

  try {
    switch (collection) {
      case 'patients':
        if (type === 'create') (patientDb as any).create(data, true);
        else if (type === 'update') (patientDb as any).update(data.id, data, true);
        else if (type === 'delete') (patientDb as any).delete(data.id, true);
        break;

      case 'appointments':
        if (type === 'create') (appointmentDb as any).create(data, true);
        else if (type === 'update') (appointmentDb as any).update(data.id, data, true);
        else if (type === 'delete') (appointmentDb as any).delete(data.id, true);
        break;

      case 'billing':
        if (type === 'create') (billingQueueDb as any).create(data, true);
        else if (type === 'update') (billingQueueDb as any).update(data.id, data, true);
        else if (type === 'delete') (billingQueueDb as any).delete(data.id, true);
        break;

      case 'medicine-bills':
        if (type === 'create') (medicineBillDb as any).create(data, true);
        else if (type === 'update') (medicineBillDb as any).update(data.id, data, true);
        else if (type === 'delete') (medicineBillDb as any).delete(data.id, true);
        break;

      case 'fee-history':
        if (type === 'create') (feeHistoryDb as any).create(data, true);
        break;

      case 'internalMessages':
        if (type === 'create') internalMessageDb.create(data, true);
        else if (type === 'update') internalMessageDb.markRead(data.id, true);
        else if (type === 'delete') {
          if (data.all) internalMessageDb.clearAll(true);
          else internalMessageDb.delete(data.id, true);
        }
        break;

      case 'messagingModuleUsers':
        if (type === 'update') messagingModuleUserDb.updateStatus(data.module, data.status, true);
        else if (type === 'create') messagingModuleUserDb.updateLastActive(data.module, true);
        break;

      default:
        console.warn('[DB Sync API] Unknown collection:', collection);
    }

    console.log('[DB Sync API] Operation applied successfully');
  } catch (error) {
    console.error('[DB Sync API] Error applying to database:', error);
    throw error;
  }
}

/**
 * Broadcast operation to other servers
 */
function broadcastOperation(operation: SyncOperation): void {
  const lanServer = getLANServer();
  if (!lanServer) return;

  const peers = lanServer.getPeers();
  console.log(`[DB Sync API] Broadcasting to ${peers.length} peers`);

  peers.forEach(peer => {
    const peerURL = `http://${peer.ip}:${peer.port}/api/db-sync/broadcast`;
    
    fetch(peerURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation)
    }).catch(error => {
      console.error(`[DB Sync API] Failed to broadcast to ${peer.hostname}:`, error);
    });
  });
}
