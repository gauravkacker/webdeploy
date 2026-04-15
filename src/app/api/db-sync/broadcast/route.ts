/**
 * Database Sync Broadcast Endpoint
 * Client servers receive updates from main server
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SyncOperation } from '@/lib/db-sync';

export async function POST(request: NextRequest) {
  try {
    const operation: SyncOperation = await request.json();

    console.log('[DB Sync Broadcast] Received operation:', {
      type: operation.type,
      collection: operation.collection,
      serverId: operation.serverId
    });

    // Apply operation to local database
    await applyOperationLocally(operation);

    return NextResponse.json({
      success: true,
      operationId: operation.id
    });
  } catch (error) {
    console.error('[DB Sync Broadcast] Error:', error);
    return NextResponse.json(
      { error: 'Failed to apply broadcast operation' },
      { status: 500 }
    );
  }
}

/**
 * Apply operation to local database
 */
async function applyOperationLocally(operation: SyncOperation): Promise<void> {
  const { 
    db,
    patientDb, 
    appointmentDb, 
    billingQueueDb,
    billingReceiptDb,
    medicineBillDb,
    feeHistoryDb,
    feesDb,
    feeDb,
    investigationDb,
    queueItemDb,
    queueEventDb,
    queueDb,
    patientTagDb,
    slotDb,
    medicineAmountMemoryDb,
  } = await import('@/lib/db/database');
  
  const { doctorVisitDb, doctorPrescriptionDb, pharmacyQueueDb, combinationDb, medicineMemoryDb } = await import('@/lib/db/doctor-panel');
  const { internalMessageDb, messagingModuleUserDb } = await import('@/lib/db/internal-messaging');

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
      case 'billingQueue':
        if (type === 'create') (billingQueueDb as any).create(data, true);
        else if (type === 'update') (billingQueueDb as any).update(data.id, data, true);
        else if (type === 'delete') (billingQueueDb as any).delete(data.id, true);
        break;

      case 'medicine-bills':
      case 'medicineBills':
        if (type === 'create') (medicineBillDb as any).create(data, true);
        else if (type === 'update') (medicineBillDb as any).update(data.id, data, true);
        else if (type === 'delete') (medicineBillDb as any).delete(data.id, true);
        break;

      case 'fee-history':
        if (type === 'create') (feeHistoryDb as any).create(data, true);
        else if (type === 'update') (feeHistoryDb as any).update(data.id, data, true);
        else if (type === 'delete') (feeHistoryDb as any).delete(data.id, true);
        break;

      case 'fees':
        if (type === 'create') (feesDb as any).create(data, true);
        else if (type === 'update') (feesDb as any).update(data.id, data, true);
        else if (type === 'delete') (feesDb as any).delete(data.id, true);
        break;

      case 'investigations':
        if (type === 'create') (investigationDb as any).create(data, true);
        else if (type === 'delete') (investigationDb as any).delete(data.id, true);
        break;

      case 'billingReceipts':
        if (type === 'create') (billingReceiptDb as any).create(data, true);
        else if (type === 'update') (billingReceiptDb as any).update(data.id, data, true);
        else if (type === 'delete') (billingReceiptDb as any).delete(data.id, true);
        break;

      case 'queueItems':
        if (type === 'create') (queueItemDb as any).create(data, true);
        else if (type === 'update') (queueItemDb as any).update(data.id, data, true);
        else if (type === 'delete') (queueItemDb as any).delete(data.id, true);
        break;

      case 'visits':
        if (type === 'create') (doctorVisitDb as any).create(data, true);
        else if (type === 'update') (doctorVisitDb as any).update(data.id, data, true);
        else if (type === 'delete') (doctorVisitDb as any).delete(data.id, true);
        break;

      case 'prescriptions':
        if (type === 'create') (doctorPrescriptionDb as any).create(data, true);
        else if (type === 'update') (doctorPrescriptionDb as any).update(data.id, data, true);
        else if (type === 'delete') (doctorPrescriptionDb as any).delete(data.id, true);
        break;

      case 'pharmacy':
        if (type === 'create') (pharmacyQueueDb as any).create(data, true);
        else if (type === 'update') (pharmacyQueueDb as any).update(data.id, data, true);
        else if (type === 'delete') (pharmacyQueueDb as any).delete(data.id, true);
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

      case 'combinations':
        if (type === 'create') (combinationDb as any).create(data, true);
        else if (type === 'update') (combinationDb as any).update(data.id, data, true);
        else if (type === 'delete') (combinationDb as any).delete(data.id, true);
        break;

      case 'medicineUsageMemory':
        if (type === 'create') medicineMemoryDb.create(data, true);
        else if (type === 'update') medicineMemoryDb.create(data, true);
        else if (type === 'delete') medicineMemoryDb.delete(data.id, true);
        break;

      case 'medicineAmountMemory':
        if (type === 'create') medicineAmountMemoryDb.create(data, true);
        else if (type === 'update') medicineAmountMemoryDb.update(data.id, data, true);
        break;

      case 'patientTags':
        if (type === 'create') patientTagDb.create(data, true);
        else if (type === 'update') patientTagDb.update(data.id, data, true);
        else if (type === 'delete') patientTagDb.delete(data.id, true);
        break;

      case 'slots':
        if (type === 'create') slotDb.create(data, true);
        else if (type === 'update') slotDb.update(data.id, data, true);
        else if (type === 'delete') slotDb.delete(data.id, true);
        break;

      case 'queueEvents':
        if (type === 'create') queueEventDb.create(data, true);
        break;

      case 'queueConfigs':
        if (type === 'create') (queueDb as any).create(data, true);
        else if (type === 'update') (queueDb as any).update(data.id, data, true);
        else if (type === 'delete') (queueDb as any).delete(data.id, true);
        break;

      case 'smartParsingRules':
        if (type === 'create') db.create('smartParsingRules', data);
        else if (type === 'update') db.update('smartParsingRules', data.id, data);
        else if (type === 'delete') db.delete('smartParsingRules', data.id);
        break;

      case 'smartParsingTemplates':
        if (type === 'create') db.create('smartParsingTemplates', data);
        else if (type === 'update') db.update('smartParsingTemplates', data.id, data);
        else if (type === 'delete') db.delete('smartParsingTemplates', data.id);
        break;

      case 'feeTypes':
        if (type === 'create') (feeDb as any).create(data, true);
        else if (type === 'update') (feeDb as any).update(data.id, data, true);
        else if (type === 'delete') (feeDb as any).delete(data.id, true);
        break;

      default:
        console.warn('[DB Sync Broadcast] Unknown collection:', collection);
    }

    console.log('[DB Sync Broadcast] Operation applied successfully');
  } catch (error) {
    console.error('[DB Sync Broadcast] Error applying to database:', error);
    throw error;
  }
}
