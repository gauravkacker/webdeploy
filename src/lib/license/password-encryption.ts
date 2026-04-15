/**
 * Simple password encryption/decryption for storing generated passwords
 * Uses a simple XOR-based encryption with a fixed key
 * Note: This is for obfuscation only, not cryptographic security
 */

const ENCRYPTION_KEY = 'license-password-encryption-key-2024';

/**
 * Encrypt password for storage
 */
export function encryptPassword(password: string): string {
  let encrypted = '';
  for (let i = 0; i < password.length; i++) {
    const charCode = password.charCodeAt(i);
    const keyCharCode = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
    encrypted += String.fromCharCode(charCode ^ keyCharCode);
  }
  // Convert to base64 for safe storage
  return Buffer.from(encrypted).toString('base64');
}

/**
 * Decrypt password from storage
 */
export function decryptPassword(encrypted: string): string {
  try {
    // Convert from base64
    const decrypted = Buffer.from(encrypted, 'base64').toString('binary');
    let password = '';
    for (let i = 0; i < decrypted.length; i++) {
      const charCode = decrypted.charCodeAt(i);
      const keyCharCode = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      password += String.fromCharCode(charCode ^ keyCharCode);
    }
    return password;
  } catch (error) {
    console.error('Failed to decrypt password:', error);
    return '';
  }
}
