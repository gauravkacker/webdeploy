/**
 * Dropbox Cleanup API
 * Handles cleanup of old backups on the backend (avoids CORS issues)
 */

import { NextRequest, NextResponse } from 'next/server';

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const SYNC_FOLDER = '/clinic-backups';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, keepCount = 5 } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token required' },
        { status: 400 }
      );
    }

    console.log(`🧹 Starting cleanup on backend - keeping only ${keepCount} backups...`);

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

    // If folder doesn't exist (404), that's OK - no files to clean up yet
    if (listResponse.status === 404) {
      console.log('Folder does not exist yet - no cleanup needed');
      return NextResponse.json({
        success: true,
        message: 'No backups to cleanup yet',
        deleted: 0,
        remaining: 0,
      });
    }

    if (!listResponse.ok) {
      const error = await listResponse.text();
      console.error('Failed to list files:', error);
      return NextResponse.json(
        { error: `Failed to list files: ${error}` },
        { status: 400 }
      );
    }

    const listData = (await listResponse.json()) as {
      entries?: Array<{ name: string; path_display: string }>;
    };

    console.log(`📋 Total entries in folder: ${listData.entries?.length || 0}`);
    if (listData.entries) {
      listData.entries.forEach((entry) => {
        console.log(`  - ${entry.name}`);
      });
    }

    if (!listData.entries || listData.entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No files found',
        deleted: 0,
        remaining: 0,
      });
    }

    const files = listData.entries
      .filter((f) => f.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name)); // Sort descending (newest first)

    console.log(`📄 JSON backup files found: ${files.length}`);
    files.forEach((f) => {
      console.log(`  - ${f.name}`);
    });

    let deletedCount = 0;

    // Delete old files, keep only keepCount
    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);
      console.log(`🗑️ Deleting ${filesToDelete.length} old backups...`);

      for (const file of filesToDelete) {
        try {
          const deleteResponse = await fetch(`${DROPBOX_API_URL}/files/delete_v2`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: file.path_display,
            }),
          });

          if (!deleteResponse.ok) {
            const error = await deleteResponse.text();
            console.warn(`Failed to delete ${file.name}: ${error}`);
          } else {
            console.log(`✅ Deleted: ${file.name}`);
            deletedCount++;
          }
        } catch (error) {
          console.warn(`Failed to delete ${file.name}:`, error);
        }
      }
    } else {
      console.log(`✅ All ${files.length} backups are within limit of ${keepCount}`);
    }

    const remaining = Math.min(files.length, keepCount);
    return NextResponse.json({
      success: true,
      message: `Cleanup complete - deleted ${deletedCount} old backups, keeping ${remaining} backups`,
      deleted: deletedCount,
      remaining,
      totalFound: files.length,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
