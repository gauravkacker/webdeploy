import crypto from 'crypto';

// Default admin credentials - stored as hash for security
const DEFAULT_ADMIN_USERNAME = 'licensing';
const DEFAULT_ADMIN_PASSWORD_HASH = hashPassword('Licensing@1983');

export function hashPassword(password: string): string {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function verifyAdminCredentials(
  username: string,
  password: string,
  storedHash: string
): boolean {
  if (username !== DEFAULT_ADMIN_USERNAME) {
    return false;
  }

  const passwordHash = hashPassword(password);
  return passwordHash === storedHash;
}

export { DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD_HASH };
