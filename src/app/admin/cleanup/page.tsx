'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface CleanupStats {
  totalOrphaned: number;
  breakdown: {
    fees: number;
    prescriptions: number;
    bills: number;
    billingQueue: number;
    pharmacyQueue: number;
    receipts: number;
  };
}

interface CleanupResult {
  success: boolean;
  message: string;
  summary?: {
    totalRemoved: number;
    fees: number;
    prescriptions: number;
    bills: number;
    billingQueue: number;
    pharmacyQueue: number;
    receipts: number;
  };
  error?: string;
}

export default function CleanupPage() {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  // Fetch cleanup statistics on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cleanup/orphaned-items', {
        method: 'GET',
      });
      const data = await response.json();
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch cleanup stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    try {
      setCleaning(true);
      const response = await fetch('/api/cleanup/orphaned-items', {
        method: 'POST',
      });
      const data = await response.json();
      setResult(data);
      if (data.success) {
        // Refresh stats after cleanup
        setTimeout(fetchStats, 1000);
      }
    } catch (error) {
      console.error('Failed to run cleanup:', error);
      setResult({
        success: false,
        message: 'Failed to run cleanup',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-64 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Database Cleanup</h1>
          <p className="text-sm text-gray-500">Remove orphaned fees, prescriptions, bills, and related records</p>
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Orphaned Items Statistics</h2>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Loading statistics...</p>
            </div>
          ) : stats ? (
            <div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-lg font-semibold text-blue-900">
                  Total Orphaned Items: <span className="text-2xl">{stats.totalOrphaned}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Fees</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.fees}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Prescriptions</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.prescriptions}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Bills</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.bills}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Billing Queue</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.billingQueue}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Pharmacy Queue</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.pharmacyQueue}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Orphaned Receipts</p>
                  <p className="text-2xl font-bold text-red-600">{stats.breakdown.receipts}</p>
                </div>
              </div>

              {stats.totalOrphaned > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Found {stats.totalOrphaned} orphaned items. These are records that reference deleted patients.
                    Click the button below to remove them.
                  </p>
                </div>
              )}

              {stats.totalOrphaned === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-800">
                    ✓ No orphaned items found. Your database is clean!
                  </p>
                </div>
              )}

              <Button
                onClick={runCleanup}
                disabled={cleaning || stats.totalOrphaned === 0}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cleaning ? 'Cleaning...' : 'Run Cleanup'}
              </Button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">Failed to load statistics</p>
            </div>
          )}
        </Card>

        {result && (
          <Card className={`p-6 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h2 className="text-lg font-semibold mb-4">
              {result.success ? '✓ Cleanup Completed' : '✗ Cleanup Failed'}
            </h2>
            <p className="mb-4">{result.message}</p>

            {result.summary && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Total Removed</p>
                  <p className="text-xl font-bold">{result.summary.totalRemoved}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Fees Removed</p>
                  <p className="text-xl font-bold">{result.summary.fees}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Prescriptions Removed</p>
                  <p className="text-xl font-bold">{result.summary.prescriptions}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Bills Removed</p>
                  <p className="text-xl font-bold">{result.summary.bills}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Billing Queue Removed</p>
                  <p className="text-xl font-bold">{result.summary.billingQueue}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Pharmacy Queue Removed</p>
                  <p className="text-xl font-bold">{result.summary.pharmacyQueue}</p>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Receipts Removed</p>
                  <p className="text-xl font-bold">{result.summary.receipts}</p>
                </div>
              </div>
            )}

            {result.error && (
              <div className="bg-white p-3 rounded-lg mt-4">
                <p className="text-sm text-red-600">{result.error}</p>
              </div>
            )}

            <Button onClick={fetchStats} className="mt-4">
              Refresh Statistics
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
