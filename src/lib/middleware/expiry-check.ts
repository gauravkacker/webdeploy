/**
 * Expiry Check Middleware
 * Checks license expiration on each API call
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectExpiry, isExpiringSoon, getExpiryWarning } from '@/lib/machine-binding/expiry-detector';
import { isReadOnlyMode } from '@/lib/machine-binding/read-only-mode';

export interface ExpiryCheckOptions {
  daysThreshold?: number;
  skipReadOnlyCheck?: boolean;
}

/**
 * Check license expiration for API requests
 * Returns 403 if license is expired and operation is not allowed
 * Adds expiry warning header if license is expiring soon
 * 
 * @param expiresAt - License expiration date
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param options - Optional configuration
 * @returns NextResponse with error or null if check passes
 */
export function checkExpiryForRequest(
  expiresAt: Date | string | null | undefined,
  method: string,
  options: ExpiryCheckOptions = {}
): NextResponse | null {
  const { daysThreshold = 30, skipReadOnlyCheck = false } = options;

  // Handle missing expiration date
  if (!expiresAt) {
    if (method !== 'GET' && !skipReadOnlyCheck) {
      return NextResponse.json(
        {
          error: 'No valid license found',
          message: 'Application is in read-only mode. Please contact your administrator.',
          code: 'LICENSE_MISSING',
        },
        { status: 403 }
      );
    }
    return null;
  }

  try {
    const isExpired = detectExpiry(expiresAt);

    // Block write operations if license is expired
    if (isExpired && method !== 'GET' && !skipReadOnlyCheck) {
      return NextResponse.json(
        {
          error: 'License expired',
          message: 'Your license has expired. Application is in read-only mode. Please renew your license to continue.',
          code: 'LICENSE_EXPIRED',
          expiresAt: typeof expiresAt === 'string' ? expiresAt : expiresAt.toISOString(),
        },
        { status: 403 }
      );
    }

    // Check if read-only mode is active (from other sources)
    if (isReadOnlyMode() && method !== 'GET' && !skipReadOnlyCheck) {
      return NextResponse.json(
        {
          error: 'Read-only mode active',
          message: 'Application is in read-only mode. Write operations are not allowed.',
          code: 'READ_ONLY_MODE',
        },
        { status: 403 }
      );
    }

    return null; // Check passed
  } catch (error) {
    // On error, block write operations as a safety measure
    if (method !== 'GET' && !skipReadOnlyCheck) {
      return NextResponse.json(
        {
          error: 'License validation failed',
          message: 'Unable to validate license. Application is in read-only mode.',
          code: 'LICENSE_VALIDATION_ERROR',
        },
        { status: 403 }
      );
    }
    return null;
  }
}

/**
 * Get expiry warning header for API responses
 * Returns header object if warning should be displayed
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns Header object or null
 */
export function getExpiryWarningHeader(
  expiresAt: Date | string | null | undefined,
  daysThreshold: number = 30
): Record<string, string> | null {
  if (!expiresAt) {
    return null;
  }

  try {
    const expiringSoon = isExpiringSoon(expiresAt, daysThreshold);

    if (expiringSoon) {
      const warning = getExpiryWarning(expiresAt);
      if (warning) {
        return {
          'X-License-Warning': warning,
          'X-License-Expiring': 'true',
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Add expiry warning headers to response
 * 
 * @param response - NextResponse to add headers to
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns Modified response with headers
 */
export function addExpiryWarningHeaders(
  response: NextResponse,
  expiresAt: Date | string | null | undefined,
  daysThreshold: number = 30
): NextResponse {
  const headers = getExpiryWarningHeader(expiresAt, daysThreshold);

  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

/**
 * Middleware wrapper for API routes
 * Checks expiration and adds warning headers
 * 
 * @param handler - API route handler
 * @param getLicenseExpiry - Function to get license expiration date
 * @param options - Optional configuration
 * @returns Wrapped handler
 */
export function withExpiryCheck(
  handler: (req: NextRequest) => Promise<NextResponse>,
  getLicenseExpiry: (req: NextRequest) => Promise<Date | string | null>,
  options: ExpiryCheckOptions = {}
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const expiresAt = await getLicenseExpiry(req);
    const method = req.method || 'GET';

    // Check expiry
    const expiryError = checkExpiryForRequest(expiresAt, method, options);
    if (expiryError) {
      return expiryError;
    }

    // Execute handler
    const response = await handler(req);

    // Add warning headers
    return addExpiryWarningHeaders(response, expiresAt, options.daysThreshold);
  };
}

/**
 * Check if operation is allowed based on license expiry
 * 
 * @param expiresAt - License expiration date
 * @param operation - Operation type ('read' | 'write' | 'export')
 * @returns True if operation is allowed
 */
export function isOperationAllowedWithExpiry(
  expiresAt: Date | string | null | undefined,
  operation: 'read' | 'write' | 'export'
): boolean {
  if (!expiresAt) {
    return operation === 'read' || operation === 'export';
  }

  try {
    const isExpired = detectExpiry(expiresAt);

    if (isExpired) {
      // In expired state, only read and export are allowed
      return operation === 'read' || operation === 'export';
    }

    // License is valid, all operations allowed
    return true;
  } catch {
    // On error, only allow read and export
    return operation === 'read' || operation === 'export';
  }
}
