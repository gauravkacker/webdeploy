import { NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

export async function POST() {
  const WA_SERVER = await getWhatsAppServerUrl();
  if (!WA_SERVER) {
    return NextResponse.json({ success: false, error: 'WhatsApp server not connected' });
  }
  try {
    const res = await fetch(`${WA_SERVER}/disconnect`, { method: 'POST', cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned error' }, { status: res.status });
    }
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned non-JSON response' });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ success: false, error: 'WhatsApp server not running' });
  }
}
