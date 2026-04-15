import { AuditLogger } from '@/lib/audit-logger';

describe('Multi-PC Audit Logging', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger();
  });

  test('logs license creation with initial Machine IDs', () => {
    const entry = auditLogger.logLicenseCreation(
      'admin-123',
      'lic-456',
      'multi-pc',
      ['MACHINE-A', 'MACHINE-B'],
      5,
      { customerId: 'cust-789' }
    );

    expect(entry.action).toBe('LICENSE_CREATED');
    expect(entry.itemType).toBe('license');
    expect(entry.itemId).toBe('lic-456');
    expect(entry.userId).toBe('admin-123');
    expect(entry.details?.licenseType).toBe('multi-pc');
    expect(entry.details?.initialMachineIds).toEqual(['MACHINE-A', 'MACHINE-B']);
    expect(entry.details?.maxMachines).toBe(5);
    expect(entry.details?.machineCount).toBe(2);
    expect(entry.immutable).toBe(true);
  });

  test('logs Machine ID addition', () => {
    const entry = auditLogger.logMachineIdAdded(
      'admin-123',
      'lic-456',
      'MACHINE-C',
      { remainingSlots: 2 }
    );

    expect(entry.action).toBe('MACHINE_ID_ADDED');
    expect(entry.itemType).toBe('license');
    expect(entry.itemId).toBe('lic-456');
    expect(entry.userId).toBe('admin-123');
    expect(entry.details?.machineId).toBe('MACHINE-C');
    expect(entry.details?.remainingSlots).toBe(2);
    expect(entry.immutable).toBe(true);
  });

  test('logs Machine ID removal', () => {
    const entry = auditLogger.logMachineIdRemoved(
      'admin-123',
      'lic-456',
      'MACHINE-B',
      { remainingSlots: 3 }
    );

    expect(entry.action).toBe('MACHINE_ID_REMOVED');
    expect(entry.itemType).toBe('license');
    expect(entry.itemId).toBe('lic-456');
    expect(entry.userId).toBe('admin-123');
    expect(entry.details?.machineId).toBe('MACHINE-B');
    expect(entry.details?.remainingSlots).toBe(3);
    expect(entry.immutable).toBe(true);
  });

  test('logs license upgrade', () => {
    const entry = auditLogger.logLicenseUpgrade(
      'admin-123',
      'lic-456',
      1,
      10,
      { preservedMachineId: 'MACHINE-A' }
    );

    expect(entry.action).toBe('LICENSE_UPGRADED');
    expect(entry.itemType).toBe('license');
    expect(entry.itemId).toBe('lic-456');
    expect(entry.userId).toBe('admin-123');
    expect(entry.details?.oldMaxMachines).toBe(1);
    expect(entry.details?.newMaxMachines).toBe(10);
    expect(entry.details?.oldLicenseType).toBe('single-pc');
    expect(entry.details?.newLicenseType).toBe('multi-pc');
    expect(entry.immutable).toBe(true);
  });

  test('logs LIC file regeneration', () => {
    const entry = auditLogger.logLicFileRegeneration(
      'admin-123',
      'lic-456',
      'Machine ID added',
      { regenerationTime: 500 }
    );

    expect(entry.action).toBe('LIC_FILE_REGENERATED');
    expect(entry.itemType).toBe('license');
    expect(entry.itemId).toBe('lic-456');
    expect(entry.userId).toBe('admin-123');
    expect(entry.reason).toBe('Machine ID added');
    expect(entry.details?.regenerationTime).toBe(500);
    expect(entry.immutable).toBe(true);
  });

  test('retrieves license audit history', () => {
    // Create multiple audit entries
    auditLogger.logLicenseCreation('admin-123', 'lic-456', 'multi-pc', ['MACHINE-A'], 5);
    auditLogger.logMachineIdAdded('admin-123', 'lic-456', 'MACHINE-B');
    auditLogger.logMachineIdAdded('admin-123', 'lic-456', 'MACHINE-C');
    auditLogger.logMachineIdRemoved('admin-123', 'lic-456', 'MACHINE-B');

    const history = auditLogger.getLicenseAuditHistory('lic-456');

    expect(history).toHaveLength(4);
    expect(history[0].action).toBe('MACHINE_ID_REMOVED'); // Most recent first
    expect(history[3].action).toBe('LICENSE_CREATED'); // Oldest last
  });

  test('filters audit history by license ID', () => {
    auditLogger.logLicenseCreation('admin-123', 'lic-456', 'multi-pc', ['MACHINE-A'], 5);
    auditLogger.logLicenseCreation('admin-123', 'lic-789', 'single-pc', ['MACHINE-X'], 1);
    auditLogger.logMachineIdAdded('admin-123', 'lic-456', 'MACHINE-B');

    const history456 = auditLogger.getLicenseAuditHistory('lic-456');
    const history789 = auditLogger.getLicenseAuditHistory('lic-789');

    expect(history456).toHaveLength(2);
    expect(history789).toHaveLength(1);
    expect(history456.every(e => e.itemId === 'lic-456')).toBe(true);
    expect(history789.every(e => e.itemId === 'lic-789')).toBe(true);
  });

  test('ensures audit entries are immutable', () => {
    const entry = auditLogger.logLicenseCreation(
      'admin-123',
      'lic-456',
      'multi-pc',
      ['MACHINE-A'],
      5
    );

    expect(auditLogger.verifyImmutability(entry.id)).toBe(true);
  });

  test('includes timestamp in all audit entries', () => {
    const before = new Date();
    const entry = auditLogger.logMachineIdAdded('admin-123', 'lic-456', 'MACHINE-A');
    const after = new Date();

    const entryTime = new Date(entry.timestamp);
    expect(entryTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entryTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('retrieves entries by item type', () => {
    auditLogger.logLicenseCreation('admin-123', 'lic-456', 'multi-pc', ['MACHINE-A'], 5);
    auditLogger.logMachineIdAdded('admin-123', 'lic-456', 'MACHINE-B');

    const licenseEntries = auditLogger.getEntriesByItemType('license');

    expect(licenseEntries.length).toBeGreaterThanOrEqual(2);
    expect(licenseEntries.every(e => e.itemType === 'license')).toBe(true);
  });
});
