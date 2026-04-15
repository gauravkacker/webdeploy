import { POST } from '@/app/api/whatsapp/setup-session-folder/route';
import { GET } from '@/app/api/whatsapp/session-folder-status/route';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WhatsApp Session Folder API Endpoints', () => {
  const testDir = path.join(os.tmpdir(), 'whatsapp-api-test-' + Date.now());

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

  describe('POST /api/whatsapp/setup-session-folder', () => {
    it('should create folder successfully', async () => {
      const testPath = path.join(testDir, 'test-post-create');
      const request = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.path).toBe(testPath);
      expect(fs.existsSync(testPath)).toBe(true);
    });

    it('should be idempotent', async () => {
      const testPath = path.join(testDir, 'test-post-idempotent');

      // First call
      const request1 = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });
      const response1 = await POST(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(200);
      expect(data1.success).toBe(true);
      expect(data1.created).toBe(true);

      // Second call
      const request2 = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: testPath }),
      });
      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(200);
      expect(data2.success).toBe(true);
      expect(data2.created).toBe(false); // Already existed
    });

    it('should reject path traversal attempts', async () => {
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

    it('should return error response with details', async () => {
      const request = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({ sessionPath: '/invalid/path' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.code).toBeDefined();
    });

    it('should use default path if not provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/whatsapp/setup-session-folder', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should fail because /home/ubuntu/whatsapp-sessions might not exist in test env
      // But it should attempt to use the default path
      expect(data.path).toBe('/home/ubuntu/whatsapp-sessions');
    });
  });

  describe('GET /api/whatsapp/session-folder-status', () => {
    it('should return status for existing folder', async () => {
      const testPath = path.join(testDir, 'test-get-status');
      fs.mkdirSync(testPath, { recursive: true });

      const request = new NextRequest(
        `http://localhost:3000/api/whatsapp/session-folder-status?path=${encodeURIComponent(testPath)}`,
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.exists).toBe(true);
      expect(data.accessible).toBe(true);
      expect(data.readable).toBe(true);
      expect(data.writable).toBe(true);
    });

    it('should return error for non-existent folder', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/whatsapp/session-folder-status?path=/non/existent/path`,
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.exists).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.suggestion).toContain('setup-session-folder');
    });

    it('should return folder metadata', async () => {
      const testPath = path.join(testDir, 'test-get-metadata');
      fs.mkdirSync(testPath, { recursive: true });
      fs.writeFileSync(path.join(testPath, 'test.txt'), 'test');

      const request = new NextRequest(
        `http://localhost:3000/api/whatsapp/session-folder-status?path=${encodeURIComponent(testPath)}`,
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.permissions).toBeDefined();
      expect(data.owner).toBeDefined();
      expect(data.size).toBeDefined();
      expect(data.fileCount).toBe(1);
      expect(data.lastModified).toBeDefined();
      expect(data.path).toBe(testPath);
    });

    it('should use default path if not provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/whatsapp/session-folder-status', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      // Should check default path
      expect(data.path).toBe('/home/ubuntu/whatsapp-sessions');
    });
  });
});
