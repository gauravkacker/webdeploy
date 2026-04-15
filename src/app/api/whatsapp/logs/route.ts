import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { getParsingLogs } = await import('@/lib/db/whatsapp-parser-storage');
    const logs = getParsingLogs('default', 20);
    return NextResponse.json({ logs });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ logs: [], error }, { status: 500 });
  }
}
