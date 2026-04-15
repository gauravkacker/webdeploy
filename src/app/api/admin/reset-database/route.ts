import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // This endpoint is for server-side reset
    // The actual localStorage clearing needs to happen on the client
    
    return NextResponse.json({
      success: true,
      message: 'Database reset endpoint ready. Use the client-side reset function.',
      instructions: 'Call window.localStorage.clear() in browser console or use the reset page'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to reset database', details: String(error) },
      { status: 500 }
    );
  }
}
