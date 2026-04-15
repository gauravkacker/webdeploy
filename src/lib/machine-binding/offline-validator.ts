/**
 * Offline Validator
 * Validates licenses without server communication
 * Supports offline operation for clinic environments
 */

import fs from 'fs';
import path from 'path';
import { validateLicFileForMachine, getRemainingDays } from './lic-file-manager';
import { LicenseData } from './lic-file';

export interface OfflineValidationResult {
  valid: boolean;
  cached: boolean;
  licenseData?: LicenseData;
  remainingDays?: number;
  error?: string;
}

export interface ValidationCache {
  licenseData: LicenseData;
  validatedAt: Date;
  machineId: string;
}

// Default cache directory (can be overridden)
const DEFAULT_CACHE_DIR = '.license-cache';

/**
 * Get cache file path
 */
function getCacheFilePath(cacheDir: string = DEFAULT_CACHE_DIR): string {
  return path.join(cacheDir, 'validation-cache.json');
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(cacheDir: string = DEFAULT_CACHE_DIR): void {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

/**
 * Load validation cache from disk
 */
function loadValidationCache(cacheDir: string = DEFAULT_CACHE_DIR): ValidationCache | null {
  try {
    const cacheFile = getCacheFilePath(cacheDir);
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const cacheContent = fs.readFileSync(cacheFile, 'utf-8');
    const cache = JSON.parse(cacheContent) as ValidationCache;

    // Convert date strings back to Date objects
    cache.validatedAt = new Date(cache.validatedAt);
    cache.licenseData.expiresAt = new Date(cache.licenseData.expiresAt);
    cache.licenseData.createdAt = new Date(cache.licenseData.createdAt);

    return cache;
  } catch (error) {
    console.error('Error loading validation cache:', error);
    return null;
  }
}

/**
 * Save validation cache to disk
 */
function saveValidationCache(
  cache: ValidationCache,
  cacheDir: string = DEFAULT_CACHE_DIR
): boolean {
  try {
    ensureCacheDir(cacheDir);
    const cacheFile = getCacheFilePath(cacheDir);
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving validation cache:', error);
    return false;
  }
}

/**
 * Clear validation cache
 */
export function clearValidationCache(cacheDir: string = DEFAULT_CACHE_DIR): boolean {
  try {
    const cacheFile = getCacheFilePath(cacheDir);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
    return true;
  } catch (error) {
    console.error('Error clearing validation cache:', error);
    return false;
  }
}

/**
 * Validate license offline using .LIC file
 * Uses local .LIC file and cached validation data
 */
export function validateOffline(
  licFileBuffer: Buffer,
  currentMachineId: string,
  encryptionKey: Buffer,
  cacheDir: string = DEFAULT_CACHE_DIR
): OfflineValidationResult {
  try {
    // First, try to validate using the .LIC file directly
    const validationResult = validateLicFileForMachine(
      licFileBuffer,
      currentMachineId,
      encryptionKey
    );

    if (validationResult.valid && validationResult.data) {
      // Cache the validation result
      const cache: ValidationCache = {
        licenseData: validationResult.data,
        validatedAt: new Date(),
        machineId: currentMachineId,
      };

      saveValidationCache(cache, cacheDir);

      return {
        valid: true,
        cached: false,
        licenseData: validationResult.data,
        remainingDays: getRemainingDays(validationResult.data.expiresAt),
      };
    }

    // If .LIC file validation fails, try to use cached validation
    const cache = loadValidationCache(cacheDir);

    if (cache) {
      // Verify cache is for the same machine
      if (cache.machineId !== currentMachineId) {
        return {
          valid: false,
          cached: false,
          error: 'Cached license is for a different Machine ID',
        };
      }

      // Check if cached license is still valid
      const remainingDays = getRemainingDays(cache.licenseData.expiresAt);

      if (remainingDays > 0) {
        return {
          valid: true,
          cached: true,
          licenseData: cache.licenseData,
          remainingDays,
        };
      } else {
        return {
          valid: false,
          cached: true,
          error: 'Cached license has expired',
        };
      }
    }

    // No valid .LIC file and no cache
    return {
      valid: false,
      cached: false,
      error: validationResult.error || 'License validation failed',
    };
  } catch (error) {
    return {
      valid: false,
      cached: false,
      error: error instanceof Error ? error.message : 'Offline validation failed',
    };
  }
}

/**
 * Cache validation result
 * Stores license data for offline use
 */
export function cacheValidation(
  licenseData: LicenseData,
  machineId: string,
  cacheDir: string = DEFAULT_CACHE_DIR
): boolean {
  try {
    const cache: ValidationCache = {
      licenseData,
      validatedAt: new Date(),
      machineId,
    };

    return saveValidationCache(cache, cacheDir);
  } catch (error) {
    console.error('Error caching validation:', error);
    return false;
  }
}

/**
 * Get cached validation data
 */
export function getCachedValidation(
  cacheDir: string = DEFAULT_CACHE_DIR
): ValidationCache | null {
  return loadValidationCache(cacheDir);
}

/**
 * Check if cached validation is still valid
 */
export function isCachedValidationValid(
  cacheDir: string = DEFAULT_CACHE_DIR
): boolean {
  try {
    const cache = loadValidationCache(cacheDir);

    if (!cache) {
      return false;
    }

    // Check if license has expired
    const remainingDays = getRemainingDays(cache.licenseData.expiresAt);
    return remainingDays > 0;
  } catch (error) {
    console.error('Error checking cached validation:', error);
    return false;
  }
}

/**
 * Get cache age in seconds
 */
export function getCacheAge(cacheDir: string = DEFAULT_CACHE_DIR): number | null {
  try {
    const cache = loadValidationCache(cacheDir);

    if (!cache) {
      return null;
    }

    const now = new Date();
    const ageMs = now.getTime() - cache.validatedAt.getTime();
    return Math.floor(ageMs / 1000);
  } catch (error) {
    console.error('Error getting cache age:', error);
    return null;
  }
}

/**
 * Validate license with fallback to cache
 * Tries online validation first, falls back to cache if offline
 */
export function validateWithFallback(
  licFileBuffer: Buffer | null,
  currentMachineId: string,
  encryptionKey: Buffer,
  cacheDir: string = DEFAULT_CACHE_DIR
): OfflineValidationResult {
  try {
    // If .LIC file is available, try to validate it
    if (licFileBuffer) {
      const result = validateOffline(licFileBuffer, currentMachineId, encryptionKey, cacheDir);

      if (result.valid) {
        return result;
      }
    }

    // Fall back to cache
    const cache = loadValidationCache(cacheDir);

    if (cache) {
      // Verify cache is for the same machine
      if (cache.machineId !== currentMachineId) {
        return {
          valid: false,
          cached: false,
          error: 'Cached license is for a different Machine ID',
        };
      }

      // Check if cached license is still valid
      const remainingDays = getRemainingDays(cache.licenseData.expiresAt);

      if (remainingDays > 0) {
        return {
          valid: true,
          cached: true,
          licenseData: cache.licenseData,
          remainingDays,
        };
      } else {
        return {
          valid: false,
          cached: true,
          error: 'Cached license has expired',
        };
      }
    }

    return {
      valid: false,
      cached: false,
      error: 'No valid license or cache found',
    };
  } catch (error) {
    return {
      valid: false,
      cached: false,
      error: error instanceof Error ? error.message : 'Validation with fallback failed',
    };
  }
}
