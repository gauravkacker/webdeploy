/**
 * API Route for License Audit Log
 * Retrieves audit history for a specific license
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from '@/lib/audit-logger';

/**
 * GET /api/admin/licenses/[id]/audit-log
 * Get audit log entries for a specific license
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('eventType');

    const auditLogger = new AuditLogger();
    let entries = auditLogger.getLicenseAuditHistory(params.id);

    // Filter by event type if specified
    if (eventType) {
      entries = entries.filter(entry => entry.action === eventType);
    }

    return NextResponse.json({
      licenseId: params.id,
      entries,
      total: entries.length,
    });
  } catch (error) {
    console.error('Failed to get audit log:', error);
    return NextResponse.json(
      { error: 'Failed to get audit log' },
      { status: 500 }
    );
  }
}
