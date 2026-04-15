'use client';

import React, { useState, useEffect } from 'react';

interface ServerSelectionPromptProps {
  onOpenServerSelection: () => void;
}

export function ServerSelectionPrompt({ onOpenServerSelection }: ServerSelectionPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has already dismissed this prompt
    const dismissed = localStorage.getItem('serverSelectionPromptDismissed');
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Show prompt after a short delay on first login
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!isVisible) return;

    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      localStorage.setItem('serverSelectionPromptDismissed', 'true');
    }, 6000);

    return () => clearTimeout(dismissTimer);
  }, [isVisible]);

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-lg shadow-lg border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          {/* Info Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm">Server Selection</h3>
            <p className="text-gray-600 text-sm mt-1">
              Configure your server role to enable multi-PC connectivity
            </p>
            <button
              onClick={() => {
                setIsVisible(false);
                localStorage.setItem('serverSelectionPromptDismissed', 'true');
                onOpenServerSelection();
              }}
              className="mt-3 inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
            >
              Configure Now
            </button>
          </div>

          {/* Close Button */}
          <button
            onClick={() => {
              setIsVisible(false);
              localStorage.setItem('serverSelectionPromptDismissed', 'true');
            }}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 animate-pulse" style={{
            animation: 'shrink 6s linear forwards'
          }} />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
