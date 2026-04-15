import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    serverDb.delete('licenses', id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete license:', error);
    return NextResponse.json({ error: 'Failed to delete license' }, { status: 500 });
  }
}
