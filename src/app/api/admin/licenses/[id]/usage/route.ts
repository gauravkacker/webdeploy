/**
 * GET /api/admin/licenses/:id/usage - Get license usage details
 */

import { serverDb } from '@/lib/db/server-database';
import type { License, LicenseUsage } from '@/lib/db/schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const license = serverDb.getById<License>('licenses', id);
    if (!license) {
      return Response.json(
        { error: 'License not found' },
        { status: 404 }
      );
    }

    // Get usage info
    const usages = serverDb.getAll<LicenseUsage>('license_usage');
    const usage = usages.find((u) => u.licenseId === id);

    if (!usage) {
      return Response.json(
        { error: 'Usage record not found' },
        { status: 404 }
      );
    }

    // Calculate remaining
    const prescriptionsRemaining = (license.maxPrescriptions || 0) - usage.prescriptionsUsed;
    const daysRemaining = license.expiresAt
      ? Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    return Response.json({
      usage,
      prescriptionsRemaining,
      daysRemaining,
      percentageUsed: license.maxPrescriptions
        ? Math.round((usage.prescriptionsUsed / license.maxPrescriptions) * 100)
        : 0,
    });
  } catch (error) {
    console.error('Get usage error:', error);
    return Response.json(
      { error: 'Failed to get usage' },
      { status: 500 }
    );
  }
}
