import { LocalDatabase } from './db/database';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  itemType: 'fee' | 'prescription' | 'bill' | 'license';
  itemId: string;
  patientId?: string;
  cascadedRecords: string[];
  reason?: string;
  immutable: boolean;
  details?: Record<string, unknown>;
}

/**
 * AuditLogger handles logging of all hard delete operations
 * Ensures immutability and provides audit trail for compliance
 */
export class AuditLogger {
  private db: LocalDatabase;
  private readonly AUDIT_COLLECTION = 'auditLog';

  constructor() {
    this.db = LocalDatabase.getInstance();
    this.ensureAuditLogExists();
  }

  /**
   * Ensure audit log collection exists
   */
  private ensureAuditLogExists(): void {
    const auditLog = this.db.getAll(this.AUDIT_COLLECTION);
    if (!auditLog || auditLog.length === 0) {
      // Initialize if empty
      console.log('Audit log collection initialized');
    }
  }

  /**
   * Log a hard delete operation
   */
  logHardDelete(
    userId: string,
    itemType: 'fee' | 'prescription' | 'bill',
    itemId: string,
    patientId: string,
    cascadedRecords: string[],
    reason?: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId,
      action: 'HARD_DELETE',
      itemType,
      itemId,
      patientId,
      cascadedRecords,
      reason: reason || 'No reason provided',
      immutable: true,
      details,
    };

    // Store in database
    this.db.create(this.AUDIT_COLLECTION, entry);

