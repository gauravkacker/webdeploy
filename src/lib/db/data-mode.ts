/**
 * Data Mode Configuration
 * Controls where patient data is stored.
 *
 * NEXT_PUBLIC_DATA_MODE=local  → localStorage / Electron SQLite (default, current behavior)
 * NEXT_PUBLIC_DATA_MODE=server → SQLite file on Oracle Cloud server (server-side)
 */

export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE || 'local';

export const isServerDataMode = DATA_MODE === 'server';
export const isLocalDataMode = !isServerDataMode;
