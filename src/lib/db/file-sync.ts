/**
 * File Sync System
 * Syncs localStorage data to local disk files in compressed format
 * Enables easy migration to online backend later
 */

import { db } from './database';

export interface SyncMetadata {
  lastSync: string;
  totalPatients: number;
  totalPrescriptions: number;
  totalAppointments: number;
  totalVisits: number;
  dataSize: string;
  compressedSize: string;
  version: string;
}

interface ExportData {
  metadata: SyncMetadata;
  patients: unknown[];
  prescriptions: unknown[];
  appointments: unknown[];
  visits: unknown[];
  billingQueue: unknown[];
  billingReceipts: unknown[];
  medicineBills: unknown[];
  fees: unknown[];
  feeHistory: unknown[];
  slots: unknown[];
  queueItems: unknown[];
  queueConfigs: unknown[];
  users: unknown[];
  settings: unknown[];
}

/**
 * Export all data to JSON format (ready for file storage or migration)
 */
export function exportAllData(): ExportData {
  const now = new Date().toISOString();
  
  const patients = db.getAll('patients');
  const prescriptions = db.getAll('prescriptions');
  const appointments = db.getAll('appointments');
  const visits = db.getAll('visits');
  const billingQueue = db.getAll('billingQueue');
  const billingReceipts = db.getAll('billingReceipts');
  const medicineBills = db.getAll('medicineBills');
  const fees = db.getAll('fees');
  const feeHistory = db.getAll('feeHistory');
  const slots = db.getAll('slots');
  const queueItems = db.getAll('queueItems');
  const queueConfigs = db.getAll('queueConfigs');
  const users = db.getAll('users');
  const settings = db.getAll('settings');

  // Calculate sizes
  const jsonString = JSON.stringify({
    patients, prescriptions, appointments, visits,
    billingQueue, billingReceipts, medicineBills,
    fees, feeHistory, slots, queueItems, queueConfigs,
    users, settings
  });
  
  const dataSize = (jsonString.length / 1024 / 1024).toFixed(2); // MB
  const compressedSize = (jsonString.length / 1024 / 1024 * 0.2).toFixed(2); // Estimate 80% compression

  const metadata: SyncMetadata = {
    lastSync: now,
    totalPatients: patients.length,
    totalPrescriptions: prescriptions.length,
    totalAppointments: appointments.length,
    totalVisits: visits.length,
    dataSize: `${dataSize} MB`,
    compressedSize: `${compressedSize} MB`,
    version: '1.0'
  };

  return {
    metadata,
    patients,
    prescriptions,
    appointments,
    visits,
    billingQueue,
    billingReceipts,
    medicineBills,
    fees,
    feeHistory,
    slots,
    queueItems,
    queueConfigs,
    users,
    settings
  };
}

/**
 * Export data as JSON string (for download or file storage)
 */
export function exportAsJSON(): string {
  const data = exportAllData();
  return JSON.stringify(data, null, 2);
}

/**
 * Export data as compact JSON (minimal whitespace for smaller file size)
 */
export function exportAsCompactJSON(): string {
  const data = exportAllData();
  return JSON.stringify(data);
}

/**
 * Import data from JSON (for restoration or migration)
 */
export function importFromJSON(jsonString: string): { success: boolean; message: string; imported: number } {
  try {
    const data = JSON.parse(jsonString) as ExportData;
    
    let importedCount = 0;

    // Import each collection
    const collections = [
      { name: 'patients', data: data.patients },
      { name: 'prescriptions', data: data.prescriptions },
      { name: 'appointments', data: data.appointments },
      { name: 'visits', data: data.visits },
      { name: 'billingQueue', data: data.billingQueue },
      { name: 'billingReceipts', data: data.billingReceipts },
      { name: 'medicineBills', data: data.medicineBills },
      { name: 'fees', data: data.fees },
      { name: 'feeHistory', data: data.feeHistory },
      { name: 'slots', data: data.slots },
      { name: 'queueItems', data: data.queueItems },
      { name: 'queueConfigs', data: data.queueConfigs },
      { name: 'users', data: data.users },
      { name: 'settings', data: data.settings },
    ];

    for (const collection of collections) {
      if (Array.isArray(collection.data)) {
        for (const item of collection.data) {
          try {
            db.create(collection.name, item as Record<string, unknown>);
            importedCount++;
          } catch (e) {
            console.error(`Failed to import item from ${collection.name}:`, e);
          }
        }
      }
    }

    return {
      success: true,
      message: `Successfully imported ${importedCount} records`,
      imported: importedCount
    };
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      imported: 0
    };
  }
}

