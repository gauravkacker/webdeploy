import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { planId, expiryType, expiryValue, isLifetime } = body;

    const licenses = serverDb.getAll('licenses') as any[];
    const index = licenses.findIndex(l => l.id === id);
    
    if (index === -1) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    // Calculate new expiry date
    let expiresAt = new Date();
    if (!isLifetime) {
      if (expiryType === 'days') {
        expiresAt.setDate(expiresAt.getDate() + expiryValue);
      } else if (expiryType === 'months') {
        expiresAt.setMonth(expiresAt.getMonth() + expiryValue);
      } else if (expiryType === 'years') {
        expiresAt.setFullYear(expiresAt.getFullYear() + expiryValue);
      }
    } else {
      // Lifetime: set to expiryValue years from now
      expiresAt.setFullYear(expiresAt.getFullYear() + expiryValue);
    }

    // Get the plan to get its modules
    const plans = serverDb.getAll('purchase_plans') as any[];
    const plan = plans.find(p => p.id === planId);
    const planModules = plan?.modules || [];

    // Update license
    licenses[index] = {
      ...licenses[index],
      planId,
      expiresAt: expiresAt.toISOString(),
      modules: planModules,
      isLifetime,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };

    serverDb.update('licenses', id, licenses[index]);
    return NextResponse.json(licenses[index]);
  } catch (error) {
    console.error('Failed to renew license:', error);
    return NextResponse.json({ error: 'Failed to renew license' }, { status: 500 });
  }
}
