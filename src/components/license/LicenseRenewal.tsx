'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface LicenseRenewalProps {
  machineId: string;
  onRenewalComplete?: () => void;
}

interface RenewalInfo {
  licenseKey: string;
  machineId: string;
  currentExpiresAt: string;
  remainingDays: number;
  modules: string[];
  customerId: string;
}

export default function LicenseRenewal({ machineId, onRenewalComplete }: LicenseRenewalProps) {
  const [renewalInfo, setRenewalInfo] = useState<RenewalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRenewalInfo();
  }, [machineId]);

  const fetchRenewalInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/license/renewal/info?machineId=${machineId}`);
      const data = await response.json();
      if (!data.success) { setError(data.message || 'Failed to load renewal information'); return; }
      setRenewalInfo(data.info);
    } catch {
      setError('Failed to load renewal information');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.lic')) { setError('Please select a .lic file'); return; }
    if (file.size < 2000 || file.size > 10000) { setError('Invalid .lic file size (expected 2–10 KB)'); return; }
    setSelectedFile(file);
    setError(null);
  };

  const handleUploadRenewal = async () => {
    if (!selectedFile) { setError('Please select a .lic file'); return; }
    try {
      setUploading(true);
      setError(null);
      setSuccess(null);
      const fileBuffer = await selectedFile.arrayBuffer();
      const licFileBase64 = Buffer.from(fileBuffer).toString('base64');
      const response = await fetch('/api/license/renewal/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, licFileBase64 }),
      });
      const data = await response.json();
      if (!data.success) { setError(data.message || 'Failed to apply renewal'); return; }
      setSuccess('License renewed successfully!');
      setSelectedFile(null);
      await fetchRenewalInfo();
      onRenewalComplete?.();
    } catch {
      setError('Failed to apply renewal');
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const getExpiryStatus = (days: number) => {
    if (days <= 0) return { color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Expired' };
    if (days <= 30) return { color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: 'Expiring Soon' };
    return { color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Active' };
  };

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm font-semibold text-gray-900 mb-1">License Renewal</p>
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </Card>
    );
  }

  if (!renewalInfo) {
    return (
      <Card className="p-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">License Renewal</p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">No active license found for this machine. Please activate a license first.</p>
        </div>
      </Card>
    );
  }

  const status = getExpiryStatus(renewalInfo.remainingDays);

  return (
    <Card className="p-6 space-y-6">
      <div>
        <p className="text-sm font-semibold text-gray-900">License Renewal</p>
        <p className="text-xs text-gray-500">Renew your license to extend access</p>
      </div>

      {/* Current status */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Current License Status</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">License Key</p>
            <p className="text-xs font-mono text-gray-800">{renewalInfo.licenseKey}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Expiration Date</p>
            <p className="text-sm text-gray-800">{formatDate(renewalInfo.currentExpiresAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Remaining Days</p>
            <p className={`text-sm font-medium ${status.color}`}>{renewalInfo.remainingDays} {renewalInfo.remainingDays === 1 ? 'day' : 'days'}</p>
          </div>
        </div>
        {renewalInfo.modules.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Active Modules</p>
            <div className="flex flex-wrap gap-1">
              {renewalInfo.modules.map((m) => (
                <span key={m} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">{m}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-blue-900 mb-2">How to Renew</p>
        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
          <li>Contact your vendor to request a renewal</li>
          <li>Provide your Machine ID: <code className="font-mono">{machineId}</code></li>
          <li>Vendor will generate a renewal .lic file</li>
          <li>Upload the renewal .lic file below</li>
          <li>Your remaining days will be preserved and added to the renewal period</li>
        </ol>
      </div>

      {/* Upload */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Upload Renewal .lic File</p>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${selectedFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}
        >
          {selectedFile ? (
            <div>
              <p className="text-sm font-medium text-green-700">✓ {selectedFile.name}</p>
              <p className="text-xs text-green-600 mt-1">({(selectedFile.size / 1024).toFixed(2)} KB) — ready to apply</p>
            </div>
          ) : (
            <div>
              <svg className="w-7 h-7 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600">Click to browse for your .lic file</p>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".lic" className="hidden" onChange={handleFileSelect} />

        <Button variant="primary" className="w-full" onClick={handleUploadRenewal} disabled={!selectedFile || uploading}>
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Applying Renewal...
            </span>
          ) : 'Apply Renewal'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">✓ {success}</p>
        </div>
      )}
    </Card>
  );
}
