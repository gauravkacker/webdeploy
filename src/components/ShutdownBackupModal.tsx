"use client";

import { useEffect, useState } from 'react';
import { isElectron } from '@/lib/ipc-client';

export function ShutdownBackupModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<'backing-up' | 'complete' | 'error' | 'skipped'>('backing-up');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isElectron()) return;

    // Access ipcRenderer from preload
    const ipcRenderer = (window as any).electronAPI?.ipcRenderer;
    if (!ipcRenderer) return;

    const handleBeforeQuit = () => {
      console.log('[UI] App shutting down, showing backup modal');
      setIsVisible(true);
      setStatus('backing-up');
      setMessage('Backing up data before closing...');
      setErrorMessage('');
    };

    const handleBackupComplete = () => {
      console.log('[UI] Backup complete');
      setStatus('complete');
      setMessage('✓ Backup complete. Safe to close.');
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsVisible(false);
      }, 2000);
    };

    const handleBackupSkipped = () => {
      console.log('[UI] No changes to backup');
      setStatus('skipped');
      setMessage('No changes detected. Closing...');
      
      // Auto-close after 1 second
      setTimeout(() => {
        setIsVisible(false);
      }, 1000);
    };

    const handleBackupError = (event: any, data: any) => {
      console.error('[UI] Backup error:', data.error);
      setStatus('error');
      setMessage('⚠ Backup failed');
      setErrorMessage(data.error || 'Unknown error occurred');
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        setIsVisible(false);
      }, 3000);
    };

    ipcRenderer.on('app:before-quit', handleBeforeQuit);
    ipcRenderer.on('backup:complete', handleBackupComplete);
    ipcRenderer.on('backup:skipped', handleBackupSkipped);
    ipcRenderer.on('backup:error', handleBackupError);

    return () => {
      ipcRenderer.removeAllListeners('app:before-quit');
      ipcRenderer.removeAllListeners('backup:complete');
      ipcRenderer.removeAllListeners('backup:skipped');
      ipcRenderer.removeAllListeners('backup:error');
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0">
            {status === 'backing-up' && (
              <div className="animate-spin">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            )}
            {status === 'complete' && (
              <div className="text-green-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'skipped' && (
              <div className="text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            {status === 'error' && (
              <div className="text-red-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${
              status === 'error' ? 'text-red-900' :
              status === 'complete' ? 'text-green-900' :
              status === 'skipped' ? 'text-blue-900' :
              'text-gray-900'
            }`}>
              {message}
            </p>
            
            {errorMessage && (
              <p className="text-xs text-red-600 mt-2">
                {errorMessage}
              </p>
            )}

            {status === 'backing-up' && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div className="bg-blue-600 h-1 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Please wait...</p>
              </div>
            )}

            {status === 'complete' && (
              <p className="text-xs text-gray-600 mt-2">
                Your data has been safely backed up.
              </p>
            )}

            {status === 'skipped' && (
              <p className="text-xs text-gray-600 mt-2">
                No changes were made since last backup.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
