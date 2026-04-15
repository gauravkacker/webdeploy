/**
 * Data Sync API
 * Receives bulk data from client-side browser and syncs to server database
 * Only active when NEXT_PUBLIC_DATA_MODE=server
 */

import { NextRequest, NextResponse } from 'next/server';
import { isServerDataMode } from '@/lib/db/data-mode';
import { serverCreate } from '@/lib/db/server-db';

function notAvailable() {
  return NextResponse.json({ error: 'Server data mode not enabled' }, { status: 503 });
}

export async function POST(req: NextRequest, { params }: { params: { collection: string } }) {
  if (!isServerDataMode) return notAvailable();
  
  try {
    const body = await req.json();
    const { items } = body;
    
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }
    
    // Sync each item to server database
    for (const item of items) {
      if (item.id) {
        await serverCreate(params.collection, item);
      }
    }
    
    return NextResponse.json({ success: true, synced: items.length });
  } catch (e: any) {
    console.error('[Data Sync API] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
