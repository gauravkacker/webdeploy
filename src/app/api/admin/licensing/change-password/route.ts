import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminCredentials,
  validatePasswordStrength,
  hashPassword,
  DEFAULT_ADMIN_PASSWORD_HASH,
} from '@/lib/admin-auth/admin-credentials';
import { isAdminAuthenticated } from '@/lib/admin-auth/session';

// Store the current password hash in memory (in production, use a database)
let currentPasswordHash = DEFAULT_ADMIN_PASSWORD_HASH;

export async function POST(request: NextRequest) {
  try {
    // Check if admin is authenticated
    const authenticated = await isAdminAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Verify current password
    const isCurrentPasswordValid = verifyAdminCredentials(
      'licensing',
      currentPassword,
      currentPasswordHash
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Check if new password matches confirm password
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New passwords do not match' },
        { status: 400 }
      );
    }

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', details: validation.errors },
        { status: 400 }
      );
    }

    // Update password hash
    currentPasswordHash = hashPassword(newPassword);

    return NextResponse.json(
      { success: true, message: 'Password changed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
