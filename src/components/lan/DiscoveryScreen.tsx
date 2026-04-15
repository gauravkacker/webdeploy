'use client';

import React from 'react';
import type { DiscoveredInstance } from '@/types/lan-network';

interface DiscoveryScreenProps {
  discoveredInstances: DiscoveredInstance[];
  isDiscovering: boolean;
  discoveryProgress: number;
}

export function DiscoveryScreen({ discoveredInstances, isDiscovering, discoveryProgress }: DiscoveryScreenProps) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-md mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Discovering Instances</h2>
        <p className="text-sm text-gray-500">
          {isDiscovering
            ? 'Scanning the network for other HomeoPMS instances...'
            : 'Discovery complete'}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Scanning network</span>
          <span>{Math.round(discoveryProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-100"
            style={{ width: `${discoveryProgress}%` }}
          />
        </div>
      </div>

      {/* Discovered Instances */}
      {discoveredInstances.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-700">
            Found {discoveredInstances.length} instance{discoveredInstances.length !== 1 ? 's' : ''}:
          </p>
          <div className="flex flex-col gap-2">
            {discoveredInstances.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-md px-3 py-2"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{inst.hostname}</p>
                  <p className="text-xs text-gray-500">{inst.ip}:{inst.port}</p>
                </div>
                {inst.role && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">
                    {inst.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : !isDiscovering ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 text-sm text-yellow-700">
          No other systems found on this network
        </div>
      ) : null}

      {/* Spinner while discovering */}
      {isDiscovering && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Listening for responses...
        </div>
      )}
    </div>
  );
}
