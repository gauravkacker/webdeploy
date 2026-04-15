'use client';

import { useState, useEffect } from 'react';

interface TransferHistory {
  id: string;
  licenseId: string;
  oldMachineId: string;
  newMachineId: string;
  adminId: string;
  transferredAt: Date;
  remainingDaysPreserved: number;
}

export default function LicenseTransfer() {
  const [oldMachineId, setOldMachineId] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [adminId, setAdminId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transferHistory, setTransferHistory] = useState<TransferHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [licFileData, setLicFileData] = useState<string | null>(null);

  // Fetch transfer history
  const fetchTransferHistory = async (machineId: string) => {
    try {
      const response = await fetch(
        `/api/admin/license/transfer-history?machineId=${encodeURIComponent(machineId)}`
      );
      const data = await response.json();
      if (data.success) {
        setTransferHistory(data.history);
      }
    } catch (err) {
      console.error('Error fetching transfer history:', err);
    }
  };

  // Handle license transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLicFileData(null);
    setLoading(true);

    try {
      const response = await fetch('/api/admin/license/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          oldMachineId,
          newMachineId,
          licenseKey,
          adminId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Transfer failed');
        return;
      }

      setSuccess(
        `License transferred successfully! Remaining days: ${data.remainingDays}`
      );
      setLicFileData(data.licFile);

      // Fetch updated history
      await fetchTransferHistory(newMachineId);

      // Clear form
      setOldMachineId('');
      setNewMachineId('');
      setLicenseKey('');
    } catch (err) {
      setError('Error transferring license');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Download .LIC file
  const downloadLicFile = () => {
    if (!licFileData) return;

    const binaryString = atob(licFileData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license_${newMachineId}.lic`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Transfer Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">License Transfer</h2>

        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Old Machine ID
              </label>
              <input
                type="text"
                value={oldMachineId}
                onChange={(e) => setOldMachineId(e.target.value)}
                placeholder="Enter old machine ID"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Machine ID
              </label>
              <input
                type="text"
                value={newMachineId}
                onChange={(e) => setNewMachineId(e.target.value)}
                placeholder="Enter new machine ID"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="Enter license key"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin ID
              </label>
              <input
                type="text"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="Enter admin ID"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {loading ? 'Transferring...' : 'Transfer License'}
          </button>
        </form>

        {licFileData && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-900 mb-3">New .LIC file generated successfully!</p>
            <button
              onClick={downloadLicFile}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Download .LIC File
            </button>
          </div>
        )}
      </div>

      {/* Transfer History */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Transfer History</h2>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory && newMachineId) {
                fetchTransferHistory(newMachineId);
              }
            }}
            className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>

        {showHistory && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Old Machine ID
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    New Machine ID
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Days Preserved
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Transferred At
                  </th>
                </tr>
              </thead>
              <tbody>
                {transferHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-gray-500">
                      No transfer history found
                    </td>
                  </tr>
                ) : (
                  transferHistory.map((transfer) => (
                    <tr key={transfer.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900 font-mono text-sm">
                        {transfer.oldMachineId.substring(0, 20)}...
                      </td>
                      <td className="py-3 px-4 text-gray-900 font-mono text-sm">
                        {transfer.newMachineId.substring(0, 20)}...
                      </td>
                      <td className="py-3 px-4 text-gray-900">
                        {transfer.remainingDaysPreserved} days
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {new Date(transfer.transferredAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
