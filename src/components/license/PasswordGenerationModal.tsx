/**
 * Password Generation Modal Component
 * Displays generated password and allows copying to clipboard
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface PasswordGenerationModalProps {
  isOpen: boolean;
  licenseId: string;
  licenseKey: string;
  onClose: () => void;
  onGenerate?: () => void;
}

export function PasswordGenerationModal({
  isOpen,
  licenseId,
  licenseKey,
  onClose,
  onGenerate,
}: PasswordGenerationModalProps) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [customExpiryDays, setCustomExpiryDays] = useState<number>(365);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGeneratePassword = async () => {
    setLoading(true);
    setError(null);
    setPassword(null);

    try {
      console.log('Generating password for licenseId:', licenseId);
      
      if (!licenseId) {
        setError('License ID is missing');
        setLoading(false);
        return;
      }

      const body: any = {};

      if (expiryDate) {
        body.expiryDate = expiryDate;
      } else if (customExpiryDays) {
        body.customExpiryDays = customExpiryDays;
      }

      console.log('Request body:', body);
      console.log('API URL:', `/api/admin/licenses/${licenseId}/generate-password`);

      const res = await fetch(`/api/admin/licenses/${licenseId}/generate-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      console.log('Response:', data);

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to generate password');
        return;
      }

      setPassword(data.password);
      onGenerate?.();
    } catch (err) {
      console.error('Error generating password:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate password');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Generate License Password</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {!password ? (
          <div className="space-y-4">
            {/* License Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-gray-600 font-medium mb-1">License Key</p>
              <p className="font-mono text-sm text-gray-900 break-all">{licenseKey}</p>
            </div>

            {/* Expiry Date Options */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Expiry Date</p>

              {/* Option 1: Custom Days */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Days from today</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="3650"
                    value={customExpiryDays}
                    onChange={(e) => {
                      setCustomExpiryDays(parseInt(e.target.value) || 365);
                      setExpiryDate(''); // Clear manual date
                    }}
                    placeholder="365"
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 self-center whitespace-nowrap">
                    {customExpiryDays === 365 ? '(1 year)' : customExpiryDays === 730 ? '(2 years)' : ''}
                  </span>
                </div>
              </div>

              {/* Option 2: Manual Date */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Or set manual date (YYYYMMDD)</label>
                <Input
                  type="text"
                  placeholder="20261231"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    if (e.target.value) setCustomExpiryDays(0); // Clear days option
                  }}
                  maxLength="8"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Format: YYYYMMDD (e.g., 20261231 = Dec 31, 2026)</p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Generate Button */}
            <Button
              onClick={handleGeneratePassword}
              disabled={loading}
              variant="primary"
              className="w-full"
            >
              {loading ? 'Generating...' : 'Generate Password'}
            </Button>

            <Button
              onClick={onClose}
              variant="secondary"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Success Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-700">✓ Password Generated Successfully</p>
            </div>

            {/* Password Display */}
            <div>
              <p className="text-xs text-gray-600 font-medium mb-2">Your Password</p>
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 font-mono text-sm break-all text-gray-900 select-all">
                {password}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Length: {password.length} characters (URL-safe, no special characters)
              </p>
            </div>

            {/* Copy Button */}
            <Button
              onClick={handleCopyToClipboard}
              variant={copied ? 'success' : 'primary'}
              className="w-full"
            >
              {copied ? '✓ Copied to Clipboard' : '📋 Copy to Clipboard'}
            </Button>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-900 mb-2">How to use this password:</p>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>Share this password with your customer</li>
                <li>Customer opens the app and selects "Use Password"</li>
                <li>Customer pastes this password on the login page</li>
                <li>License activates automatically (offline)</li>
              </ol>
            </div>

            {/* Close Button */}
            <Button
              onClick={onClose}
              variant="secondary"
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
