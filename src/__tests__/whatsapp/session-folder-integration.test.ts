import { POST } from '@/app/api/whatsapp/setup-session-folder/route';
import { GET } from '@/app/api/whatsapp/session-folder-status/route';
import { getConfiguredSessionPath, validateSessionFolderOnStartup } from '@/lib/whatsapp/session-startup-validator';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WhatsApp Session Folder Integration Tests', () => {
  const testDir = path.join(os.tmpdir(), 'whatsapp-integration-test-' + Date.now());

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Setup Flow', () => {
    it('should complete full setup flow: create folder -> check status', async () => {
      const testPath = path.join(testDir, 'test-e2e-setup');

      // Step 1: Create folder via API
      const setupRequest = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });

      const setupResponse = await POST(setupRequest);
      const setupData = await setupResponse.json();

      expect(setupResponse.status).toBe(200);
      expect(setupData.success).toBe(true);
      expect(setupData.created).toBe(true);
      expect(fs.existsSync(testPath)).toBe(true);

      // Step 2: Check status via API
      const statusRequest = new NextRequest(
        `http://localhost:3000/api/whatsapp/session-folder-status?path=${encodeURIComponent(testPath)}`,
        { method: 'GET' }
      );

      const statusResponse = await GET(statusRequest);
      const statusData = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusData.success).toBe(true);
      expect(statusData.exists).toBe(true);
      expect(statusData.accessible).toBe(true);
      expect(statusData.readable).toBe(true);
      expect(statusData.writable).toBe(true);
      expect(statusData.permissions).toBeDefined();
    });

    it('should handle multiple backend instances accessing same folder', async () => {
      const testPath = path.join(testDir, 'test-multi-instance');

      // Create folder
      const setupRequest = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });

      const setupResponse = await POST(setupRequest);
      expect(setupResponse.status).toBe(200);

      // Simulate multiple instances checking status
      const statusRequests = [1, 2, 3].map(() =>
        new NextRequest(
          `http://localhost:3000/api/whatsapp/session-folder-status?path=${encodeURIComponent(testPath)}`,
          { method: 'GET' }
        )
      );

      const statusResponses = await Promise.all(statusRequests.map(req => GET(req)));

      statusResponses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const statusDataList = await Promise.all(statusResponses.map(r => r.json()));

      statusDataList.forEach(data => {
        expect(data.success).toBe(true);
        expect(data.exists).toBe(true);
        expect(data.accessible).toBe(true);
      });
    });

    it('should persist session files after folder creation', async () => {
      const testPath = path.join(testDir, 'test-persistence');

      // Create folder
      const setupRequest = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });

      const setupResponse = await POST(setupRequest);
      expect(setupResponse.status).toBe(200);

      // Add test files
      fs.writeFileSync(path.join(testPath, 'session.json'), JSON.stringify({ test: 'data' }));
      fs.writeFileSync(path.join(testPath, 'qr-code.png'), 'fake-image-data');

      // Check status
      const statusRequest = new NextRequest(
        `http://localhost:3000/api/whatsapp/session-folder-status?path=${encodeURIComponent(testPath)}`,
        { method: 'GET' }
      );

      const statusResponse = await GET(statusRequest);
      const statusData = await statusResponse.json();

      expect(statusData.success).toBe(true);
      expect(statusData.fileCount).toBe(2);

      // Verify files still exist
      expect(fs.existsSync(path.join(testPath, 'session.json'))).toBe(true);
      expect(fs.existsSync(path.join(testPath, 'qr-code.png'))).toBe(true);
    });
  });

  describe('Backend Startup Validation', () => {
    it('should get configured session path', () => {
      const sessionPath = getConfiguredSessionPath();
      expect(sessionPath).toBeDefined();
      expect(typeof sessionPath).toBe('string');
      // Should be either from env var or default
      expect(sessionPath).toMatch(/whatsapp-sessions/);
    });

    it('should validate session folder on startup', () => {
      // Create a test folder and set env var
      const testPath = path.join(testDir, 'test-startup-validation');
      fs.mkdirSync(testPath, { recursive: true });

      // Temporarily set env var
      const originalEnv = process.env.WHATSAPP_SESSION_PATH;
      process.env.WHATSAPP_SESSION_PATH = testPath;

      try {
        const isValid = validateSessionFolderOnStartup();
        expect(isValid).toBe(true);
      } finally {
        // Restore original env var
        if (originalEnv) {
          process.env.WHATSAPP_SESSION_PATH = originalEnv;
        } else {
          delete process.env.WHATSAPP_SESSION_PATH;
        }
      }
    });

    it('should fail validation for non-existent folder', () => {
      // Set env var to non-existent path
      const originalEnv = process.env.WHATSAPP_SESSION_PATH;
      process.env.WHATSAPP_SESSION_PATH = '/non/existent/path';

      try {
        const isValid = validateSessionFolderOnStartup();
        expect(isValid).toBe(false);
      } finally {
        // Restore original env var
        if (originalEnv) {
          process.env.WHATSAPP_SESSION_PATH = originalEnv;
        } else {
          delete process.env.WHATSAPP_SESSION_PATH;
        }
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid path in setup', async () => {
      const request = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: '/etc/passwd' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle missing folder in status check', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/whatsapp/session-folder-status?path=/non/existent/path',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.exists).toBe(false);
      expect(data.suggestion).toBeDefined();
    });

    it('should handle concurrent setup requests', async () => {
      const testPath = path.join(testDir, 'test-concurrent');

      // Send multiple concurrent setup requests
      const requests = [1, 2, 3].map(() =>
        new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
          method: 'POST',
          body: JSON.stringify({ sessionPath: testPath }),
        })
      );

      const responses = await Promise.all(requests.map(req => POST(req)));

      // All should succeed (idempotent)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const dataList = await Promise.all(responses.map(r => r.json()));

      dataList.forEach(data => {
        expect(data.success).toBe(true);
      });

      // Folder should exist
      expect(fs.existsSync(testPath)).toBe(true);
    });
  });
});
