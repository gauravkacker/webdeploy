/**
 * Unified Database Abstraction Layer
 * 
 * This layer provides a single interface for all database operations
 * that works in both Web mode (localStorage) and Desktop mode (SQLite via IPC).
 * 
 * It also integrates WiFi LAN sync for multi-computer setups.
 */

'use client';

import { isElectron, ipcQuery, ipcExecute, ipcTransaction } from '@/lib/ipc-client';

// Environment detection
export function isDatabaseElectronMode(): boolean {
  return isElectron();
}

// Unified Database Interface
export class UnifiedDatabase {
  private mode: 'web' | 'desktop';

  constructor() {
    this.mode = isDatabaseElectronMode() ? 'desktop' : 'web';
  }

  /**
   * Query data from database
   * @param collection - Table/collection name
   * @param filter - Optional filter criteria
   * @returns Array of results
   */
  async query<T>(collection: string, filter?: any): Promise<T[]> {
    if (this.mode === 'desktop') {
      return await this.queryElectron<T>(collection, filter);
    } else {
      return await this.queryWeb<T>(collection, filter);
    }
  }

  /**
   * Execute a write operation (INSERT, UPDATE, DELETE)
   * @param collection - Table/collection name
   * @param operation - Operation details
   * @returns Operation result
   */
  async execute(collection: string, operation: any): Promise<any> {
    if (this.mode === 'desktop') {
      return await this.executeElectron(collection, operation);
    } else {
      return await this.executeWeb(collection, operation);
    }
  }

  /**
   * Execute multiple operations in a transaction
   * @param operations - Array of operations
   */
  async transaction(operations: Array<{ collection: string; operation: any }>): Promise<void> {
    if (this.mode === 'desktop') {
      return await this.transactionElectron(operations);
    } else {
      return await this.transactionWeb(operations);
    }
  }

  // ── Electron Mode (SQLite via IPC) ────────────────────────────────────────

  private async queryElectron<T>(collection: string, filter?: any): Promise<T[]> {
    const sql = this.buildSelectSQL(collection, filter);
    const params = this.buildSQLParams(filter);
    return await ipcQuery<T>(sql, params, { cache: true, ttl: 5000 });
  }

  private async executeElectron(collection: string, operation: any): Promise<any> {
    const { sql, params } = this.buildExecuteSQL(collection, operation);
    const result = await ipcExecute(sql, params);
    
    // TODO: Integrate LAN sync here
    // await this.syncToLAN(collection, operation);
    
    return result;
  }

  private async transactionElectron(operations: Array<{ collection: string; operation: any }>): Promise<void> {
    const sqlOperations = operations.map(op => {
      const { sql, params } = this.buildExecuteSQL(op.collection, op.operation);
      return { sql, params };
    });
    
    await ipcTransaction(sqlOperations);
    
    // TODO: Integrate LAN sync here
    // await this.syncTransactionToLAN(operations);
  }

  // ── Web Mode (localStorage) ────────────────────────────────────────────────

  private async queryWeb<T>(collection: string, filter?: any): Promise<T[]> {
    const key = this.getLocalStorageKey(collection);
    const data = localStorage.getItem(key);
    
    if (!data) return [];
    
    let items: T[] = JSON.parse(data);
    
    // Apply filter if provided
    if (filter) {
      items = items.filter(item => this.matchesFilter(item, filter));
    }
    
    return items;
  }

  private async executeWeb(collection: string, operation: any): Promise<any> {
    const key = this.getLocalStorageKey(collection);
    const data = localStorage.getItem(key);
    const items = data ? JSON.parse(data) : [];
    
    let result: any;
    
    switch (operation.type) {
      case 'insert':
        items.push(operation.data);
        result = operation.data;
        break;
        
      case 'update':
        const updateIndex = items.findIndex((item: any) => 
          this.matchesFilter(item, operation.filter)
        );
        if (updateIndex !== -1) {
          items[updateIndex] = { ...items[updateIndex], ...operation.data };
          result = items[updateIndex];
        }
        break;
        
      case 'delete':
        const deleteIndex = items.findIndex((item: any) => 
          this.matchesFilter(item, operation.filter)
        );
        if (deleteIndex !== -1) {
          result = items.splice(deleteIndex, 1)[0];
        }
        break;
    }
    
    localStorage.setItem(key, JSON.stringify(items));
    return result;
  }

  private async transactionWeb(operations: Array<{ collection: string; operation: any }>): Promise<void> {
    // In web mode, execute operations sequentially
    // (no true transaction support in localStorage)
    for (const op of operations) {
      await this.executeWeb(op.collection, op.operation);
    }
  }

  // ── SQL Building Helpers ───────────────────────────────────────────────────

  private buildSelectSQL(collection: string, filter?: any): string {
    let sql = `SELECT * FROM ${collection}`;
    
    if (filter) {
      const conditions = Object.keys(filter).map(key => `${key} = ?`);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }
    
    return sql;
  }

  private buildExecuteSQL(collection: string, operation: any): { sql: string; params: any[] } {
    switch (operation.type) {
      case 'insert':
        return this.buildInsertSQL(collection, operation.data);
      case 'update':
        return this.buildUpdateSQL(collection, operation.data, operation.filter);
      case 'delete':
        return this.buildDeleteSQL(collection, operation.filter);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  private buildInsertSQL(collection: string, data: any): { sql: string; params: any[] } {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${collection} (${keys.join(', ')}) VALUES (${placeholders})`;
    const params = keys.map(key => data[key]);
    return { sql, params };
  }

  private buildUpdateSQL(collection: string, data: any, filter: any): { sql: string; params: any[] } {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const whereClause = Object.keys(filter).map(key => `${key} = ?`).join(' AND ');
    const sql = `UPDATE ${collection} SET ${setClause} WHERE ${whereClause}`;
    const params = [...Object.values(data), ...Object.values(filter)];
    return { sql, params };
  }

  private buildDeleteSQL(collection: string, filter: any): { sql: string; params: any[] } {
    const whereClause = Object.keys(filter).map(key => `${key} = ?`).join(' AND ');
    const sql = `DELETE FROM ${collection} WHERE ${whereClause}`;
    const params = Object.values(filter);
    return { sql, params };
  }

  private buildSQLParams(filter?: any): any[] {
    if (!filter) return [];
    return Object.values(filter);
  }

  // ── Helper Methods ─────────────────────────────────────────────────────────

  private getLocalStorageKey(collection: string): string {
    return `homeopms_${collection}`;
  }

  private matchesFilter(item: any, filter: any): boolean {
    return Object.keys(filter).every(key => item[key] === filter[key]);
  }

  // ── LAN Sync Integration (TODO) ────────────────────────────────────────────

  private async syncToLAN(collection: string, operation: any): Promise<void> {
    // TODO: Implement LAN sync
    // This will integrate with existing src/lib/db-sync.ts
    console.log('[LAN Sync] TODO: Sync operation', { collection, operation });
  }

  private async syncTransactionToLAN(operations: Array<{ collection: string; operation: any }>): Promise<void> {
    // TODO: Implement LAN sync for transactions
    console.log('[LAN Sync] TODO: Sync transaction', { operations });
  }
}

// Export singleton instance
export const unifiedDb = new UnifiedDatabase();

// Export convenience methods
export const dbQuery = <T>(collection: string, filter?: any) => unifiedDb.query<T>(collection, filter);
export const dbExecute = (collection: string, operation: any) => unifiedDb.execute(collection, operation);
export const dbTransaction = (operations: Array<{ collection: string; operation: any }>) => unifiedDb.transaction(operations);
