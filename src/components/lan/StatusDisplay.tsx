'use client';

import React, { useState } from 'react';
import type { ConnectionStateValue } from '@/lib/lan-network-context';

interface StatusDisplayProps {
  state: ConnectionStateValue;
  role?: 'main' | 'child' | null;
  mainServerId?: string;
  networkName?: string;
  error?: string | null;
  onClick?: () => void;
}

const STATE_CONFIG: Record<
  ConnectionStateValue,
  { dot: string; label: (role?: string | null, mainId?: string, netName?: string) => string; text: string }
> = {
  disconnected: {
    dot: 'bg-red-500',
    label: () => 'Not Connected',
    text: 'text-red-600',
  },
  connecting: {
    dot: 'bg-yellow-400 animate-pulse',
    label: () => 'Connecting...',
    text: 'text-yellow-600',
  },
  connected: {
    dot: 'bg-green-500',
    label: (role, mainId) =>
      role === 'main'
        ? 'Main Server'
        : role === 'child'
        ? `Child Server${mainId ? ` (${mainId.slice(0, 8)}...)` : ''}`
        : 'Connected',
    text: 'text-green-600',
  },
  error: {
    dot: 'bg-red-500',
    label: () => 'Connection Error',
    text: 'text-red-600',
  },
};

export function StatusDisplay({ state, role, mainServerId, networkName, error, onClick }: StatusDisplayProps) {
  const [showError, setShowError] = useState(false);
  const config = STATE_CONFIG[state];
  const label = config.label(role, mainServerId, networkName);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => state === 'error' && error && setShowError(true)}
        onMouseLeave={() => setShowError(false)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          onClick ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'
        } ${config.text}`}
        title={state === 'error' && error ? error : label}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {/* Error tooltip */}
      {showError && error && (
        <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-gray-800 text-white text-xs rounded-md p-2 shadow-lg pointer-events-none">
          {error}
          <div className="absolute bottom-full left-3 border-4 border-transparent border-b-gray-800" />
        </div>
      )}
    </div>
  );
}
