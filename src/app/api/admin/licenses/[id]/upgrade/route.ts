import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { newMaxMachines } = body;

    if (!newMaxMachines || newMaxMachines < 2 || newMaxMachines > 100) {
      return NextResponse.json(
        { error: 'newMaxMachines must be between 2-100' },
        { status: 400 }
      );
    }

    const license = serverDb.getById('licenses', id);
    if (!license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    if ((license as any).licenseType !== 'single-pc') {
      return NextResponse.json(
        { error: 'Only single-PC licenses can be upgraded' },
        { status: 400 }
      );
    }

    const machineHistory = JSON.parse((license as any).machineHistory || '[]');
    machineHistory.push({
      eventType: 'upgraded',
      timestamp: new Date().toISOString(),
      performedBy: 'admin',
      oldMaxMachines: 1,
      newMaxMachines,
      details: `Upgraded from single-PC to multi-PC (max ${newMaxMachines} machines)`,
    });

    serverDb.update('licenses', id, {
      licenseType: 'multi-pc',
      maxMachines: newMaxMachines,
      machineHistory: JSON.stringify(machineHistory),
    });

    return NextResponse.json({
      success: true,
      oldType: 'single-pc',
      newType: 'multi-pc',
      newMaxMachines,
    });
  } catch (error) {
    console.error('Failed to upgrade license:', error);
    return NextResponse.json({ error: 'Failed to upgrade license' }, { status: 500 });
  }
}
