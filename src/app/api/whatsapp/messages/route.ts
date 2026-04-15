import { NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

export async function GET() {
  const WA_SERVER = await getWhatsAppServerUrl();
  if (!WA_SERVER) {
    return NextResponse.json({ messages: [] });
  }
  try {
    const res = await fetch(`${WA_SERVER}/messages`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ messages: [] });
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) return NextResponse.json({ messages: [] });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
