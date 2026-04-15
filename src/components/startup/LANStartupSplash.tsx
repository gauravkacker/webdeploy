'use client';

import React, { useEffect, useState } from 'react';

interface LANStartupSplashProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function LANStartupSplash({ isVisible, onComplete }: LANStartupSplashProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          {/* Spinner */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
          </div>

          {/* Text */}
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Starting HomeoPMS
            </h2>
            <p className="text-gray-600">
              Searching network{dots}
            </p>
          </div>

          {/* Status Message */}
          <div className="text-sm text-gray-500 text-center mt-2">
            {dots === '' && 'Initializing...'}
            {dots === '.' && 'Scanning for other servers...'}
            {dots === '..' && 'Determining server role...'}
            {dots === '...' && 'Almost ready...'}
          </div>
        </div>
      </div>
    </div>
  );
}
