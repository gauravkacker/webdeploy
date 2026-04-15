'use client';

import React, { useState } from 'react';
import { LANNetworkProvider, useLANNetwork } from '@/lib/lan-network-context';
import { NetworkSelectionScreen } from '@/components/lan/NetworkSelectionScreen';
import { DiscoveryScreen } from '@/components/lan/DiscoveryScreen';
import { RoleSelectionScreen } from '@/components/lan/RoleSelectionScreen';
import { SyncStatusPanel } from '@/components/lan/SyncStatusPanel';
import { LANErrorModal } from '@/components/lan/LANErrorModal';

interface ServerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ServerSelectionModalContent({ onClose }: { onClose: () => void }) {
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
    <>
      {/* Error Modal */}
      {showErrorModal && (
        <LANErrorModal
          error={error!}
          onRetry={() => selectedNetwork ? connectToNetwork(selectedNetwork) : clearError()}
          onChangeNetwork={clearError}
        />
      )}

      <div className="flex flex-col gap-4 max-h-96 overflow-y-auto">
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
          <div className="flex flex-col gap-4">
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

            {/* Return to Software Button */}
            <button
              onClick={onClose}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
            >
              Return to Software
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function ServerSelectionModal({ isOpen, onClose }: ServerSelectionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-md max-h-96 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Server Selection</h2>
            <p className="text-xs text-gray-500 mt-0.5">Multi-PC HomeoPMS configuration</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <LANNetworkProvider>
            <ServerSelectionModalContent onClose={onClose} />
          </LANNetworkProvider>
        </div>
      </div>
    </div>
  );
}
