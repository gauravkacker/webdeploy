import { getSessionFolderStatus } from './session-folder-manager';

const DEFAULT_SESSION_PATH = '/home/ubuntu/whatsapp-sessions';

/**
 * Validates session folder on backend startup
 */
export function validateSessionFolderOnStartup(): boolean {
  const sessionPath = process.env.WHATSAPP_SESSION_PATH || DEFAULT_SESSION_PATH;

  console.log(`[Backend] Session path configured: ${sessionPath}`);

  // Check if folder exists and is accessible
  const status = getSessionFolderStatus(sessionPath);

  if (!status.exists) {
    console.error(`[Backend] Session folder not found: ${sessionPath}`);
    console.error('[Backend] Call POST /api/whatsapp/setup-session-folder to create it');
    return false;
  }

  if (!status.readable) {
    console.error(`[Backend] Cannot read session folder: ${sessionPath}`);
    console.error('[Backend] Check folder permissions (should be 755)');
    return false;
  }

  if (!status.writable) {
    console.error(`[Backend] Cannot write to session folder: ${sessionPath}`);
    console.error('[Backend] Check folder permissions (should be 755)');
    return false;
  }

  console.log(`[Backend] Session folder validated successfully: ${sessionPath}`);
  return true;
}

/**
 * Gets the configured session path
 */
export function getConfiguredSessionPath(): string {
  return process.env.WHATSAPP_SESSION_PATH || DEFAULT_SESSION_PATH;
}
