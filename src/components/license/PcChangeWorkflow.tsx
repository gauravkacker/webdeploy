'use client';

import React, { useState, useRef } from 'react';

interface PcChangeGuidance {
  title: string;
  description: string;
  steps: string[];
  adminSteps: string[];
  options: Array<{
    title: string;
    description: string;
    action: 'upload-new-lic' | 'contact-admin';
  }>;
}

interface MachineIdResult {
  success: boolean;
  newMachineId?: string;
  guidance?: PcChangeGuidance;
  error?: string;
}

interface CompleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

export function PcChangeWorkflow() {
  const [step, setStep] = useState<'start' | 'new-machine-id' | 'upload' | 'complete'>('start');
  const [newMachineId, setNewMachineId] = useState('');
  const [oldMachineId, setOldMachineId] = useState('');
  const [guidance, setGuidance] = useState<PcChangeGuidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [licFile, setLicFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInitiatePcChange = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/license/pc-change/initiate', { method: 'POST' });
      const data: MachineIdResult = await res.json();
      if (!data.success) { setError(data.error || 'Failed to initiate PC change'); return; }
      setNewMachineId(data.newMachineId || '');
      setGuidance(data.guidance || null);
      setStep('new-machine-id');
    } catch {
      setError('Failed to initiate PC change');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(newMachineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.lic')) { setError('Please select a valid .lic file'); return; }
    if (file.size > 10 * 1024) { setError('.lic file is too large (max 10 KB)'); return; }
    setLicFile(file);
    setError('');
  };

  const handleUploadLicFile = async () => {
    if (!licFile || !newMachineId || !oldMachineId) { setError('Missing required information'); return; }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('oldMachineId', oldMachineId);
      formData.append('newMachineId', newMachineId);
      formData.append('licFile', licFile);
      const res = await fetch('/api/license/pc-change/complete', { method: 'POST', body: formData });
      const data: CompleteResult = await res.json();
      if (!data.success) { setError(data.error || 'Failed to upload .lic file'); return; }
      setSuccess('License transferred successfully! Your software is now activated on the new PC.');
      setStep('complete');
    } catch {
      setError('Failed to upload .lic file');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setStep('start');
    setNewMachineId('');
    setOldMachineId('');
    setLicFile(null);
    setSuccess('');
    setError('');
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Move License to New PC</h2>

      {/* Start */}
      {step === 'start' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This process will help you transfer your license to a new computer. Your remaining license days will be preserved.
          </p>
          <button
            onClick={handleInitiatePcChange}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating New Machine ID...
              </span>
            ) : 'Start PC Change Process'}
          </button>
        </div>
      )}

      {/* New Machine ID */}
      {step === 'new-machine-id' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">Your New Machine ID</p>
            <code className="block bg-white border border-blue-200 rounded px-3 py-2 text-xs font-mono text-gray-800 break-all">{newMachineId}</code>
            <button
              onClick={handleCopyMachineId}
              className="mt-3 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Copied!' : 'Copy Machine ID'}
            </button>
          </div>

          {guidance && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">What to do next:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  {guidance.steps.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-900 mb-2">⚠ For Your Admin</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-amber-800">
                  {guidance.adminSteps.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Old Machine ID (for verification)</label>
            <input
              type="text"
              value={oldMachineId}
              onChange={(e) => setOldMachineId(e.target.value)}
              placeholder="Enter your old Machine ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={() => setStep('upload')}
            disabled={!oldMachineId}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Next: Upload New License File
          </button>
        </div>
      )}

      {/* Upload */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-900 mb-1">Upload New License File</p>
            <p className="text-xs text-green-800 mb-4">Your admin has generated a new .lic file for your new Machine ID. Upload it here to activate your license.</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${licFile ? 'border-green-400 bg-white' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}
            >
              {licFile ? (
                <div>
                  <p className="text-sm font-medium text-green-700">✓ {licFile.name}</p>
                  <p className="text-xs text-green-600 mt-1">Ready to upload</p>
                </div>
              ) : (
                <div>
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600">Click to select your .lic file</p>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".lic" className="hidden" onChange={handleFileSelect} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            onClick={handleUploadLicFile}
            disabled={!licFile || uploading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </span>
            ) : 'Upload and Activate License'}
          </button>

          <button onClick={() => setStep('new-machine-id')} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors">
            Back
          </button>
        </div>
      )}

      {/* Complete */}
      {step === 'complete' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-green-900 mb-1">License Transfer Complete!</p>
            <p className="text-sm text-green-800">{success}</p>
          </div>
          <button onClick={reset} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
