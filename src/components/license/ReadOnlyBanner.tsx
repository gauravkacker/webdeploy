'use client';

import { AlertCircle } from 'lucide-react';
import { getReadOnlyModeState } from '@/lib/machine-binding/read-only-mode';
import { useEffect, useState } from 'react';

interface ReadOnlyBannerProps {
  onRenew?: () => void;
}

export default function ReadOnlyBanner({ onRenew }: ReadOnlyBannerProps) {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const state = getReadOnlyModeState();
    setIsReadOnly(state.isReadOnly);
    setReason(state.reason);
  }, []);

  if (!isReadOnly) {
    return null;
  }

  const handleRenew = () => {
    if (onRenew) {
      onRenew();
    } else {
      window.location.href = '/settings/license';
    }
  };

  return (
    <div
      className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3"
      role="alert"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Read-Only Mode Active
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {reason || 'Application is in read-only mode. You can view data but cannot make changes.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleRenew}
          className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex-shrink-0"
        >
          Renew License
        </button>
      </div>
    </div>
  );
}
