/**
 * Electron Tunnel Registration
 * Called by the local Electron app to register its Cloudflare tunnel URL
 * Oracle Cloud stores this URL and uses it to proxy data requests
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for tunnel registrations
// Key: clientId (unique per installation), Value: { tunnelUrl, apiSecret, lastSeen }
const tunnelRegistry = new Map<string, {
  tunnelUrl: string;
  apiSecret: string;
  lastSeen: number;
}>();

// Clean up stale registrations (older than 5 minutes)
function cleanStale() {
  const now = Date.now();
  for (const [key, val] of tunnelRegistry.entries()) {
    if (now - val.lastSeen > 5 * 60 * 1000) {
      tunnelRegistry.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, tunnelUrl, apiSecret } = body;

    if (!clientId || !tunnelUrl || !apiSecret) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate tunnel URL format
    if (!tunnelUrl.startsWith('https://') || !tunnelUrl.includes('trycloudflare.com')) {
      return NextResponse.json({ error: 'Invalid tunnel URL' }, { status: 400 });
    }

    cleanStale();

    tunnelRegistry.set(clientId, {
      tunnelUrl,
      apiSecret,
      lastSeen: Date.now(),
    });

    console.log(`[Electron Register] Client ${clientId} registered tunnel: ${tunnelUrl}`);

    return NextResponse.json({ success: true, message: 'Tunnel registered' });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// GET — check if a client is registered (used by UI to know if Electron is connected)
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');

  if (!clientId) {
    // Return all active registrations count
    cleanStale();
    return NextResponse.json({ activeClients: tunnelRegistry.size });
  }

  const registration = tunnelRegistry.get(clientId);
  if (!registration) {
    return NextResponse.json({ connected: false });
  }

  const isStale = Date.now() - registration.lastSeen > 5 * 60 * 1000;
  return NextResponse.json({
    connected: !isStale,
    tunnelUrl: isStale ? null : registration.tunnelUrl,
  });
}

// Export for use by proxy route
export function getTunnelRegistration(clientId: string) {
  cleanStale();
  return tunnelRegistry.get(clientId) || null;
}

export function getAllRegistrations() {
  cleanStale();
  return Array.from(tunnelRegistry.entries()).map(([id, val]) => ({
    clientId: id,
    tunnelUrl: val.tunnelUrl,
    lastSeen: val.lastSeen,
  }));
}
