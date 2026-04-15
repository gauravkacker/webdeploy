/**
 * Unified Data API
 * Routes to server-side SQLite (server mode) or returns 503 (local mode — UI uses localStorage directly)
 * Only active when NEXT_PUBLIC_DATA_MODE=server
 */

import { NextRequest, NextResponse } from 'next/server';
import { isServerDataMode } from '@/lib/db/data-mode';
import { serverGetAll, serverCreate, serverUpdate, serverDelete } from '@/lib/db/server-db';

function notAvailable() {
  return NextResponse.json({ error: 'Server data mode not enabled' }, { status: 503 });
}

export async function GET(req: NextRequest, { params }: { params: { collection: string } }) {
  if (!isServerDataMode) return notAvailable();
  try {
    const data = await serverGetAll(params.collection);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { collection: string } }) {
  if (!isServerDataMode) return notAvailable();
  try {
    const body = await req.json();
    const item = await serverCreate(params.collection, body);
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { collection: string } }) {
  if (!isServerDataMode) return notAvailable();
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const item = await serverUpdate(params.collection, id, updates);
    return NextResponse.json({ data: item });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { collection: string } }) {
  if (!isServerDataMode) return notAvailable();
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await serverDelete(params.collection, id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
