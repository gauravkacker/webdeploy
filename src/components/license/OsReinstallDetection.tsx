'use client';

import React, { useState, useEffect } from 'react';
import {
  detectOsReinstall,
  handleOsReinstall,
  validateOsReinstallRecovery,
} from '@/lib/machine-binding/os-reinstall-detector';

interface OsReinstallDetectionProps {
  machineId: string;
  encryptionKey: Buffer;
  onReinstallDetected?: (detected: boolean) => void;
  onActionSelected?: (action: 'restore-backup' | 'revalidate' | 'contact-admin') => void;
}

export const OsReinstallDetection: React.FC<OsReinstallDetectionProps> = ({
  machineId,
  encryptionKey,
  onReinstallDetected,
  onActionSelected,
}) => {
  const [osReinstallDetected, setOsReinstallDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<any>(null);
  const [canRecover, setCanRecover] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  useEffect(() => {
    checkOsReinstall();
  }, [machineId, encryptionKey]);

  const checkOsReinstall = async () => {
    try {
      setLoading(true);
      setError(null);

      // Detect OS reinstall
      const detectionResult = detectOsReinstall(machineId, encryptionKey);

      if (detectionResult.osReinstallDetected) {
        setOsReinstallDetected(true);
        const reinstallGuidance = handleOsReinstall(machineId);
        setGuidance(reinstallGuidance);

        // Check if recovery is possible
        const recoveryResult = validateOsReinstallRecovery(machineId, encryptionKey);
        setCanRecover(recoveryResult.canRecover);

        onReinstallDetected?.(true);
      } else {
        setOsReinstallDetected(false);
        onReinstallDetected?.(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check OS reinstall');
      console.error('Error checking OS reinstall:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action: 'restore-backup' | 'revalidate' | 'contact-admin') => {
    setSelectedAction(action);
    onActionSelected?.(action);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Checking OS status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Checking OS Status</h3>
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={checkOsReinstall}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!osReinstallDetected) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-green-800 font-semibold mb-2">OS Status Verified</h3>
        <p className="text-green-700 text-sm">Your operating system is recognized. No reinstall detected.</p>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-yellow-900 mb-2">{guidance?.title}</h2>
        <p className="text-yellow-800 mb-4">{guidance?.description}</p>

        {!canRecover && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-red-700 text-sm font-semibold">
              ⚠️ License recovery may not be possible. Please contact your admin.
            </p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h3 className="font-semibold text-yellow-900 mb-3">What to do next:</h3>
        <ol className="list-decimal list-inside space-y-2">
          {guidance?.steps?.map((step: string, index: number) => (
            <li key={index} className="text-yellow-800 text-sm">
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-yellow-900 mb-3">Choose an option:</h3>
        {guidance?.options?.map((option: any, index: number) => (
          <button
            key={index}
            onClick={() => handleActionClick(option.action)}
            className={`w-full text-left p-4 rounded border-2 transition-colors ${
              selectedAction === option.action
                ? 'border-blue-500 bg-blue-50'
                : 'border-yellow-200 bg-white hover:border-yellow-300'
            }`}
          >
            <div className="font-semibold text-gray-900 mb-1">{option.title}</div>
            <div className="text-sm text-gray-600">{option.description}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-blue-800 text-sm">
          <strong>Note:</strong> Your license file remains valid. You can restore it from a backup or contact your admin
          for revalidation. Your remaining license days will be preserved.
        </p>
      </div>
    </div>
  );
};