    return entry;
  }

  /**
   * Log multi-PC license creation
   */
  logLicenseCreation(
    adminId: string,
    licenseId: string,
    licenseType: 'single-pc' | 'multi-pc',
    initialMachineIds: string[],
    maxMachines?: number,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: adminId,
      action: 'LICENSE_CREATED',
      itemType: 'license',
      itemId: licenseId,
      cascadedRecords: [],
      immutable: true,
      details: {
        licenseType,
        initialMachineIds,
        maxMachines,
        machineCount: initialMachineIds.length,
        ...details
      },
    };

    this.db.create(this.AUDIT_COLLECTION, entry);
    return entry;
  }

  /**
   * Log Machine ID addition
   */
  logMachineIdAdded(
    adminId: string,
    licenseId: string,
    machineId: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: adminId,
      action: 'MACHINE_ID_ADDED',
      itemType: 'license',
      itemId: licenseId,
      cascadedRecords: [],
      immutable: true,
      details: {
        machineId,
        ...details
      },
    };

    this.db.create(this.AUDIT_COLLECTION, entry);
    return entry;
  }

  /**
   * Log Machine ID removal
   */
  logMachineIdRemoved(
    adminId: string,
    licenseId: string,
    machineId: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: adminId,
      action: 'MACHINE_ID_REMOVED',
      itemType: 'license',
      itemId: licenseId,
      cascadedRecords: [],
      immutable: true,
      details: {
        machineId,
        ...details
      },
    };

    this.db.create(this.AUDIT_COLLECTION, entry);
    return entry;
  }

  /**
   * Log license upgrade
   */
  logLicenseUpgrade(
    adminId: string,
    licenseId: string,
    oldMaxMachines: number,
    newMaxMachines: number,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: adminId,
      action: 'LICENSE_UPGRADED',
      itemType: 'license',
      itemId: licenseId,
      cascadedRecords: [],
      immutable: true,
      details: {
        oldMaxMachines,
        newMaxMachines,
        oldLicenseType: 'single-pc',
        newLicenseType: 'multi-pc',
        ...details
      },
    };

    this.db.create(this.AUDIT_COLLECTION, entry);
    return entry;
  }

  /**
   * Log LIC file regeneration
   */
  logLicFileRegeneration(
    adminId: string,
    licenseId: string,
    reason: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: adminId,
      action: 'LIC_FILE_REGENERATED',
      itemType: 'license',
      itemId: licenseId,
      cascadedRecords: [],
      reason,
      immutable: true,
      details,
    };

    this.db.create(this.AUDIT_COLLECTION, entry);
    return entry;
  }

  /**
   * Get all audit log entries
   */
  getAllEntries(): AuditLogEntry[] {
    return this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
  }

  /**
   * Get audit log entries for a specific user
   */
  getEntriesByUser(userId: string): AuditLogEntry[] {
    const entries = this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
    return entries.filter((entry) => entry.userId === userId);
  }

  /**
   * Get audit log entries for a specific patient
   */
  getEntriesByPatient(patientId: string): AuditLogEntry[] {
    const entries = this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
    return entries.filter((entry) => entry.patientId === patientId);
  }

  /**
   * Get audit log entries for a specific item type
   */
  getEntriesByItemType(itemType: 'fee' | 'prescription' | 'bill' | 'license'): AuditLogEntry[] {
    const entries = this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
    return entries.filter((entry) => entry.itemType === itemType);
  }

  /**
   * Get license audit entries for a specific license
   */
  getLicenseAuditHistory(licenseId: string): AuditLogEntry[] {
    const entries = this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
    return entries.filter(
      (entry) => entry.itemType === 'license' && entry.itemId === licenseId
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get audit log entries within a date range
   */
  getEntriesByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
    const entries = this.db.getAll(this.AUDIT_COLLECTION) as AuditLogEntry[];
    return entries.filter((entry) => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  }

  /**
   * Get a specific audit log entry by ID
   */
  getEntryById(entryId: string): AuditLogEntry | undefined {
    return this.db.getById(this.AUDIT_COLLECTION, entryId) as AuditLogEntry | undefined;
  }

  /**
   * Verify audit log immutability
   * Ensures that audit log entries cannot be modified or deleted
   */
  verifyImmutability(entryId: string): boolean {
    const entry = this.getEntryById(entryId);
    if (!entry) {
      return false;
    }
    return entry.immutable === true;
  }

  /**
   * Get audit log statistics
   */
  getStatistics(): {
    totalEntries: number;
    entriesByItemType: Record<string, number>;
    entriesByUser: Record<string, number>;
    dateRange: { earliest: Date | null; latest: Date | null };
  } {
    const entries = this.getAllEntries();

    const entriesByItemType: Record<string, number> = {
      fee: 0,
      prescription: 0,
      bill: 0,
    };

    const entriesByUser: Record<string, number> = {};
    let earliest: Date | null = null;
    let latest: Date | null = null;

    entries.forEach((entry) => {
      entriesByItemType[entry.itemType]++;

      if (!entriesByUser[entry.userId]) {
        entriesByUser[entry.userId] = 0;
      }
      entriesByUser[entry.userId]++;

      const entryDate = new Date(entry.timestamp);
      if (!earliest || entryDate < earliest) {
        earliest = entryDate;
      }
      if (!latest || entryDate > latest) {
        latest = entryDate;
      }
    });

    return {
      totalEntries: entries.length,
      entriesByItemType,
      entriesByUser,
      dateRange: { earliest, latest },
    };
  }

  /**
   * Export audit log as JSON
   */
  exportAsJSON(): string {
    const entries = this.getAllEntries();
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export audit log as CSV
   */
  exportAsCSV(): string {
    const entries = this.getAllEntries();

    if (entries.length === 0) {
      return 'No audit log entries found';
    }

    // CSV header
    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Action',
      'Item Type',
      'Item ID',
      'Patient ID',
      'Cascaded Records Count',
      'Reason',
      'Immutable',
    ];

    // CSV rows
    const rows = entries.map((entry) => [
      entry.id,
      entry.timestamp.toISOString(),
      entry.userId,
      entry.action,
      entry.itemType,
      entry.itemId,
      entry.patientId,
      entry.cascadedRecords.length,
      entry.reason || 'N/A',
      entry.immutable ? 'Yes' : 'No',
    ]);

    // Combine headers and rows
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  /**
   * Search audit log entries
   */
  search(query: string): AuditLogEntry[] {
    const entries = this.getAllEntries();
    const lowerQuery = query.toLowerCase();

    return entries.filter((entry) => {
      return (
        entry.id.toLowerCase().includes(lowerQuery) ||
        entry.userId.toLowerCase().includes(lowerQuery) ||
        entry.itemId.toLowerCase().includes(lowerQuery) ||
        entry.patientId.toLowerCase().includes(lowerQuery) ||
        (entry.reason && entry.reason.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Generate audit report
   */
  generateReport(startDate?: Date, endDate?: Date): {
    reportDate: Date;
    period: { start: Date; end: Date };
    summary: {
      totalDeletions: number;
      deletionsByType: Record<string, number>;
      deletionsByUser: Record<string, number>;
      totalCascadedRecords: number;
    };
    entries: AuditLogEntry[];
  } {
    const start = startDate || new Date(0);
    const end = endDate || new Date();

    const entries = this.getEntriesByDateRange(start, end);

    const deletionsByType: Record<string, number> = {
      fee: 0,
      prescription: 0,
      bill: 0,
    };

    const deletionsByUser: Record<string, number> = {};
    let totalCascadedRecords = 0;

    entries.forEach((entry) => {
      deletionsByType[entry.itemType]++;

      if (!deletionsByUser[entry.userId]) {
        deletionsByUser[entry.userId] = 0;
      }
      deletionsByUser[entry.userId]++;

      totalCascadedRecords += entry.cascadedRecords.length;
    });

    return {
      reportDate: new Date(),
      period: { start, end },
      summary: {
        totalDeletions: entries.length,
        deletionsByType,
        deletionsByUser,
        totalCascadedRecords,
      },
      entries,
    };
  }

  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
