import { NextRequest, NextResponse } from 'next/server';
import { getTransferHistory } from '@/lib/machine-binding/admin-license-transfer';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const machineId = searchParams.get('machineId');

    if (!machineId) {
      return NextResponse.json(
        { error: 'machineId query parameter is required' },
        { status: 400 }
      );
    }

    const history = await getTransferHistory(machineId);

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('Error in transfer history endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
