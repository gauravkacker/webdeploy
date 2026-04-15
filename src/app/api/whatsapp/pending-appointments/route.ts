import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

/**
 * GET  — returns all unprocessed pending WhatsApp appointments.
 * POST — marks a pending entry as processed (client calls this after
 *        successfully creating the appointment in localStorage).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get('all') === 'true';
    const items = serverDb.getAll<any>('whatsappPending');
    const pending = all ? items : items.filter((p: any) => !p.processed);
    return NextResponse.json({ success: true, pending });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, rejected, rejectReason } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }
    const updates: any = { processed: true };
    if (rejected) { updates.rejected = true; updates.rejectReason = rejectReason || 'no_slot_match'; }
    const updated = serverDb.update('whatsappPending', id, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
