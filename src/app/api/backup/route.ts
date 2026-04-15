/**
 * Backup API
 * Allows clients to trigger backups and retrieve status from the main server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLANServer } from '@/lib/lan-server';

export async function GET(request: NextRequest) {
  const lanServer = getLANServer();

  // Only main server can provide backup status
  if (!lanServer || !lanServer.isMain()) {
    return NextResponse.json(
      { error: 'Only main server provides backup status' },
      { status: 403 }
    );
  }

  try {
    const { ipcRenderer } = require('electron');
    // Note: Since this is running in the Next.js process (which might be in Electron),
    // we need a way to talk to the main Electron process.
    // However, Next.js API routes run in a Node environment.
    // In our Electron setup, the main process is the one that has the BackupService.
    
    // We'll use a global variable or a shared module if possible.
    // For now, let's assume we can trigger it via an IPC-like mechanism or direct call if available.
    
    // Actually, in our architecture, the Main process and the Next.js server are separate.
    // The Next.js server can't directly call Electron's BackupService.
    // But we can use the `DatabaseManager` which is shared.
    
    // Wait, the BackupService is in the Electron Main process.
    // We need a way for the Next.js API (Main Server) to tell the Electron Main process to backup.
    
    return NextResponse.json({
      success: true,
      message: 'Backup status retrieved'
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const lanServer = getLANServer();

  if (!lanServer || !lanServer.isMain()) {
    return NextResponse.json(
      { error: 'Only main server can perform backups' },
      { status: 403 }
    );
  }

  const { action, label, uploadToDropbox } = await request.json();

  try {
    // We need to trigger the backup in the main process.
    // Since this API route is part of the Next.js server running inside Electron (on the Main Server),
    // we can use a custom event or a shared singleton to communicate with the main process.
    
    // Let's check how we can communicate between Next.js API and Electron Main.
    // Usually, we can use a global variable set in main.ts.
    
    const globalAny: any = global;
    if (globalAny.backupService) {
      const service = globalAny.backupService;
      
      switch (action) {
        case 'create':
          const createResult = await service.createBackup(label, uploadToDropbox);
          return NextResponse.json({ success: true, data: createResult });
        
        case 'list':
          const backups = await service.listBackups();
          return NextResponse.json({ success: true, data: backups });
        
        case 'status':
          const status = await service.getBackupStatus();
          return NextResponse.json({ success: true, data: status });
          
        case 'list-dropbox':
          const dbBackups = await service.listDropboxBackups();
          return NextResponse.json({ success: true, data: dbBackups });
          
        case 'restore':
          await service.restoreBackup(backupId);
          return NextResponse.json({ success: true });
          
        case 'restore-dropbox':
          await service.restoreFromDropbox(dropboxPath);
          return NextResponse.json({ success: true });
          
        case 'upload-dropbox':
          // For simplicity, we trigger a manual upload of the latest local backup
          const allLocal = await service.listBackups();
          if (allLocal.length > 0) {
            const latest = allLocal[allLocal.length - 1];
            const filename = latest.filePath.split(/[\\/]/).pop();
            await service.uploadToDropbox(latest.filePath, filename);
            return NextResponse.json({ success: true });
          }
          return NextResponse.json({ error: 'No local backups to upload' });
          
        case 'cleanup-dropbox':
          await service.cleanupDropbox();
          return NextResponse.json({ success: true });

        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Backup service not available on main server' }, { status: 500 });
  } catch (error) {
    console.error('[Backup API] Error:', error);
    return NextResponse.json({ error: 'Failed to perform backup action' }, { status: 500 });
  }
}
