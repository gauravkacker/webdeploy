import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppServerUrl } from '@/lib/whatsapp/server-url';

/**
 * Proxy to whatsapp-server.js /send endpoint.
 * Body: { phone: string, message: string }
 *
 * Includes in-process deduplication: if the exact same phone+message is sent
 * within 8 seconds, the second call is silently dropped. This prevents double
 * sends caused by concurrent polling cycles or retry logic.
 */

// In-memory dedup cache: key → expiry timestamp
const recentSends = new Map<string, number>();
const DEDUP_WINDOW_MS = 8_000;

function isDuplicate(phone: string, message: string): boolean {
  const key = `${phone}::${message}`;
  const now = Date.now();
  // Clean up expired entries
  for (const [k, exp] of recentSends) {
    if (exp < now) recentSends.delete(k);
  }
  if (recentSends.has(key)) return true;
  recentSends.set(key, now + DEDUP_WINDOW_MS);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { phone, message } = await req.json();
    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone and message required' }, { status: 400 });
    }

    // Deduplicate: drop identical sends within the dedup window
    if (isDuplicate(phone, message)) {
      console.warn(`[WhatsApp Send] Duplicate suppressed for phone: ${phone}`);
      return NextResponse.json({ success: true, deduplicated: true });
    }

    const waServerUrl = await getWhatsAppServerUrl();
    if (!waServerUrl) {
      return NextResponse.json({ success: false, error: 'WhatsApp server not connected. Please ensure the HomeoPMS app is running on your PC.' }, { status: 503 });
    }

    const res = await fetch(`${waServerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
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
