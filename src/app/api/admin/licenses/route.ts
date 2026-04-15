import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function GET() {
  try {
    let licenses = serverDb.getAll('licenses');
    
    console.log('[GET /api/admin/licenses] Licenses from db.getAll():', licenses.length);
    
    // If no licenses found in db, this is likely a server-side context issue
    // The database should have loaded from localStorage on initialization
    // Log for debugging
    if (licenses.length === 0) {
      console.log('[GET /api/admin/licenses] No licenses found in database');
    }
    
    // Format licenses for frontend
    const formatted = licenses.map((license: any) => ({
      id: license.id,
      licenseKey: license.licenseKey,
      customerId: license.customerId,
      planId: license.planId,
      licenseType: license.licenseType || 'single-pc',
      maxMachines: license.maxMachines || 1,
      authorizedMachines: typeof license.authorizedMachines === 'string' 
        ? JSON.parse(license.authorizedMachines || '[]')
        : (license.authorizedMachines || []),
      status: license.status || 'active',
      expiresAt: license.expiresAt,
      modules: Array.isArray(license.modules) ? license.modules : (license.modules || []),
      isLifetime: license.isLifetime || false,
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
      // Include password fields
      generatedPassword: license.generatedPassword || undefined,
      passwordExpiryDate: license.passwordExpiryDate || undefined,
      passwordGeneratedAt: license.passwordGeneratedAt || undefined,
      passwordHash: license.passwordHash || undefined,
    }));

    console.log('[GET /api/admin/licenses] Returning formatted licenses:', formatted.length);
    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Failed to fetch licenses:', error);
    return NextResponse.json({ error: 'Failed to fetch licenses' }, { status: 500 });
  }
}
