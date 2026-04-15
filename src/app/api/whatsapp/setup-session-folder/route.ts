import { NextRequest, NextResponse } from 'next/server';
import { createSessionFolder, validatePath } from '@/lib/whatsapp/session-folder-manager';

const DEFAULT_SESSION_PATH = '/home/ubuntu/whatsapp-sessions';

/**
 * POST /api/whatsapp/setup-session-folder
 * Creates WhatsApp session folder on the server with proper permissions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionPath = body.sessionPath || DEFAULT_SESSION_PATH;

    console.log(`[WhatsApp Setup] Creating session folder: ${sessionPath}`);

    // Validate path
    const validation = validatePath(sessionPath);
    if (!validation.valid) {
      console.error(`[WhatsApp Setup] Path validation failed: ${validation.error}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid path',
          details: validation.error,
          code: 'EINVAL',
        },
        { status: 400 }
      );
    }

    // Create folder
    const result = createSessionFolder(sessionPath);

    if (!result.success) {
      console.error(`[WhatsApp Setup] Failed to create folder: ${result.error}`);
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          details: result.details,
          code: result.code,
        },
        { status: 500 }
      );
    }

    console.log(`[WhatsApp Setup] Folder created successfully at: ${sessionPath}`);

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        path: result.path,
        created: result.created,
        permissions: result.permissions,
        owner: result.owner,
        timestamp: result.timestamp,
      },
      { status: 200 }
    );
  } catch (error) {
    const err = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WhatsApp Setup] Unexpected error: ${err}`);

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
