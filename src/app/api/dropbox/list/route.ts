/**
 * Dropbox List Backups API
 * Lists all backup files in Dropbox folder
 */

import { NextRequest, NextResponse } from 'next/server';

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const SYNC_FOLDER = '/clinic-backups';

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token required' },
        { status: 400 }
      );
    }

    // List files in Dropbox folder
    const listResponse = await fetch(`${DROPBOX_API_URL}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: SYNC_FOLDER,
        recursive: false,
        include_media_info: false,
      }),
    });

    if (!listResponse.ok) {
      const error = await listResponse.text();
      console.error('Failed to list files:', error);
      return NextResponse.json(
        { error: `Failed to list files: ${error}` },
        { status: 400 }
      );
    }

    const listData = (await listResponse.json()) as {
      entries?: Array<{ name: string; path_display: string; server_modified: string; size: number }>;
    };

    // Filter JSON files and sort by date (newest first)
    const backups = (listData.entries || [])
      .filter((f) => f.name.endsWith('.json'))
      .sort((a, b) => new Date(b.server_modified).getTime() - new Date(a.server_modified).getTime())
      .map((f) => ({
        name: f.name,
        path: f.path_display,
        date: f.server_modified,
        size: f.size,
      }));

    return NextResponse.json({
      success: true,
      backups,
      count: backups.length,
    });
  } catch (error) {
    console.error('List error:', error);
    return NextResponse.json(
      { error: `List failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
