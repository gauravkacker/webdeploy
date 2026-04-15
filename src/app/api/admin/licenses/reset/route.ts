import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function POST() {
  try {
    // Get all licenses
    const licenses = serverDb.getAll('licenses');
    
    // Delete each one
    licenses.forEach((license: any) => {
      serverDb.delete('licenses', license.id);
    });
    
    console.log('All licenses cleared');
    return NextResponse.json({ message: 'All licenses cleared', count: licenses.length });
  } catch (error) {
    console.error('Failed to clear licenses:', error);
    return NextResponse.json({ error: 'Failed to clear licenses' }, { status: 500 });
  }
}
