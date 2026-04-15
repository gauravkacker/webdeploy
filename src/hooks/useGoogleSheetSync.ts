/**
 * Hook for managing Google Sheet sync in the background
 */

import { useEffect, useRef } from 'react';
import { startGoogleSheetPolling, stopGoogleSheetPolling } from '@/lib/google-sheets-sync';

export function useGoogleSheetSync(isEnabled: boolean = false) {
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      if (pollingTimerRef.current) {
        stopGoogleSheetPolling(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    // Check if auto-sync is enabled on app load
    const checkAndStartSync = () => {
      try {
        const saved = localStorage.getItem('onlineAppointmentsSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.autoSyncEnabled && parsed.googleSheetLink) {
            console.log('[Google Sheets Sync] Starting background sync...');
            const timerId = startGoogleSheetPolling(
              parsed.googleSheetLink,
              parsed.syncInterval || 5
            );
            pollingTimerRef.current = timerId;
          }
        }
      } catch (error) {
        console.error('[Google Sheets Sync] Error starting background sync:', error);
      }
    };

    checkAndStartSync();

    return () => {
      if (pollingTimerRef.current) {
        stopGoogleSheetPolling(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isEnabled]);
}
