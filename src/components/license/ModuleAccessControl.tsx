/**
 * Module Access Control Component
 * Shows/hides UI elements based on license module access
 */

import { ReactNode } from 'react';

interface ModuleAccessControlProps {
  module: string;
  isAccessible: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function ModuleAccessControl({
  module,
  isAccessible,
  children,
  fallback,
}: ModuleAccessControlProps) {
  if (!isAccessible) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

interface UpgradePromptProps {
  module: string;
  onUpgrade?: () => void;
}

export function UpgradePrompt({ module, onUpgrade }: UpgradePromptProps) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="text-yellow-600 text-xl">⚠️</div>
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-900">Module Not Available</h3>
          <p className="text-yellow-800 text-sm mt-1">
            The <strong>{module}</strong> module is not available in your current plan.
          </p>
          <button
            onClick={onUpgrade}
            className="mt-3 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm font-medium"
          >
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  );
}

interface LicenseExpirationWarningProps {
  daysRemaining: number;
  onRenew?: () => void;
}

export function LicenseExpirationWarning({ daysRemaining, onRenew }: LicenseExpirationWarningProps) {
  if (daysRemaining > 30) {
    return null;
  }

  const isExpired = daysRemaining <= 0;
  const bgColor = isExpired ? 'bg-red-50' : 'bg-orange-50';
  const borderColor = isExpired ? 'border-red-200' : 'border-orange-200';
  const textColor = isExpired ? 'text-red-900' : 'text-orange-900';
  const icon = isExpired ? '❌' : '⏰';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 mb-4`}>
      <div className="flex items-start gap-3">
        <div className="text-xl">{icon}</div>
        <div className="flex-1">
          <h3 className={`font-semibold ${textColor}`}>
            {isExpired ? 'License Expired' : 'License Expiring Soon'}
          </h3>
          <p className={`${textColor} text-sm mt-1`}>
            {isExpired
              ? 'Your license has expired. Please renew to continue using the application.'
              : `Your license will expire in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}.`}
          </p>
          <button
            onClick={onRenew}
            className={`mt-3 ${isExpired ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'} text-white px-4 py-2 rounded text-sm font-medium`}
          >
            Renew License
          </button>
        </div>
      </div>
    </div>
  );
}

interface UsageAlertProps {
  percentageUsed: number;
  prescriptionsRemaining: number;
  onUpgrade?: () => void;
}

export function UsageAlert({ percentageUsed, prescriptionsRemaining, onUpgrade }: UsageAlertProps) {
  if (percentageUsed < 80) {
    return null;
  }

  const isLimitReached = prescriptionsRemaining <= 0;
  const bgColor = isLimitReached ? 'bg-red-50' : 'bg-yellow-50';
  const borderColor = isLimitReached ? 'border-red-200' : 'border-yellow-200';
  const textColor = isLimitReached ? 'text-red-900' : 'text-yellow-900';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 mb-4`}>
      <div className="flex items-start gap-3">
        <div className="text-xl">📊</div>
        <div className="flex-1">
          <h3 className={`font-semibold ${textColor}`}>
            {isLimitReached ? 'Prescription Limit Reached' : 'High Usage'}
          </h3>
          <p className={`${textColor} text-sm mt-1`}>
            {isLimitReached
              ? 'You have reached your prescription limit. Please upgrade your plan.'
              : `You have used ${percentageUsed}% of your prescription limit (${prescriptionsRemaining} remaining).`}
          </p>
          <button
            onClick={onUpgrade}
            className={`mt-3 ${isLimitReached ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white px-4 py-2 rounded text-sm font-medium`}
          >
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  );
}
