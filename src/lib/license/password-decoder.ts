/**
 * License Password Decoder
 * Decodes and extracts data from offline license passwords
 */

import {
  PASSWORD_ENCODING,
  PASSWORD_SEPARATOR,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from './constants';

/**
 * Decoded password data structure
 */
export interface DecodedPassword {
  licenseKey: string;
  plan: string;
  maxMachines: number;
  expiryDate: string;
  signature: string;
}

/**
 * Decodes BASE64_URL_SAFE string back to original format
 * @param encoded - URL-safe base64 string
 * @returns Decoded string
 */
function fromBase64UrlSafe(encoded: string): string {
  // Add padding if needed
  let padded = encoded;
  const padding = 4 - (encoded.length % 4);
  if (padding !== 4) {
    padded += '='.repeat(padding);
  }

  // Replace URL-safe characters
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error('Invalid BASE64 encoding');
  }
}

/**
 * Decodes a license password and extracts all fields
 *
 * Format: BASE64_URL_SAFE(licenseKey|plan|maxMachines|expiryDate|signature)
 *
 * @param password - The encoded password
 * @returns Decoded password data
 *
 * @example
 * const decoded = decodePassword('QUJDMTIzWFlafDEafDEafDIwMjYxMjMxafDc2Y2...');
 * // Returns: {
 * //   licenseKey: 'ABC123XYZ',
 * //   plan: '1',
 * //   maxMachines: 1,
 * //   expiryDate: '20261231',
 * //   signature: '7cc6...'
 * // }
 *
 * @throws Error if password is invalid or corrupted
 */
export function decodePassword(password: string): DecodedPassword {
  // Validate password length
  if (!password || typeof password !== 'string') {
    throw new Error('Invalid password (must be a string)');
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Invalid password length (${password.length} chars, expected ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH})`
    );
  }

  // Decode from BASE64_URL_SAFE
  let decoded: string;
  try {
    decoded = fromBase64UrlSafe(password);
  } catch (error) {
    throw new Error(`Failed to decode password: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Split by separator
  const parts = decoded.split(PASSWORD_SEPARATOR);

  if (parts.length !== 5) {
    throw new Error(`Invalid password format (expected 5 parts, got ${parts.length})`);
  }

  const [licenseKey, plan, maxMachinesStr, expiryDate, signature] = parts;

  // Validate each part
  if (!licenseKey) {
    throw new Error('Invalid password: missing license key');
  }

  if (!plan) {
    throw new Error('Invalid password: missing plan type');
  }

  const maxMachines = parseInt(maxMachinesStr, 10);
  if (isNaN(maxMachines) || maxMachines < 1) {
    throw new Error('Invalid password: invalid maxMachines');
  }

  if (!expiryDate || !/^\d{8}$/.test(expiryDate)) {
    throw new Error('Invalid password: invalid expiry date format');
  }

  if (!signature || signature.length < 32) {
    throw new Error('Invalid password: invalid signature');
  }

  return {
    licenseKey,
    plan,
    maxMachines,
    expiryDate,
    signature,
  };
}

/**
 * Parses YYYYMMDD date string to Date object
 * @param dateStr - Date string in YYYYMMDD format
 * @returns Date object
 *
 * @example
 * const date = parseYYYYMMDD('20261231');
 * // Returns: Date object for December 31, 2026
 */
export function parseYYYYMMDD(dateStr: string): Date {
  if (!/^\d{8}$/.test(dateStr)) {
    throw new Error('Invalid date format (must be YYYYMMDD)');
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const day = parseInt(dateStr.substring(6, 8), 10);

  const date = new Date(year, month - 1, day);

  // Validate the date is valid
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Invalid date values');
  }

  return date;
}
