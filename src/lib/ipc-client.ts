/**
 * IPC Client - Frontend interface for Electron IPC communication
 * Falls back gracefully when running in browser (npm run dev)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Type definitions ───────────────────────────────────────────────────────

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface DatabaseStatus {
  connected: boolean;
  version: string;
  path: string;
  size?: number;
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'error' | 'success';
  lastSync: string | null;
  error: string | null;
  pendingChanges: number;
}

export interface Backup {
  id: string;
  label: string;
  filePath: string;
  createdAt: string;
  size: number;
}

// ── Cache management ───────────────────────────────────────────────────────

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5000; // 5 seconds default

  private getCacheKey(sql: string, params?: any[]): string {
    return JSON.stringify({ sql, params });
  }

  get<T>(sql: string, params?: any[]): T[] | null {
    const key = this.getCacheKey(sql, params);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T[];
  }

  set<T>(sql: string, params: any[] | undefined, data: T[], ttl?: number): void {
    const key = this.getCacheKey(sql, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    // Invalidate entries matching pattern (table name)
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const queryCache = new QueryCache();

// ── Electron detection ─────────────────────────────────────────────────────

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

// ── Core IPC functions ─────────────────────────────────────────────────────

export async function ipcQuery<T = any>(
  sql: string, 
  params?: any[], 
  options?: { cache?: boolean; ttl?: number }
): Promise<T[]> {
  if (!isElectron()) return [];
  
  // Check cache if enabled
  if (options?.cache) {
    const cached = queryCache.get<T>(sql, params);
    if (cached) return cached;
  }
  
  const res = await (window as any).electronAPI.dbQuery(sql, params);
  if (!res.success) throw new Error(res.error);
  
  const data = res.data as T[];
  
  // Store in cache if enabled
  if (options?.cache) {
    queryCache.set(sql, params, data, options.ttl);
  }
  
  return data;
}

export async function ipcExecute(sql: string, params?: any[]): Promise<RunResult> {
  if (!isElectron()) return { changes: 0, lastInsertRowid: 0 };
  
  const res = await (window as any).electronAPI.dbExecute(sql, params);
  if (!res.success) throw new Error(res.error);
  
  // Invalidate cache for affected table
  const tableName = extractTableName(sql);
  if (tableName) {
    queryCache.invalidate(tableName);
  }
  
  return res.data as RunResult;
}

function extractTableName(sql: string): string | null {
  const match = sql.match(/(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return match ? match[1] : null;
}

export async function ipcTransaction(operations: { sql: string; params?: any[] }[]): Promise<void> {
  if (!isElectron()) return;
  
  const res = await (window as any).electronAPI.dbTransaction(operations);
  if (!res.success) throw new Error(res.error);
  
  // Invalidate cache for all affected tables
  const tables = new Set<string>();
  operations.forEach(op => {
    const table = extractTableName(op.sql);
    if (table) tables.add(table);
  });
  
  tables.forEach(table => queryCache.invalidate(table));
}

export function clearCache(pattern?: string): void {
  queryCache.invalidate(pattern);
}

export async function ipcDbStatus(): Promise<DatabaseStatus | null> {
  if (!isElectron()) return null;
  const res = await (window as any).electronAPI.dbStatus();
  if (!res.success) return null;
  return res.data as DatabaseStatus;
}

// ── React Hooks ────────────────────────────────────────────────────────────

export function useDatabase() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isElectron()) return;
    setIsLoading(true);
    ipcDbStatus()
      .then(status => setIsConnected(status?.connected ?? false))
      .catch(err => setError(err))
      .finally(() => setIsLoading(false));
  }, []);

  const query = useCallback(async <T = any>(
    sql: string, 
    params?: any[], 
    options?: { cache?: boolean; ttl?: number }
  ): Promise<T[]> => {
    setIsLoading(true);
    try {
      setError(null);
      return await ipcQuery<T>(sql, params, options);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const execute = useCallback(async (sql: string, params?: any[]): Promise<RunResult> => {
    setIsLoading(true);
    try {
      setError(null);
      return await ipcExecute(sql, params);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const transaction = useCallback(async (ops: { sql: string; params?: any[] }[]): Promise<void> => {
    setIsLoading(true);
    try {
      setError(null);
      return await ipcTransaction(ops);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { query, execute, transaction, isConnected, isLoading, error };
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({
    status: 'idle',
    lastSync: null,
    error: null,
    pendingChanges: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isElectron()) return;
    setIsLoading(true);
    try {
      const res = await (window as any).electronAPI.syncStatus();
      if (res.success) {
        setStatus(res.data);
        setError(null);
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const startSync = useCallback(async () => {
    if (!isElectron()) return;
    setIsLoading(true);
    try {
      await (window as any).electronAPI.syncStart();
      await refresh();
      setError(null);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const retry = useCallback(async () => {
    setError(null);
    await refresh();
  }, [refresh]);

  return { status, startSync, refresh, retry, isLoading, error };
}

export function useBackup() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const listBackups = useCallback(async () => {
    if (!isElectron()) return;
    setIsLoading(true);
    try {
      const res = await (window as any).electronAPI.backupList();
      if (res.success) setBackups(res.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { listBackups(); }, [listBackups]);

  const createBackup = useCallback(async (label?: string) => {
    if (!isElectron()) return;
    setIsLoading(true);
    try {
      const res = await (window as any).electronAPI.backupCreate(label);
      if (!res.success) throw new Error(res.error);
      await listBackups();
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [listBackups]);

  const restoreBackup = useCallback(async (id: string) => {
    if (!isElectron()) return;
    setIsLoading(true);
    try {
      const res = await (window as any).electronAPI.backupRestore(id);
      if (!res.success) throw new Error(res.error);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { backups, createBackup, restoreBackup, listBackups, isLoading, error };
}
