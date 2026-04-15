import { NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

export async function GET() {
  const WA_SERVER = await getWhatsAppServerUrl();
  if (!WA_SERVER) {
    return NextResponse.json({ status: 'disconnected', error: 'WhatsApp server not connected. Please ensure the HomeoPMS app is running on your PC.' });
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${WA_SERVER}/status`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      return NextResponse.json({ status: 'disconnected', error: 'WhatsApp server returned error', statusCode: res.status });
    }
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ status: 'disconnected', error: 'WhatsApp server returned non-JSON response' });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ status: 'disconnected', error: 'WhatsApp server not reachable', details: err instanceof Error ? err.message : 'Timeout' });
  }
}
