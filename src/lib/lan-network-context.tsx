'use client';

/**
 * LAN Network Context Provider
 * Manages manual LAN network selection state across the application.
 * Follows dual-mode architecture: works in both web and desktop modes.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { NetworkInfo, DiscoveredInstance, ConnectedInstance } from '@/types/lan-network';

export type ConnectionStateValue = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LANNetworkContextType {
  // State
  connectionState: ConnectionStateValue;
  role: 'main' | 'child' | null;
  selectedNetwork: NetworkInfo | null;
  discoveredInstances: DiscoveredInstance[];
  connectedInstances: ConnectedInstance[];
  isDiscovering: boolean;
  discoveryProgress: number;
  error: string | null;

  // Actions
  getNetworks: () => Promise<NetworkInfo[]>;
  connectToNetwork: (network: NetworkInfo) => Promise<void>;
  startDiscovery: () => Promise<void>;
  selectRole: (role: 'main', mainServerId?: string) => Promise<void>;
  selectChildRole: (mainServerId: string, mainServerIp: string, mainServerPort?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

const LANNetworkContext = createContext<LANNetworkContextType>({
  connectionState: 'disconnected',
  role: null,
  selectedNetwork: null,
  discoveredInstances: [],
  connectedInstances: [],
  isDiscovering: false,
  discoveryProgress: 0,
  error: null,
  getNetworks: async () => [],
  connectToNetwork: async () => {},
  startDiscovery: async () => {},
  selectRole: async () => {},
  selectChildRole: async () => {},
  disconnect: async () => {},
  clearError: () => {},
});

export function LANNetworkProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionStateValue>('disconnected');
  const [role, setRole] = useState<'main' | 'child' | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkInfo | null>(null);
  const [discoveredInstances, setDiscoveredInstances] = useState<DiscoveredInstance[]>([]);
  const [connectedInstances, setConnectedInstances] = useState<ConnectedInstance[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const discoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const discoveryProgressRef = useRef<NodeJS.Timeout | null>(null);
  const syncPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('lanConnectionState');
      const savedConfig = localStorage.getItem('lanNetworkConfig');

      if (savedState) {
        const state = JSON.parse(savedState);
        // Only restore if was connected — don't auto-reconnect, just restore UI state
        if (state.state === 'connected') {
          setConnectionState('connected');
          setRole(state.role || null);
          setConnectedInstances(state.connectedInstances || []);
        }
      }

      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        if (config.selectedNetworkId) {
          setSelectedNetwork({
            id: config.selectedNetworkId,
            name: config.selectedNetworkName || '',
            ipRange: '',
            broadcastAddress: config.broadcastAddress || '',
            isAvailable: true,
          });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Poll sync status when connected
  useEffect(() => {
    if (connectionState === 'connected') {
      syncPollingRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/lan/sync-status');
          if (res.ok) {
            const data = await res.json();
            if (data.connectedInstances?.length > 0) {
              setConnectedInstances(data.connectedInstances);
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 5000);
    }

    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
        syncPollingRef.current = null;
      }
    };
  }, [connectionState]);

  const getNetworks = useCallback(async (): Promise<NetworkInfo[]> => {
    try {
      const res = await fetch('/api/lan/networks');
      if (!res.ok) throw new Error('Failed to fetch networks');
      const data = await res.json();
      return data.networks || [];
    } catch (err) {
      console.error('[LANNetworkContext] getNetworks error:', err);
      return [];
    }
  }, []);

  const connectToNetwork = useCallback(async (network: NetworkInfo): Promise<void> => {
    setError(null);
    setConnectionState('connecting');
    setSelectedNetwork(network);

    try {
      const res = await fetch('/api/lan/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          networkId: network.id,
          networkName: network.name,
          broadcastAddress: network.broadcastAddress,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to connect');
      }

      // Persist selection
      localStorage.setItem('lanNetworkConfig', JSON.stringify({
        selectedNetworkId: network.id,
        selectedNetworkName: network.name,
        broadcastAddress: network.broadcastAddress,
        lastConnectedTime: Date.now(),
      }));

      // Start discovery immediately after connecting
      await startDiscoveryInternal(network.broadcastAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setConnectionState('error');
    }
  }, []);  

  const startDiscoveryInternal = async (broadcastAddress: string): Promise<void> => {
    setIsDiscovering(true);
    setDiscoveryProgress(0);
    setDiscoveredInstances([]);

    // Trigger discovery on server
    try {
      await fetch('/api/lan/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastAddress }),
      });
    } catch {
      // Continue even if server-side discovery fails (web mode)
    }

    // Progress bar over 5 seconds
    const startTime = Date.now();
    discoveryProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / 5000) * 100);
      setDiscoveryProgress(progress);
    }, 100);

    // Poll for discovered instances
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/lan/discover');
        if (res.ok) {
          const data = await res.json();
          if (data.instances?.length > 0) {
            setDiscoveredInstances(data.instances);
          }
        }
      } catch {
        // Ignore
      }
    }, 500);

    // Complete after 5 seconds
    discoveryTimerRef.current = setTimeout(() => {
      clearInterval(pollInterval);
      if (discoveryProgressRef.current) {
        clearInterval(discoveryProgressRef.current);
        discoveryProgressRef.current = null;
      }
      setDiscoveryProgress(100);
      setIsDiscovering(false);
    }, 5000);
  };

  const startDiscovery = useCallback(async (): Promise<void> => {
    if (!selectedNetwork) return;
    await startDiscoveryInternal(selectedNetwork.broadcastAddress);
  }, [selectedNetwork]);  

  const selectRole = useCallback(async (roleValue: 'main'): Promise<void> => {
    setError(null);
    try {
      const res = await fetch('/api/lan/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: roleValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to assign role');
      }

      setRole('main');
      setConnectionState('connected');

      // Persist state
      const stateToSave = {
        state: 'connected',
        role: 'main',
        connectedInstances: [],
        lastStateChange: Date.now(),
      };
      localStorage.setItem('lanConnectionState', JSON.stringify(stateToSave));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Role assignment failed';
      setError(message);
      setConnectionState('error');
    }
  }, []);

  const selectChildRole = useCallback(async (
    mainServerId: string,
    mainServerIp: string,
    mainServerPort = 3000
  ): Promise<void> => {
    setError(null);
    try {
      const res = await fetch('/api/lan/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'child', mainServerId, mainServerIp, mainServerPort }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to connect as child');
      }

      setRole('child');
      setConnectionState('connected');

      const stateToSave = {
        state: 'connected',
        role: 'child',
        mainServerId,
        connectedInstances: [],
        lastStateChange: Date.now(),
      };
      localStorage.setItem('lanConnectionState', JSON.stringify(stateToSave));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Child connection failed';
      setError(message);
      setConnectionState('error');
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/lan/disconnect', { method: 'POST' });
    } catch {
      // Ignore
    }

    // Clear timers
    if (discoveryTimerRef.current) {
      clearTimeout(discoveryTimerRef.current);
      discoveryTimerRef.current = null;
    }
    if (discoveryProgressRef.current) {
      clearInterval(discoveryProgressRef.current);
      discoveryProgressRef.current = null;
    }

    setConnectionState('disconnected');
    setRole(null);
    setDiscoveredInstances([]);
    setConnectedInstances([]);
    setIsDiscovering(false);
    setDiscoveryProgress(0);
    setError(null);

    localStorage.removeItem('lanConnectionState');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (connectionState === 'error') {
      setConnectionState('disconnected');
    }
  }, [connectionState]);

  return (
    <LANNetworkContext.Provider
      value={{
        connectionState,
        role,
        selectedNetwork,
        discoveredInstances,
        connectedInstances,
        isDiscovering,
        discoveryProgress,
        error,
        getNetworks,
        connectToNetwork,
        startDiscovery,
        selectRole,
        selectChildRole,
        disconnect,
        clearError,
      }}
    >
      {children}
    </LANNetworkContext.Provider>
  );
}

export function useLANNetwork() {
  return useContext(LANNetworkContext);
}
