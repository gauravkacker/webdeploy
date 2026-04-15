import { NextRequest, NextResponse } from 'next/server';
import { getSessionFolderStatus } from '@/lib/whatsapp/session-folder-manager';

const DEFAULT_SESSION_PATH = '/home/ubuntu/whatsapp-sessions';

/**
 * GET /api/whatsapp/session-folder-status
 * Checks if the session folder exists and is accessible
 */
export async function GET(request: NextRequest) {
  try {
    // Get session path from query parameter or use default
    const sessionPath = request.nextUrl.searchParams.get('path') || DEFAULT_SESSION_PATH;

    console.log(`[WhatsApp Status] Checking session folder: ${sessionPath}`);

    // Get folder status
    const status = getSessionFolderStatus(sessionPath);

    if (!status.success) {
      console.warn(`[WhatsApp Status] Folder not accessible: ${status.error}`);
      return NextResponse.json(
        {
          success: false,
          exists: status.exists,
          accessible: status.accessible,
          error: status.error,
          suggestion: status.suggestion,
          path: status.path,
        },
        { status: 404 }
      );
    }

    console.log(
      `[WhatsApp Status] Folder exists: ${status.exists}, Readable: ${status.readable}, Writable: ${status.writable}`
    );

    return NextResponse.json(
      {
        success: true,
        exists: status.exists,
        accessible: status.accessible,
        readable: status.readable,
        writable: status.writable,
        permissions: status.permissions,
        owner: status.owner,
        size: status.size,
        fileCount: status.fileCount,
        lastModified: status.lastModified,
        path: status.path,
      },
      { status: 200 }
    );
  } catch (error) {
    const err = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WhatsApp Status] Unexpected error: ${err}`);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: err,
      },
      { status: 500 }
    );
  }
}
