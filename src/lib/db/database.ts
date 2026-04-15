// ============================================
// Local Database Infrastructure
// Offline-first data layer based on Module 1
// Includes Module 2: User Roles, Permissions & Login System
// Includes Module 3: Patient Master Database & Profile System
// Dual-Mode Architecture: Works in both Web (localStorage) and Desktop (SQLite) modes
// ============================================

import type { DatabaseConfig, RegNumberSettings } from '@/types';
import { isElectron, ipcQuery, ipcExecute } from '@/lib/ipc-client';
import { isServerDataMode } from '@/lib/db/data-mode';

// Database configuration
const dbConfig: DatabaseConfig = {
  type: 'sqlite',
  name: 'pms_database',
  version: 4,
};

// Database schema version - increment to reset data after schema changes
// NOTE: Set to empty string to preserve data between sessions
const SCHEMA_VERSION = '1.0';

// ── Server-mode JSON file persistence ─────────────────────────────────────
// When NEXT_PUBLIC_DATA_MODE=server, data is stored in a JSON file on the
// server filesystem instead of localStorage. This is loaded synchronously
// using Node.js fs module (server context only).
function getServerDbPath(): string {
  // Only called in server (Node.js) context
  const path = require('path') as typeof import('path');
  const dbDir = process.env.SERVER_DB_DIR || path.join(process.cwd(), '.data');
  return path.join(dbDir, 'database.json');
}

function loadServerJsonDb(): Map<string, unknown[]> | null {
  if (typeof window !== 'undefined') return null; // browser — skip
  if (!isServerDataMode) return null;
  try {
    const fs = require('fs') as typeof import('fs');
    const dbPath = getServerDbPath();
    const dir = require('path').dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dbPath)) return null;
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown[]>;
    const map = new Map<string, unknown[]>();
    Object.keys(parsed).forEach(k => map.set(k, parsed[k]));
    console.log('[ServerDB] Loaded database.json from', dbPath);
    return map;
  } catch (e) {
    console.error('[ServerDB] Failed to load database.json:', e);
    return null;
  }
}

