import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from '@/lib/audit-logger';

export async function GET(request: NextRequest) {
  try {
    const auditLogger = new AuditLogger();
    const searchParams = request.nextUrl.searchParams;

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let report;

    if (startDate && endDate) {
      report = auditLogger.generateReport(
        new Date(startDate),
        new Date(endDate)
      );
    } else {
      report = auditLogger.generateReport();
    }

    return NextResponse.json(
      {
        success: true,
        report,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Audit log statistics error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}
