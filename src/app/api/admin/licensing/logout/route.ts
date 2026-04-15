import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-auth/session';

export async function POST() {
  try {
    await clearAdminSession();

    return NextResponse.json(
      { success: true, message: 'Logout successful' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
