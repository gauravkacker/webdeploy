/**
 * Remaining Days Calculator
 * Calculates remaining days until license expiration with edge case handling
 */

export interface RemainingDaysInfo {
  remainingDays: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiresAt: Date;
}

/**
 * Calculate remaining days from license expiration
 * Returns non-negative integer representing days remaining
 * 
 * Edge cases:
 * - Expired license (past date) → returns 0
 * - Future expiration → returns positive days
 * - Today expiration → returns 0
 * - Invalid dates → throws error
 * 
 * @param expiresAt - License expiration date
 * @returns Number of days remaining (non-negative integer)
 * @throws Error if expiresAt is invalid
 */
export function calculateRemainingDays(expiresAt: Date | string): number {
  // Validate input
  if (!expiresAt) {
    throw new Error('Expiration date is required');
  }

  // Convert to Date if string
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

  // Validate date
  if (isNaN(expirationDate.getTime())) {
    throw new Error('Invalid expiration date');
  }

  // Calculate difference in milliseconds
  const now = new Date();
  const diffTime = expirationDate.getTime() - now.getTime();

  // Convert to days (ceiling to count partial days)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Return non-negative value (0 for expired licenses)
  return Math.max(0, diffDays);
}

/**
 * Get detailed remaining days information
 * Includes expiration status and warning flags
 * 
 * @param expiresAt - License expiration date
 * @param warningThreshold - Days before expiration to trigger warning (default: 30)
 * @returns Detailed information about remaining days
 * @throws Error if expiresAt is invalid
 */
export function getRemainingDaysInfo(
  expiresAt: Date | string,
  warningThreshold: number = 30
): RemainingDaysInfo {
  // Validate input
  if (!expiresAt) {
    throw new Error('Expiration date is required');
  }

  // Convert to Date if string
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

  // Validate date
  if (isNaN(expirationDate.getTime())) {
    throw new Error('Invalid expiration date');
  }

  // Calculate remaining days
  const remainingDays = calculateRemainingDays(expirationDate);

  // Determine expiration status
  const isExpired = remainingDays === 0;
  const isExpiringSoon = !isExpired && remainingDays <= warningThreshold;

  return {
    remainingDays,
    isExpired,
    isExpiringSoon,
    expiresAt: expirationDate,
  };
}

/**
 * Check if license is expired
 * 
 * @param expiresAt - License expiration date
 * @returns True if license is expired
 */
export function isLicenseExpired(expiresAt: Date | string): boolean {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);
    return remainingDays === 0;
  } catch {
    return true; // Treat invalid dates as expired
  }
}

/**
 * Check if license is expiring soon
 * 
 * @param expiresAt - License expiration date
 * @param warningThreshold - Days before expiration to trigger warning (default: 30)
 * @returns True if license is expiring soon
 */
export function isLicenseExpiringSoon(
  expiresAt: Date | string,
  warningThreshold: number = 30
): boolean {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);
    return remainingDays > 0 && remainingDays <= warningThreshold;
  } catch {
    return false;
  }
}

/**
 * Format remaining days as human-readable string
 * 
 * @param expiresAt - License expiration date
 * @returns Human-readable string (e.g., "30 days", "1 day", "Expired")
 */
export function formatRemainingDays(expiresAt: Date | string): string {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);

    if (remainingDays === 0) {
      return 'Expired';
    }

    if (remainingDays === 1) {
      return '1 day';
    }

    return `${remainingDays} days`;
  } catch {
    return 'Invalid date';
  }
}
