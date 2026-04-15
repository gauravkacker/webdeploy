'use client';

import React, { useState } from 'react';
import type { ConnectedInstance } from '@/types/lan-network';

interface SyncStatusPanelProps {
  instances: ConnectedInstance[];
  mainServerId?: string;
}

const SYNC_STATUS_COLORS: Record<ConnectedInstance['syncStatus'], string> = {
  synced: 'bg-green-500',
  syncing: 'bg-yellow-400',
  error: 'bg-red-500',
  stale: 'bg-orange-400',
};

const SYNC_STATUS_LABELS: Record<ConnectedInstance['syncStatus'], string> = {
  synced: 'Synced',
  syncing: 'Syncing...',
  error: 'Sync Error',
  stale: 'Stale',
};

function formatTimestamp(ts: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TooltipProps {
  instance: ConnectedInstance;
}

function SyncTooltip({ instance }: TooltipProps) {
  return (
    <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 shadow-lg pointer-events-none">
      <div className="flex justify-between mb-1">
        <span className="text-gray-400">Last sync:</span>
        <span>{formatTimestamp(instance.lastSyncTime)}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-400">Duration:</span>
        <span>{instance.lastSyncDuration ? `${instance.lastSyncDuration}ms` : 'N/A'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Transferred:</span>
        <span>{formatBytes(instance.bytesTransferred)}</span>
      </div>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
    </div>
  );
}

interface InstanceCardProps {
  instance: ConnectedInstance;
  isMain: boolean;
}

function InstanceCard({ instance, isMain }: InstanceCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
      {/* Role badge */}
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          isMain ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {isMain ? 'Main' : 'Child'}
      </span>

      {/* Instance info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{instance.hostname}</p>
        <p className="text-xs text-gray-400">{instance.ip}</p>
      </div>

      {/* Sync status indicator with tooltip */}
      <div
        className="relative flex-shrink-0"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="flex items-center gap-1.5 cursor-default">
          <div
            className={`w-2 h-2 rounded-full ${SYNC_STATUS_COLORS[instance.syncStatus]} ${
              instance.syncStatus === 'syncing' ? 'animate-pulse' : ''
            }`}
          />
          <span className="text-xs text-gray-500">{SYNC_STATUS_LABELS[instance.syncStatus]}</span>
        </div>
        {showTooltip && <SyncTooltip instance={instance} />}
      </div>
    </div>
  );
}

export function SyncStatusPanel({ instances, mainServerId }: SyncStatusPanelProps) {
  // Only show when 2+ instances
  if (instances.length < 2) return null;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Connected Instances</h3>
        <span className="text-xs text-gray-400">{instances.length} online</span>
      </div>
      <div className="flex flex-col gap-2">
        {instances.map((inst) => (
          <InstanceCard key={inst.id} instance={inst} isMain={inst.id === mainServerId} />
        ))}
      </div>
    </div>
  );
}