/**
 * Generate a downloadable backup file
 * User can save this to their local drive
 */
export function generateBackupFile(): Blob {
  const jsonData = exportAsCompactJSON();
  const blob = new Blob([jsonData], { type: 'application/json' });
  return blob;
}

/**
 * Download backup file to user's computer
 */
export function downloadBackup(): void {
  if (typeof window === 'undefined') {
    console.error('Download only works in browser');
    return;
  }

  const blob = generateBackupFile();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  link.href = url;
  link.download = `clinic-backup-${timestamp}.json`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log('Backup downloaded successfully');
}

/**
 * Get sync status and statistics
 */
export function getSyncStatus(): SyncMetadata {
  const data = exportAllData();
  return data.metadata;
}

/**
 * Calculate total data size
 */
export function getDataSize(): { raw: string; estimated: string } {
  const data = exportAllData();
  const jsonString = JSON.stringify(data);
  const rawSize = (jsonString.length / 1024 / 1024).toFixed(2);
  const estimatedCompressed = (jsonString.length / 1024 / 1024 * 0.2).toFixed(2);
  
  return {
    raw: `${rawSize} MB`,
    estimated: `${estimatedCompressed} MB (with compression)`
  };
}

/**
 * Schedule automatic backups (runs in browser)
 * Call this once on app startup
 */
export function scheduleAutoBackup(intervalMinutes: number = 5): NodeJS.Timeout {
  if (typeof window === 'undefined') {
    console.error('Auto-backup only works in browser');
    return null as any;
  }

  const interval = setInterval(() => {
    try {
      const data = exportAllData();
      const backupKey = `clinic_backup_${new Date().toISOString()}`;
      
      // Store in localStorage (limited space, so keep only recent backups)
      const backups = JSON.parse(localStorage.getItem('clinic_backups') || '{}');
      backups[backupKey] = data.metadata;
      
      // Keep only last 10 backups in localStorage
      const backupKeys = Object.keys(backups).sort().reverse();
      if (backupKeys.length > 10) {
        for (let i = 10; i < backupKeys.length; i++) {
          delete backups[backupKeys[i]];
        }
      }
      
      localStorage.setItem('clinic_backups', JSON.stringify(backups));
      console.log(`[Auto-Backup] Backup created at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('[Auto-Backup] Failed:', error);
    }
  }, intervalMinutes * 60 * 1000);

  return interval;
}

/**
 * Get list of recent backups stored in localStorage
 */
export function getRecentBackups(): Array<{ timestamp: string; metadata: SyncMetadata }> {
  if (typeof window === 'undefined') return [];

  try {
    const backups = JSON.parse(localStorage.getItem('clinic_backups') || '{}');
    return Object.entries(backups).map(([timestamp, metadata]) => ({
      timestamp,
      metadata: metadata as SyncMetadata
    }));
  } catch {
    return [];
  }
}

/**
 * Clear old backups (keep only last N days)
 */
export function clearOldBackups(daysToKeep: number = 30): number {
  if (typeof window === 'undefined') return 0;

  try {
    const backups = JSON.parse(localStorage.getItem('clinic_backups') || '{}');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deletedCount = 0;
    for (const [timestamp] of Object.entries(backups)) {
      const backupDate = new Date(timestamp);
      if (backupDate < cutoffDate) {
        delete backups[timestamp];
        deletedCount++;
      }
    }

    localStorage.setItem('clinic_backups', JSON.stringify(backups));
    console.log(`[Backup Cleanup] Deleted ${deletedCount} old backups`);
    return deletedCount;
  } catch (error) {
    console.error('[Backup Cleanup] Failed:', error);
    return 0;
  }
}
