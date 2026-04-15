/**
 * WhatsApp Server URL resolver
 *
 * - local/prod build  → uses WHATSAPP_SERVER_URL env var (localhost:3001 for EXE)
 * - server build      → looks up the Cloudflare tunnel URL registered by the EXE
 *                       Falls back to WHATSAPP_SERVER_URL if set, otherwise null
 */

import { isServerDataMode } from '@/lib/db/data-mode';

export async function getWhatsAppServerUrl(): Promise<string | null> {
  if (!isServerDataMode) {
    // Local/EXE mode — use env var directly
    return process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
  }

  // Server mode — try to get tunnel URL from the Electron registry
  try {
    const { getAllRegistrations } = await import('@/app/api/electron/register/route');
    const registrations = getAllRegistrations();

    if (registrations.length > 0) {
      // Use the most recently seen registration
      const latest = registrations.sort((a, b) => b.lastSeen - a.lastSeen)[0];
      // Tunnel URL is HTTPS (Cloudflare), WhatsApp server is on port 3001 via the tunnel
      // The tunnel-manager exposes port 3001, so the tunnel URL IS the WhatsApp server URL
      return latest.tunnelUrl;
    }
  } catch {
    // Registry not available
  }

  // Fallback: if WHATSAPP_SERVER_URL is explicitly set, use it
  const fallback = process.env.WHATSAPP_SERVER_URL;
  return fallback || null;
}
