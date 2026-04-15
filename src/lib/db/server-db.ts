/**
 * Server-Side SQLite Database
 * Used when NEXT_PUBLIC_DATA_MODE=server
 * Stores data in a SQLite file on the Oracle Cloud server filesystem.
 * This file is completely isolated from the localStorage/Electron database.ts
 */

import * as path from 'path';
import * as fs from 'fs';

// Database file path on the server
const DB_DIR = process.env.SERVER_DB_DIR || path.join(process.cwd(), '.data');
const DB_PATH = path.join(DB_DIR, 'database.db');

let db: any = null;
let SQL: any = null;

async function getDb() {
  if (db) return db;

  // Ensure directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Dynamically import sql.js (server-side only)
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    initSchema();
    saveDb();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS store (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_collection ON store(collection);
  `);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function serverGetAll<T>(collection: string): Promise<T[]> {
  const database = await getDb();
  const stmt = database.prepare('SELECT data FROM store WHERE collection = ?');
  stmt.bind([collection]);
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { data: string };
    results.push(JSON.parse(row.data) as T);
  }
  stmt.free();
  return results;
}

export async function serverCreate<T extends { id: string }>(collection: string, item: T): Promise<T> {
  const database = await getDb();
  database.run(
    'INSERT OR REPLACE INTO store (collection, id, data, updated_at) VALUES (?, ?, ?, strftime(\'%s\',\'now\'))',
    [collection, item.id, JSON.stringify(item)]
  );
  saveDb();
  return item;
}

export async function serverUpdate<T extends { id: string }>(collection: string, id: string, updates: Partial<T>): Promise<T | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT data FROM store WHERE collection = ? AND id = ?');
  stmt.bind([collection, id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { data: string };
  stmt.free();
  const existing = JSON.parse(row.data) as T;
  const updated = { ...existing, ...updates };
  database.run(
    'UPDATE store SET data = ?, updated_at = strftime(\'%s\',\'now\') WHERE collection = ? AND id = ?',
    [JSON.stringify(updated), collection, id]
  );
  saveDb();
  return updated;
}

export async function serverDelete(collection: string, id: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM store WHERE collection = ? AND id = ?', [collection, id]);
  saveDb();
}

export async function serverGetById<T>(collection: string, id: string): Promise<T | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT data FROM store WHERE collection = ? AND id = ?');
  stmt.bind([collection, id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { data: string };
  stmt.free();
  return JSON.parse(row.data) as T;
}
