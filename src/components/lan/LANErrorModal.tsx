'use client';

import React from 'react';

interface LANErrorModalProps {
  error: string;
  onRetry: () => void;
  onChangeNetwork: () => void;
}

export function LANErrorModal({ error, onRetry, onChangeNetwork }: LANErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Connection Error</h3>
            <p className="text-sm text-gray-600 mt-1">{error}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onChangeNetwork}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Change Network
          </button>
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
