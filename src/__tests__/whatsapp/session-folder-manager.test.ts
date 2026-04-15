import {
  validatePath,
  createSessionFolder,
  checkFolderPermissions,
  getSessionFolderStatus,
} from '@/lib/whatsapp/session-folder-manager';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Session Folder Manager', () => {
  const testDir = path.join(os.tmpdir(), 'whatsapp-test-' + Date.now());

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('validatePath', () => {
    it('should accept valid paths within /home/ubuntu', () => {
      const result = validatePath('/home/ubuntu/whatsapp-sessions');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject paths with path traversal attempts', () => {
      const result = validatePath('/home/ubuntu/../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject paths outside allowed directory', () => {
      const result = validatePath('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path must be within /home/ubuntu');
    });

    it('should reject paths with tilde', () => {
      const result = validatePath('~/whatsapp-sessions');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid path characters');
    });
  });

  describe('createSessionFolder', () => {
    it('should create folder successfully', () => {
      const testPath = path.join(testDir, 'test-create');
      const result = createSessionFolder(testPath);

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(fs.existsSync(testPath)).toBe(true);
    });

    it('should be idempotent (safe to call multiple times)', () => {
      const testPath = path.join(testDir, 'test-idempotent');

      const result1 = createSessionFolder(testPath);
      expect(result1.success).toBe(true);
      expect(result1.created).toBe(true);

      const result2 = createSessionFolder(testPath);
      expect(result2.success).toBe(true);
      expect(result2.created).toBe(false); // Already existed
    });

    it('should set correct permissions', () => {
      const testPath = path.join(testDir, 'test-permissions');
      const result = createSessionFolder(testPath);

      expect(result.success).toBe(true);
      expect(result.permissions).toBeDefined();
      // Permissions should be 755 or similar
      expect(['755', '755']).toContain(result.permissions);
    });

    it('should reject invalid paths', () => {
      const result = createSessionFolder('/etc/passwd');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('checkFolderPermissions', () => {
    it('should return readable and writable for accessible folder', () => {
      const testPath = path.join(testDir, 'test-perms-check');
      fs.mkdirSync(testPath, { recursive: true });

      const result = checkFolderPermissions(testPath);
      expect(result.readable).toBe(true);
      expect(result.writable).toBe(true);
    });

    it('should return error for non-existent folder', () => {
      const result = checkFolderPermissions('/non/existent/path');
      expect(result.readable).toBe(false);
      expect(result.writable).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getSessionFolderStatus', () => {
    it('should return success for existing accessible folder', () => {
      const testPath = path.join(testDir, 'test-status-success');
      fs.mkdirSync(testPath, { recursive: true });

      const result = getSessionFolderStatus(testPath);
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.accessible).toBe(true);
      expect(result.readable).toBe(true);
      expect(result.writable).toBe(true);
    });

    it('should return error for non-existent folder', () => {
      const result = getSessionFolderStatus('/non/existent/path');
      expect(result.success).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.accessible).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.suggestion).toContain('setup-session-folder');
    });

    it('should return file count for folder', () => {
      const testPath = path.join(testDir, 'test-file-count');
      fs.mkdirSync(testPath, { recursive: true });
      fs.writeFileSync(path.join(testPath, 'file1.txt'), 'test');
      fs.writeFileSync(path.join(testPath, 'file2.txt'), 'test');

      const result = getSessionFolderStatus(testPath);
      expect(result.success).toBe(true);
      expect(result.fileCount).toBe(2);
    });

    it('should return folder metadata', () => {
      const testPath = path.join(testDir, 'test-metadata');
      fs.mkdirSync(testPath, { recursive: true });

      const result = getSessionFolderStatus(testPath);
      expect(result.success).toBe(true);
      expect(result.permissions).toBeDefined();
      expect(result.owner).toBeDefined();
      expect(result.size).toBeDefined();
      expect(result.lastModified).toBeDefined();
      expect(result.path).toBe(testPath);
    });
  });
});
