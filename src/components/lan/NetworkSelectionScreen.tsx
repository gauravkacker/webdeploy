'use client';

import React, { useEffect, useState } from 'react';
import type { NetworkInfo } from '@/types/lan-network';

interface NetworkSelectionScreenProps {
  onConnect: (network: NetworkInfo) => Promise<void>;
  isConnecting: boolean;
  error?: string | null;
}

export function NetworkSelectionScreen({ onConnect, isConnecting, error }: NetworkSelectionScreenProps) {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkInfo | null>(null);
  const [loadingNetworks, setLoadingNetworks] = useState(true);

  useEffect(() => {
    async function fetchNetworks() {
      try {
        const res = await fetch('/api/lan/networks');
        if (res.ok) {
          const data = await res.json();
          setNetworks(data.networks || []);
          if (data.networks?.length === 1) {
            setSelectedNetwork(data.networks[0]);
          }
        }
      } catch {
        // Ignore
      } finally {
        setLoadingNetworks(false);
      }
    }
    fetchNetworks();
  }, []);

  const handleConnect = async () => {
    if (!selectedNetwork) return;
    await onConnect(selectedNetwork);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-md mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Select Network</h2>
        <p className="text-sm text-gray-500">Choose the local network to connect HomeoPMS instances</p>
      </div>

      {/* Network Dropdown */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Available Networks</label>
        {loadingNetworks ? (
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        ) : (
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedNetwork?.id || ''}
            onChange={(e) => {
              const net = networks.find((n) => n.id === e.target.value) || null;
              setSelectedNetwork(net);
            }}
            disabled={isConnecting}
          >
            <option value="">-- Select a network --</option>
            {networks.map((net) => (
              <option key={net.id} value={net.id}>
                {net.name} — {net.ipRange}
              </option>
            ))}
          </select>
        )}
        {selectedNetwork && (
          <p className="text-xs text-gray-400">Broadcast: {selectedNetwork.broadcastAddress}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Connect Button */}
      <button
        onClick={handleConnect}
        disabled={!selectedNetwork || isConnecting}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
      >
        {isConnecting ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Connecting...
          </>
        ) : (
          'Connect to Network'
        )}
      </button>
    </div>
  );
}
