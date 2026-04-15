/**
 * Unified Database Client
 * Used by UI pages/components to read and write data.
 *
 * - In 'local' mode: delegates to LocalDatabase (localStorage/Electron) — unchanged behavior
 * - In 'server' mode: calls /api/data/:collection REST endpoints (server-side SQLite)
 *
 * Usage (same API in both modes):
 *   import { dbClient } from '@/lib/db/db-client';
 *   const patients = await dbClient.getAll('patients');
 *   await dbClient.create('patients', { id: '...', name: '...' });
 */

import { isServerDataMode } from './data-mode';

// ── Server mode helpers ────────────────────────────────────────────────────

async function apiFetch(method: string, collection: string, body?: unknown, params?: Record<string, string>) {
  let url = `/api/data/${collection}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Local mode helpers ─────────────────────────────────────────────────────

function getLocalDb() {
  // Dynamically import to avoid server-side issues
  // LocalDatabase is only available in browser context
  if (typeof window === 'undefined') return null;
  const { LocalDatabase } = require('./database');
  return LocalDatabase.getInstance();
}

// ── Unified client ─────────────────────────────────────────────────────────

export const dbClient = {
  async getAll<T>(collection: string): Promise<T[]> {
    if (isServerDataMode) {
      const res = await apiFetch('GET', collection);
      return res.data || [];
    }
    const db = getLocalDb();
    return db ? db.getAll<T>(collection) : [];
  },

  async create<T extends { id: string }>(collection: string, item: T): Promise<T> {
    if (isServerDataMode) {
      const res = await apiFetch('POST', collection, item);
      return res.data;
    }
    const db = getLocalDb();
    if (!db) throw new Error('Database not available');
    return db.create<T>(collection, item);
  },

  async update<T extends { id: string }>(collection: string, id: string, updates: Partial<T>): Promise<T | null> {
    if (isServerDataMode) {
      const res = await apiFetch('PUT', collection, { id, ...updates });
      return res.data;
    }
    const db = getLocalDb();
    if (!db) return null;
    return db.update<T>(collection, id, updates);
  },

  async delete(collection: string, id: string): Promise<void> {
    if (isServerDataMode) {
      await apiFetch('DELETE', collection, undefined, { id });
      return;
    }
    const db = getLocalDb();
    if (db) db.delete(collection, id);
  },

  async getById<T>(collection: string, id: string): Promise<T | null> {
    if (isServerDataMode) {
      const all = await this.getAll<T>(collection);
      return (all as any[]).find((item: any) => item.id === id) || null;
    }
    const db = getLocalDb();
    if (!db) return null;
    const all = db.getAll<T>(collection) as any[];
    return all.find((item: any) => item.id === id) || null;
  },

  async find<T>(collection: string, predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.getAll<T>(collection);
    return all.filter(predicate);
  },
};
