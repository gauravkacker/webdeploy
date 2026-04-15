import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    let parsed: { html?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!parsed.html) {
      return NextResponse.json({ success: false, error: 'html required' }, { status: 400 });
    }

    const waServerUrl = process.env.NEXT_PUBLIC_WHATSAPP_WS_URL
      ? process.env.NEXT_PUBLIC_WHATSAPP_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://')
      : 'http://localhost:3001';

    const res = await fetch(`${waServerUrl}/html-to-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: parsed.html }),
    });

    // Check if response is OK before parsing JSON
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'PDF conversion server returned error' }, { status: res.status });
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ success: false, error: 'PDF conversion server returned non-JSON response' }, { status: 503 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
