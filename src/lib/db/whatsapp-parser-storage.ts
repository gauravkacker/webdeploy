/**
 * WhatsApp Parser Storage
 * Stores and retrieves parsing logs
 */

import type { ParsingResult } from '../whatsapp-parser';
import type { ValidationResult } from '../whatsapp-validator';
import type { AppendResult } from '../google-sheets-service';

/**
 * Complete log entry for a parsing operation
 */
export interface ParsingLog {
  id: string;                       // Unique identifier
  timestamp: string;                // ISO timestamp
  message: string;                  // Original WhatsApp message
  result: ParsingResult;            // Parsing result
  validationResult?: ValidationResult;  // Validation result if parsing succeeded
  appendResult?: AppendResult;      // Append result if validation succeeded
  clinicId: string;                 // Clinic identifier for multi-clinic support
}

// Server-side in-memory fallback (used when localStorage is not available)
const serverMemoryLogs: Record<string, ParsingLog[]> = {};

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * Add a parsing log entry
 * @param log - The parsing log to add
 */
export function addParsingLog(log: ParsingLog): void {
  try {
    const logs = getParsingLogs(log.clinicId, MAX_LOGS_PER_CLINIC + 1);
    logs.unshift(log);
    const trimmedLogs = logs.slice(0, MAX_LOGS_PER_CLINIC);
    const key = getStorageKey(log.clinicId);

    if (isClient()) {
      localStorage.setItem(key, JSON.stringify(trimmedLogs));
    } else {
      serverMemoryLogs[key] = trimmedLogs;
    }
  } catch (error) {
    console.error('Error adding parsing log:', error);
  }
}

/**
 * Get parsing logs for a clinic
 * @param clinicId - The clinic identifier
 * @param limit - Maximum number of logs to retrieve (default: 20)
 * @returns Array of parsing logs
 */
export function getParsingLogs(clinicId: string, limit?: number): ParsingLog[] {
  try {
    const key = getStorageKey(clinicId);
    const maxLogs = limit || MAX_LOGS_PER_CLINIC;

    if (isClient()) {
      const data = localStorage.getItem(key);
      if (!data) return [];
      return (JSON.parse(data) as ParsingLog[]).slice(0, maxLogs);
    } else {
      return (serverMemoryLogs[key] || []).slice(0, maxLogs);
    }
  } catch (error) {
    console.error('Error getting parsing logs:', error);
    return [];
  }
}

/**
 * Clear all parsing logs for a clinic
 * @param clinicId - The clinic identifier
 */
export function clearParsingLogs(clinicId: string): void {
  try {
    const key = getStorageKey(clinicId);
    if (isClient()) {
      localStorage.removeItem(key);
    } else {
      delete serverMemoryLogs[key];
    }
  } catch (error) {
    console.error('Error clearing parsing logs:', error);
  }
}

/**
 * Get a specific parsing log by ID
 * @param clinicId - The clinic identifier
 * @param logId - The log identifier
 * @returns The parsing log or undefined
 */
export function getParsingLogById(clinicId: string, logId: string): ParsingLog | undefined {
  try {
    const logs = getParsingLogs(clinicId);
    return logs.find(log => log.id === logId);
  } catch (error) {
    console.error('Error getting parsing log by ID:', error);
    return undefined;
  }
}

/**
 * Generate a unique ID for a parsing log
 * @returns Unique identifier
 */
export function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the storage key for a clinic's parsing logs
 * @param clinicId - The clinic identifier
 * @returns Storage key
 */
export function getStorageKey(clinicId: string): string {
  return `whatsappParserLogs_${clinicId}`;
}

/**
 * Maximum number of logs to keep per clinic
 */
export const MAX_LOGS_PER_CLINIC = 20;
