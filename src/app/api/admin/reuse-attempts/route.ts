import { NextRequest, NextResponse } from 'next/server';
import { getAllReuseAttempts, getReuseStatistics } from '@/lib/machine-binding/reuse-detector';

/**
 * GET /api/admin/reuse-attempts
 * Fetch all reuse attempts with optional date range filter
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get all reuse attempts
    let attempts = getAllReuseAttempts();

    // Apply date range filter if provided
    if (startDate) {
      const start = new Date(startDate);
      attempts = attempts.filter((attempt) => new Date(attempt.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      attempts = attempts.filter((attempt) => new Date(attempt.timestamp) <= end);
    }

    // Get statistics
    const statistics = getReuseStatistics();

    // Sort by timestamp (most recent first)
    attempts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      attempts,
      statistics,
      count: attempts.length,
    });
  } catch (error) {
    console.error('Error fetching reuse attempts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch reuse attempts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
