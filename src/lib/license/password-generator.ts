/**
 * License Password Generator
 * Generates compact, offline-capable license passwords
 */

import crypto from 'crypto';
import {
  HMAC_SECRET,
  PASSWORD_ENCODING,
  EXPIRY_FORMAT,
  SIGNATURE_ALGORITHM,
  PASSWORD_SEPARATOR,
  MAX_PASSWORD_LENGTH,
} from './constants';

/**
 * Generates HMAC-SHA256 signature for password integrity
 * @param licenseKey - The license key
 * @param plan - Plan type (1=single-pc, 2=multi-pc-5, etc.)
 * @param maxMachines - Maximum number of machines
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @returns Hex-encoded signature
 */
function generateSignature(
  licenseKey: string,
  plan: string,
  maxMachines: number,
  expiryDate: string
): string {
  const data = `${licenseKey}${PASSWORD_SEPARATOR}${plan}${PASSWORD_SEPARATOR}${maxMachines}${PASSWORD_SEPARATOR}${expiryDate}`;
  const hmac = crypto.createHmac(SIGNATURE_ALGORITHM, HMAC_SECRET);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Encodes string to BASE64_URL_SAFE format
 * Removes padding and replaces +, / with -, _
 * @param data - Data to encode
 * @returns URL-safe base64 string
 */
function toBase64UrlSafe(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generates a compact offline license password
 *
 * Format: BASE64_URL_SAFE(licenseKey|plan|maxMachines|expiryDate|signature)
 *
 * @param licenseKey - The license key (e.g., "ABC123XYZ")
 * @param plan - Plan type: "1"=single-pc, "2"=multi-pc-5, "3"=multi-pc-10, "4"=unlimited
 * @param maxMachines - Maximum number of machines allowed (1, 5, 10, etc.)
 * @param expiryDate - Expiry date in YYYYMMDD format (e.g., "20261231")
 * @returns Generated password (~60-80 characters)
 *
 * @example
 * const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
 * // Returns: "QUJDMTIzWFlafDEafDEafDIwMjYxMjMxafDc2Y2..."
 *
 * @throws Error if inputs are invalid
 */
export function generatePassword(
  licenseKey: string,
  plan: string,
  maxMachines: number,
  expiryDate: string
): string {
  // Validate inputs
  if (!licenseKey || typeof licenseKey !== 'string') {
    throw new Error('Invalid license key');
  }
  if (!plan || typeof plan !== 'string') {
    throw new Error('Invalid plan type');
  }
  if (!Number.isInteger(maxMachines) || maxMachines < 1) {
    throw new Error('Invalid maxMachines (must be positive integer)');
  }
  if (!expiryDate || !/^\d{8}$/.test(expiryDate)) {
    throw new Error('Invalid expiry date (must be YYYYMMDD format)');
  }

  // Generate signature
  const signature = generateSignature(licenseKey, plan, maxMachines, expiryDate);

  // Build password data
  const passwordData = `${licenseKey}${PASSWORD_SEPARATOR}${plan}${PASSWORD_SEPARATOR}${maxMachines}${PASSWORD_SEPARATOR}${expiryDate}${PASSWORD_SEPARATOR}${signature}`;

  // Encode to BASE64_URL_SAFE
  const password = toBase64UrlSafe(passwordData);

  // Validate length
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Generated password exceeds maximum length (${password.length} > ${MAX_PASSWORD_LENGTH})`);
  }

  return password;
}

/**
 * Generates expiry date string in YYYYMMDD format
 * @param daysFromNow - Number of days from today (default: 365 = 1 year)
 * @returns Expiry date in YYYYMMDD format
 *
 * @example
 * const expiry = generateExpiryDate(365); // 1 year from today
 * // Returns: "20270328"
 */
export function generateExpiryDate(daysFromNow: number = 365): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * Formats a date object to YYYYMMDD format
 * @param date - Date to format
 * @returns Formatted date string
 *
 * @example
 * const expiry = formatDateToYYYYMMDD(new Date('2026-12-31'));
 * // Returns: "20261231"
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}