function saveServerJsonDb(store: Map<string, unknown[]>): void {
  if (typeof window !== 'undefined') return; // browser — skip
  if (!isServerDataMode) return;
  try {
    const fs = require('fs') as typeof import('fs');
    const dbPath = getServerDbPath();
    const dir = require('path').dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data: Record<string, unknown[]> = {};
    store.forEach((v, k) => { data[k] = v; });
    fs.writeFileSync(dbPath, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.error('[ServerDB] Failed to save database.json:', e);
  }
}

// Global server-side cache for persisting data across API requests
// This is needed because Next.js API routes run in a server context where localStorage is not available
// Each request creates a fresh database instance, so we use a global variable to maintain state
let globalServerCache: Map<string, unknown[]> | null = null;

// LocalStorage-persisted database for offline-first functionality
export class LocalDatabase {
  private static instance: LocalDatabase;
  private store: Map<string, unknown[]>;
  private isInitialized: boolean = false;
  private lastSyncTime: number = 0;
  private hasPendingChanges: boolean = false;
  private syncTimeout: NodeJS.Timeout | null = null;
  // Debounce localStorage writes to avoid blocking the main thread on every DB operation
  private localStorageSaveTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.store = new Map();
    
    // In server context, use global cache if available
    if (typeof window === 'undefined' && globalServerCache) {
      console.log('[Database] Server context: Using global server cache');
      this.store = globalServerCache;
      this.isInitialized = true;
    } else if (typeof window === 'undefined' && isServerDataMode) {
      // Server mode first request: load from JSON file on disk
      const loaded = loadServerJsonDb();
      if (loaded) {
        this.store = loaded;
        this.isInitialized = true;
        globalServerCache = this.store;
        console.log('[ServerDB] Initialized from database.json');
      } else {
        // First run — initialize empty stores and save
        this.initializeStores();
        this.isInitialized = true;
        globalServerCache = this.store;
        saveServerJsonDb(this.store);
        console.log('[ServerDB] Created new database.json');
      }
    } else {
      // Client context or first request: load from storage
      this.loadFromStorage();
      // Initialize stores if not loaded from storage
      if (!this.isInitialized) {
        this.initializeStores();
        // Mark as initialized after setting up stores
        this.isInitialized = true;
      }
    }
    
    // Desktop mode: Start background sync with SQLite
    if (typeof window !== 'undefined' && isElectron()) {
      this.initDesktopMode();
      this.setupShutdownHandler();
    }
  }
  
  private setupShutdownHandler(): void {
    if (typeof window === 'undefined') return;
    
    // Access ipcRenderer from preload bridge
    const ipcRenderer = (window as any).electronAPI?.ipcRenderer;
    if (!ipcRenderer) return;
    
    ipcRenderer.on('app:before-quit', async () => {
      console.log('[Desktop Mode] App shutting down, checking for pending changes...');
      
      // Only backup if there are pending changes
      if (this.hasPendingChanges) {
        console.log('[Desktop Mode] Pending changes detected, forcing sync...');
        
        // Force immediate sync
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
          this.syncTimeout = null;
        }
        
        // Notify UI that backup is starting
        ipcRenderer.send('backup:starting');
        
        try {
          // Sync to SQLite
          await this.syncToSQLite();
          this.hasPendingChanges = false;
          
          // Notify UI that backup is complete
          ipcRenderer.send('backup:complete');
          console.log('[Desktop Mode] Shutdown backup complete');
        } catch (error) {
          console.error('[Desktop Mode] Shutdown backup failed:', error);
          ipcRenderer.send('backup:error', { error: (error as Error).message });
        }
      } else {
        console.log('[Desktop Mode] No pending changes, skipping backup');
        ipcRenderer.send('backup:skipped');
      }
    });
  }
  
  private initDesktopMode(): void {
    console.log('[Desktop Mode] Initializing dual-mode database...');
    
    // Don't load from SQLite on startup - localStorage is the source of truth
    // Just schedule an initial sync to ensure SQLite is up to date
    this.hasPendingChanges = true;
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    
    // Sync after 2 seconds to give time for initialization
    this.syncTimeout = setTimeout(() => {
      if (this.hasPendingChanges) {
        this.syncToSQLite();
        this.hasPendingChanges = false;
      }
    }, 2000);
    
    console.log('[Desktop Mode] Initial sync to SQLite scheduled');
  }

  public static getInstance(): LocalDatabase {
    // Always return existing instance to preserve data
    if (!LocalDatabase.instance) {
      LocalDatabase.instance = new LocalDatabase();
    } else if (typeof window === 'undefined' && globalServerCache) {
      // In server context, sync the instance's store with global cache
      // This ensures each API request sees the latest data
      console.log('[Database] Syncing instance store with global server cache');
      LocalDatabase.instance.store = globalServerCache;
    } else if (typeof window === 'undefined' && isServerDataMode && !globalServerCache) {
      // Server mode: reload from JSON file if cache was lost (e.g. hot reload)
      const loaded = loadServerJsonDb();
      if (loaded) {
        globalServerCache = loaded;
        LocalDatabase.instance.store = globalServerCache;
      }
    }
    return LocalDatabase.instance;
  }

  private loadFromStorage(): void {
    // Desktop mode: Load from localStorage first, then sync to SQLite
    if (typeof window !== 'undefined' && isElectron()) {
      console.log('[Desktop Mode] Loading from localStorage first...');
      this.loadFromLocalStorage();
      return;
    }
    
    // Web mode: Only use localStorage for client-side
    this.loadFromLocalStorage();
  }
  
  private async loadFromSQLite(): Promise<void> {
    console.log('[Desktop Mode] Loading data from SQLite...');
    try {
      // Load all collections from SQLite
      const collections = ['patients', 'appointments', 'billingQueue', 'billingReceipts', 'medicineBills', 'queueItems', 'prescriptions', 'visits', 'pharmacyQueue'];
      
      for (const collection of collections) {
        try {
          const tableName = this.collectionToTable(collection);
          const rows = await ipcQuery(`SELECT * FROM ${tableName}`);
          
          // Only update if SQLite has data, otherwise keep localStorage data
          if (rows && rows.length > 0) {
            this.store.set(collection, rows);
            console.log(`[Desktop Mode] Loaded ${rows.length} rows from ${tableName}`);
          } else {
            console.log(`[Desktop Mode] SQLite ${tableName} is empty, keeping localStorage data`);
          }
        } catch (error) {
          console.warn(`[Desktop Mode] Failed to load ${collection}:`, error);
          // Keep existing localStorage data instead of clearing
          console.log(`[Desktop Mode] Keeping existing ${collection} data from localStorage`);
        }
      }
      
      this.isInitialized = true;
      console.log('[Desktop Mode] SQLite data loaded successfully');
    } catch (error) {
      console.error('[Desktop Mode] Failed to load from SQLite:', error);
      // Keep existing stores instead of reinitializing
      console.log('[Desktop Mode] Keeping existing localStorage data');
    }
  }
  
  // Map localStorage collection names to SQLite table names
  private collectionToTable(collection: string): string {
    const mapping: Record<string, string> = {
      'patients': 'patients',
      'appointments': 'appointments',
      'billingQueue': 'billing_queue_items',
      'billingReceipts': 'billing_receipts',
      'medicineBills': 'medicine_bills',
      'queueItems': 'queue_items',
      'prescriptions': 'prescriptions',
      'visits': 'doctor_visits',
      'pharmacyQueue': 'pharmacy_queue_items',
      'internalMessages': 'internal_messages',
      'messagingModuleUsers': 'messaging_module_users',
    };
    return mapping[collection] || collection;
  }

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const savedData = localStorage.getItem('pms_database');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        const savedVersion = localStorage.getItem('pms_schema_version');
        if (savedVersion === SCHEMA_VERSION) {
          Object.keys(parsed).forEach(key => {
            this.store.set(key, parsed[key]);
          });
          this.isInitialized = true;
        }
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
    }
  }

  private saveToStorage(): void {
    // Debounce localStorage writes — batch rapid successive writes into one
    // This prevents the main thread from being blocked on every create/update/delete
    if (this.localStorageSaveTimeout) {
      clearTimeout(this.localStorageSaveTimeout);
    }
    this.localStorageSaveTimeout = setTimeout(() => {
      this.saveToLocalStorage();
      this.localStorageSaveTimeout = null;
    }, 300);

    // In server context, also update global cache
    if (typeof window === 'undefined') {
      globalServerCache = this.store;
      console.log('[Database] Updated global server cache');
      // Server mode: persist to JSON file immediately
      if (isServerDataMode) {
        saveServerJsonDb(this.store);
      }
    }

    // In browser context with server mode: sync to API
    if (typeof window !== 'undefined' && isServerDataMode && !isElectron()) {
      this.syncToServerApi();
    }

    // Desktop mode: Also schedule sync to SQLite
    if (typeof window !== 'undefined' && isElectron()) {
      this.hasPendingChanges = true;
      
      // Clear existing timeout if any
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }
      
      // Schedule sync after 1 second of inactivity (debounce)
      this.syncTimeout = setTimeout(() => {
        if (this.hasPendingChanges) {
          this.syncToSQLite();
          this.hasPendingChanges = false;
        }
      }, 1000);
    }
  }

  private syncToServerApi(): void {
    // Sync all collections to server API
    // This runs in browser context when NEXT_PUBLIC_DATA_MODE=server
    try {
      this.store.forEach((items, collection) => {
        // Send each collection to the server
        fetch(`/api/data/${collection}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        }).catch(err => {
          console.warn(`[Database] Failed to sync ${collection} to server:`, err);
        });
      });
    } catch (error) {
      console.warn('[Database] Failed to sync to server API:', error);
    }
  }

  // Flush immediately to localStorage — use only when cross-tab sync is needed right away
  public flushToLocalStorage(): void {
    if (this.localStorageSaveTimeout) {
      clearTimeout(this.localStorageSaveTimeout);
      this.localStorageSaveTimeout = null;
    }
    this.saveToLocalStorage();
  }
  
  private async syncToSQLite(): Promise<void> {
    console.log('[Desktop Mode] Syncing in-memory data to SQLite...');
    try {
      // Only valid columns per table — prevents "no column named X" errors
      const tableColumns: Record<string, string[]> = {
        patients: ['id', 'registrationNumber', 'firstName', 'lastName', 'fullName', 'dateOfBirth', 'name', 'age', 'gender', 'mobile', 'mobileNumber', 'email', 'address', 'bloodGroup', 'occupation', 'maritalStatus', 'tags', 'feeExempt', 'privacySettings', 'medicalHistory', 'allergies', 'createdBy', 'created_at', 'updated_at'],
        appointments: ['id', 'patient_id', 'appointment_date', 'slot_id', 'status', 'token_number', 'created_at', 'updated_at'],
        billing_queue_items: ['id', 'patient_id', 'visit_id', 'status', 'created_at', 'updated_at'],
        billing_receipts: ['id', 'billing_queue_item_id', 'total_amount', 'discount', 'tax', 'net_amount', 'payment_method', 'created_at'],
        medicine_bills: ['id', 'billing_receipt_id', 'medicine_name', 'quantity', 'unit_price', 'total_price', 'created_at'],
        queue_items: ['id', 'appointment_id', 'patient_id', 'token_number', 'status', 'created_at', 'updated_at'],
        prescriptions: ['id', 'visit_id', 'medicine_name', 'potency', 'quantity', 'dose_form', 'pattern', 'frequency', 'duration', 'created_at', 'updated_at'],
        doctor_visits: ['id', 'patient_id', 'doctor_id', 'chief_complaint', 'diagnosis', 'next_visit_date', 'created_at', 'updated_at'],
        pharmacy_queue_items: ['id', 'visit_id', 'status', 'created_at', 'updated_at'],
        internal_messages: ['id', 'sender_module', 'receiver_module', 'content', 'type', 'audio_url', 'is_read', 'is_deleted', 'created_at'],
        messaging_module_users: ['id', 'module', 'name', 'status', 'last_active'],
      };

      // camelCase localStorage keys → snake_case SQLite columns
      const fieldMapping: Record<string, string> = {
        'createdAt': 'created_at',
        'updatedAt': 'updated_at',
        'patientId': 'patient_id',
        'visitId': 'visit_id',
        'appointmentId': 'appointment_id',
        'doctorId': 'doctor_id',
        'tokenNumber': 'token_number',
        'slotId': 'slot_id',
        'appointmentDate': 'appointment_date',
        'nextVisitDate': 'next_visit_date',
        'chiefComplaint': 'chief_complaint',
        'medicineName': 'medicine_name',
        'doseForm': 'dose_form',
        'unitPrice': 'unit_price',
        'totalPrice': 'total_price',
        'totalAmount': 'total_amount',
        'netAmount': 'net_amount',
        'paymentMethod': 'payment_method',
        'billingQueueItemId': 'billing_queue_item_id',
        'billingReceiptId': 'billing_receipt_id',
        'senderModule': 'sender_module',
        'receiverModule': 'receiver_module',
        'audioUrl': 'audio_url',
        'isRead': 'is_read',
        'isDeleted': 'is_deleted',
        'lastActive': 'last_active',
      };

      const collections = ['patients', 'appointments', 'billingQueue', 'billingReceipts', 'medicineBills', 'queueItems', 'prescriptions', 'visits', 'pharmacyQueue', 'internalMessages', 'messagingModuleUsers'];
      const operations: { sql: string; params: any[] }[] = [];

      for (const collection of collections) {
        const data = this.store.get(collection) as any[];
        if (!data || data.length === 0) continue;

        const tableName = this.collectionToTable(collection);
        const allowedCols = tableColumns[tableName];
        if (!allowedCols) continue;

        for (const item of data) {
          const mappedItem: Record<string, any> = {};

          Object.keys(item).forEach(col => {
            const value = item[col];
            if (value === undefined || value === null) return;
            const dbCol = fieldMapping[col] || col;
            // Only include columns that exist in this table
            if (!allowedCols.includes(dbCol)) return;
            if (value instanceof Date) {
              mappedItem[dbCol] = value.toISOString();
            } else if (typeof value === 'object') {
              mappedItem[dbCol] = JSON.stringify(value);
            } else {
              mappedItem[dbCol] = value;
            }
          });

          const columns = Object.keys(mappedItem);
          if (columns.length === 0) continue;

          // Skip rows missing required NOT NULL columns
          const requiredCols: Record<string, string[]> = {
            doctor_visits: ['id', 'patient_id', 'doctor_id'],
            appointments: ['id', 'patient_id', 'appointment_date'],
            queue_items: ['id', 'patient_id', 'token_number'],
            prescriptions: ['id', 'visit_id', 'medicine_name'],
            billing_queue_items: ['id', 'patient_id', 'visit_id'],
            billing_receipts: ['id', 'billing_queue_item_id'],
            medicine_bills: ['id', 'billing_receipt_id', 'medicine_name'],
            pharmacy_queue_items: ['id', 'visit_id'],
          };
          const required = requiredCols[tableName] || ['id'];
          const missingRequired = required.filter(col => mappedItem[col] == null || mappedItem[col] === '');
          if (missingRequired.length > 0) continue;

          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map(col => mappedItem[col]);

          operations.push({
            sql: `REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
            params: values
          });
        }
      }

      if (operations.length > 0) {
        // Use ipcRenderer directly for transaction to be more efficient
        const ipcRenderer = (window as any).electronAPI?.ipcRenderer;
        if (ipcRenderer) {
          // Process in chunks of 100 to avoid IPC message size limits
          const CHUNK_SIZE = 100;
          for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            await (window as any).electronAPI.dbTransaction(chunk);
          }
        }
      }

      console.log('[Desktop Mode] Sync to SQLite completed');
    } catch (error) {
      console.error('[Desktop Mode] Failed to sync to SQLite:', error);
    }
  }

  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const data: Record<string, unknown[]> = {};
      this.store.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem('pms_database', JSON.stringify(data));
      localStorage.setItem('pms_schema_version', SCHEMA_VERSION);
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  public reset(): void {
    console.log('Resetting database...');
    this.store.clear();
    this.initializeStores();
    this.saveToStorage();
    console.log('Database reset complete');
  }

  public reloadFromStorage(): void {
    console.log('Reloading database from storage...');
    
    // Always reload from localStorage (source of truth)
    this.store.clear();
    this.loadFromLocalStorage();
    if (!this.isInitialized) {
      this.initializeStores();
      this.isInitialized = true;
    }
    console.log('Database reloaded from localStorage');
  }

  private initializeStores(): void {
    this.store.set('patients', []);
    this.store.set('visits', []);
    this.store.set('investigations', []);
    this.store.set('voiceNotes', []);
    this.store.set('patientTags', []);
    this.store.set('internalMessages', []);
    this.store.set('messagingModuleUsers', []);
    this.store.set('feeExemptions', []);
    this.store.set('prescriptionHistory', []);
    this.store.set('feeHistory', []);
    this.store.set('cases', []);
    this.store.set('symptoms', []);
    this.store.set('diagnoses', []);

    // Operational Domain
    this.store.set('appointments', []);
    this.store.set('queue', []);
    this.store.set('pharmacy', []);
    this.store.set('staffActions', []);
    this.store.set('slots', []);
    this.store.set('queueConfigs', []);
    this.store.set('queueItems', []);

    // Financial Domain
    this.store.set('fees', []);
    this.store.set('receipts', []);
    this.store.set('refunds', []);

    // Knowledge Domain
    this.store.set('materiaMedica', []);
    this.store.set('materiaMedicaBooks', []);
    this.store.set('materiaMedicaBookPages', []);
    this.store.set('materiaMedicaSearchIndex', []);
    this.store.set('materiaMedicaBookmarks', []);
    this.store.set('materiaMedicaReadingHistory', []);
    this.store.set('materiaMedicaAISearchCache', []);
    this.store.set('materiaMedicaBookEmbeddings', []);
    this.store.set('repertory', []);
    this.store.set('doctorNotes', []);

    // Module 2: User Roles & Permissions
    this.store.set('users', []);
    this.store.set('roles', []);
    this.store.set('permissions', []);
    this.store.set('sessions', []);
    this.store.set('activityLogs', []);
    this.store.set('staffMessages', []);
    this.store.set('roleTemplates', []);

    // System
    this.store.set('settings', []);
    this.store.set('auditLog', []);
    
    // Smart Parsing
    this.store.set('smartParsingRules', []);
    this.store.set('smartParsingTemplates', []);
    
    // Doctor Panel
    this.store.set('prescriptions', []);
    this.store.set('combinations', []);
    this.store.set('medicineUsageMemory', []);
    
    // Billing
    this.store.set('billingQueue', []);
    this.store.set('billingReceipts', []);
    this.store.set('medicineBills', []);
    this.store.set('medicineAmountMemory', []);

    // Software Delivery & Licensing
    this.store.set('customers', []);
    this.store.set('purchase_plans', []);
    this.store.set('licenses', []);
    this.store.set('license_usage', []);
    this.store.set('license_audit_log', []);
    this.store.set('active_computer_sessions', []);
    this.store.set('feeTypes', []);
    
    // Machine Binding & Reuse Detection
    this.store.set('licenseReuseAttempts', []);
    this.store.set('adminNotifications', []);
    
    // Seed default smart parsing rules
    this.seedDefaultSmartParsingRules();
  }
  
  private seedDefaultSmartParsingRules(): void {
    const defaultRules = [
      // Quantity rules
      { id: 'rule-qty-1', name: 'Drachm', type: 'quantity', pattern: '\\b(\\d+)\\s*dr\\b', replacement: '$1 dr', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-qty-2', name: 'Ounce', type: 'quantity', pattern: '\\b(\\d+)\\s*oz\\b', replacement: '$1 oz', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-qty-3', name: 'Milliliter', type: 'quantity', pattern: '\\b(\\d+)\\s*ml\\b', replacement: '$1 ml', isRegex: true, priority: 10, isActive: true },
      
      // Dose Form rules
      { id: 'rule-form-1', name: 'Pills', type: 'doseForm', pattern: '\\b(pills?)\\b', replacement: 'pills', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-form-2', name: 'Tablet', type: 'doseForm', pattern: '\\b(tablets?|tabs?)\\b', replacement: 'tablets', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-form-3', name: 'Liquid', type: 'doseForm', pattern: '\\b(liq|liquid|solution)\\b', replacement: 'liquid', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-form-4', name: 'Drops', type: 'doseForm', pattern: '\\b(drops?)\\b', replacement: 'drops', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-form-5', name: 'Powder', type: 'doseForm', pattern: '\\b(powders?)\\b', replacement: 'powder', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-form-6', name: 'Ointment', type: 'doseForm', pattern: '\\b(ointment|cream|balm)\\b', replacement: 'ointment', isRegex: true, priority: 10, isActive: true },
      
      // Dose Pattern rules
      { id: 'rule-pattern-1', name: 'OD', type: 'dosePattern', pattern: 'OD', replacement: '1-0-0', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-2', name: 'BD', type: 'dosePattern', pattern: 'BD', replacement: '1-1-0', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-3', name: 'TDS', type: 'dosePattern', pattern: 'TDS', replacement: '1-1-1', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-4', name: 'QID', type: 'dosePattern', pattern: 'QID', replacement: '1-1-1-1', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-5', name: 'SOS', type: 'dosePattern', pattern: 'SOS', replacement: 'SOS', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-6', name: 'HS', type: 'dosePattern', pattern: 'HS', replacement: '0-0-1', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-7', name: 'TID', type: 'dosePattern', pattern: 'TID', replacement: '1-1-1', isRegex: false, priority: 10, isActive: true },
      { id: 'rule-pattern-8', name: '3 times', type: 'dosePattern', pattern: '3 times', replacement: '1-1-1', isRegex: false, priority: 5, isActive: true },
      { id: 'rule-pattern-9', name: '2 times', type: 'dosePattern', pattern: '2 times', replacement: '1-1-0', isRegex: false, priority: 5, isActive: true },
      
      // Duration rules
      { id: 'rule-dur-1', name: 'Days', type: 'duration', pattern: '(\\d+)\\s*days?', replacement: '$1 days', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-dur-2', name: 'Weeks', type: 'duration', pattern: '(\\d+)\\s*weeks?', replacement: '$1 weeks', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-dur-3', name: 'Months', type: 'duration', pattern: '(\\d+)\\s*months?', replacement: '$1 months', isRegex: true, priority: 10, isActive: true },
      { id: 'rule-dur-4', name: 'For X days', type: 'duration', pattern: 'for\\s*(\\d+)\\s*days?', replacement: '$1 days', isRegex: true, priority: 15, isActive: true },
    ];
    
    this.store.set('smartParsingRules', defaultRules);
    
    // Seed default combination medicines
    this.seedDefaultCombinations();
  }
  
  private seedDefaultCombinations(): void {
    const defaultCombinations = [
      { id: 'combo-1', name: 'Bioplasgen No. 1', content: 'Calcarea fluorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum phosphoricum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-2', name: 'Bioplasgen No. 2', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-3', name: 'Bioplasgen No. 3', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-4', name: 'Bioplasgen No. 4', content: 'Calcarea fluorica 3x, Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-5', name: 'Bioplasgen No. 5', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-6', name: 'Bioplasgen No. 6', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x', showComposition: true },
      { id: 'combo-7', name: 'Bioplasgen No. 7', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-8', name: 'Bioplasgen No. 8', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-9', name: 'Bioplasgen No. 9', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-10', name: 'Bioplasgen No. 10', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-11', name: 'Bioplasgen No. 11', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-12', name: 'Bioplasgen No. 12', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
      { id: 'combo-13', name: 'Five Phos', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum phosphoricum 3x', showComposition: true },
      { id: 'combo-14', name: 'Five Phos with Ferrum', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum phosphoricum 3x, Ferrum metallicum 3x', showComposition: true },
      { id: 'combo-15', name: 'BC-1', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-16', name: 'BC-2', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x', showComposition: true },
      { id: 'combo-17', name: 'BC-3', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-18', name: 'BC-4', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x', showComposition: true },
      { id: 'combo-19', name: 'BC-5', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x', showComposition: true },
      { id: 'combo-20', name: 'BC-6', content: 'Calcarea phosphorica 3x, Ferrum phosphoricum 3x, Kali muriaticum 3x, Kali phosphoricum 3x, Magnesia phosphorica 3x, Natrum muriaticum 3x, Natrum sulphuricum 3x, Silicea 3x', showComposition: true },
    ];
    
    this.store.set('combinations', defaultCombinations);
  }

  // Generic CRUD operations
  public getAll<T>(collection: string): T[] {
    const items = (this.store.get(collection) as T[]) || [];
    // Deduplicate by ID to prevent duplicate key errors in React
    const seenIds = new Set<string>();
    const deduplicated: T[] = [];
    
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        const itemId = (item as Record<string, unknown>).id as string;
        if (itemId && !seenIds.has(itemId)) {
          seenIds.add(itemId);
          deduplicated.push(item);
        } else if (!itemId) {
          deduplicated.push(item);
        }
      } else {
        deduplicated.push(item);
      }
    }
    
    return deduplicated;
  }

  public getById<T>(collection: string, id: string): T | undefined {
    const items = this.getAll<T>(collection);
    return items.find((item: unknown) => {
      if (item && typeof item === 'object' && 'id' in item) {
        return (item as { id: string }).id === id;
      }
      return false;
    });
  }

  public create<T extends Record<string, unknown>>(collection: string, item: T): T & { id: string; createdAt: Date; updatedAt: Date } {
    const items = this.getAll<T>(collection);
    // Preserve existing ID if present, otherwise generate new one
    const existingId = item.id;
    const newItem = {
      ...item,
      id: existingId || this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as T & { id: string; createdAt: Date; updatedAt: Date };
    items.push(newItem);
    this.store.set(collection, items);
    this.saveToStorage();
    return newItem;
  }

  public update<T extends { id: string }>(collection: string, id: string, updates: Record<string, unknown>): T | undefined {
    const items = this.getAll<T>(collection);
    const index = items.findIndex((item: unknown) => {
      if (item && typeof item === 'object' && 'id' in item) {
        return (item as { id: string }).id === id;
      }
      return false;
    });

    if (index !== -1) {
      const existing = items[index];
      const updated = {
        ...existing,
        ...updates,
        id: existing.id,
        updatedAt: new Date(),
      } as T;
      items[index] = updated;
      this.store.set(collection, items);
      this.saveToStorage();
      return updated;
    }
    return undefined;
  }

  public delete(collection: string, id: string): boolean {
    const items = this.getAll(collection);
    const index = items.findIndex((item: unknown) => {
      if (item && typeof item === 'object' && 'id' in item) {
        return (item as { id: string }).id === id;
      }
      return false;
    });

    if (index !== -1) {
      items.splice(index, 1);
      this.store.set(collection, items);
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public search<T>(collection: string, query: string, fields: string[]): T[] {
    const items = this.getAll<T>(collection);
    const lowerQuery = query.toLowerCase();
    const seenIds = new Set<string>();
    const results: T[] = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;

      const hasMatch = fields.some((field) => {
        const value = (item as Record<string, unknown>)[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(lowerQuery);
        }
        return false;
      });

      if (hasMatch) {
        // Deduplicate by ID at the database level
        const itemId = (item as Record<string, unknown>).id as string;
        if (itemId && !seenIds.has(itemId)) {
          seenIds.add(itemId);
          results.push(item);
        } else if (!itemId) {
          // If no ID, include it anyway
          results.push(item);
        }
      }
    }

    return results;
  }

  public count(collection: string): number {
    return this.getAll(collection).length;
  }

  // Module 3: Registration Number Generation
  // Formula: nextRegNumber = max(settings.startingNumber, highest existing number + 1)
  public getRegNumberSettings(): RegNumberSettings {
    // Get settings from localStorage via settingsDb
    let settings = {
      prefix: '',
      startingNumber: 1001,
      padding: 4,
      separator: '-',
    };
    
    // Try to load settings from database if available
    if (typeof window !== 'undefined') {
      try {
        const savedData = localStorage.getItem('pms_database');
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const settingsData = parsed['settings'];
          if (settingsData && Array.isArray(settingsData)) {
            const regSettings = settingsData.find((s: { id: string }) => s.id === 'registration');
            if (regSettings) {
              settings = {
                prefix: regSettings.prefix !== undefined ? regSettings.prefix : '',
                startingNumber: regSettings.startingNumber || 1001,
                padding: regSettings.padding || 4,
                separator: regSettings.separator || '-',
              };
            }
          }
        }
      } catch (e) {
        // Use default settings
      }
    }
    
    return settings;
  }

  private extractRegNumberParts(regNumber: string): { prefix: string; number: number } | null {
    // Try to extract the numeric part from a registration number
    // Examples: "DK-1001" -> { prefix: "DK-", number: 1001 }
    // Examples: "1928" -> { prefix: "", number: 1928 }
    const match = regNumber.match(/^(.*?)(\d+)$/);
    if (match) {
      return {
        prefix: match[1],
        number: parseInt(match[2], 10),
      };
    }
    return null;
  }

  public generateRegNumber(): string {
    const settings = this.getRegNumberSettings();
    
    // Get all existing patients and find the highest registration number
    const patients = this.getAll('patients');
    let highestNumber = 0;
    
    patients.forEach((patient: unknown) => {
      const p = patient as { registrationNumber: string };
      const parts = this.extractRegNumberParts(p.registrationNumber);
      if (parts && parts.number > highestNumber) {
        highestNumber = parts.number;
      }
    });
    
    // Calculate next number: max of startingNumber and highest existing + 1
    const nextNumber = Math.max(settings.startingNumber, highestNumber + 1);
    const paddedNumber = nextNumber.toString().padStart(settings.padding, '0');
    return `${settings.prefix}${paddedNumber}`;
  }

  // Module 3: Duplicate Detection
  public findDuplicates(collection: string, query: string, mobile?: string): string[] {
    const items = this.getAll(collection);
    const duplicates: string[] = [];
    const lowerQuery = query.toLowerCase();

    items.forEach((item: unknown) => {
      if (typeof item !== 'object' || item === null) return;
      const p = item as Record<string, unknown>;
      
      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
      const firstName = (p.firstName as string)?.toLowerCase() || '';
      const lastName = (p.lastName as string)?.toLowerCase() || '';
      
      const nameMatch = fullName.includes(lowerQuery) || 
                        firstName.includes(lowerQuery) || 
                        lastName.includes(lowerQuery);
      
      const mobileMatch = mobile ? p.mobileNumber === mobile : false;
      
      if (nameMatch || mobileMatch) {
        duplicates.push(p.id as string);
      }
    });

    return duplicates;
  }

  /**
   * Get Machine ID for license binding
   * In Electron: Uses IPC to call main process (has full Node.js access)
   * In Web: Uses server-side generation
   */
  async getMachineId(): Promise<string> {
    try {
      // Try IPC first (Electron mode)
      if (typeof window !== 'undefined' && isElectron()) {
        console.log('[DB] Getting machine ID via IPC');
        try {
          const machineId = await (window as any).electronAPI.getMachineId();
          console.log('[DB] Machine ID from IPC:', machineId);
          return machineId as string;
        } catch (ipcError) {
          console.error('[DB] IPC error:', ipcError);
          // Fall through to API call
        }
      }

      // Web mode or IPC failed - use API
      console.log('[DB] Getting machine ID via API');
      const response = await fetch('/api/license/machine-id');
      const data = await response.json();
      if (data.machineId) {
        console.log('[DB] Machine ID from API:', data.machineId);
        return data.machineId;
      }
      throw new Error('No machine ID in response');
    } catch (error) {
      console.error('[DB] Error getting machine ID:', error);
      throw error;
    }
  }

  /**
   * Get list of activated machines for a license
   * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
   */
  getActivatedMachines(licenseId: string): string[] {
    const license = this.getById<any>('licenses', licenseId);
    if (!license) return [];
    
    try {
      // Parse JSON array of machine IDs
      if (typeof license.activatedMachines === 'string') {
        return JSON.parse(license.activatedMachines);
      }
      if (Array.isArray(license.activatedMachines)) {
        return license.activatedMachines;
      }
      return [];
    } catch (error) {
      console.error('[DB] Error parsing activated machines:', error);
      return [];
    }
  }

  /**
   * Add a machine to the activated machines list
   * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
   */
  addActivatedMachine(licenseId: string, machineId: string): boolean {
    try {
      const license = this.getById<any>('licenses', licenseId);
      if (!license) {
        console.error('[DB] License not found:', licenseId);
        return false;
      }

      const activatedMachines = this.getActivatedMachines(licenseId);
      
      // Check if machine already activated
      if (activatedMachines.includes(machineId)) {
        console.log('[DB] Machine already activated:', machineId);
        return true;
      }

      // Add machine to list
      activatedMachines.push(machineId);
      
      // Update license
      this.update('licenses', licenseId, {
        activatedMachines: JSON.stringify(activatedMachines),
        machineCount: activatedMachines.length,
        updatedAt: new Date(),
      });

      console.log('[DB] Machine added to license:', machineId);
      return true;
    } catch (error) {
      console.error('[DB] Error adding activated machine:', error);
      return false;
    }
  }

  /**
   * Remove a machine from the activated machines list
   * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
   */
  removeActivatedMachine(licenseId: string, machineId: string): boolean {
    try {
      const license = this.getById<any>('licenses', licenseId);
      if (!license) {
        console.error('[DB] License not found:', licenseId);
        return false;
      }

      const activatedMachines = this.getActivatedMachines(licenseId);
      const index = activatedMachines.indexOf(machineId);
      
      if (index === -1) {
        console.log('[DB] Machine not found in activated list:', machineId);
        return false;
      }

      // Remove machine from list
      activatedMachines.splice(index, 1);
      
      // Update license
      this.update('licenses', licenseId, {
        activatedMachines: JSON.stringify(activatedMachines),
        machineCount: activatedMachines.length,
        updatedAt: new Date(),
      });

      console.log('[DB] Machine removed from license:', machineId);
      return true;
    } catch (error) {
      console.error('[DB] Error removing activated machine:', error);
      return false;
    }
  }

  /**
   * Check if a machine can activate a license
   * Enforces single-PC vs multi-PC limits
   * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
   */
  canActivateLicense(licenseId: string, machineId: string): { allowed: boolean; reason?: string } {
    try {
      const license = this.getById<any>('licenses', licenseId);
      if (!license) {
        return { allowed: false, reason: 'License not found' };
      }

      const activatedMachines = this.getActivatedMachines(licenseId);
      const maxMachines = license.maxMachines || 1;
      const licenseType = license.licenseType || 'single-pc';

      // Check if machine already activated
      if (activatedMachines.includes(machineId)) {
        return { allowed: true, reason: 'Machine already activated' };
      }

      // Single-PC: Only 1 machine allowed
      if (licenseType === 'single-pc' && activatedMachines.length > 0) {
        return {
          allowed: false,
          reason: `License already activated on another machine. Single-PC licenses work on only one machine.`,
        };
      }

      // Multi-PC: Check machine limit
      if (licenseType === 'multi-pc' && activatedMachines.length >= maxMachines) {
        return {
          allowed: false,
          reason: `License limit reached (${maxMachines} machines). Contact admin for upgrade.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[DB] Error checking license activation:', error);
      return { allowed: false, reason: 'Error checking license' };
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const db = LocalDatabase.getInstance();

// Seed initial data for testing (Module 3)
export function seedInitialData(): void {
  // Seed default patient tags
  const defaultTags = [
    { id: 'tag-diabetic', name: 'Diabetic', color: '#ef4444', description: 'Diabetic patient', isSystem: true },
    { id: 'tag-hypertensive', name: 'Hypertensive', color: '#f97316', description: 'Hypertensive patient', isSystem: true },
    { id: 'tag-chronic', name: 'Chronic', color: '#eab308', description: 'Chronic case', isSystem: true },
    { id: 'tag-vip', name: 'VIP', color: '#8b5cf6', description: 'VIP patient', isSystem: true },
    { id: 'tag-exempt', name: 'Fee Exempt', color: '#10b981', description: 'Exempt from fees', isSystem: true },
    { id: 'tag-difficult', name: 'Difficult', color: '#ec4899', description: 'Difficult patient', isSystem: true },
  ];
  defaultTags.forEach((tag) => {
    db.create('patientTags', tag);
  });

  // Seed sample patients
  const patients = [
    {
      registrationNumber: db.generateRegNumber(),
      firstName: 'John',
      lastName: 'Smith',
      fullName: 'John Smith',
      dateOfBirth: '1985-03-15',
      age: 39,
      gender: 'male' as const,
      mobileNumber: '+91-9876543210',
      email: 'john.smith@email.com',
      address: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
      bloodGroup: 'O+' as const,
      occupation: 'Engineer',
      maritalStatus: 'married' as const,
      tags: ['tag-diabetic'],
      feeExempt: false,
      privacySettings: {
        hideMentalSymptoms: false,
        hideDiagnosis: false,
        hidePrognosis: false,
        hideFees: false,
        hideCaseNotes: false,
      },
      medicalHistory: ['Hypertension', 'Type 2 Diabetes'],
      allergies: ['Penicillin'],
      createdBy: 'system',
    },
    {
      registrationNumber: db.generateRegNumber(),
      firstName: 'Sarah',
      lastName: 'Johnson',
      fullName: 'Sarah Johnson',
      dateOfBirth: '1990-07-22',
      age: 34,
      gender: 'female' as const,
      mobileNumber: '+91-9876543211',
      email: 'sarah.j@email.com',
      address: {
        street: '456 Oak Avenue',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        country: 'India',
      },
      bloodGroup: 'A+' as const,
      occupation: 'Teacher',
      maritalStatus: 'single' as const,
      tags: [],
      feeExempt: false,
      privacySettings: {
        hideMentalSymptoms: false,
        hideDiagnosis: false,
        hidePrognosis: false,
        hideFees: false,
        hideCaseNotes: false,
      },
      medicalHistory: [],
      allergies: [],
      createdBy: 'system',
    },
    {
      registrationNumber: db.generateRegNumber(),
      firstName: 'Rajesh',
      lastName: 'Kumar',
      fullName: 'Rajesh Kumar',
      dateOfBirth: '1975-05-10',
      age: 49,
      gender: 'male' as const,
      mobileNumber: '+91-9876543212',
      email: 'rajesh.k@email.com',
      address: {
        street: '789 Park Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        country: 'India',
      },
      bloodGroup: 'B+' as const,
      occupation: 'Business',
      maritalStatus: 'married' as const,
      tags: ['tag-chronic', 'tag-vip'],
      feeExempt: true,
      feeExemptionReason: 'Long-term patient, special consideration',
      privacySettings: {
        hideMentalSymptoms: false,
        hideDiagnosis: false,
        hidePrognosis: false,
        hideFees: false,
        hideCaseNotes: false,
      },
      medicalHistory: ['Arthritis', 'Chronic Back Pain'],
      allergies: ['Sulpha'],
      createdBy: 'system',
    },
  ];

  patients.forEach((patient) => {
    db.create('patients', patient);
  });

  // Seed sample visits
  const patientsList = db.getAll('patients');
  if (patientsList.length > 0) {
    const patient1 = patientsList[0] as { id: string; registrationNumber: string };
    db.create('visits', {
      patientId: patient1.id,
      registrationNumber: patient1.registrationNumber,
      visitNumber: 1,
      visitDate: new Date('2024-01-15'),
      visitTime: '10:30',
      doctorId: 'user-doctor',
      doctorName: 'Dr. Homeopathic',
      mode: 'in-person' as const,
      status: 'completed' as const,
      chiefComplaint: 'Joint pain and stiffness',
      diagnosis: 'Arthritic condition',
      isSelfRepeat: false,
      createdBy: 'system',
    });
    
    db.create('visits', {
      patientId: patient1.id,
      registrationNumber: patient1.registrationNumber,
      visitNumber: 2,
      visitDate: new Date('2024-02-01'),
      visitTime: '11:00',
      doctorId: 'user-doctor',
      doctorName: 'Dr. Homeopathic',
      mode: 'video' as const,
      status: 'completed' as const,
      chiefComplaint: 'Follow-up for joint pain',
      diagnosis: 'Improving',
      isSelfRepeat: false,
      createdBy: 'system',
    });
  }

  // Seed fee history
  if (patientsList.length > 0) {
    const patient1 = patientsList[0] as { id: string };
    db.create('feeHistory', {
      patientId: patient1.id,
      visitId: 'visit-1',
      receiptId: 'rcpt-001',
      feeType: 'first-visit' as const,
      amount: 500,
      paymentMethod: 'cash' as const,
      paymentStatus: 'paid' as const,
      paidDate: new Date('2024-01-15'),
    });
    
    db.create('feeHistory', {
      patientId: patient1.id,
      visitId: 'visit-2',
      receiptId: 'rcpt-002',
      feeType: 'follow-up' as const,
      amount: 300,
      paymentMethod: 'upi' as const,
      paymentStatus: 'paid' as const,
      paidDate: new Date('2024-02-01'),
      daysSinceLastFee: 17,
    });
  }

  // Seed sample materia medica
  const materiaMedica = [
    {
      name: 'Arnica Montana',
      scientificName: 'Arnica montana',
      family: 'Asteraceae',
      description: 'First remedy for trauma, bruises, and muscular soreness.',
      symptoms: ['Soreness', 'Bruising', 'Trauma', 'Muscle pain', 'Overexertion'],
      modalities: {
        worse: ['Touch', 'Movement', 'Heat'],
        better: ['Rest', 'Lying down'],
      },
      relationships: ['Rhus toxicodendron', 'Bryonia'],
      source: 'Classical Materia Medica',
    },
    {
      name: 'Nux Vomica',
      scientificName: 'Strychnos nux-vomica',
      family: 'Loganiaceae',
      description: 'Remedy for impatient, irritable, and chilly patients.',
      symptoms: ['Irritability', 'Digestive disturbances', 'Headache', 'Sensitivity to noise', 'Overeating'],
      modalities: {
        worse: ['Noise', 'Odors', 'Touch', 'Morning'],
        better: ['Evening', 'Rest', 'Warm applications'],
      },
      relationships: ['Ignatia', 'Lycopodium'],
      source: 'Classical Materia Medica',
    },
  ];

  materiaMedica.forEach((mm) => {
    db.create('materiaMedica', mm);
  });

  // Seed fee structure
  const fees = [
    { name: 'New Patient Consultation', type: 'consultation' as const, amount: 500 },
    { name: 'Follow-up Consultation', type: 'consultation' as const, amount: 300 },
    { name: 'Medicine - Arnica 30', type: 'medicine' as const, amount: 50 },
    { name: 'Medicine - Nux Vomica 30', type: 'medicine' as const, amount: 50 },
  ];

  fees.forEach((fee) => {
    db.create('fees', fee);
  });

  // Seed default slots (Module 4) - only if no slots exist
  const existingSlots = db.getAll('slots');
  if (existingSlots.length === 0) {
    const defaultSlots = [
      {
        name: 'Morning',
        startTime: '11:00',
        endTime: '13:30',
        duration: 10,
        maxTokens: 15,
        tokenReset: true,
        isActive: true,
        displayOrder: 0,
      },
      {
        name: 'Evening',
        startTime: '18:00',
        endTime: '20:30',
        duration: 10,
        maxTokens: 15,
        tokenReset: true,
        isActive: true,
        displayOrder: 1,
      },
    ];

    defaultSlots.forEach((slot) => {
      db.create('slots', slot);
    });
  }
}

import { getDBSync } from '@/lib/db-sync';

// ============================================
// Module 3: Patient Database Operations
// ============================================

export const patientDb = {
  getAll: () => db.getAll('patients'),
  getById: (id: string) => db.getById('patients', id),
  getByMobile: (mobile: string) => {
    const patients = db.getAll('patients');
    return patients.filter((p: unknown) => {
      const patient = p as { mobileNumber: string };
      return patient.mobileNumber === mobile;
    });
  },
  getByRegNumber: (regNumber: string) => {
    const patients = db.getAll('patients');
    return patients.find((p: unknown) => {
      const patient = p as { registrationNumber: string };
      return patient.registrationNumber === regNumber;
    });
  },
  generateRegNumber: () => db.generateRegNumber(),
  create: (patient: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    // Use existing registration number if provided, otherwise generate new one
    const regNumber = patient.registrationNumber || db.generateRegNumber();
    const newPatient = db.create('patients', { ...patient, registrationNumber: regNumber });
    
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'patients', newPatient);
    }
    
    return newPatient;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('patients', id, updates);
    
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'patients', { id, ...updates });
    }
    
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('patients', id);
    
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'patients', { id });
    }
    
    return success;
  },
  search: (query: string) => {
    const lowerQuery = query.toLowerCase();
    const patients = db.getAll('patients');
    return patients.filter((p: unknown) => {
      const patient = p as {
        registrationNumber: string;
        firstName: string;
        lastName: string;
        fullName: string;
        mobileNumber: string;
      };
      return (
        patient.registrationNumber.toLowerCase().includes(lowerQuery) ||
        patient.fullName.toLowerCase().includes(lowerQuery) ||
        patient.firstName.toLowerCase().includes(lowerQuery) ||
        patient.lastName.toLowerCase().includes(lowerQuery) ||
        patient.mobileNumber.includes(query)
      );
    });
  },
  findDuplicates: (name: string, mobile?: string) => db.findDuplicates('patients', name, mobile),
  deleteByRegNumber: (regNumber: string) => {
    const patients = db.getAll('patients');
    const patient = patients.find((p: unknown) => {
      const pt = p as { registrationNumber: string };
      return pt.registrationNumber === regNumber;
    });
    if (patient) {
      db.delete('patients', (patient as { id: string }).id);
      return true;
    }
    return false;
  },
  deleteAll: () => {
    const patients = db.getAll('patients');
    patients.forEach((p: unknown) => {
      const patient = p as { id: string };
      db.delete('patients', patient.id);
    });
  },
};

// Visit operations
export const visitDb = {
  getAll: () => db.getAll('visits'),
  getById: (id: string) => db.getById('visits', id),
  getByPatient: (patientId: string) => {
    const visits = db.getAll('visits');
    return visits.filter((v: unknown) => {
      const visit = v as { patientId: string };
      return visit.patientId === patientId;
    }).sort((a, b) => {
      const visitA = a as { visitDate: Date };
      const visitB = b as { visitDate: Date };
      return new Date(visitB.visitDate).getTime() - new Date(visitA.visitDate).getTime();
    });
  },
  create: (visit: Parameters<typeof db.create>[1]) => db.create('visits', visit),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('visits', id, updates),
  delete: (id: string) => db.delete('visits', id),
};

// Investigation operations
export const investigationDb = {
  getAll: () => db.getAll('investigations'),
  getById: (id: string) => db.getById('investigations', id),
  getByPatient: (patientId: string) => {
    const investigations = db.getAll('investigations');
    return investigations.filter((i: unknown) => {
      const inv = i as { patientId: string };
      return inv.patientId === patientId;
    });
  },
  create: (inv: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('investigations', inv);
    if (!fromSync) getDBSync()?.queueOperation('create', 'investigations', result);
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('investigations', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'investigations', { id });
    return success;
  },
};

// Voice Note operations
export const voiceNoteDb = {
  getAll: () => db.getAll('voiceNotes'),
  getById: (id: string) => db.getById('voiceNotes', id),
  getByPatient: (patientId: string) => {
    const notes = db.getAll('voiceNotes');
    return notes.filter((n: unknown) => {
      const note = n as { patientId: string };
      return note.patientId === patientId;
    });
  },
  create: (note: Parameters<typeof db.create>[1]) => db.create('voiceNotes', note),
  delete: (id: string) => db.delete('voiceNotes', id),
};

// Patient Tag operations
export const patientTagDb = {
  getAll: () => db.getAll('patientTags'),
  getById: (id: string) => db.getById('patientTags', id),
  create: (tag: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('patientTags', tag);
    if (!fromSync) getDBSync()?.queueOperation('create', 'patientTags', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('patientTags', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'patientTags', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('patientTags', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'patientTags', { id });
    return success;
  },
};

// Fee Exemption operations
export const feeExemptionDb = {
  getAll: () => db.getAll('feeExemptions'),
  getByPatient: (patientId: string) => {
    const exemptions = db.getAll('feeExemptions');
    return exemptions.find((e: unknown) => {
      const exemption = e as { patientId: string; isActive: boolean };
      return exemption.patientId === patientId && exemption.isActive;
    });
  },
  create: (exemption: Parameters<typeof db.create>[1]) => db.create('feeExemptions', exemption),
  deactivate: (id: string) => db.update('feeExemptions', id, { isActive: false }),
};

// Fee History operations
export const feeHistoryDb = {
  getAll: () => db.getAll('feeHistory'),
  getByPatient: (patientId: string) => {
    const history = db.getAll('feeHistory');
    return history.filter((h: unknown) => {
      const entry = h as { patientId: string };
      return entry.patientId === patientId;
    }).sort((a, b) => {
      const entryA = a as { paidDate: Date };
      const entryB = b as { paidDate: Date };
      return new Date(entryB.paidDate).getTime() - new Date(entryA.paidDate).getTime();
    });
  },
  getLastByPatient: (patientId: string) => {
    const history = db.getAll('feeHistory');
    const patientHistory = history.filter((h: unknown) => {
      const entry = h as { patientId: string; amount: number };
      return entry.patientId === patientId && entry.amount > 0;
    }) as Array<{ paidDate: Date; amount: number }>;
    
    if (patientHistory.length === 0) return null;
    
    return patientHistory.sort((a, b) => 
      new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime()
    )[0];
  },
  create: (entry: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('feeHistory', entry);
    if (!fromSync) getDBSync()?.queueOperation('create', 'fee-history', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('feeHistory', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'fee-history', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('feeHistory', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'fee-history', { id });
    return success;
  },
};

// Prescription History operations
export const prescriptionHistoryDb = {
  getAll: () => db.getAll('prescriptionHistory'),
  getByPatient: (patientId: string) => {
    const history = db.getAll('prescriptionHistory');
    return history.filter((h: unknown) => {
      const entry = h as { patientId: string };
      return entry.patientId === patientId;
    });
  },
  create: (entry: Parameters<typeof db.create>[1]) => db.create('prescriptionHistory', entry),
};

export const materiaMedicaDb = {
  getAll: () => db.getAll('materiaMedica'),
  getById: (id: string) => db.getById('materiaMedica', id),
  create: (item: Parameters<typeof db.create>[1]) => db.create('materiaMedica', item),
  update: (id: string, updates: Record<string, unknown>) => db.update('materiaMedica', id, updates),
  delete: (id: string) => db.delete('materiaMedica', id),
};

// ============================================
// Materia Medica Library Operations
// ============================================

export const materiaMedicaBookDb = {
  getAll: () => db.getAll('materiaMedicaBooks'),
  getById: (id: string) => db.getById('materiaMedicaBooks', id),
  getByCategory: (category: string) => {
    const books = db.getAll('materiaMedicaBooks');
    return books.filter((book: any) => book.category === category);
  },
  search: (query: string) => {
    return db.search('materiaMedicaBooks', query, ['title', 'author', 'publisher']);
  },
  create: (book: Parameters<typeof db.create>[1]) => db.create('materiaMedicaBooks', book),
  update: (id: string, updates: Record<string, unknown>) => db.update('materiaMedicaBooks', id, updates),
  delete: (id: string) => db.delete('materiaMedicaBooks', id),
  updateAccessTime: (id: string) => {
    const book: any = db.getById('materiaMedicaBooks', id);
    if (book) {
      return db.update('materiaMedicaBooks', id, {
        lastAccessedAt: new Date(),
        accessCount: (book.accessCount || 0) + 1
      });
    }
    return undefined;
  }
};

export const materiaMedicaBookPageDb = {
  getAll: () => db.getAll('materiaMedicaBookPages'),
  getById: (id: string) => db.getById('materiaMedicaBookPages', id),
  getByBook: (bookId: string) => {
    const pages = db.getAll('materiaMedicaBookPages');
    return pages.filter((page: any) => page.bookId === bookId);
  },
  getByBookAndPage: (bookId: string, pageNumber: number) => {
    const pages = db.getAll('materiaMedicaBookPages');
    return pages.find((page: any) => page.bookId === bookId && page.pageNumber === pageNumber);
  },
  create: (page: Parameters<typeof db.create>[1]) => db.create('materiaMedicaBookPages', page),
  createBatch: (pages: any[]) => {
    return pages.map(page => db.create('materiaMedicaBookPages', page));
  },
  delete: (id: string) => db.delete('materiaMedicaBookPages', id),
  deleteByBook: (bookId: string) => {
    const pages = db.getAll('materiaMedicaBookPages');
    const bookPages = pages.filter((page: any) => page.bookId === bookId);
    bookPages.forEach((page: any) => db.delete('materiaMedicaBookPages', page.id));
    return bookPages.length;
  }
};

export const materiaMedicaSearchIndexDb = {
  getAll: () => db.getAll('materiaMedicaSearchIndex'),
  getById: (id: string) => db.getById('materiaMedicaSearchIndex', id),
  searchWord: (word: string, bookIds?: string[]) => {
    const indices = db.getAll('materiaMedicaSearchIndex');
    const normalizedWord = word.toLowerCase().trim();
    return indices.filter((index: any) => {
      // Support both exact and partial matching
      const indexWord = index.word.toLowerCase();
      const matchesWord = indexWord === normalizedWord || 
                         indexWord.includes(normalizedWord) || 
                         normalizedWord.includes(indexWord);
      const matchesBook = !bookIds || bookIds.includes(index.bookId);
      return matchesWord && matchesBook;
    });
  },
  create: (index: Parameters<typeof db.create>[1]) => db.create('materiaMedicaSearchIndex', index),
  createBatch: (indices: any[]) => {
    return indices.map(index => db.create('materiaMedicaSearchIndex', index));
  },
  delete: (id: string) => db.delete('materiaMedicaSearchIndex', id),
  deleteByBook: (bookId: string) => {
    const indices = db.getAll('materiaMedicaSearchIndex');
    const bookIndices = indices.filter((index: any) => index.bookId === bookId);
    bookIndices.forEach((index: any) => db.delete('materiaMedicaSearchIndex', index.id));
    return bookIndices.length;
  }
};

export const materiaMedicaBookmarkDb = {
  getAll: () => db.getAll('materiaMedicaBookmarks'),
  getById: (id: string) => db.getById('materiaMedicaBookmarks', id),
  getByBook: (bookId: string, userId?: string) => {
    const bookmarks = db.getAll('materiaMedicaBookmarks');
    return bookmarks.filter((bookmark: any) => {
      const matchesBook = bookmark.bookId === bookId;
      const matchesUser = !userId || bookmark.userId === userId;
      return matchesBook && matchesUser;
    });
  },
  getByUser: (userId: string) => {
    const bookmarks = db.getAll('materiaMedicaBookmarks');
    return bookmarks.filter((bookmark: any) => bookmark.userId === userId);
  },
  create: (bookmark: Parameters<typeof db.create>[1]) => db.create('materiaMedicaBookmarks', bookmark),
  update: (id: string, updates: Record<string, unknown>) => db.update('materiaMedicaBookmarks', id, updates),
  delete: (id: string) => db.delete('materiaMedicaBookmarks', id)
};

export const materiaMedicaReadingHistoryDb = {
  getAll: () => db.getAll('materiaMedicaReadingHistory'),
  getById: (id: string) => db.getById('materiaMedicaReadingHistory', id),
  getByBook: (bookId: string, userId: string) => {
    const histories = db.getAll('materiaMedicaReadingHistory');
    return histories.find((history: any) => 
      history.bookId === bookId && history.userId === userId
    );
  },
  getByUser: (userId: string) => {
    const histories = db.getAll('materiaMedicaReadingHistory');
    return histories.filter((history: any) => history.userId === userId);
  },
  create: (history: Parameters<typeof db.create>[1]) => db.create('materiaMedicaReadingHistory', history),
  update: (id: string, updates: Record<string, unknown>) => db.update('materiaMedicaReadingHistory', id, updates),
  updateOrCreate: (bookId: string, userId: string, updates: any) => {
    const existing: any = materiaMedicaReadingHistoryDb.getByBook(bookId, userId);
    if (existing) {
      return db.update('materiaMedicaReadingHistory', existing.id, {
        ...updates,
        sessionCount: (existing.sessionCount || 0) + 1,
        lastReadAt: new Date()
      });
    } else {
      return db.create('materiaMedicaReadingHistory', {
        bookId,
        userId,
        ...updates,
        sessionCount: 1,
        lastReadAt: new Date()
      });
    }
  },
  delete: (id: string) => db.delete('materiaMedicaReadingHistory', id)
};

export const materiaMedicaAISearchCacheDb = {
  getAll: () => db.getAll('materiaMedicaAISearchCache'),
  getById: (id: string) => db.getById('materiaMedicaAISearchCache', id),
  getByQueryHash: (queryHash: string) => {
    const caches = db.getAll('materiaMedicaAISearchCache');
    const cache: any = caches.find((c: any) => c.queryHash === queryHash);
    if (cache && new Date(cache.expiresAt) > new Date()) {
      // Update hit count and last accessed
      db.update('materiaMedicaAISearchCache', cache.id, {
        hitCount: (cache.hitCount || 0) + 1,
        lastAccessedAt: new Date()
      });
      return cache;
    }
    return undefined;
  },
  create: (cache: Parameters<typeof db.create>[1]) => db.create('materiaMedicaAISearchCache', cache),
  delete: (id: string) => db.delete('materiaMedicaAISearchCache', id),
  cleanExpired: () => {
    const caches = db.getAll('materiaMedicaAISearchCache');
    const now = new Date();
    const expired = caches.filter((cache: any) => new Date(cache.expiresAt) <= now);
    expired.forEach((cache: any) => db.delete('materiaMedicaAISearchCache', cache.id));
    return expired.length;
  }
};

export const feesDb = {
  getAll: () => db.getAll('fees'),
  getById: (id: string) => db.getById('fees', id),
  create: (fee: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('fees', fee);
    if (!fromSync) getDBSync()?.queueOperation('create', 'fees', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('fees', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'fees', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('fees', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'fees', { id });
    return success;
  },
};

// ============================================
// Module 2: User Roles & Permissions Database Operations
// ============================================

const defaultPermissions = [
  { id: 'p1', category: 'clinical' as const, name: 'View Case', key: 'view_case', description: 'View patient case details', enabled: true },
  { id: 'p2', category: 'clinical' as const, name: 'Edit Case', key: 'edit_case', description: 'Edit patient case details', enabled: true },
  { id: 'p3', category: 'clinical' as const, name: 'Create Prescription', key: 'create_prescription', description: 'Create new prescription', enabled: true },
  { id: 'p4', category: 'clinical' as const, name: 'Edit Prescription', key: 'edit_prescription', description: 'Edit existing prescription', enabled: true },
  { id: 'p5', category: 'clinical' as const, name: 'Delete Prescription', key: 'delete_prescription', description: 'Delete prescription', enabled: true },
  
  { id: 'p6', category: 'operational' as const, name: 'Book Appointment', key: 'book_appointment', description: 'Book new appointment', enabled: true },
  { id: 'p7', category: 'operational' as const, name: 'Cancel Appointment', key: 'cancel_appointment', description: 'Cancel appointment', enabled: true },
  { id: 'p8', category: 'operational' as const, name: 'Reschedule', key: 'reschedule', description: 'Reschedule appointment', enabled: true },
  { id: 'p9', category: 'operational' as const, name: 'Generate Token', key: 'generate_token', description: 'Generate queue token', enabled: true },
  
  { id: 'p10', category: 'financial' as const, name: 'View Fees', key: 'view_fees', description: 'View fee structure', enabled: true },
  { id: 'p11', category: 'financial' as const, name: 'Edit Fees', key: 'edit_fees', description: 'Edit fee structure', enabled: true },
  { id: 'p12', category: 'financial' as const, name: 'Refund', key: 'refund', description: 'Process refunds', enabled: true },
  { id: 'p13', category: 'financial' as const, name: 'Override Fee Rules', key: 'override_fees', description: 'Override fee rules', enabled: true },
  
  { id: 'p14', category: 'pharmacy' as const, name: 'View Prescriptions', key: 'view_prescriptions', description: 'View prescriptions', enabled: true },
  { id: 'p15', category: 'pharmacy' as const, name: 'Edit Labels', key: 'edit_labels', description: 'Edit prescription labels', enabled: true },
  { id: 'p16', category: 'pharmacy' as const, name: 'Mark Prepared', key: 'mark_prepared', description: 'Mark medicine as prepared', enabled: true },
  { id: 'p17', category: 'pharmacy' as const, name: 'Stop Preparation', key: 'stop_preparation', description: 'Stop medicine preparation', enabled: true },
  
  { id: 'p18', category: 'system' as const, name: 'Settings', key: 'settings', description: 'Access system settings', enabled: true },
  { id: 'p19', category: 'system' as const, name: 'Backup', key: 'backup', description: 'Create backups', enabled: true },
  { id: 'p20', category: 'system' as const, name: 'Restore', key: 'restore', description: 'Restore from backup', enabled: true },
  { id: 'p21', category: 'system' as const, name: 'Licensing', key: 'licensing', description: 'Manage licensing', enabled: true },
];

const defaultRoles = [
  {
    id: 'role-doctor',
    name: 'Doctor',
    description: 'Full control over everything',
    isSystem: true,
    permissions: {
      view_case: true, edit_case: true, create_prescription: true, edit_prescription: true, delete_prescription: true,
      book_appointment: true, cancel_appointment: true, reschedule: true, generate_token: true,
      view_fees: true, edit_fees: true, refund: true, override_fees: true,
      view_prescriptions: true, edit_labels: true, mark_prepared: true, stop_preparation: true,
      settings: true, backup: true, restore: true, licensing: true,
    },
  },
  {
    id: 'role-frontdesk',
    name: 'Frontdesk',
    description: 'Appointments, fees, patient info',
    isSystem: true,
    permissions: {
      view_case: true, edit_case: false, create_prescription: false, edit_prescription: false, delete_prescription: false,
      book_appointment: true, cancel_appointment: true, reschedule: true, generate_token: true,
      view_fees: true, edit_fees: false, refund: false, override_fees: false,
      view_prescriptions: false, edit_labels: false, mark_prepared: false, stop_preparation: false,
      settings: false, backup: false, restore: false, licensing: false,
    },
  },
  {
    id: 'role-pharmacy',
    name: 'Pharmacy',
    description: 'Only prescriptions and labels',
    isSystem: true,
    permissions: {
      view_case: false, edit_case: false, create_prescription: false, edit_prescription: false, delete_prescription: false,
      book_appointment: false, cancel_appointment: false, reschedule: false, generate_token: false,
      view_fees: false, edit_fees: false, refund: false, override_fees: false,
      view_prescriptions: true, edit_labels: true, mark_prepared: true, stop_preparation: true,
      settings: false, backup: false, restore: false, licensing: false,
    },
  },
  {
    id: 'role-assistant',
    name: 'Assistant',
    description: 'Case entry, voice notes, uploads',
    isSystem: true,
    permissions: {
      view_case: true, edit_case: true, create_prescription: false, edit_prescription: false, delete_prescription: false,
      book_appointment: false, cancel_appointment: false, reschedule: false, generate_token: false,
      view_fees: false, edit_fees: false, refund: false, override_fees: false,
      view_prescriptions: false, edit_labels: false, mark_prepared: false, stop_preparation: false,
      settings: false, backup: false, restore: false, licensing: false,
    },
  },
];

const defaultUsers = [
  { id: 'user-doctor', username: 'doctor', identifierType: 'username' as const, identifier: 'doctor', password: 'doctor123', roleId: 'role-doctor', isActive: true, isDoctor: true, name: 'Dr. Homeopathic' },
  { id: 'user-frontdesk', username: 'frontdesk', identifierType: 'username' as const, identifier: 'frontdesk', password: 'front123', roleId: 'role-frontdesk', isActive: true, isDoctor: false, name: 'Front Desk Staff' },
  { id: 'user-pharmacy', username: 'pharmacy', identifierType: 'username' as const, identifier: 'pharmacy', password: 'pharm123', roleId: 'role-pharmacy', isActive: true, isDoctor: false, name: 'Pharmacy Staff' },
  { id: 'user-assistant', username: 'assistant', identifierType: 'username' as const, identifier: 'assistant', password: 'assist123', roleId: 'role-assistant', isActive: true, isDoctor: false, name: 'Clinic Assistant' },
];

export function seedModule2Data(): void {
  // Only seed if not already seeded
  const existingRoles = db.getAll('roles');
  if (existingRoles.length > 0) {
    console.log('Roles already seeded, skipping...');
    return;
  }

  defaultPermissions.forEach((perm) => {
    db.create('permissions', perm);
  });

  defaultRoles.forEach((role) => {
    db.create('roles', role);
  });

  // Seed default users - they are available for login after first successful license activation
  // First login MUST be with license-generated password
  // After that, user can login with hardcoded credentials (doctor/doctor123) or create their own
  defaultUsers.forEach((user) => {
    db.create('users', user);
  });

  const roleTemplates = [
    { name: 'Busy Day Mode', description: 'Maximum efficiency settings', roleIds: ['role-doctor', 'role-frontdesk'] },
    { name: 'Solo Clinic Mode', description: 'Single person operation', roleIds: ['role-doctor'] },
    { name: 'Training Mode', description: 'Assistant has more access', roleIds: ['role-doctor', 'role-assistant'] },
  ];
  roleTemplates.forEach((template) => {
    db.create('roleTemplates', template);
  });
}

export const userDb = {
  getAll: () => {
    const allUsers = db.getAll('users');
    // Deduplicate by ID - keep only the first occurrence
    const seenIds = new Set<string>();
    return allUsers.filter((u: unknown) => {
      const user = u as { id: string };
      if (seenIds.has(user.id)) {
        return false;
      }
      seenIds.add(user.id);
      return true;
    });
  },
  getById: (id: string) => db.getById('users', id),
  getByIdentifier: (identifier: string) => {
    const users = db.getAll('users');
    return users.find((u: unknown) => {
      const user = u as { identifier: string };
      return user.identifier === identifier;
    });
  },
  create: (user: Parameters<typeof db.create>[1]) => db.create('users', user),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('users', id, updates),
  delete: (id: string) => db.delete('users', id),
};

export const roleDb = {
  getAll: () => db.getAll('roles'),
  getById: (id: string) => db.getById('roles', id),
  create: (role: Parameters<typeof db.create>[1]) => db.create('roles', role),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('roles', id, updates),
  delete: (id: string) => db.delete('roles', id),
};

export const permissionDb = {
  getAll: () => db.getAll('permissions'),
  getByCategory: (category: string) => {
    const perms = db.getAll('permissions');
    return perms.filter((p: unknown) => {
      const perm = p as { category: string };
      return perm.category === category;
    });
  },
};

export const activityLogDb = {
  getAll: () => db.getAll('activityLogs'),
  getByUser: (userId: string) => {
    const logs = db.getAll('activityLogs');
    return logs.filter((l: unknown) => {
      const log = l as { userId: string };
      return log.userId === userId;
    });
  },
  getByPatient: (patientId: string) => {
    const logs = db.getAll('activityLogs');
    return logs.filter((l: unknown) => {
      const log = l as { patientId?: string };
      return log.patientId === patientId;
    });
  },
  create: (log: Parameters<typeof db.create>[1]) => db.create('activityLogs', log),
};

export const staffMessageDb = {
  getAll: () => db.getAll('staffMessages'),
  getByUser: (userId: string) => {
    const messages = db.getAll('staffMessages');
    return messages.filter((m: unknown) => {
      const msg = m as { recipientId: string };
      return msg.recipientId === userId;
    });
  },
  getUnread: (userId: string) => {
    const messages = db.getAll('staffMessages');
    return messages.filter((m: unknown) => {
      const msg = m as { recipientId: string; readAt?: Date };
      return msg.recipientId === userId && !msg.readAt;
    });
  },
  create: (message: Parameters<typeof db.create>[1]) => db.create('staffMessages', message),
  markRead: (id: string) => db.update('staffMessages', id, { readAt: new Date() }),
};

export const sessionDb = {
  getAll: () => db.getAll('sessions'),
  getActive: () => {
    const sessions = db.getAll('sessions');
    return sessions.filter((s: unknown) => {
      const session = s as { isActive: boolean };
      return session.isActive;
    });
  },
  create: (session: Parameters<typeof db.create>[1]) => db.create('sessions', session),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('sessions', id, updates),
  deactivate: (id: string) => db.update('sessions', id, { isActive: false }),
};

export const roleTemplateDb = {
  getAll: () => db.getAll('roleTemplates'),
  getById: (id: string) => db.getById('roleTemplates', id),
  create: (template: Parameters<typeof db.create>[1]) => db.create('roleTemplates', template),
  apply: (templateId: string) => {
    const template = db.getById('roleTemplates', templateId);
    return template;
  },
};

// Settings operations
export const settingsDb = {
  getAll: () => db.getAll('settings'),
  getById: (id: string) => db.getById('settings', id),
  create: (setting: Parameters<typeof db.create>[1]) => db.create('settings', setting),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('settings', id, updates),
  upsert: (id: string, data: Parameters<typeof db.create>[1]) => {
    const existing = db.getById('settings', id);
    if (existing) {
      db.update('settings', id, data);
    } else {
      db.create('settings', { ...data, id });
    }
  },
};

// ============================================
// Module 4: Appointment Scheduler Operations (Updated)
// ============================================

export const appointmentDb = {
  getAll: () => db.getAll('appointments'),
  getById: (id: string) => db.getById('appointments', id),
  getByPatient: (patientId: string) => {
    const appointments = db.getAll('appointments');
    return appointments.filter((a: unknown) => {
      const apt = a as { patientId: string };
      return apt.patientId === patientId;
    }).sort((a, b) => {
      const aptA = a as { appointmentDate: Date; appointmentTime: string };
      const aptB = b as { appointmentDate: Date; appointmentTime: string };
      const dateA = new Date(`${aptA.appointmentDate}T${aptA.appointmentTime}`);
      const dateB = new Date(`${aptB.appointmentDate}T${aptB.appointmentTime}`);
      return dateB.getTime() - dateA.getTime();
    });
  },
  getByDate: (date: Date) => {
    const appointments = db.getAll('appointments');
    const targetDate = date.toISOString().split('T')[0];
    return appointments.filter((a: unknown) => {
      const apt = a as { appointmentDate: Date };
      return new Date(apt.appointmentDate).toISOString().split('T')[0] === targetDate;
    }).sort((a, b) => {
      const aptA = a as { appointmentTime: string };
      const aptB = b as { appointmentTime: string };
      return aptA.appointmentTime.localeCompare(aptB.appointmentTime);
    });
  },
  getBySlot: (date: Date, slotId: string) => {
    const appointments = db.getAll('appointments');
    const targetDate = date.toISOString().split('T')[0];
    return appointments.filter((a: unknown) => {
      const apt = a as { appointmentDate: Date; slotId: string };
      return new Date(apt.appointmentDate).toISOString().split('T')[0] === targetDate && apt.slotId === slotId;
    }).sort((a, b) => {
      const aptA = a as { tokenNumber: number };
      const aptB = b as { tokenNumber: number };
      return (aptA.tokenNumber || 0) - (aptB.tokenNumber || 0);
    });
  },
  getUpcoming: () => {
    const appointments = db.getAll('appointments');
    const today = new Date().toISOString().split('T')[0];
    return appointments.filter((a: unknown) => {
      const apt = a as { appointmentDate: Date; appointmentTime: string; status: string };
      const aptDateTime = new Date(`${apt.appointmentDate}T${apt.appointmentTime}`);
      const now = new Date();
      return aptDateTime >= now && ['scheduled', 'confirmed'].includes(apt.status) && new Date(apt.appointmentDate).toISOString().split('T')[0] >= today;
    }).sort((a, b) => {
      const aptA = a as { appointmentDate: Date; appointmentTime: string };
      const aptB = b as { appointmentDate: Date; appointmentTime: string };
      const dateA = new Date(`${aptA.appointmentDate}T${aptA.appointmentTime}`);
      const dateB = new Date(`${aptB.appointmentDate}T${aptB.appointmentTime}`);
      return dateA.getTime() - dateB.getTime();
    });
  },
  create: (appointment: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const newApt = db.create('appointments', appointment);
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'appointments', newApt);
    }
    return newApt;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('appointments', id, updates);
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'appointments', { id, ...updates });
    }
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('appointments', id);
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'appointments', { id });
    }
    return success;
  },
  cancel: (id: string, reason?: string) => appointmentDb.update(id, { 
    status: 'cancelled', 
    cancelledAt: new Date(),
    cancellationReason: reason 
  }),
  checkIn: (id: string) => {
    appointmentDb.update(id, {
      status: 'checked-in',
      checkedInAt: new Date()
    });
    // Also create queue item when checking in
    const appointment = db.getById('appointments', id);
    if (appointment) {
      const apt = appointment as {
        patientId: string;
        patientName: string;
        slotId: string;
        slotName: string;
        tokenNumber: number;
        priority: string;
      };
      // Get or create queue config
      const today = new Date();
      let queueConfig = db.getAll('queueConfigs').find((q: unknown) => {
        const que = q as { date: Date; slotId: string };
        return new Date(que.date).toISOString().split('T')[0] === today.toISOString().split('T')[0] &&
               que.slotId === apt.slotId;
      });
      
      if (!queueConfig) {
        queueConfig = db.create('queueConfigs', {
          date: today,
          slotId: apt.slotId,
          slotName: apt.slotName,
          status: 'open',
          currentToken: 0,
          totalPatients: 0,
          completedPatients: 0,
          skippedPatients: 0,
        });
      }
      
      const qConfig = queueConfig as { id: string };
      
      // Create queue item via queueItemDb so it gets LAN synced
      queueItemDb.create({
        queueConfigId: qConfig.id,
        appointmentId: id,
        patientId: apt.patientId,
        patientName: apt.patientName,
        slotId: apt.slotId,
        slotName: apt.slotName,
        tokenNumber: apt.tokenNumber || 1,
        priority: apt.priority || 'normal',
        status: 'waiting',
        checkInTime: new Date(),
      });
      
      // Update queue config
      const queues = db.getAll('queueConfigs');
      const queueIndex = queues.findIndex((q: unknown) => (q as { id: string }).id === qConfig.id);
      if (queueIndex !== -1) {
        const que = queues[queueIndex] as { totalPatients: number };
        db.update('queueConfigs', qConfig.id, { totalPatients: que.totalPatients + 1 });
      }
    }
  },
  startConsultation: (id: string) => appointmentDb.update(id, { 
    status: 'in-progress',
    consultationStartedAt: new Date() 
  }),
  complete: (id: string) => appointmentDb.update(id, { 
    status: 'completed',
    consultationEndedAt: new Date() 
  }),
  markNoShow: (id: string) => appointmentDb.update(id, { status: 'no-show' }),
  assignToken: (id: string, tokenNumber: number, slotId: string, slotName: string) => appointmentDb.update(id, {
    tokenNumber,
    slotId,
    slotName,
    tokenAssignedAt: new Date()
  }),
};

// ============================================
// Module 4: Slot Operations
// ============================================

export const slotDb = {
  getAll: () => db.getAll('slots'),
  getById: (id: string) => db.getById('slots', id),
  getActive: () => {
    const slots = db.getAll('slots');
    return slots.filter((s: unknown) => {
      const slot = s as { isActive: boolean };
      return slot.isActive;
    }).sort((a, b) => {
      const slotA = a as { displayOrder: number };
      const slotB = b as { displayOrder: number };
      return (slotA.displayOrder || 0) - (slotB.displayOrder || 0);
    });
  },
  create: (slot: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    // Check for duplicate slot name
    const existingSlots = db.getAll('slots');
    const slotData = slot as { name: string };
    const duplicate = existingSlots.find((s: unknown) => {
      const existing = s as { name: string };
      return existing.name.toLowerCase() === slotData.name.toLowerCase();
    });
    if (duplicate) {
      console.warn(`Slot with name "${slotData.name}" already exists`);
      return duplicate;
    }
    const result = db.create('slots', slot);
    if (!fromSync) getDBSync()?.queueOperation('create', 'slots', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('slots', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'slots', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('slots', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'slots', { id });
    return success;
  },
  toggleActive: (id: string) => {
    const slot = db.getById('slots', id);
    if (slot) {
      const s = slot as { isActive: boolean };
      slotDb.update(id, { isActive: !s.isActive });
    }
  },
};

// ============================================
// Module 4: Queue Configuration Operations
// ============================================

export const queueDb = {
  getAll: () => db.getAll('queueConfigs'),
  getById: (id: string) => db.getById('queueConfigs', id),
  getByDateAndSlot: (date: Date, slotId: string) => {
    const queues = db.getAll('queueConfigs');
    const targetDate = date.toISOString().split('T')[0];
    return queues.find((q: unknown) => {
      const queue = q as { date: Date; slotId: string };
      return new Date(queue.date).toISOString().split('T')[0] === targetDate && queue.slotId === slotId;
    });
  },
  getOrCreate: (date: Date, slotId: string, slotName: string) => {
    const existing = queueDb.getByDateAndSlot(date, slotId);
    if (existing) return existing;
    
    // Create new queue config
    const newConfig = db.create('queueConfigs', {
      date,
      slotId,
      slotName,
      status: 'open',
      currentToken: 0,
      totalPatients: 0,
      completedPatients: 0,
      skippedPatients: 0,
      tickerMessage: 'Welcome to our clinic. Please wait for your turn. Thank you for your patience.',
      tickerSpeed: 20,
    });
    getDBSync()?.queueOperation('create', 'queueConfigs', newConfig);
    return newConfig;
  },
  create: (queue: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('queueConfigs', queue);
    if (!fromSync) getDBSync()?.queueOperation('create', 'queueConfigs', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('queueConfigs', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'queueConfigs', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('queueConfigs', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'queueConfigs', { id });
    return success;
  },
  open: (id: string) => queueDb.update(id, { status: 'open', openedAt: new Date() }),
  close: (id: string) => queueDb.update(id, { status: 'closed', closedAt: new Date() }),
  pause: (id: string) => queueDb.update(id, { status: 'paused', pausedAt: new Date() }),
  resume: (id: string) => queueDb.update(id, { status: 'open', resumedAt: new Date() }),
  incrementToken: (id: string) => {
    const queue = db.getById('queueConfigs', id);
    if (queue) {
      const q = queue as { currentToken: number };
      queueDb.update(id, { currentToken: q.currentToken + 1 });
    }
  },
  incrementCompleted: (id: string) => {
    const queue = db.getById('queueConfigs', id);
    if (queue) {
      const q = queue as { completedPatients: number };
      queueDb.update(id, { completedPatients: q.completedPatients + 1 });
    }
  },
  incrementSkipped: (id: string) => {
    const queue = db.getById('queueConfigs', id);
    if (queue) {
      const q = queue as { skippedPatients: number };
      queueDb.update(id, { skippedPatients: q.skippedPatients + 1 });
    }
  },
};

// ============================================
// Module 4: Queue Item Operations
// ============================================

export const queueItemDb = {
  getAll: () => db.getAll('queueItems'),
  getById: (id: string) => db.getById('queueItems', id),
  getByQueueConfig: (queueConfigId: string) => {
    const items = db.getAll('queueItems');
    return items.filter((i: unknown) => {
      const item = i as { queueConfigId: string };
      return item.queueConfigId === queueConfigId;
    }).sort((a, b) => {
      const itemA = a as { priority: string; tokenNumber: number };
      const itemB = b as { priority: string; tokenNumber: number };
      // Priority patients first
      const priorityOrder = { 'emergency': 0, 'vip': 1, 'doctor-priority': 2, 'normal': 3 };
      const orderA = priorityOrder[itemA.priority as keyof typeof priorityOrder] || 3;
      const orderB = priorityOrder[itemB.priority as keyof typeof priorityOrder] || 3;
      if (orderA !== orderB) return orderA - orderB;
      return (itemA.tokenNumber || 0) - (itemB.tokenNumber || 0);
    });
  },
  getActiveByDate: (date: Date) => {
    const items = db.getAll('queueItems');
    const targetDate = date.toISOString().split('T')[0];
    return items.filter((i: unknown) => {
      const item = i as { checkInTime: Date; status: string };
      return new Date(item.checkInTime).toISOString().split('T')[0] === targetDate && 
             ['waiting', 'in-consultation'].includes(item.status);
    });
  },
  create: (item: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const newItem = db.create('queueItems', item);
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'queueItems', newItem);
    }
    return newItem;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('queueItems', id, updates);
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'queueItems', { id, ...updates });
    }
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('queueItems', id);
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'queueItems', { id });
    }
    return success;
  },
  call: (id: string) => queueItemDb.update(id, { status: 'in-consultation', consultationStartTime: new Date() }),
  release: (id: string) => queueItemDb.update(id, { 
    status: 'released', 
    consultationEndTime: new Date() 
  }),
  complete: (id: string) => queueItemDb.update(id, { 
    status: 'completed', 
    consultationEndTime: new Date() 
  }),
  skip: (id: string) => queueItemDb.update(id, { status: 'skipped' }),
  noShow: (id: string) => queueItemDb.update(id, { status: 'no-show' }),
  changePriority: (id: string, priority: string) => queueItemDb.update(id, { priority }),
};

// ============================================
// Module 4: Queue Event Operations (Audit Trail)
// ============================================

export const queueEventDb = {
  getAll: () => db.getAll('queueEvents'),
  getByQueue: (queueId: string) => {
    const events = db.getAll('queueEvents');
    return events.filter((e: unknown) => {
      const event = e as { queueId: string };
      return event.queueId === queueId;
    }).sort((a, b) => {
      const eventA = a as { timestamp: Date };
      const eventB = b as { timestamp: Date };
      return new Date(eventB.timestamp).getTime() - new Date(eventA.timestamp).getTime();
    });
  },
  create: (event: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('queueEvents', event);
    if (!fromSync) getDBSync()?.queueOperation('create', 'queueEvents', result);
    return result;
  },
};

// ============================================
// Module 4: Token Settings Operations
// ============================================

export const tokenSettingsDb = {
  get: () => {
    const settings = db.getAll('tokenSettings');
    return settings.length > 0 ? settings[0] : null;
  },
  save: (settings: Parameters<typeof db.create>[1]) => {
    const existing = tokenSettingsDb.get();
    if (existing) {
      const s = existing as { id: string };
      db.update('tokenSettings', s.id, settings);
    } else {
      db.create('tokenSettings', settings);
    }
  },
};

// ============================================
// Module 4: Fee Type Operations
// ============================================

export const feeDb = {
  getAll: () => db.getAll('feeTypes'),
  getById: (id: string) => db.getById('feeTypes', id),
  getActive: () => {
    const fees = db.getAll('feeTypes');
    return fees.filter((f: unknown) => {
      const fee = f as { isActive: boolean };
      return fee.isActive;
    }).sort((a, b) => {
      const feeA = a as { displayOrder: number };
      const feeB = b as { displayOrder: number };
      return (feeA.displayOrder || 0) - (feeB.displayOrder || 0);
    });
  },
  create: (fee: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('feeTypes', fee);
    if (!fromSync) getDBSync()?.queueOperation('create', 'feeTypes', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('feeTypes', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'feeTypes', { id, ...updates });
    return result;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('feeTypes', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'feeTypes', { id });
    return success;
  },
  toggleActive: (id: string) => {
    const fee = db.getById('feeTypes', id);
    if (fee) {
      const f = fee as { isActive: boolean };
      feeDb.update(id, { isActive: !f.isActive });
    }
  },
};

// Seed default fee types if none exist
function ensureDefaultFeeTypes(): void {
  const fees = db.getAll('feeTypes');
  if (fees.length === 0) {
    const defaultFees = [
      { name: 'New Patient', amount: 300, description: 'First visit consultation fee', isActive: true, displayOrder: 0 },
      { name: 'Follow Up', amount: 150, description: 'Subsequent visit consultation fee', isActive: true, displayOrder: 1 },
      { name: 'Free Follow Up', amount: 0, description: 'Complimentary follow-up visit', isActive: true, displayOrder: 2 },
    ];
    defaultFees.forEach((fee) => {
      db.create('feeTypes', fee);
    });
  }
}

export function ensureModule2DataSeeded(): void {
  const roles = db.getAll('roles');
  let users = db.getAll('users');
  
  // Seed roles if missing
  if (roles.length === 0) {
    console.log('Seeding roles...');
    defaultRoles.forEach((role) => {
      db.create('roles', role);
    });
  }
  
  // Seed permissions if missing
  const permissions = db.getAll('permissions');
  if (permissions.length === 0) {
    console.log('Seeding permissions...');
    defaultPermissions.forEach((perm) => {
      db.create('permissions', perm);
    });
  }
  
  // Seed all default users if they don't exist
  defaultUsers.forEach((defaultUser) => {
    // Refresh users list each time to check latest
    users = db.getAll('users');
    const existingUser = users.find((u: unknown) => {
      const user = u as { identifier: string };
      return user.identifier === defaultUser.identifier;
    });
    
    if (!existingUser) {
      console.log(`Seeding ${defaultUser.identifier} user...`);
      db.create('users', defaultUser);
    }
  });
  
  // Seed role templates if missing
  const roleTemplates = db.getAll('roleTemplates');
  if (roleTemplates.length === 0) {
    console.log('Seeding role templates...');
    const templates = [
      { name: 'Busy Day Mode', description: 'Maximum efficiency settings', roleIds: ['role-doctor', 'role-frontdesk'] },
      { name: 'Solo Clinic Mode', description: 'Single person operation', roleIds: ['role-doctor'] },
      { name: 'Training Mode', description: 'Assistant has more access', roleIds: ['role-doctor', 'role-assistant'] },
    ];
    templates.forEach((template) => {
      db.create('roleTemplates', template);
    });
  }
}

// Call ensureDefaultFeeTypes when module loads
ensureDefaultFeeTypes();

// ============================================
// Billing Queue Operations
// ============================================

export const billingQueueDb = {
  getAll: () => db.getAll('billingQueue'),
  getById: (id: string) => db.getById('billingQueue', id),
  getByPatient: (patientId: string) => {
    const items = db.getAll('billingQueue');
    return items.filter((item: unknown) => {
      const billing = item as { patientId: string };
      return billing.patientId === patientId;
    }).sort((a, b) => {
      const billingA = a as { createdAt: Date };
      const billingB = b as { createdAt: Date };
      return new Date(billingB.createdAt).getTime() - new Date(billingA.createdAt).getTime();
    });
  },
  getByStatus: (status: string) => {
    const items = db.getAll('billingQueue');
    return items.filter((item: unknown) => {
      const billing = item as { status: string };
      return billing.status === status;
    }).sort((a, b) => {
      const billingA = a as { createdAt: Date };
      const billingB = b as { createdAt: Date };
      return new Date(billingA.createdAt).getTime() - new Date(billingB.createdAt).getTime();
    });
  },
  getPending: () => {
    const items = db.getAll('billingQueue');
    return items.filter((item: unknown) => {
      const billing = item as { status: string };
      return billing.status === 'pending' || billing.status === 'paid';
    }).sort((a, b) => {
      const billingA = a as { createdAt: Date };
      const billingB = b as { createdAt: Date };
      return new Date(billingA.createdAt).getTime() - new Date(billingB.createdAt).getTime();
    });
  },
  create: (item: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const newItem = db.create('billingQueue', item);
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'billingQueue', newItem);
    }
    return newItem;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('billingQueue', id, updates);
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'billingQueue', { id, ...updates });
    }
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('billingQueue', id);
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'billingQueue', { id });
    }
    return success;
  },
  markPaid: (id: string, paymentMethod: string, receiptNumber: string) => db.update('billingQueue', id, {
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod,
    receiptNumber,
    receiptGeneratedAt: new Date()
  }),
  markCompleted: (id: string) => db.update('billingQueue', id, { status: 'completed' }),
  generateReceiptNumber: () => {
    const receipts = db.getAll('billingReceipts');
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayReceipts = receipts.filter((r: unknown) => {
      const receipt = r as { receiptNumber: string };
      return receipt.receiptNumber.includes(today);
    });
    const sequence = (todayReceipts.length + 1).toString().padStart(4, '0');
    return `RCP-${today}-${sequence}`;
  }
};

// ============================================
// Billing Receipt Operations
// ============================================

export const billingReceiptDb = {
  getAll: () => db.getAll('billingReceipts'),
  getById: (id: string) => db.getById('billingReceipts', id),
  getByPatient: (patientId: string) => {
    const receipts = db.getAll('billingReceipts');
    return receipts.filter((r: unknown) => {
      const receipt = r as { patientId: string };
      return receipt.patientId === patientId;
    }).sort((a, b) => {
      const receiptA = a as { createdAt: Date };
      const receiptB = b as { createdAt: Date };
      return new Date(receiptB.createdAt).getTime() - new Date(receiptA.createdAt).getTime();
    });
  },
  getByReceiptNumber: (receiptNumber: string) => {
    const receipts = db.getAll('billingReceipts');
    return receipts.find((r: unknown) => {
      const receipt = r as { receiptNumber: string };
      return receipt.receiptNumber === receiptNumber;
    });
  },
  getByBillingQueueId: (billingQueueId: string) => {
    const receipts = db.getAll('billingReceipts');
    return receipts.find((r: unknown) => {
      const receipt = r as { billingQueueId: string };
      return receipt.billingQueueId === billingQueueId;
    });
  },
  getByVisitId: (visitId: string) => {
    const receipts = db.getAll('billingReceipts');
    return receipts.find((r: unknown) => {
      const receipt = r as { visitId: string };
      return receipt.visitId === visitId;
    });
  },
  create: (receipt: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    // Check if receipt with same receiptNumber already exists
    const receiptData = receipt as { receiptNumber: string };
    if (receiptData.receiptNumber) {
      const existing = billingReceiptDb.getByReceiptNumber(receiptData.receiptNumber);
      if (existing) {
        console.log('[billingReceiptDb] Receipt already exists with number:', receiptData.receiptNumber, '- returning existing receipt');
        return existing;
      }
    }
    const newReceipt = db.create('billingReceipts', receipt);
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'billingReceipts', newReceipt);
    }
    return newReceipt;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('billingReceipts', id, updates);
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'billingReceipts', { id, ...updates });
    }
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('billingReceipts', id);
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'billingReceipts', { id });
    }
    return success;
  },
  markPrinted: (id: string) => billingReceiptDb.update(id, { printedAt: new Date() }),
  markWhatsappSent: (id: string) => billingReceiptDb.update(id, { whatsappSentAt: new Date() })
};

// ============================================
// Centralized Receipt Generation
// ============================================

/**
 * Creates or reuses a receipt for a billing queue item.
 * This is the single point of receipt generation to prevent duplicates.
 * 
 * @param billingQueueItem - The billing queue item to create/reuse receipt for
 * @param receiptItems - The items to include in the receipt
 * @returns The receipt object with receiptNumber, or null if conditions not met
 */
export function createOrReuseReceipt(
  billingQueueItem: any,
  receiptItems: any[]
): any | null {
  console.log('[createOrReuseReceipt] Called with:', {
    id: billingQueueItem.id,
    netAmount: billingQueueItem.netAmount,
    paymentStatus: billingQueueItem.paymentStatus,
    receiptNumber: billingQueueItem.receiptNumber
  });

  // Check if receipt already exists by receiptNumber on BillingQueueItem
  if (billingQueueItem.receiptNumber) {
    const existingReceipt = billingReceiptDb.getByReceiptNumber(billingQueueItem.receiptNumber);
    if (existingReceipt) {
      console.log('[createOrReuseReceipt] Receipt already exists with number:', billingQueueItem.receiptNumber);
      return existingReceipt;
    }
  }

  // Check by billingQueueId in BillingReceipt table
  const existingByQueueId = billingReceiptDb.getByBillingQueueId(billingQueueItem.id);
  if (existingByQueueId) {
    console.log('[createOrReuseReceipt] Receipt already exists for billingQueueId:', billingQueueItem.id);
    return existingByQueueId;
  }

  // Check by visitId in BillingReceipt table
  const existingByVisitId = billingReceiptDb.getByVisitId(billingQueueItem.visitId);
  if (existingByVisitId) {
    console.log('[createOrReuseReceipt] Receipt already exists for visitId:', billingQueueItem.visitId);
    return existingByVisitId;
  }

  // No existing receipt - create new one only if conditions met
  console.log('[createOrReuseReceipt] Checking conditions:', {
    netAmountCheck: billingQueueItem.netAmount > 0,
    paymentStatusCheck: billingQueueItem.paymentStatus === 'paid',
    bothMet: billingQueueItem.netAmount > 0 && billingQueueItem.paymentStatus === 'paid'
  });

  if (billingQueueItem.netAmount > 0 && billingQueueItem.paymentStatus === 'paid') {
    const receiptNumber = billingQueueDb.generateReceiptNumber();
    
    const receipt = {
      receiptNumber,
      billingQueueId: billingQueueItem.id,
      visitId: billingQueueItem.visitId,
      patientId: billingQueueItem.patientId,
      items: receiptItems,
      subtotal: billingQueueItem.feeAmount || 0,
      discountPercent: billingQueueItem.discountPercent || 0,
      discountAmount: billingQueueItem.discountAmount || 0,
      taxAmount: billingQueueItem.taxAmount || 0,
      netAmount: billingQueueItem.netAmount,
      paymentMethod: billingQueueItem.paymentMethod || 'cash',
      paymentStatus: 'paid',
      createdAt: new Date()
    };

    console.log('[createOrReuseReceipt] Creating receipt with:', receipt);

    const createdReceipt = billingReceiptDb.create(receipt);
    console.log('[createOrReuseReceipt] Created new receipt:', receiptNumber, 'Result:', createdReceipt);
    
    // Update BillingQueueItem with receiptNumber for future reference
    billingQueueDb.update(billingQueueItem.id, {
      receiptNumber,
      receiptGeneratedAt: new Date()
    });

    return createdReceipt;
  }

  console.log('[createOrReuseReceipt] Receipt not created - conditions not met (netAmount > 0 and paymentStatus = paid)');
  return null;
}

// ============================================
// Medicine Bill Operations
// ============================================

export const medicineBillDb = {
  getAll: () => db.getAll('medicineBills'),
  getById: (id: string) => db.getById('medicineBills', id),
  getByBillingQueueId: (billingQueueId: string) => {
    const bills = db.getAll('medicineBills');
    const filtered = bills.filter((b: unknown) => {
      const bill = b as { billingQueueId: string };
      return bill.billingQueueId === billingQueueId;
    }) as Array<{ createdAt: Date }>;
    if (filtered.length === 0) return undefined;
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  },
  getByVisitId: (visitId: string) => {
    const bills = db.getAll('medicineBills');
    return bills.filter((b: unknown) => {
      const bill = b as { visitId: string };
      return bill.visitId === visitId;
    }).sort((a, b) => {
      const billA = a as { createdAt: Date };
      const billB = b as { createdAt: Date };
      return new Date(billB.createdAt).getTime() - new Date(billA.createdAt).getTime();
    });
  },
  getByPatientId: (patientId: string) => {
    const bills = db.getAll('medicineBills');
    return bills.filter((b: unknown) => {
      const bill = b as { patientId: string };
      return bill.patientId === patientId;
    }).sort((a, b) => {
      const billA = a as { createdAt: Date };
      const billB = b as { createdAt: Date };
      return new Date(billB.createdAt).getTime() - new Date(billA.createdAt).getTime();
    });
  },
  create: (bill: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const newBill = db.create('medicineBills', bill);
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'medicineBills', newBill);
    }
    return newBill;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const updated = db.update('medicineBills', id, updates);
    if (!fromSync && updated) {
      getDBSync()?.queueOperation('update', 'medicineBills', { id, ...updates });
    }
    return updated;
  },
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('medicineBills', id);
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'medicineBills', { id });
    }
    return success;
  },
};

// ============================================
// Medicine Amount Memory Operations
// ============================================

export const medicineAmountMemoryDb = {
  getAll: () => db.getAll('medicineAmountMemory'),
  getByMedicine: (medicine: string, potency?: string) => {
    const memories = db.getAll('medicineAmountMemory');
    return memories.find((m: unknown) => {
      const memory = m as { medicine: string; potency?: string };
      return memory.medicine.toLowerCase() === medicine.toLowerCase() && 
             (!potency || memory.potency?.toLowerCase() === potency.toLowerCase());
    });
  },
  create: (memory: Parameters<typeof db.create>[1], fromSync: boolean = false) => {
    const result = db.create('medicineAmountMemory', memory);
    if (!fromSync) getDBSync()?.queueOperation('create', 'medicineAmountMemory', result);
    return result;
  },
  update: (id: string, updates: Parameters<typeof db.update>[2], fromSync: boolean = false) => {
    const result = db.update('medicineAmountMemory', id, updates);
    if (!fromSync && result) getDBSync()?.queueOperation('update', 'medicineAmountMemory', { id, ...updates });
    return result;
  },
  upsert: (medicine: string, potency: string | undefined, amount: number) => {
    const existing = medicineAmountMemoryDb.getByMedicine(medicine, potency);
    if (existing) {
      medicineAmountMemoryDb.update((existing as { id: string }).id, { amount, lastUsedAt: new Date() });
    } else {
      medicineAmountMemoryDb.create({
        id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        medicine,
        potency,
        amount,
        lastUsedAt: new Date()
      });
    }
  }
};

// ============================================
// Materia Medica Embeddings Database
// ============================================

export const materiaMedicaBookEmbeddingDb = {
  getAll: () => db.getAll('materiaMedicaBookEmbeddings'),
  getById: (id: string) => db.getById('materiaMedicaBookEmbeddings', id),
  getByBook: (bookId: string) => {
    const embeddings = db.getAll('materiaMedicaBookEmbeddings');
    return embeddings.filter((emb: any) => emb.bookId === bookId);
  },
  getByMedicine: (medicineName: string) => {
    const embeddings = db.getAll('materiaMedicaBookEmbeddings');
    return embeddings.filter((emb: any) => emb.medicineName === medicineName);
  },
  search: (query: string, bookIds?: string[]) => {
    const embeddings = db.getAll('materiaMedicaBookEmbeddings');
    const lowerQuery = query.toLowerCase();
    return embeddings.filter((emb: any) => {
      const matchesQuery = emb.text.toLowerCase().includes(lowerQuery) ||
                          emb.medicineName.toLowerCase().includes(lowerQuery) ||
                          emb.sectionName.toLowerCase().includes(lowerQuery);
      const matchesBook = !bookIds || bookIds.includes(emb.bookId);
      return matchesQuery && matchesBook;
    });
  },
  create: (embedding: Parameters<typeof db.create>[1]) => db.create('materiaMedicaBookEmbeddings', embedding),
  createBatch: (embeddings: any[]) => {
    return embeddings.map(emb => db.create('materiaMedicaBookEmbeddings', emb));
  },
  delete: (id: string) => db.delete('materiaMedicaBookEmbeddings', id),
  deleteByBook: (bookId: string) => {
    const embeddings = db.getAll('materiaMedicaBookEmbeddings');
    const bookEmbeddings = embeddings.filter((emb: any) => emb.bookId === bookId);
    bookEmbeddings.forEach((emb: any) => db.delete('materiaMedicaBookEmbeddings', emb.id));
    return bookEmbeddings.length;
  },
  count: () => db.count('materiaMedicaBookEmbeddings'),
  countByBook: (bookId: string) => {
    const embeddings = db.getAll('materiaMedicaBookEmbeddings');
    return embeddings.filter((emb: any) => emb.bookId === bookId).length;
  }
};


// ============================================
// Licenses Database Operations
// ============================================

export const licensesDb = {
  getAll: () => db.getAll('licenses'),
  getById: (id: string) => db.getById('licenses', id),
  getByCustomer: (customerId: string) => {
    const licenses = db.getAll('licenses');
    return licenses.filter((l: unknown) => {
      const license = l as { customerId: string };
      return license.customerId === customerId;
    });
  },
  getByKey: (licenseKey: string) => {
    const licenses = db.getAll('licenses');
    return licenses.find((l: unknown) => {
      const license = l as { licenseKey: string };
      return license.licenseKey === licenseKey;
    });
  },
  create: (license: Parameters<typeof db.create>[1]) => db.create('licenses', license),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('licenses', id, updates),
  delete: (id: string) => db.delete('licenses', id),
};

// ============================================
// Customers Database Operations
// ============================================

export const customersDb = {
  getAll: () => db.getAll('customers'),
  getById: (id: string) => db.getById('customers', id),
  getByEmail: (email: string) => {
    const customers = db.getAll('customers');
    return customers.find((c: unknown) => {
      const customer = c as { email: string };
      return customer.email === email;
    });
  },
  create: (customer: Parameters<typeof db.create>[1]) => db.create('customers', customer),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('customers', id, updates),
  delete: (id: string) => db.delete('customers', id),
};

// ============================================
// Plans Database Operations
// ============================================

export const plansDb = {
  getAll: () => db.getAll('purchase_plans'),
  getById: (id: string) => db.getById('purchase_plans', id),
  create: (plan: Parameters<typeof db.create>[1]) => db.create('purchase_plans', plan),
  update: (id: string, updates: Parameters<typeof db.update>[2]) => db.update('purchase_plans', id, updates),
  delete: (id: string) => db.delete('purchase_plans', id),
};

// ============================================
// LAN Network Configuration Database Operations
// Dual-mode: localStorage (web) + SQLite (desktop)
// ============================================

import type { LANNetworkConfig, LANConnectionState, SyncStatusRecord } from '@/types/lan-network';

/**
 * LAN Network Configuration Database
 * Stores user's selected network, role, and connection details
 * Storage: localStorage key 'lanNetworkConfig' (web) or SQLite table 'lan_network_config' (desktop)
 */
export const lanNetworkDb = {
  /**
   * Get the current network configuration
   */
  getConfig: (): LANNetworkConfig | null => {
    if (typeof window === 'undefined') return null;
    
    if (isElectron()) {
      // Desktop mode: Query SQLite
      try {
        const result = ipcQuery('SELECT * FROM lan_network_config LIMIT 1');
        if (result && Array.isArray(result) && result.length > 0) {
          return result[0] as LANNetworkConfig;
        }
      } catch (error) {
        console.warn('[LAN Network DB] Failed to query SQLite:', error);
      }
    }
    
    // Web mode or fallback: Use localStorage
    try {
      const stored = localStorage.getItem('lanNetworkConfig');
      if (stored) {
        return JSON.parse(stored) as LANNetworkConfig;
      }
    } catch (error) {
      console.warn('[LAN Network DB] Failed to parse localStorage:', error);
    }
    
    return null;
  },

  /**
   * Save network configuration
   */
  saveConfig: (config: LANNetworkConfig): void => {
    if (typeof window === 'undefined') return;
    
    // Always save to localStorage first (source of truth)
    try {
      localStorage.setItem('lanNetworkConfig', JSON.stringify(config));
      console.log('[LAN Network DB] Config saved to localStorage');
    } catch (error) {
      console.error('[LAN Network DB] Failed to save to localStorage:', error);
    }
    
    // Desktop mode: Also sync to SQLite
    if (isElectron()) {
      try {
        const sql = `
          INSERT OR REPLACE INTO lan_network_config 
          (selectedNetworkId, selectedNetworkName, broadcastAddress, role, mainServerId, mainServerIp, mainServerPort, lastConnectedTime, connectionAttempts, lastError)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
          config.selectedNetworkId,
          config.selectedNetworkName,
          config.broadcastAddress,
          config.role,
          config.mainServerId || null,
          config.mainServerIp || null,
          config.mainServerPort || null,
          config.lastConnectedTime,
          config.connectionAttempts,
          config.lastError || null
        ];
        ipcExecute(sql, params);
        console.log('[LAN Network DB] Config synced to SQLite');
      } catch (error) {
        console.warn('[LAN Network DB] Failed to sync to SQLite:', error);
      }
    }
  },

  /**
   * Clear network configuration
   */
  clearConfig: (): void => {
    if (typeof window === 'undefined') return;
    
    // Clear from localStorage
    try {
      localStorage.removeItem('lanNetworkConfig');
      console.log('[LAN Network DB] Config cleared from localStorage');
    } catch (error) {
      console.warn('[LAN Network DB] Failed to clear localStorage:', error);
    }
    
    // Desktop mode: Also clear from SQLite
    if (isElectron()) {
      try {
        ipcExecute('DELETE FROM lan_network_config');
        console.log('[LAN Network DB] Config cleared from SQLite');
      } catch (error) {
        console.warn('[LAN Network DB] Failed to clear SQLite:', error);
      }
    }
  },

  /**
   * Update connection attempt count
   */
  incrementConnectionAttempts: (): void => {
    const config = lanNetworkDb.getConfig();
    if (config) {
      config.connectionAttempts = (config.connectionAttempts || 0) + 1;
      lanNetworkDb.saveConfig(config);
    }
  },

  /**
   * Reset connection attempt count
   */
  resetConnectionAttempts: (): void => {
    const config = lanNetworkDb.getConfig();
    if (config) {
      config.connectionAttempts = 0;
      lanNetworkDb.saveConfig(config);
    }
  },

  /**
   * Update last error
   */
  setLastError: (error: string | null): void => {
    const config = lanNetworkDb.getConfig();
    if (config) {
      config.lastError = error || undefined;
      lanNetworkDb.saveConfig(config);
    }
  }
};

/**
 * LAN Connection State Database
 * Stores current connection state, role, and connected instances
 * Storage: localStorage key 'lanConnectionState' (web) or SQLite table 'lan_connection_state' (desktop)
 */
export const lanConnectionStateDb = {
  /**
   * Get the current connection state
   */
  getState: (): LANConnectionState | null => {
    if (typeof window === 'undefined') return null;
    
    if (isElectron()) {
      // Desktop mode: Query SQLite
      try {
        const result = ipcQuery('SELECT * FROM lan_connection_state LIMIT 1');
        if (result && Array.isArray(result) && result.length > 0) {
          const row = result[0] as any;
          return {
            state: row.state,
            role: row.role,
            mainServerId: row.mainServerId,
            connectedInstances: row.connectedInstances ? JSON.parse(row.connectedInstances) : [],
            lastStateChange: row.lastStateChange,
            error: row.error ? JSON.parse(row.error) : undefined
          };
        }
      } catch (error) {
        console.warn('[LAN Connection State DB] Failed to query SQLite:', error);
      }
    }
    
    // Web mode or fallback: Use localStorage
    try {
      const stored = localStorage.getItem('lanConnectionState');
      if (stored) {
        return JSON.parse(stored) as LANConnectionState;
      }
    } catch (error) {
      console.warn('[LAN Connection State DB] Failed to parse localStorage:', error);
    }
    
    return null;
  },

  /**
   * Save connection state
   */
  setState: (state: LANConnectionState): void => {
    if (typeof window === 'undefined') return;
    
    // Always save to localStorage first (source of truth)
    try {
      localStorage.setItem('lanConnectionState', JSON.stringify(state));
      console.log('[LAN Connection State DB] State saved to localStorage');
    } catch (error) {
      console.error('[LAN Connection State DB] Failed to save to localStorage:', error);
    }
    
    // Desktop mode: Also sync to SQLite
    if (isElectron()) {
      try {
        const sql = `
          INSERT OR REPLACE INTO lan_connection_state 
          (state, role, mainServerId, connectedInstances, lastStateChange, error)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
          state.state,
          state.role || null,
          state.mainServerId || null,
          JSON.stringify(state.connectedInstances),
          state.lastStateChange,
          state.error ? JSON.stringify(state.error) : null
        ];
        ipcExecute(sql, params);
        console.log('[LAN Connection State DB] State synced to SQLite');
      } catch (error) {
        console.warn('[LAN Connection State DB] Failed to sync to SQLite:', error);
      }
    }
  },

  /**
   * Clear connection state
   */
  clearState: (): void => {
    if (typeof window === 'undefined') return;
    
    // Clear from localStorage
    try {
      localStorage.removeItem('lanConnectionState');
      console.log('[LAN Connection State DB] State cleared from localStorage');
    } catch (error) {
      console.warn('[LAN Connection State DB] Failed to clear localStorage:', error);
    }
    
    // Desktop mode: Also clear from SQLite
    if (isElectron()) {
      try {
        ipcExecute('DELETE FROM lan_connection_state');
        console.log('[LAN Connection State DB] State cleared from SQLite');
      } catch (error) {
        console.warn('[LAN Connection State DB] Failed to clear SQLite:', error);
      }
    }
  }
};

/**
 * LAN Sync Status Database
 * Stores sync status for each connected instance
 * Storage: localStorage key 'lanSyncStatus' (web) or SQLite table 'lan_sync_status' (desktop)
 */
export const lanSyncDb = {
  /**
   * Get all sync status records
   */
  getAll: (): SyncStatusRecord[] => {
    if (typeof window === 'undefined') return [];
    
    if (isElectron()) {
      // Desktop mode: Query SQLite
      try {
        const result = ipcQuery('SELECT * FROM lan_sync_status');
        if (result && Array.isArray(result)) {
          return result as SyncStatusRecord[];
        }
      } catch (error) {
        console.warn('[LAN Sync DB] Failed to query SQLite:', error);
      }
    }
    
    // Web mode or fallback: Use localStorage
    try {
      const stored = localStorage.getItem('lanSyncStatus');
      if (stored) {
        return JSON.parse(stored) as SyncStatusRecord[];
      }
    } catch (error) {
      console.warn('[LAN Sync DB] Failed to parse localStorage:', error);
    }
    
    return [];
  },

  /**
   * Get sync status for a specific instance
   */
  getByInstanceId: (instanceId: string): SyncStatusRecord | null => {
    const records = lanSyncDb.getAll();
    return records.find(r => r.instanceId === instanceId) || null;
  },

  /**
   * Save or update sync status for an instance
   */
  upsert: (record: SyncStatusRecord): void => {
    if (typeof window === 'undefined') return;
    
    const records = lanSyncDb.getAll();
    const index = records.findIndex(r => r.instanceId === record.instanceId);
    
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    
    // Always save to localStorage first (source of truth)
    try {
      localStorage.setItem('lanSyncStatus', JSON.stringify(records));
      console.log('[LAN Sync DB] Sync status saved to localStorage');
    } catch (error) {
      console.error('[LAN Sync DB] Failed to save to localStorage:', error);
    }
    
    // Desktop mode: Also sync to SQLite
    if (isElectron()) {
      try {
        const sql = `
          INSERT OR REPLACE INTO lan_sync_status 
          (instanceId, lastSyncTime, lastSyncDuration, bytesTransferred, syncStatus, errorDetails)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
          record.instanceId,
          record.lastSyncTime,
          record.lastSyncDuration,
          record.bytesTransferred,
          record.syncStatus,
          record.errorDetails || null
        ];
        ipcExecute(sql, params);
        console.log('[LAN Sync DB] Sync status synced to SQLite');
      } catch (error) {
        console.warn('[LAN Sync DB] Failed to sync to SQLite:', error);
      }
    }
  },

  /**
   * Delete sync status for an instance
   */
  deleteByInstanceId: (instanceId: string): void => {
    if (typeof window === 'undefined') return;
    
    const records = lanSyncDb.getAll();
    const filtered = records.filter(r => r.instanceId !== instanceId);
    
    // Always save to localStorage first (source of truth)
    try {
      localStorage.setItem('lanSyncStatus', JSON.stringify(filtered));
      console.log('[LAN Sync DB] Sync status deleted from localStorage');
    } catch (error) {
      console.error('[LAN Sync DB] Failed to delete from localStorage:', error);
    }
    
    // Desktop mode: Also delete from SQLite
    if (isElectron()) {
      try {
        ipcExecute('DELETE FROM lan_sync_status WHERE instanceId = ?', [instanceId]);
        console.log('[LAN Sync DB] Sync status deleted from SQLite');
      } catch (error) {
        console.warn('[LAN Sync DB] Failed to delete from SQLite:', error);
      }
    }
  },

  /**
   * Clear all sync status records
   */
  clearAll: (): void => {
    if (typeof window === 'undefined') return;
    
    // Clear from localStorage
    try {
      localStorage.removeItem('lanSyncStatus');
      console.log('[LAN Sync DB] All sync status cleared from localStorage');
    } catch (error) {
      console.warn('[LAN Sync DB] Failed to clear localStorage:', error);
    }
    
    // Desktop mode: Also clear from SQLite
    if (isElectron()) {
      try {
        ipcExecute('DELETE FROM lan_sync_status');
        console.log('[LAN Sync DB] All sync status cleared from SQLite');
      } catch (error) {
        console.warn('[LAN Sync DB] Failed to clear SQLite:', error);
      }
    }
  }
};
