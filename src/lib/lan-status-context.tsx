'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface LANStatusContextType {
  isElectionComplete: boolean;
  isMainServer: boolean | null;
  serverRole: 'main' | 'child' | null;
  isElectionInProgress: boolean;
  // Manual network selection state (new)
  manualConnectionState: 'disconnected' | 'connecting' | 'connected' | 'error' | null;
  manualRole: 'main' | 'child' | null;
  manualNetworkName: string | null;
}

const LANStatusContext = createContext<LANStatusContextType>({
  isElectionComplete: false,
  isMainServer: null,
  serverRole: null,
  isElectionInProgress: false,
  manualConnectionState: null,
  manualRole: null,
  manualNetworkName: null,
});

const CURRENT_USER_KEY = 'clinic_current_user';

// DISABLED: Automatic LAN election fallback
// Set to true to enable automatic election when manual selection is not done
// Currently disabled - manual server selection is required
const ENABLE_AUTOMATIC_ELECTION = false;

export function LANStatusProvider({ children }: { children: React.ReactNode }) {
  const [isElectionComplete, setIsElectionComplete] = useState(false);
  const [isMainServer, setIsMainServer] = useState<boolean | null>(null);
  const [serverRole, setServerRole] = useState<'main' | 'child' | null>(null);
  const [isElectionInProgress, setIsElectionInProgress] = useState(false);

  // Manual network selection state — read from localStorage, updated by polling
  const [manualConnectionState, setManualConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error' | null>(null);
  const [manualRole, setManualRole] = useState<'main' | 'child' | null>(null);
  const [manualNetworkName, setManualNetworkName] = useState<string | null>(null);

  const hasInitialized = useRef(false);
  const lastUserState = useRef<string | null>(null);
  const pathname = usePathname();
  const manualPollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll manual connection state from localStorage
  useEffect(() => {
    const readManualState = () => {
      try {
        const savedState = localStorage.getItem('lanConnectionState');
        const savedConfig = localStorage.getItem('lanNetworkConfig');

        if (savedState) {
          const state = JSON.parse(savedState);
          setManualConnectionState(state.state || null);
          setManualRole(state.role || null);
        } else {
          setManualConnectionState(null);
          setManualRole(null);
        }

        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          setManualNetworkName(config.selectedNetworkName || null);
        }
      } catch {
        // Ignore parse errors
      }
    };

    readManualState();
    manualPollRef.current = setInterval(readManualState, 3000);

    return () => {
      if (manualPollRef.current) clearInterval(manualPollRef.current);
    };
  }, []);

  // Existing election logic — DISABLED (set ENABLE_AUTOMATIC_ELECTION to true to re-enable)
  useEffect(() => {
    // Automatic election is currently disabled - manual server selection is required
    if (!ENABLE_AUTOMATIC_ELECTION) {
      console.log('[LAN Status] Automatic election is disabled - manual server selection required');
      return;
    }

    const currentUser = localStorage.getItem(CURRENT_USER_KEY);
    const userLoggedOut = lastUserState.current !== null && currentUser === null;
    lastUserState.current = currentUser;

    if (userLoggedOut) {
      console.log('[LAN Status] User logged out detected, resetting election state');
      hasInitialized.current = false;
      setIsElectionComplete(false);
      setIsElectionInProgress(false);
      setIsMainServer(null);
      setServerRole(null);
      return;
    }

    if (pathname === '/login' || pathname?.includes('/licensing')) {
      console.log('[LAN Status] On login/licensing page, skipping election');
      return;
    }

    if (hasInitialized.current) {
      console.log('[LAN Status] Election already completed, skipping re-election on route change');
      return;
    }

    if (currentUser) {
      console.log('[LAN Status] User logged in, starting election');
      hasInitialized.current = true;
    } else {
      return;
    }

    let ipcReceived = false;
    let electionCompleteTimer: NodeJS.Timeout | null = null;

    setIsElectionInProgress(true);
    console.log('[LAN Status] Election in progress...');

    const handleElectionComplete = (_event: any, data: any) => {
      const { isMainServer } = data || {};
      ipcReceived = true;

      if (electionCompleteTimer) {
        clearTimeout(electionCompleteTimer);
        electionCompleteTimer = null;
      }

      console.log('[LAN Status] IPC election complete - role:', isMainServer ? 'main' : 'child');
      setIsMainServer(isMainServer);
      setServerRole(isMainServer ? 'main' : 'child');
      setIsElectionComplete(true);
      setIsElectionInProgress(false);
    };

    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.ipcRenderer.on('lan:election-complete', handleElectionComplete);
      console.log('[LAN Status] IPC listener registered for lan:election-complete');
    }

    electionCompleteTimer = setTimeout(async () => {
      if (ipcReceived) {
        console.log('[LAN Status] IPC already received, skipping API fallback');
        return;
      }

      console.log('[LAN Status] IPC not received after 12s, checking API as fallback');
      try {
        const response = await fetch('/api/lan/status');
        if (response.ok) {
          const data = await response.json();
          const isMain = data.isMainServer !== false;
          console.log('[LAN Status] API fallback - role:', isMain ? 'main' : 'child');
          setIsMainServer(isMain);
          setServerRole(isMain ? 'main' : 'child');
          setIsElectionComplete(true);
          setIsElectionInProgress(false);
        } else {
          setIsMainServer(true);
          setServerRole('main');
          setIsElectionComplete(true);
          setIsElectionInProgress(false);
        }
      } catch (err) {
        console.error('[LAN Status] Failed to check API status:', err);
        setIsMainServer(true);
        setServerRole('main');
        setIsElectionComplete(true);
        setIsElectionInProgress(false);
      }
    }, 12000);

    return () => {
      if (electionCompleteTimer) clearTimeout(electionCompleteTimer);
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        (window as any).electronAPI.ipcRenderer.removeAllListeners('lan:election-complete');
      }
    };
  }, [pathname]);

  return (
    <LANStatusContext.Provider
      value={{
        isElectionComplete,
        isMainServer,
        serverRole,
        isElectionInProgress,
        manualConnectionState,
        manualRole,
        manualNetworkName,
      }}
    >
      {children}
    </LANStatusContext.Provider>
  );
}

export function useLANStatus() {
  return useContext(LANStatusContext);
}
