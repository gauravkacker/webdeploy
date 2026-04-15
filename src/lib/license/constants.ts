/**
 * License Password Constants
 * Used for offline password-based license activation
 */

/**
 * HMAC Secret Key for password signature generation
 * This key is used to sign passwords and prevent tampering
 * IMPORTANT: Never change this value after deployment
 * Generated: 2026-03-28
 */
export const HMAC_SECRET = 'a7f3k9m2x5q8w1p4r6t9y2u5i8o1l4e7';

/**
 * Password encoding format
 * BASE64_URL_SAFE uses URL-safe characters (no +, /, =)
 */
export const PASSWORD_ENCODING = 'base64url';

/**
 * Expiry date format for passwords
 * Format: YYYYMMDD (8 characters)
 * Example: 20261231 = December 31, 2026
 */
export const EXPIRY_FORMAT = 'YYYYMMDD';

/**
 * HMAC signature algorithm
 * Used for password integrity verification
 */
export const SIGNATURE_ALGORITHM = 'sha256';

/**
 * Password structure (decoded):
 * licenseKey|plan|maxMachines|expiryDate|signature
 *
 * Example:
 * ABC123XYZ|1|1|20261231|<64-char-hex-signature>
 *
 * Then encoded as BASE64_URL_SAFE to create the final password
 */
export const PASSWORD_SEPARATOR = '|';

/**
 * Plan type constants
 * Used in password to identify license type
 */
export const PLAN_TYPES = {
  SINGLE_PC: '1',
  MULTI_PC_5: '2',
  MULTI_PC_10: '3',
  MULTI_PC_UNLIMITED: '4',
} as const;

/**
 * Maximum password length (for validation)
 * Passwords should be ~60-80 characters
 */
export const MAX_PASSWORD_LENGTH = 150;

/**
 * Minimum password length (for validation)
 */
export const MIN_PASSWORD_LENGTH = 40;
