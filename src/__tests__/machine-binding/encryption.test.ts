/**
 * Unit Tests for Encryption Utilities
 * Tests AES-256-GCM encryption/decryption and integrity verification
 */

import crypto from 'crypto';
import {
  generateEncryptionKey,
  deriveKeyFromPassphrase,
  encrypt,
  decrypt,
  encryptToBase64,
  decryptFromBase64,
  generateHmac,
  verifyHmac,
  generateChecksum,
  verifyChecksum,
} from '@/lib/machine-binding/encryption';

describe('Encryption Utilities', () => {
  describe('generateEncryptionKey', () => {
    it('should generate a 32-byte encryption key', () => {
      const key = generateEncryptionKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should generate different keys on each call', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toEqual(key2);
    });

    it('should generate cryptographically secure keys', () => {
      const keys = Array.from({ length: 10 }, () => generateEncryptionKey());

      // All keys should be unique
      const uniqueKeys = new Set(keys.map((k) => k.toString('hex')));
      expect(uniqueKeys.size).toBe(10);
    });
  });

  describe('deriveKeyFromPassphrase', () => {
    it('should derive a 32-byte key from passphrase', () => {
      const result = deriveKeyFromPassphrase('test-passphrase');

      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
      expect(result.salt).toBeInstanceOf(Buffer);
      expect(result.salt.length).toBe(16);
    });

    it('should generate consistent key for same passphrase and salt', () => {
      const passphrase = 'test-passphrase';
      const salt = Buffer.from('fixed-salt-value');

      const result1 = deriveKeyFromPassphrase(passphrase, salt);
      const result2 = deriveKeyFromPassphrase(passphrase, salt);

      expect(result1.key).toEqual(result2.key);
      expect(result1.salt).toEqual(result2.salt);
    });

    it('should generate different keys for different passphrases', () => {
      const salt = Buffer.from('fixed-salt-value');

      const result1 = deriveKeyFromPassphrase('passphrase1', salt);
      const result2 = deriveKeyFromPassphrase('passphrase2', salt);

      expect(result1.key).not.toEqual(result2.key);
    });

    it('should generate different keys for different salts', () => {
      const passphrase = 'test-passphrase';
      const salt1 = Buffer.from('salt-value-1');
      const salt2 = Buffer.from('salt-value-2');

      const result1 = deriveKeyFromPassphrase(passphrase, salt1);
      const result2 = deriveKeyFromPassphrase(passphrase, salt2);

      expect(result1.key).not.toEqual(result2.key);
    });

    it('should handle empty passphrase', () => {
      const result = deriveKeyFromPassphrase('');

      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
    });

    it('should handle very long passphrase', () => {
      const longPassphrase = 'a'.repeat(1000);
      const result = deriveKeyFromPassphrase(longPassphrase);

      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
    });
  });

  describe('encrypt and decrypt', () => {
    let encryptionKey: Buffer;

    beforeEach(() => {
      encryptionKey = generateEncryptionKey();
    });

    it('should encrypt and decrypt data successfully', () => {
      const originalData = Buffer.from('Hello, World!');

      const encryptionResult = encrypt(originalData, encryptionKey);
      const decryptionResult = decrypt(
        encryptionResult.encrypted,
        encryptionResult.iv,
        encryptionResult.authTag,
        encryptionKey
      );

      expect(decryptionResult.isValid).toBe(true);
      expect(decryptionResult.decrypted).toEqual(originalData);
    });

    /**
     * Property 2: Encryption Round-Trip Consistency
     * Data can be encrypted and decrypted with identical result
     */
    it('should maintain data integrity through encryption/decryption (Property 2)', () => {
      const testData = [
        Buffer.from(''),
        Buffer.from('a'),
        Buffer.from('Hello, World!'),
        Buffer.from('{"key": "value"}'),
        crypto.randomBytes(1000),
        crypto.randomBytes(10000),
      ];

      for (const data of testData) {
        const encrypted = encrypt(data, encryptionKey);
        const decrypted = decrypt(
          encrypted.encrypted,
          encrypted.iv,
          encrypted.authTag,
          encryptionKey
        );

        expect(decrypted.isValid).toBe(true);
        expect(decrypted.decrypted).toEqual(data);
      }
    });

    it('should generate different ciphertexts for same plaintext', () => {
      const data = Buffer.from('Same data');

      const result1 = encrypt(data, encryptionKey);
      const result2 = encrypt(data, encryptionKey);

      // Different IVs should produce different ciphertexts
      expect(result1.encrypted).not.toEqual(result2.encrypted);
      expect(result1.iv).not.toEqual(result2.iv);
    });

    it('should reject decryption with wrong key', () => {
      const data = Buffer.from('Secret data');
      const wrongKey = generateEncryptionKey();

      const encrypted = encrypt(data, encryptionKey);
      const decrypted = decrypt(
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag,
        wrongKey
      );

      expect(decrypted.isValid).toBe(false);
      expect(decrypted.error).toBeDefined();
    });

    it('should reject decryption with tampered ciphertext', () => {
      const data = Buffer.from('Secret data');

      const encrypted = encrypt(data, encryptionKey);

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.encrypted);
      tamperedCiphertext[0] ^= 0xff;

      const decrypted = decrypt(
        tamperedCiphertext,
        encrypted.iv,
        encrypted.authTag,
        encryptionKey
      );

      expect(decrypted.isValid).toBe(false);
    });

    it('should reject decryption with tampered auth tag', () => {
      const data = Buffer.from('Secret data');

      const encrypted = encrypt(data, encryptionKey);

      // Tamper with auth tag
      const tamperedTag = Buffer.from(encrypted.authTag);
      tamperedTag[0] ^= 0xff;

      const decrypted = decrypt(
        encrypted.encrypted,
        encrypted.iv,
        tamperedTag,
        encryptionKey
      );

      expect(decrypted.isValid).toBe(false);
    });

    it('should reject decryption with wrong IV', () => {
      const data = Buffer.from('Secret data');
      const wrongIv = crypto.randomBytes(16);

      const encrypted = encrypt(data, encryptionKey);
      const decrypted = decrypt(
        encrypted.encrypted,
        wrongIv,
        encrypted.authTag,
        encryptionKey
      );

      expect(decrypted.isValid).toBe(false);
    });

    it('should reject invalid key size', () => {
      const data = Buffer.from('Secret data');
      const invalidKey = Buffer.alloc(16); // Wrong size

      expect(() => encrypt(data, invalidKey)).toThrow();
    });

    it('should handle empty data', () => {
      const emptyData = Buffer.alloc(0);

      const encrypted = encrypt(emptyData, encryptionKey);
      const decrypted = decrypt(
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag,
        encryptionKey
      );

      expect(decrypted.isValid).toBe(true);
      expect(decrypted.decrypted.length).toBe(0);
    });

    it('should handle large data', () => {
      const largeData = crypto.randomBytes(1000000); // 1MB

      const encrypted = encrypt(largeData, encryptionKey);
      const decrypted = decrypt(
        encrypted.encrypted,
        encrypted.iv,
        encrypted.authTag,
        encryptionKey
      );

      expect(decrypted.isValid).toBe(true);
      expect(decrypted.decrypted).toEqual(largeData);
    });
  });

  describe('encryptToBase64 and decryptFromBase64', () => {
    let encryptionKey: Buffer;

    beforeEach(() => {
      encryptionKey = generateEncryptionKey();
    });

    it('should encrypt to base64 and decrypt successfully', () => {
      const originalData = Buffer.from('Hello, World!');

      const base64 = encryptToBase64(originalData, encryptionKey);
      const decrypted = decryptFromBase64(base64, encryptionKey);

      expect(decrypted.isValid).toBe(true);
      expect(decrypted.decrypted).toEqual(originalData);
    });

    it('should produce valid base64 string', () => {
      const data = Buffer.from('Test data');
      const base64 = encryptToBase64(data, encryptionKey);

      // Should be valid base64
      expect(() => Buffer.from(base64, 'base64')).not.toThrow();

      // Should only contain base64 characters
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should reject invalid base64', () => {
      const invalidBase64 = '!!!invalid!!!';
      const decrypted = decryptFromBase64(invalidBase64, encryptionKey);

      expect(decrypted.isValid).toBe(false);
    });

    it('should reject tampered base64', () => {
      const data = Buffer.from('Secret data');
      const base64 = encryptToBase64(data, encryptionKey);

      // Tamper with base64
      const tamperedBase64 = base64.slice(0, -10) + 'AAAAAAAAAA';

      const decrypted = decryptFromBase64(tamperedBase64, encryptionKey);

      expect(decrypted.isValid).toBe(false);
    });
  });

  describe('generateHmac and verifyHmac', () => {
    it('should generate and verify HMAC', () => {
      const data = Buffer.from('Test data');
      const key = generateEncryptionKey();

      const hmac = generateHmac(data, key);
      const isValid = verifyHmac(data, hmac, key);

      expect(isValid).toBe(true);
    });

    it('should reject HMAC for different data', () => {
      const data1 = Buffer.from('Data 1');
      const data2 = Buffer.from('Data 2');
      const key = generateEncryptionKey();

      const hmac = generateHmac(data1, key);
      const isValid = verifyHmac(data2, hmac, key);

      expect(isValid).toBe(false);
    });

    it('should reject HMAC with different key', () => {
      const data = Buffer.from('Test data');
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      const hmac = generateHmac(data, key1);
      const isValid = verifyHmac(data, hmac, key2);

      expect(isValid).toBe(false);
    });

    it('should generate consistent HMAC for same data and key', () => {
      const data = Buffer.from('Test data');
      const key = generateEncryptionKey();

      const hmac1 = generateHmac(data, key);
      const hmac2 = generateHmac(data, key);

      expect(hmac1).toEqual(hmac2);
    });
  });

  describe('generateChecksum and verifyChecksum', () => {
    it('should generate and verify checksum', () => {
      const data = Buffer.from('Test data');

      const checksum = generateChecksum(data);
      const isValid = verifyChecksum(data, checksum);

      expect(isValid).toBe(true);
    });

    it('should reject checksum for different data', () => {
      const data1 = Buffer.from('Data 1');
      const data2 = Buffer.from('Data 2');

      const checksum = generateChecksum(data1);
      const isValid = verifyChecksum(data2, checksum);

      expect(isValid).toBe(false);
    });

    it('should generate consistent checksum', () => {
      const data = Buffer.from('Test data');

      const checksum1 = generateChecksum(data);
      const checksum2 = generateChecksum(data);

      expect(checksum1).toEqual(checksum2);
    });

    it('should generate 32-byte checksum (SHA256)', () => {
      const data = Buffer.from('Test data');
      const checksum = generateChecksum(data);

      expect(checksum.length).toBe(32);
    });

    it('should reject tampered checksum', () => {
      const data = Buffer.from('Test data');
      const checksum = generateChecksum(data);

      // Tamper with checksum
      const tamperedChecksum = Buffer.from(checksum);
      tamperedChecksum[0] ^= 0xff;

      const isValid = verifyChecksum(data, tamperedChecksum);

      expect(isValid).toBe(false);
    });
  });
});
