'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface License {
  id: string;
  customerId: string;
  licenseKey: string;
  status: 'active' | 'inactive' | 'expired';
  validityDays: number;
  maxPrescriptions: number;
  maxConcurrentComputers?: number;
  modules: string[];
  activatedAt: string;
  expiresAt: string;
  licenseType?: 'single-pc' | 'multi-pc';
  maxMachines?: number;
  authorizedMachines?: { machineId: string; addedAt: string }[];
}

function LicenseDetailPage() {
  const params = useParams();
  const licenseId = params.id as string;
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState(true);
  const [machines, setMachines] = useState<{ machineId: string; addedAt: string }[]>([]);
  const [machineInput, setMachineInput] = useState('');
  const [adminId, setAdminId] = useState('admin');
  const [addingMachine, setAddingMachine] = useState(false);
  const [machineMsg, setMachineMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newLicFile, setNewLicFile] = useState<string | null>(null);

  const formatMachineId = (raw: string): string => {
    const hex = raw.replace(/[^A-F0-9]/gi, '').toUpperCase().slice(0, 32);
    if (!hex) return '';
    const parts = [];
    for (let i = 0; i < hex.length; i += 8) parts.push(hex.slice(i, i + 8));
    return 'MACHINE-' + parts.join('-');
  };

  const handleMachineInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/^MACHINE-/i, '');
    setMachineInput(formatMachineId(raw));
  };

  useEffect(() => {
    const fetchLicense = async () => {
      try {
        const res = await fetch(`/api/admin/licenses/${licenseId}`);
        const data = await res.json();
        if (res.ok) {
          const lic = data.license;
          // Parse authorizedMachines if it's a JSON string
          if (lic.authorizedMachines && typeof lic.authorizedMachines === 'string') {
            try { lic.authorizedMachines = JSON.parse(lic.authorizedMachines); } catch {}
          }
          setLicense(lic);
          // Use authorizedMachines from license directly if available
          if (lic.authorizedMachines && Array.isArray(lic.authorizedMachines) && lic.authorizedMachines.length > 0) {
            setMachines(lic.authorizedMachines);
          } else {
            // Fallback: fetch from machines API
            const mRes = await fetch(`/api/admin/licenses/${licenseId}/machines`);
            if (mRes.ok) {
              const mData = await mRes.json();
              setMachines(mData.authorizedMachines || []);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch license:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLicense();
  }, [licenseId]);

  const handleAddMachine = async () => {
    const pattern = /^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
    if (!pattern.test(machineInput)) {
      setMachineMsg({ type: 'error', text: 'Invalid Machine ID format' });
      return;
    }
    setAddingMachine(true);
    setMachineMsg(null);
    setNewLicFile(null);
    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: machineInput, adminUserId: adminId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMachines(prev => [...prev, { machineId: machineInput, addedAt: new Date().toISOString() }]);
        setMachineInput('');
        setNewLicFile(data.licFileBase64);
        setMachineMsg({ type: 'success', text: 'Machine ID added. Download the new .LIC file and send to customer.' });
      } else {
        setMachineMsg({ type: 'error', text: data.error || 'Failed to add machine ID' });
      }
    } catch {
      setMachineMsg({ type: 'error', text: 'Failed to add machine ID' });
    }
    setAddingMachine(false);
  };

  const handleRemoveMachine = async (machineId: string) => {
    if (!confirm(`Remove machine ID: ${machineId}?`)) return;
    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/machines?machineId=${encodeURIComponent(machineId)}&adminUserId=${adminId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setMachines(prev => prev.filter(m => m.machineId !== machineId));
        setNewLicFile(data.licFileBase64);
        setMachineMsg({ type: 'success', text: 'Machine ID removed. Download the updated .LIC file.' });
      } else {
        setMachineMsg({ type: 'error', text: data.error || 'Failed to remove machine ID' });
      }
    } catch {
      setMachineMsg({ type: 'error', text: 'Failed to remove machine ID' });
    }
  };

  const downloadLicFile = () => {
    if (!newLicFile || !license) return;
    const bytes = atob(newLicFile);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-${license.licenseKey}.lic`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) return <div className="min-h-screen bg-gray-50 p-8 text-center">Loading...</div>;
  if (!license) return <div className="min-h-screen bg-gray-50 p-8 text-center">License not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/admin/software-delivery/licenses">
          <button className="text-blue-600 hover:text-blue-800 mb-4">← Back to Licenses</button>
        </Link>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">License Details</h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">License Key</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={license.licenseKey}
                  readOnly
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(license.licenseKey)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    license.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : license.status === 'inactive'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {license.status}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Validity Days</label>
                <p className="text-gray-900">{license.validityDays} days</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Activated</label>
                <p className="text-gray-900">{new Date(license.activatedAt).toLocaleDateString()}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Expires</label>
                <p className="text-gray-900">{new Date(license.expiresAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Max Prescriptions</label>
              <p className="text-gray-900">{license.maxPrescriptions === -1 ? 'Unlimited' : license.maxPrescriptions}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Max Concurrent Computers</label>
              <p className="text-gray-900">{license.maxConcurrentComputers || 5} computers on LAN</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Modules</label>
              <div className="flex flex-wrap gap-2">
                {license.modules?.length > 0 ? (
                  license.modules.map((mod) => (
                    <span key={mod} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                      {mod}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">No modules</span>
                )}
              </div>
            </div>

            {/* Machine ID Management */}
            <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-600 mb-3">
                  Authorized Machine IDs ({machines.length} / {license.maxMachines || '∞'})
                </label>

                {machines.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {machines.map((m) => (
                      <div key={m.machineId} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="font-mono text-xs text-gray-800">{m.machineId}</span>
                        <button onClick={() => handleRemoveMachine(m.machineId)} className="text-red-500 text-xs hover:text-red-700">Remove</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Type hex chars — auto-formats to MACHINE-XXXXXXXX-..."
                    value={machineInput}
                    onChange={handleMachineInputChange}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddMachine}
                    disabled={addingMachine}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                  >
                    {addingMachine ? 'Adding...' : 'Add'}
                  </button>
                </div>

                {machineMsg && (
                  <p className={`text-xs mt-1 ${machineMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                    {machineMsg.text}
                  </p>
                )}

                {newLicFile && (
                  <button onClick={downloadLicFile} className="mt-2 w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                    ↓ Download Updated .LIC File
                  </button>
                )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LicenseDetailPage;
