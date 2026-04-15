import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { machineId } = body;

    if (!machineId) {
      return NextResponse.json({ error: 'Machine ID required' }, { status: 400 });
    }

    const license = serverDb.getById('licenses', id);
    if (!license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    const authorizedMachines = JSON.parse((license as any).authorizedMachines || '[]');
    const machineHistory = JSON.parse((license as any).machineHistory || '[]');

    // Check if machine already exists
    if (authorizedMachines.some((m: any) => m.machineId === machineId)) {
      return NextResponse.json({ error: 'Machine already authorized' }, { status: 400 });
    }

    // Check machine limit
    if (authorizedMachines.length >= (license as any).maxMachines) {
      return NextResponse.json({ error: 'Machine limit reached' }, { status: 400 });
    }

    // Add machine
    authorizedMachines.push({
      machineId,
      machineIdHash: hashMachineId(machineId),
      addedAt: new Date().toISOString(),
      addedBy: 'admin',
    });

    machineHistory.push({
      eventType: 'added',
      machineId,
      timestamp: new Date().toISOString(),
      performedBy: 'admin',
    });

    serverDb.update('licenses', id, {
      authorizedMachines: JSON.stringify(authorizedMachines),
      machineHistory: JSON.stringify(machineHistory),
    });

    return NextResponse.json({ success: true, machineId });
  } catch (error) {
    console.error('Failed to add machine:', error);
    return NextResponse.json({ error: 'Failed to add machine' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; machineId: string }> }
) {
  try {
    const { id, machineId } = await params;

    const license = serverDb.getById('licenses', id);
    if (!license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    const authorizedMachines = JSON.parse((license as any).authorizedMachines || '[]');
    const machineHistory = JSON.parse((license as any).machineHistory || '[]');

    // Remove machine
    const filtered = authorizedMachines.filter((m: any) => m.machineId !== machineId);
    if (filtered.length === authorizedMachines.length) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    machineHistory.push({
      eventType: 'removed',
      machineId,
      timestamp: new Date().toISOString(),
      performedBy: 'admin',
    });

    serverDb.update('licenses', id, {
      authorizedMachines: JSON.stringify(filtered),
      machineHistory: JSON.stringify(machineHistory),
    });

    return NextResponse.json({ success: true, machineId });
  } catch (error) {
    console.error('Failed to remove machine:', error);
    return NextResponse.json({ error: 'Failed to remove machine' }, { status: 500 });
  }
}

function hashMachineId(machineId: string): string {
  let hash = 0;
  for (let i = 0; i < machineId.length; i++) {
    const char = machineId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
