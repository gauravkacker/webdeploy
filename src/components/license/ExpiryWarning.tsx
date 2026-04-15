'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Clock, X } from 'lucide-react';
import { getDetailedExpiryWarning } from '@/lib/machine-binding/expiry-detector';
import type { ExpiryWarning as ExpiryWarningType } from '@/lib/machine-binding/expiry-detector';

interface ExpiryWarningProps {
  expiresAt: Date | string | null | undefined;
  daysThreshold?: number;
  onRenew?: () => void;
  showRenewButton?: boolean;
  dismissible?: boolean;
}

export default function ExpiryWarning({
  expiresAt,
  daysThreshold = 30,
  onRenew,
  showRenewButton = true,
  dismissible = false,
}: ExpiryWarningProps) {
  const [warning, setWarning] = useState<ExpiryWarningType | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setWarning({
        shouldShow: true,
        message: 'No valid license found. Application is in read-only mode.',
        severity: 'error',
        daysRemaining: 0,
      });
      return;
    }

    try {
      const warningData = getDetailedExpiryWarning(expiresAt, daysThreshold);
      setWarning(warningData);
    } catch (error) {
      console.error('Failed to get expiry warning:', error);
      setWarning(null);
    }
  }, [expiresAt, daysThreshold]);

  // Don't show if dismissed or no warning
  if (isDismissed || !warning || !warning.shouldShow) {
    return null;
  }

  const handleDismiss = () => {
    if (dismissible) {
      setIsDismissed(true);
    }
  };

  const handleRenew = () => {
    if (onRenew) {
      onRenew();
    } else {
      // Default: navigate to license settings
      window.location.href = '/settings/license';
    }
  };

  // Determine background and text colors based on severity
  const severityStyles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: 'text-red-600 dark:text-red-400',
    },
  };

  const styles = severityStyles[warning.severity];

  return (
    <div
      className={`${styles.bg} ${styles.border} ${styles.text} border rounded-lg p-4 mb-4 relative`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`${styles.icon} flex-shrink-0 mt-0.5`}>
          {warning.severity === 'error' ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Clock className="h-5 w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{warning.message}</p>

          {warning.daysRemaining > 0 && (
            <p className="text-xs mt-1 opacity-80">
              {warning.daysRemaining} day{warning.daysRemaining !== 1 ? 's' : ''} remaining
            </p>
          )}

          {showRenewButton && (
            <button
              onClick={handleRenew}
              className={`mt-3 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                warning.severity === 'error'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : warning.severity === 'warning'
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              Renew License
            </button>
          )}
        </div>

        {/* Dismiss button */}
        {dismissible && warning.severity !== 'error' && (
          <button
            onClick={handleDismiss}
            className={`${styles.icon} flex-shrink-0 hover:opacity-70 transition-opacity`}
            aria-label="Dismiss warning"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
