import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

// Increase body size limit for this route (base64 PDFs can be several MB)
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Next.js App Router body size limit via route segment config
// This is the correct way to override the 4MB default for API routes
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    let parsed: { phone?: string; base64?: string; filename?: string; caption?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { phone, base64, filename, caption } = parsed;
    if (!phone || !base64 || !filename) {
      return NextResponse.json({ success: false, error: 'phone, base64, and filename required' }, { status: 400 });
    }

    const waServerUrl = await getWhatsAppServerUrl();
    if (!waServerUrl) {
      return NextResponse.json({ success: false, error: 'WhatsApp server not connected. Please ensure the HomeoPMS app is running on your PC.' }, { status: 503 });
    }

    const res = await fetch(`${waServerUrl}/send-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, base64, filename, caption }),
    });

    // Check if response is OK before parsing JSON
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned error' }, { status: res.status });
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ success: false, error: 'WhatsApp server returned non-JSON response' }, { status: 503 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
