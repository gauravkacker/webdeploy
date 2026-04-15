'use client';

import { useState, useEffect } from 'react';

interface AuthorizedMachine {
  machineId: string;
  addedAt: string;
  addedBy?: string;
  lastActivation?: string;
  status: 'active' | 'inactive';
}

interface MachineIdManagementPanelProps {
  licenseId: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: string[];
  onUpdate?: () => void;
}

export default function MachineIdManagementPanel({
  licenseId,
  licenseType,
  maxMachines,
  authorizedMachines: initialMachines,
  onUpdate
}: MachineIdManagementPanelProps) {
  const [machines, setMachines] = useState<AuthorizedMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMachines();
  }, [licenseId]);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/licenses/${licenseId}/machines`);
      if (res.ok) {
        const data = await res.json();
        setMachines(data.machines || []);
      }
    } catch (error) {
      console.error('Failed to fetch machines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMachine = async () => {
    if (!newMachineId.trim()) {
      setError('Please enter a Machine ID');
      return;
    }

    const machineIdPattern = /^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
    if (!machineIdPattern.test(newMachineId)) {
      setError('Invalid Machine ID format');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: newMachineId })
      });

      if (res.ok) {
        const data = await res.json();
        setShowAddModal(false);
        setNewMachineId('');
        await fetchMachines();
        
        // Download updated .LIC file
        if (data.licFileBase64) {
          downloadLicFile(data.licFileBase64, licenseId);
        }
        
        if (onUpdate) onUpdate();
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to add Machine ID');
      }
    } catch (error) {
      console.error('Failed to add machine:', error);
      setError('Failed to add Machine ID');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveMachine = async () => {
    if (!selectedMachineId) return;

    setProcessing(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/machines`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: selectedMachineId })
      });

      if (res.ok) {
        const data = await res.json();
        setShowRemoveModal(false);
        setSelectedMachineId('');
        await fetchMachines();
        
        // Download updated .LIC file
        if (data.licFileBase64) {
          downloadLicFile(data.licFileBase64, licenseId);
        }
        
        if (onUpdate) onUpdate();
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to remove Machine ID');
      }
    } catch (error) {
      console.error('Failed to remove machine:', error);
      setError('Failed to remove Machine ID');
    } finally {
      setProcessing(false);
    }
  };

  const downloadLicFile = (base64Data: string, licenseKey: string) => {
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${licenseKey}.lic`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download .LIC file:', error);
    }
  };

  const handleDownloadLicFile = async () => {
    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.license?.licFileBase64) {
          downloadLicFile(data.license.licFileBase64, licenseId);
        }
      }
    } catch (error) {
      console.error('Failed to download .LIC file:', error);
    }
  };

  const remainingSlots = maxMachines - machines.length;
  const canAddMore = remainingSlots > 0;
  const canRemove = machines.length > 1;

  if (licenseType === 'single-pc') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Machine Binding</h2>
        <p className="text-gray-600 mb-4">This is a Single-PC license bound to one computer.</p>
        {machines.length > 0 && (
          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <p className="font-mono text-sm text-gray-900">{machines[0].machineId}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Authorized Machine IDs</h2>
        <button
          onClick={handleDownloadLicFile}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
        >
          Download .LIC File
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">PC Limit</p>
          <p className="text-2xl font-bold text-gray-900">{maxMachines}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Authorized</p>
          <p className="text-2xl font-bold text-gray-900">{machines.length}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Available Slots</p>
          <p className="text-2xl font-bold text-gray-900">{remainingSlots}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading...</div>
      ) : (
        <>
          <div className="mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={!canAddMore}
              className={`px-4 py-2 rounded-lg text-sm ${
                canAddMore
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Add Machine ID
            </button>
            {!canAddMore && (
              <p className="text-sm text-red-600 mt-2">PC limit reached. Cannot add more machines.</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Machine ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Activation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {machines.map((machine) => (
                  <tr key={machine.machineId}>
                    <td className="px-4 py-3 font-mono text-sm text-gray-900">{machine.machineId}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(machine.addedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {machine.lastActivation
                        ? new Date(machine.lastActivation).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          machine.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {machine.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setSelectedMachineId(machine.machineId);
                          setShowRemoveModal(true);
                        }}
                        disabled={!canRemove}
                        className={`text-sm ${
                          canRemove
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add Machine Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Machine ID</h3>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Machine ID</label>
              <input
                type="text"
                placeholder="MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                value={newMachineId}
                onChange={(e) => setNewMachineId(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddMachine}
                disabled={processing}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {processing ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewMachineId('');
                  setError('');
                }}
                disabled={processing}
                className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Machine Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Remove Machine ID</h3>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <p className="text-gray-600 mb-4">
              Are you sure you want to remove this Machine ID?
            </p>
            <p className="font-mono text-sm text-gray-900 bg-gray-50 p-3 rounded mb-4">
              {selectedMachineId}
            </p>
            <p className="text-sm text-red-600 mb-4">
              This computer will no longer be able to use this license.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleRemoveMachine}
                disabled={processing}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {processing ? 'Removing...' : 'Remove'}
              </button>
              <button
                onClick={() => {
                  setShowRemoveModal(false);
                  setSelectedMachineId('');
                  setError('');
                }}
                disabled={processing}
                className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
