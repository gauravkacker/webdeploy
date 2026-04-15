'use client';

import React, { useState } from 'react';
import QRCode from 'qrcode.react';

interface MachineIdDisplayProps {
  machineId: string;
  isMultiPc?: boolean;
  onCopy?: () => void;
}

export const MachineIdDisplay: React.FC<MachineIdDisplayProps> = ({
  machineId,
  isMultiPc = false,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy Machine ID:', error);
    }
  };

  const downloadQR = () => {
    const qrElement = document.getElementById('machine-id-qr');
    if (qrElement) {
      const canvas = qrElement.querySelector('canvas');
      if (canvas) {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `machine-id-${machineId}.png`;
        link.click();
      }
    }
  };

  const exportToFile = () => {
    const content = isMultiPc
      ? `Multi-PC License - Machine ID Collection\n\n` +
        `This computer's Machine ID:\n${machineId}\n\n` +
        `IMPORTANT INSTRUCTIONS:\n` +
        `1. Collect Machine IDs from ALL computers that will use this license\n` +
        `2. Each computer should run the software and copy its Machine ID\n` +
        `3. Send ALL Machine IDs together to your administrator\n` +
        `4. Administrator will generate ONE .LIC file that works on all computers\n` +
        `5. The same .LIC file should be installed on each computer\n\n` +
        `Machine IDs collected:\n` +
        `- ${machineId}\n` +
        `- (Add more Machine IDs here)\n`
      : `Machine ID: ${machineId}\n\nSend this to your administrator to generate a license file.`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `machine-id-${machineId.substring(0, 20)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Multi-PC Indicator */}
      {isMultiPc && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <h3 className="font-medium text-purple-900">Multi-PC License</h3>
          </div>
          <p className="text-sm text-purple-800">
            This license can be used on multiple computers. Collect Machine IDs from all computers before requesting the license file.
          </p>
        </div>
      )}

      {/* Machine ID Display */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isMultiPc ? 'This Computer\'s Machine ID' : 'Machine ID'}
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 font-mono text-sm break-all">
            {machineId}
          </code>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        {isMultiPc ? (
          <p className="text-xs text-gray-500 mt-2">
            Collect Machine IDs from all computers, then send them together to your administrator
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-2">
            Send this Machine ID to your administrator to generate a license file
          </p>
        )}
      </div>

      {/* QR Code Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            QR Code
          </label>
          <button
            onClick={() => setShowQR(!showQR)}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            {showQR ? 'Hide' : 'Show'}
          </button>
        </div>

        {showQR && (
          <div className="flex flex-col items-center gap-3">
            <div
              id="machine-id-qr"
              className="bg-white p-2 border border-gray-300 rounded"
            >
              <QRCode
                value={machineId}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>
            <button
              onClick={downloadQR}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              Download QR Code
            </button>
            <p className="text-xs text-gray-500 text-center">
              Your administrator can scan this QR code to quickly enter your Machine ID
            </p>
          </div>
        )}
      </div>

      {/* Export to File */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <button
          onClick={exportToFile}
          className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 font-medium"
        >
          Export to File
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          {isMultiPc
            ? 'Download a file with instructions for collecting Machine IDs from all computers'
            : 'Download your Machine ID as a text file to send to your administrator'}
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Next Steps</h3>
        {isMultiPc ? (
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Run this software on each computer that will use the license</li>
            <li>Copy the Machine ID from each computer</li>
            <li>Collect all Machine IDs in one place (use "Export to File" for a template)</li>
            <li>Send all Machine IDs together to your administrator</li>
            <li>Administrator will generate ONE .LIC file that works on all computers</li>
            <li>Install the same .LIC file on each computer</li>
          </ol>
        ) : (
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Copy your Machine ID above</li>
            <li>Send it to your administrator via email or support ticket</li>
            <li>Administrator will generate a license file (.LIC)</li>
            <li>Upload the license file in the next step</li>
          </ol>
        )}
      </div>
    </div>
  );
};
