/**
 * Server-only database module
 * This module uses file-based storage and is ONLY imported in API routes
 * It should NEVER be imported in client components
 */

import fs from 'fs';
import path from 'path';
import type { DatabaseConfig, RegNumberSettings } from '@/types';

// In packaged Electron, process.cwd() is the read-only install dir.
// Use APPDATA/HomeoPMS (same location as the SQLite DB) so licensing data persists.
// Separate databases for dev and prod builds to avoid mixing test/user data
function getDbDir(): string {
  const buildMode = process.env.NEXT_PUBLIC_BUILD_MODE || 'prod';
  const dbSuffix = buildMode === 'dev' ? '-dev' : '';
  
  if (process.env.APPDATA) {
    // Windows Electron (packaged or dev)
    return path.join(process.env.APPDATA, `HomeoPMS${dbSuffix}`, '.data');
  }
  if (process.env.HOME && process.env.NODE_ENV === 'production') {
    // Linux/macOS packaged
    return path.join(process.env.HOME, '.config', `HomeoPMS${dbSuffix}`, '.data');
  }
  // Web / dev fallback — keep original behaviour
  return path.join(process.cwd(), `.data${dbSuffix}`);
}

const DB_DIR = getDbDir();
const DB_FILE = path.join(DB_DIR, 'database.json');

// Database configuration
const dbConfig: DatabaseConfig = {
  type: 'sqlite',
  name: 'pms_database',
  version: 4,
};

// Database schema version
const SCHEMA_VERSION = '1.0';

class ServerDatabase {
  private static instance: ServerDatabase;
  private store: Map<string, unknown[]>;
  private isInitialized: boolean = false;

  private constructor() {
    this.store = new Map();
    console.log('Server DB: Initializing...');
    this.loadFromFile();
    // Initialize stores if not loaded from file
    if (!this.isInitialized) {
      console.log('Server DB: No data loaded from file, initializing empty stores');
      this.initializeStores();
      this.isInitialized = true;
    } else {
      console.log('Server DB: Data loaded from file, skipping initialization');
    }
  }

  public static getInstance(): ServerDatabase {
    if (!ServerDatabase.instance) {
      ServerDatabase.instance = new ServerDatabase();
    }
    return ServerDatabase.instance;
  }

  private ensureDbDir(): void {
    const dbDir = DB_DIR;
    console.log(`Server DB: DB_DIR = ${dbDir}, process.cwd() = ${process.cwd()}`);
    if (!fs.existsSync(dbDir)) {
      console.log(`Server DB: Creating directory: ${dbDir}`);
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  private loadFromFile(): void {
    try {
      this.ensureDbDir();
      console.log(`Server DB: Checking for database file at: ${DB_FILE}`);
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        console.log(`Server DB: Loaded from file, collections: ${Object.keys(parsed).length}, customers: ${parsed.customers?.length || 0}`);
        // Clear existing data and reload
        this.store.clear();
        Object.keys(parsed).forEach(key => {
          this.store.set(key, parsed[key]);
        });
        this.isInitialized = true;
      } else {
        console.log(`Server DB: No existing database file found at ${DB_FILE}`);
      }
    } catch (error) {
      console.error('Server DB: Failed to load from file:', error);
    }
  }

  private saveToFile(): void {
    try {
      this.ensureDbDir();
      const data: Record<string, unknown[]> = {};
      this.store.forEach((value, key) => {
        data[key] = value;
      });
      const jsonStr = JSON.stringify(data, null, 2);
      console.log(`Server DB: SAVE TO FILE - path: ${DB_FILE}`);
      console.log(`Server DB: SAVE TO FILE - licenses count: ${data.licenses?.length || 0}`);
      fs.writeFileSync(DB_FILE, jsonStr, 'utf-8');
      console.log(`Server DB: Saved to ${DB_FILE}, size: ${jsonStr.length} bytes, collections: ${Object.keys(data).length}`);
    } catch (error) {
      console.error('Server DB: Failed to save to file:', error);
    }
  }

  private initializeStores(): void {
    const collections = [
      'patients',
      'visits',
      'investigations',
      'voiceNotes',
      'patientTags',
      'feeExemptions',
      'feeHistory',
      'prescriptionHistory',
      'materiaMedica',
      'materiaMedicaBooks',
      'materiaMedicaBookPages',
      'materiaMedicaSearchIndex',
      'materiaMedicaBookmarks',
      'materiaMedicaReadingHistory',
      'materiaMedicaAISearchCache',
      'fees',
      'users',
      'roles',
      'permissions',
      'activityLogs',
      'staffMessages',
      'sessions',
      'roleTemplates',
      'settings',
      'appointments',
      'slots',
      'queueConfigs',
      'queueItems',
      'queueEvents',
      'tokenSettings',
      'feeTypes',
      'billingQueue',
      'billingReceipts',
      'medicineBills',
      'medicineAmountMemory',
      'materiaMedicaBookEmbeddings',
      // Licensing collections
      'customers',
      'purchase_plans',
      'licenses',
      'license_usage',
      'license_audit_log',
      'active_computer_sessions',
      // WhatsApp pending appointments (parsed but not yet imported to client)
      'whatsappPending',
    ];

    collections.forEach(collection => {
      if (!this.store.has(collection)) {
        this.store.set(collection, []);
      }
    });
  }

  public getAll<T>(collection: string): T[] {
    // Always reload from file to ensure fresh data
    this.loadFromFile();
    return (this.store.get(collection) || []) as T[];
  }

  public getById<T>(collection: string, id: string): T | undefined {
    // Always reload from file to ensure fresh data
    this.loadFromFile();
    const items = this.store.get(collection) || [];
    console.log(`Server DB: Looking for ${id} in ${collection}, found ${items.length} items`);
    const found = (items as any[]).find((item: any) => item.id === id) as T | undefined;
    console.log(`Server DB: Search result: ${found ? 'found' : 'not found'}`);
    return found;
  }

  public create<T extends Record<string, unknown>>(
    collection: string,
    item: T
  ): T & { id: string; createdAt: Date; updatedAt: Date } {
    const id = this.generateId();
    const now = new Date();
    const newItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };

    console.log(`Server DB: CREATE START - collection: ${collection}, id: ${id}`);
    const items = this.store.get(collection) || [];
    console.log(`Server DB: Before create - ${collection} has ${items.length} items`);
    
    items.push(newItem);
    this.store.set(collection, items);
    console.log(`Server DB: After push - ${collection} has ${items.length} items`);
    console.log(`Server DB: Created ${collection}/${id}, total items: ${items.length}`);
    
    this.saveToFile();
    console.log(`Server DB: CREATE COMPLETE - saved to file`);

    return newItem as T & { id: string; createdAt: Date; updatedAt: Date };
  }

