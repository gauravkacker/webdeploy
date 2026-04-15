/**
 * Dropbox Download Backup API
 * Downloads a specific backup file from Dropbox
 */

import { NextRequest, NextResponse } from 'next/server';

const DROPBOX_API_URL = 'https://content.dropboxapi.com/2';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, path } = await request.json();

    if (!accessToken || !path) {
      return NextResponse.json(
        { error: 'Access token and path required' },
        { status: 400 }
      );
    }

    // Download file from Dropbox
    const downloadResponse = await fetch(`${DROPBOX_API_URL}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: path,
        }),
      },
    });

    if (!downloadResponse.ok) {
      const error = await downloadResponse.text();
      console.error('Failed to download file:', error);
      return NextResponse.json(
        { error: `Failed to download file: ${error}` },
        { status: 400 }
      );
    }

    const content = await downloadResponse.text();
    
    return NextResponse.json({
      success: true,
      data: content,
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
