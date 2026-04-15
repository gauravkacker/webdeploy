import fs from 'fs';
import path from 'path';

/**
 * Session Folder Manager
 * Handles server-side WhatsApp session folder operations
 */

export interface SessionFolderStatus {
  success: boolean;
  exists: boolean;
  accessible: boolean;
  readable: boolean;
  writable: boolean;
  permissions?: string;
  owner?: string;
  size?: number;
  fileCount?: number;
  lastModified?: string;
  path: string;
  error?: string;
  suggestion?: string;
}

export interface CreateFolderResult {
  success: boolean;
  path: string;
  created: boolean;
  permissions?: string;
  owner?: string;
  timestamp?: string;
  message?: string;
  error?: string;
  code?: string;
  details?: string;
}

/**
 * Validates path to prevent path traversal attacks
 */
export function validatePath(inputPath: string): { valid: boolean; error?: string } {
  try {
    // Resolve to absolute path
    const resolved = path.resolve(inputPath);

    // Ensure it's within allowed directory
    const allowedBase = '/home/ubuntu';
    if (!resolved.startsWith(allowedBase)) {
      return {
        valid: false,
        error: 'Path traversal detected: path must be within /home/ubuntu',
      };
    }

    // Reject paths with .. or other suspicious patterns
    if (resolved.includes('..') || resolved.includes('~')) {
      return {
        valid: false,
        error: 'Invalid path characters detected',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Creates session folder with proper permissions
 */
export function createSessionFolder(folderPath: string): CreateFolderResult {
  try {
    // Validate path first
    const validation = validatePath(folderPath);
    if (!validation.valid) {
      return {
        success: false,
        path: folderPath,
        created: false,
        error: validation.error,
        code: 'EINVAL',
      };
    }

    // Check if folder already exists
    const exists = fs.existsSync(folderPath);

    if (!exists) {
      // Create folder with recursive option
      fs.mkdirSync(folderPath, { recursive: true, mode: 0o755 });
      console.log(`[WhatsApp Setup] Created session folder: ${folderPath}`);
    }

    // Set permissions to 755
    try {
      fs.chmodSync(folderPath, 0o755);
    } catch (error) {
      console.warn(`[WhatsApp Setup] Could not set permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Get folder stats
    const stats = fs.statSync(folderPath);
    const permissions = (stats.mode & parseInt('777', 8)).toString(8);

    return {
      success: true,
      path: folderPath,
      created: !exists,
      permissions,
      owner: 'ubuntu',
      timestamp: new Date().toISOString(),
      message: exists ? 'Session folder already exists' : 'Session folder created successfully',
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`[WhatsApp Setup] Failed to create folder: ${err.message}`);

    return {
      success: false,
      path: folderPath,
      created: false,
      error: err.message,
      code: err.code,
      details: `Cannot create folder at ${folderPath}`,
    };
  }
}

/**
 * Checks folder permissions (read/write access)
 */
export function checkFolderPermissions(folderPath: string): {
  readable: boolean;
  writable: boolean;
  error?: string;
} {
  try {
    // Check read access
    fs.accessSync(folderPath, fs.constants.R_OK);
    const readable = true;

    // Check write access
    fs.accessSync(folderPath, fs.constants.W_OK);
    const writable = true;

    return { readable, writable };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      readable: false,
      writable: false,
      error: err.message,
    };
  }
}

/**
 * Gets session folder status
 */
export function getSessionFolderStatus(folderPath: string): SessionFolderStatus {
  try {
    const exists = fs.existsSync(folderPath);

    if (!exists) {
      return {
        success: false,
        exists: false,
        accessible: false,
        readable: false,
        writable: false,
        path: folderPath,
        error: 'Folder does not exist',
        suggestion: 'Call POST /api/whatsapp/setup-session-folder to create it',
      };
    }

    // Check if it's a directory
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        exists: true,
        accessible: false,
        readable: false,
        writable: false,
        path: folderPath,
        error: 'Path is not a directory',
      };
    }

    // Check permissions
    const permissions = checkFolderPermissions(folderPath);
    const readable = permissions.readable;
    const writable = permissions.writable;
    const accessible = readable && writable;

    // Get folder stats
    const permissions_octal = (stats.mode & parseInt('777', 8)).toString(8);

    // Count files in folder
    let fileCount = 0;
    try {
      const files = fs.readdirSync(folderPath);
      fileCount = files.length;
    } catch (error) {
      console.warn(`[WhatsApp Status] Could not count files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: accessible,
      exists: true,
      accessible,
      readable,
      writable,
      permissions: permissions_octal,
      owner: 'ubuntu',
      size: stats.size,
      fileCount,
      lastModified: stats.mtime.toISOString(),
      path: folderPath,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`[WhatsApp Status] Error checking folder status: ${err.message}`);

    return {
      success: false,
      exists: false,
      accessible: false,
      readable: false,
      writable: false,
      path: folderPath,
      error: err.message,
    };
  }
}
