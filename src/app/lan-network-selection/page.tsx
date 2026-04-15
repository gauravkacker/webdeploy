'use client';

import React from 'react';
import { LANNetworkProvider, useLANNetwork } from '@/lib/lan-network-context';
import { NetworkSelectionScreen } from '@/components/lan/NetworkSelectionScreen';
import { DiscoveryScreen } from '@/components/lan/DiscoveryScreen';
import { RoleSelectionScreen } from '@/components/lan/RoleSelectionScreen';
import { SyncStatusPanel } from '@/components/lan/SyncStatusPanel';
import { StatusDisplay } from '@/components/lan/StatusDisplay';
import { LANErrorModal } from '@/components/lan/LANErrorModal';

function LANNetworkSelectionContent() {
  const {
    connectionState,
    role,
    selectedNetwork,
    discoveredInstances,
    connectedInstances,
    isDiscovering,
    discoveryProgress,
    error,
    connectToNetwork,
    selectRole,
    selectChildRole,
    disconnect,
    clearError,
  } = useLANNetwork();

  // Determine which screen to show
  const showNetworkSelection = connectionState === 'disconnected' || connectionState === 'error';
  const showDiscovery = connectionState === 'connecting' && isDiscovering;
  const showRoleSelection = connectionState === 'connecting' && !isDiscovering;
  const showConnected = connectionState === 'connected';
  const showErrorModal = connectionState === 'error' && !!error;

  // Find main server id from connected instances
  const mainInstance = connectedInstances.find((i) => i.role === 'main');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Error Modal */}
      {showErrorModal && (
        <LANErrorModal
          error={error!}
          onRetry={() => selectedNetwork ? connectToNetwork(selectedNetwork) : clearError()}
          onChangeNetwork={clearError}
        />
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">LAN Network Setup</h1>
          <p className="text-xs text-gray-500 mt-0.5">Multi-PC HomeoPMS configuration</p>
        </div>
        <StatusDisplay
          state={connectionState}
          role={role}
          mainServerId={mainInstance?.id}
          networkName={selectedNetwork?.name}
          error={error}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-start justify-center pt-12 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Network Selection */}
          {showNetworkSelection && (
            <NetworkSelectionScreen
              onConnect={connectToNetwork}
              isConnecting={false}
              error={error}
            />
          )}

          {/* Discovery Progress */}
          {showDiscovery && (
            <DiscoveryScreen
              discoveredInstances={discoveredInstances}
              isDiscovering={isDiscovering}
              discoveryProgress={discoveryProgress}
            />
          )}

          {/* Role Selection (after discovery completes) */}
          {showRoleSelection && (
            <RoleSelectionScreen
              discoveredInstances={discoveredInstances}
              onSelectMain={() => selectRole('main')}
              onSelectChild={(id, ip, port) => selectChildRole(id, ip, port)}
              isProcessing={false}
              error={error}
            />
          )}

          {/* Connected State */}
          {showConnected && (
            <div className="flex flex-col gap-6 p-6">
              {/* Success banner */}
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Connected as {role === 'main' ? 'Main Server' : 'Child Server'}
                  </p>
                  {selectedNetwork && (
                    <p className="text-xs text-green-600 mt-0.5">Network: {selectedNetwork.name}</p>
                  )}
                </div>
              </div>

              {/* Sync Status Panel (only when 2+ instances) */}
              {connectedInstances.length >= 2 && (
                <SyncStatusPanel
                  instances={connectedInstances}
                  mainServerId={mainInstance?.id}
                />
              )}

              {/* Disconnect */}
              <button
                onClick={disconnect}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors underline text-center"
              >
                Disconnect from network
              </button>
            </div>
          )}

          {/* Error with retry — handled by modal above */}
        </div>
      </div>
    </div>
  );
}

export default function LANNetworkSelectionPage() {
  return (
    <LANNetworkProvider>
      <LANNetworkSelectionContent />
    </LANNetworkProvider>
  );
}