  public update<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Record<string, unknown>
  ): T | undefined {
    // Always reload from file to ensure fresh data
    console.log(`Server DB: UPDATE START - collection: ${collection}, id: ${id}`);
    this.loadFromFile();
    const items = this.store.get(collection) || [];
    console.log(`Server DB: Found ${items.length} items in ${collection}`);
    
    const index = (items as any[]).findIndex((item: any) => item.id === id);
    console.log(`Server DB: Item index: ${index}`);

    if (index === -1) {
      console.log(`Server DB: Item ${id} not found in ${collection}`);
      return undefined;
    }

    const oldItem = (items as any[])[index];
    const updated = {
      ...oldItem,
      ...updates,
      updatedAt: new Date(),
    };

    console.log(`Server DB: Old item:`, JSON.stringify(oldItem).substring(0, 100));
    console.log(`Server DB: Updates:`, JSON.stringify(updates));
    console.log(`Server DB: New item:`, JSON.stringify(updated).substring(0, 100));

    (items as any[])[index] = updated;
    this.store.set(collection, items);
    console.log(`Server DB: Updated ${collection}/${id}, changes: ${JSON.stringify(updates)}`);
    this.saveToFile();
    console.log(`Server DB: UPDATE COMPLETE - saved to file`);

    return updated as T;
  }

  public delete(collection: string, id: string): boolean {
    // Always reload from file to ensure fresh data
    console.log(`Server DB: DELETE START - collection: ${collection}, id: ${id}`);
    this.loadFromFile();
    const items = this.store.get(collection) || [];
    console.log(`Server DB: Found ${items.length} items in ${collection} before delete`);
    
    const index = (items as any[]).findIndex((item: any) => item.id === id);
    console.log(`Server DB: Item index: ${index}`);

    if (index === -1) {
      console.log(`Server DB: Item ${id} not found in ${collection}`);
      return false;
    }

    const deletedItem = (items as any[])[index];
    console.log(`Server DB: Deleting item:`, JSON.stringify(deletedItem).substring(0, 100));
    
    (items as any[]).splice(index, 1);
    this.store.set(collection, items);
    console.log(`Server DB: After splice - ${collection} has ${items.length} items`);
    
    this.saveToFile();
    console.log(`Server DB: DELETE COMPLETE - saved to file`);

    return true;
  }

  public search<T>(collection: string, query: string, fields: string[]): T[] {
    const items = this.store.get(collection) || [];
    const lowerQuery = query.toLowerCase();

    return (items as any[]).filter((item: any) =>
      fields.some(field => {
        const value = item[field];
        return value && String(value).toLowerCase().includes(lowerQuery);
      })
    ) as T[];
  }

  public count(collection: string): number {
    return (this.store.get(collection) || []).length;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const serverDb = ServerDatabase.getInstance();
