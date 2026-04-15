/**
 * Electron Data Proxy
 * Oracle Cloud proxies data requests to the local Electron app via Cloudflare Tunnel
 * Usage: POST /api/electron/proxy with { clientId, path, method, body }
 */

import { NextRequest, NextResponse } from 'next/server';

// Import registry — we use a shared module-level map
// Since Next.js API routes share module state in the same process, this works
let registryModule: any = null;

async function getRegistry() {
  if (!registryModule) {
    registryModule = await import('../register/route');
  }
  return registryModule;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, path: apiPath, method = 'GET', data } = body;

    if (!clientId || !apiPath) {
      return NextResponse.json({ error: 'Missing clientId or path' }, { status: 400 });
    }

    const registry = await getRegistry();
    const registration = registry.getTunnelRegistration(clientId);

    if (!registration) {
      return NextResponse.json(
        { error: 'Electron client not connected. Please ensure the HomeoPMS app is running.' },
        { status: 503 }
      );
    }

    const targetUrl = `${registration.tunnelUrl}${apiPath}`;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': registration.apiSecret,
      },
    };

    if (data && method !== 'GET') {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseData = await response.json();

    return NextResponse.json(responseData, { status: response.status });
  } catch (error: any) {
    console.error('[Electron Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reach local Electron app: ' + (error.message || 'Unknown error') },
      { status: 502 }
    );
  }
}

// GET — proxy a GET request
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  const apiPath = req.nextUrl.searchParams.get('path');

  if (!clientId || !apiPath) {
    return NextResponse.json({ error: 'Missing clientId or path' }, { status: 400 });
  }

  const registry = await getRegistry();
  const registration = registry.getTunnelRegistration(clientId);

  if (!registration) {
    return NextResponse.json(
      { error: 'Electron client not connected' },
      { status: 503 }
    );
  }

  try {
    const targetUrl = `${registration.tunnelUrl}${apiPath}`;
    const response = await fetch(targetUrl, {
      headers: { 'X-API-Secret': registration.apiSecret },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
