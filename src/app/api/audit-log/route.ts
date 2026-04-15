import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from '@/lib/audit-logger';

export async function GET(request: NextRequest) {
  try {
    const auditLogger = new AuditLogger();
    const searchParams = request.nextUrl.searchParams;

    const userId = searchParams.get('userId');
    const patientId = searchParams.get('patientId');
    const itemType = searchParams.get('itemType') as 'fee' | 'prescription' | 'bill' | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'json';

    let entries;

    // Filter based on query parameters
    if (userId) {
      entries = auditLogger.getEntriesByUser(userId);
    } else if (patientId) {
      entries = auditLogger.getEntriesByPatient(patientId);
    } else if (itemType) {
      entries = auditLogger.getEntriesByItemType(itemType);
    } else if (startDate && endDate) {
      entries = auditLogger.getEntriesByDateRange(
        new Date(startDate),
        new Date(endDate)
      );
    } else {
      entries = auditLogger.getAllEntries();
    }

    // Format response
    if (format === 'csv') {
      const csv = auditLogger.exportAsCSV();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="audit-log.csv"',
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        count: entries.length,
        entries,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Audit log retrieval error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}
