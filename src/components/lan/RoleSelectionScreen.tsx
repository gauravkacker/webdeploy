'use client';

import React, { useState } from 'react';
import type { DiscoveredInstance } from '@/types/lan-network';

interface RoleSelectionScreenProps {
  discoveredInstances: DiscoveredInstance[];
  onSelectMain: () => Promise<void>;
  onSelectChild: (instanceId: string, instanceIp: string, instancePort?: number) => Promise<void>;
  isProcessing: boolean;
  error?: string | null;
}

export function RoleSelectionScreen({
  discoveredInstances,
  onSelectMain,
  onSelectChild,
  isProcessing,
  error,
}: RoleSelectionScreenProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');

  const hasInstances = discoveredInstances.length > 0;

  const handleConnectAsChild = async () => {
    if (!selectedInstanceId) return;
    const instance = discoveredInstances.find((i) => i.id === selectedInstanceId);
    if (!instance) return;
    await onSelectChild(instance.id, instance.ip, instance.port);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-md mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Choose Your Role</h2>
        <p className="text-sm text-gray-500">
          {hasInstances
            ? 'Other HomeoPMS instances were found. Select one to sync with, or connect as Main Server.'
            : 'No other instances found. Connect as the Main Server.'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasInstances ? (
        <>
          {/* Child Server Option */}
          <div className="flex flex-col gap-3 border border-gray-200 rounded-lg p-4">
            <div>
              <p className="text-sm font-medium text-gray-800">Connect as Child Server</p>
              <p className="text-xs text-gray-500 mt-0.5">Sync data from the selected Main Server</p>
            </div>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              disabled={isProcessing}
            >
              <option value="">-- Select a Main Server --</option>
              {discoveredInstances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.hostname} ({inst.ip}:{inst.port})
                </option>
              ))}
            </select>
            <button
              onClick={handleConnectAsChild}
              disabled={!selectedInstanceId || isProcessing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect as Child Server'
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Main Server Option */}
          <div className="flex flex-col gap-3 border border-gray-200 rounded-lg p-4">
            <div>
              <p className="text-sm font-medium text-gray-800">Connect as Main Server</p>
              <p className="text-xs text-gray-500 mt-0.5">
                This machine becomes the primary data source. Other instances will sync from here.
              </p>
            </div>
            <button
              onClick={onSelectMain}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect as Main Server'
              )}
            </button>
          </div>
        </>
      ) : (
        /* No instances found — only Main Server option */
        <div className="flex flex-col gap-3 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            No other systems found on this network
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Connect as Main Server</p>
            <p className="text-xs text-gray-500 mt-0.5">
              This machine will be the primary data source. Other instances can join later.
            </p>
          </div>
          <button
            onClick={onSelectMain}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect as Main Server'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
