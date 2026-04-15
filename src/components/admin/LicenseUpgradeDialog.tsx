'use client';

import { useState } from 'react';

interface LicenseUpgradeDialogProps {
  licenseId: string;
  currentMachineId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (licFileBase64: string) => void;
}

export default function LicenseUpgradeDialog({
  licenseId,
  currentMachineId,
  isOpen,
  onClose,
  onSuccess
}: LicenseUpgradeDialogProps) {
  const [newPcLimit, setNewPcLimit] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [licFileBase64, setLicFileBase64] = useState('');

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    if (newPcLimit < 2) {
      setError('PC limit must be at least 2 for multi-PC licenses');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMaxMachines: newPcLimit })
      });

      if (res.ok) {
        const data = await res.json();
        setLicFileBase64(data.licFileBase64);
        setSuccess(true);
        
        if (onSuccess) {
          onSuccess(data.licFileBase64);
        }
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to upgrade license');
      }
    } catch (error) {
      console.error('Failed to upgrade license:', error);
      setError('Failed to upgrade license');
    } finally {
      setProcessing(false);
    }
  };

  const downloadLicFile = () => {
    try {
      const binaryString = atob(licFileBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${licenseId}.lic`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download .LIC file:', error);
    }
  };

  const handleClose = () => {
    setNewPcLimit(2);
    setError('');
    setSuccess(false);
    setLicFileBase64('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        {!success ? (
          <>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Upgrade to Multi-PC License
            </h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="mb-6">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-4">
                <h4 className="font-medium text-gray-900 mb-2">Current License</h4>
                <p className="text-sm text-gray-600 mb-1">Type: Single-PC License</p>
                <p className="text-sm text-gray-600 font-mono">{currentMachineId}</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded mb-4">
                <h4 className="font-medium text-gray-900 mb-2">⚠️ Important</h4>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>Your existing Machine ID will be preserved</li>
                  <li>You can add more Machine IDs after upgrade</li>
                  <li>A new .LIC file will be generated</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  New PC Limit
                </label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  value={newPcLimit}
                  onChange={(e) => setNewPcLimit(parseInt(e.target.value) || 2)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={processing}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum number of computers (2-100)
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpgrade}
                disabled={processing}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {processing ? 'Upgrading...' : 'Upgrade License'}
              </button>
              <button
                onClick={handleClose}
                disabled={processing}
                className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                License Upgraded Successfully!
              </h3>
              <p className="text-gray-600">
                Your license has been upgraded to a Multi-PC license with a limit of {newPcLimit} computers.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 p-4 rounded mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Next Steps</h4>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>Download the new .LIC file below</li>
                <li>Replace the old .LIC file on the customer's computer</li>
                <li>Add more Machine IDs from the license management panel</li>
                <li>Distribute the .LIC file to all authorized computers</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <button
                onClick={downloadLicFile}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Download New .LIC File
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
