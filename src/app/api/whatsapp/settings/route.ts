import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp/templates';

function getTemplates() {
  const allSettings = serverDb.getAll<any>('settings');
  const entry = allSettings.find((s: any) => s.key === 'whatsappMessageTemplates');
  if (entry?.value) {
    try { return { ...DEFAULT_TEMPLATES, ...JSON.parse(entry.value) }; } catch {}
  }
  return DEFAULT_TEMPLATES;
}

/** GET — returns current WhatsApp settings */
export async function GET() {
  try {
    const allSettings = serverDb.getAll<any>('settings');
    const kw = allSettings.find((s: any) => s.key === 'whatsappBookingKeyword');
    const templates = getTemplates();
    return NextResponse.json({ success: true, bookingKeyword: kw?.value || 'book', templates });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

/** POST — saves WhatsApp settings */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookingKeyword, templates } = body;

    const allSettings = serverDb.getAll<any>('settings');

    if (bookingKeyword && typeof bookingKeyword === 'string') {
      const existing = allSettings.find((s: any) => s.key === 'whatsappBookingKeyword');
      if (existing) {
        serverDb.update('settings', existing.id, { value: bookingKeyword.trim() });
      } else {
        serverDb.create('settings', { key: 'whatsappBookingKeyword', value: bookingKeyword.trim() });
      }
    }

    if (templates && typeof templates === 'object') {
      const existing = allSettings.find((s: any) => s.key === 'whatsappMessageTemplates');
      const value = JSON.stringify(templates);
      if (existing) {
        serverDb.update('settings', existing.id, { value });
      } else {
        serverDb.create('settings', { key: 'whatsappMessageTemplates', value });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
