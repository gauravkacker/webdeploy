import { NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

export async function POST() {
  const WA_SERVER = await getWhatsAppServerUrl();
  if (!WA_SERVER) {
    return NextResponse.json({ success: false, error: 'WhatsApp server not connected. Please ensure the HomeoPMS app is running on your PC.' }, { status: 503 });
  }
  try {
    const res = await fetch(`${WA_SERVER}/status`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned error' }, { status: res.status });
    }
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned non-JSON response' }, { status: 503 });
    }
    const data = await res.json();
    if (!data.error && data.status) {
      return NextResponse.json({ success: true, message: 'Already running', alreadyRunning: true });
    }
    return NextResponse.json({ success: true, message: 'WhatsApp server running' });
  } catch (error) {
    console.error('[WhatsApp Start] Error:', error);
    return NextResponse.json({ success: false, error: 'WhatsApp server not reachable' }, { status: 503 });
  }
}

export async function DELETE() {
  return NextResponse.json({ success: true, message: 'WhatsApp server managed by Electron main process' });
}
