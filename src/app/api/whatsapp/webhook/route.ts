import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

/**
 * Receives WhatsApp messages from whatsapp-server.js.
 * Parses the message and stores the parsed data as a "pending appointment"
 * in serverDb. The client-side appointments page polls
 * /api/whatsapp/pending-appointments to pick these up and create real
 * appointments using localStorage (appointmentDb / patientDb).
 */
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message?.text) {
      return NextResponse.json({ success: false, error: 'No message text' });
    }

    const { parseWhatsAppMessageWithKeyword } = await import('@/lib/whatsapp-parser');
    const { validateParsedAppointment } = await import('@/lib/whatsapp-validator');
    const { addParsingLog, generateLogId } = await import('@/lib/db/whatsapp-parser-storage');

    // Read booking keyword from server settings (saved via /api/whatsapp/settings)
    let bookingKeyword = 'book';
    try {
      const allSettings = serverDb.getAll<any>('settings');
      const kw = allSettings.find((s: any) => s.key === 'whatsappBookingKeyword');
      if (kw?.value) bookingKeyword = kw.value;
    } catch { /* use default */ }

    console.log(`[WhatsApp Webhook] Parsing message with keyword: "${bookingKeyword}"`);
    
    // Pass sender's ID as fallback phone (e.g. 919926460599@c.us)
    const fallbackPhone = message.chatName || message.from;
    const parseResult = parseWhatsAppMessageWithKeyword(message.text, bookingKeyword, fallbackPhone);

    const log = {
      id: generateLogId(),
      timestamp: message.timestamp || new Date().toISOString(),
      message: message.text,
      result: parseResult,
      clinicId: 'default',
    };

    if (!parseResult.success) {
      console.warn(`[WhatsApp Webhook] Parsing failed: ${parseResult.error}`);
      addParsingLog(log);
      return NextResponse.json({ success: false, error: parseResult.error });
    }

    const validationResult = validateParsedAppointment(parseResult.data!);
    (log as any).validationResult = validationResult;

    if (!validationResult.valid) {
      addParsingLog(log);
      return NextResponse.json({ success: false, error: validationResult.errors.join(', ') });
    }

    const parsed = parseResult.data!;

    // Check for duplicate pending entry — only block if there's an unprocessed entry
    // (processed entries mean the appointment was already created or cancelled, so allow re-booking)
    const existing = serverDb.getAll<any>('whatsappPending');
    // Duplicate check: Same name, phone, date, and time
    const isDuplicate = existing.some(
      (p: any) =>
        !p.processed &&
        p.name.toLowerCase().trim() === parsed.name.toLowerCase().trim() &&
        p.phone === parsed.phone &&
        p.date === parsed.date &&
        p.time === parsed.time
    );

    if (isDuplicate) {
      console.log(`[WhatsApp Webhook] Duplicate pending entry skipped for ${parsed.name}`);
      addParsingLog(log);
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate' });
    }

    // Store parsed data as pending — client will create the actual appointment
    // chatName is the sender's WhatsApp chat ID (e.g. "917000297909@c.us") — used for replies
    const pending = serverDb.create('whatsappPending', {
      name: parsed.name,
      phone: parsed.phone,
      date: parsed.date,   // YYYY-MM-DD
      time: parsed.time,   // HH:MM
      chatId: message.chatName || null, // sender's WhatsApp chat ID for replies
      receivedAt: message.timestamp || new Date().toISOString(),
      processed: false,
    });

    console.log(`[WhatsApp Webhook] ✓ Pending appointment stored: ${parsed.name} on ${parsed.date} at ${parsed.time} (id: ${pending.id})`);

    addParsingLog(log);
    return NextResponse.json({ success: true, pendingId: pending.id });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
