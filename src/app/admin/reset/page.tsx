'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function ResetPage() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleResetDatabase = async () => {
    if (!window.confirm('⚠️ WARNING: This will permanently delete ALL patient data, appointments, fees, bills, and prescriptions. This action CANNOT be undone. Are you sure?')) {
      return;
    }

    if (!window.confirm('🔴 FINAL CONFIRMATION: Delete all data? Type "YES" in the next prompt to confirm.')) {
      return;
    }

    setIsResetting(true);
    setResetStatus('idle');

    try {
      // Clear all localStorage keys
      const keysToDelete = [
        'pms_database',
        'pms_schema_version',
        'pms_seeded',
        'pms_module2_seeded',
        'clinicDoctorSettings',
        'queueSettings',
        'invoiceSettings',
        'billPrintSettings',
        'labelSettings',
        'materiaMedicaAISettings'
      ];

      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        console.log(`✅ Cleared localStorage key: ${key}`);
      });

      // Also clear sessionStorage
      sessionStorage.clear();
      console.log('✅ Cleared sessionStorage');

      setResetStatus('success');
      setMessage('✅ All data has been cleared! The database is now clean. Redirecting to login...');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (error) {
      setResetStatus('error');
      setMessage(`❌ Error clearing data: ${String(error)}`);
      console.error('Reset error:', error);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-6">
      <div className="max-w-2xl mx-auto">
        <Card className="border-2 border-red-200">
          <CardHeader
            title="🔴 Database Reset"
            subtitle="Permanently delete all patient data and start fresh"
          />

          <div className="p-6 space-y-6">
            {/* Warning Box */}
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">⚠️</div>
                <div>
                  <h3 className="font-bold text-red-900 mb-2">WARNING: This action is irreversible!</h3>
                  <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                    <li>All patients will be deleted</li>
                    <li>All appointments will be deleted</li>
                    <li>All fees and receipts will be deleted</li>
                    <li>All prescriptions and bills will be deleted</li>
                    <li>All queue items will be deleted</li>
                    <li>All pharmacy items will be deleted</li>
                    <li>This CANNOT be undone</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* What Will Be Preserved */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-blue-900 mb-2">✅ What will be preserved:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>User accounts (doctor login)</li>
                <li>Roles and permissions</li>
                <li>Fee types (New Patient, Follow Up, etc.)</li>
                <li>Settings and configurations</li>
                <li>License information</li>
              </ul>
            </div>

            {/* Status Messages */}
            {resetStatus === 'success' && (
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                <p className="text-green-800 font-semibold">{message}</p>
              </div>
            )}

            {resetStatus === 'error' && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <p className="text-red-800 font-semibold">{message}</p>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-2">How to reset:</h3>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>Click the "Reset Database" button below</li>
                <li>Confirm the first warning dialog</li>
                <li>Confirm the final confirmation dialog</li>
                <li>All data will be cleared from browser storage</li>
                <li>You will be redirected to login</li>
                <li>The database file (.data/database.json) is already clean</li>
              </ol>
            </div>

            {/* Reset Button */}
            <div className="flex gap-3">
              <Button
                onClick={handleResetDatabase}
                disabled={isResetting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3"
              >
                {isResetting ? '🔄 Resetting...' : '🔴 Reset Database'}
              </Button>
              <Button
                onClick={() => router.back()}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>

            {/* Info Box */}
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-800">
              <strong>ℹ️ Note:</strong> After reset, the dashboard will show 0 for all metrics. You can then create new patients and test all features with fresh data.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
