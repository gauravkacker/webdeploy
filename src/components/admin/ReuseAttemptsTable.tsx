'use client';

import { useState, useEffect } from 'react';

interface ReuseAttempt {
  id: string;
  licenseKey: string;
  originalMachineIdHash: string;
  attemptedMachineId: string;
  attemptedMachineIdHash: string;
  timestamp: string;
  ipAddress?: string;
  blocked: boolean;
  details?: string;
  licenseType?: 'single-pc' | 'multi-pc';
  authorizedMachineIds?: string[];
}

interface Statistics {
  totalAttempts: number;
  uniqueLicenses: number;
  recentAttempts: number;
  attemptsByLicense: Record<string, number>;
  singlePCAttempts: number;
  multiPCAttempts: number;
}

type DateRangeFilter = 'today' | 'last7days' | 'last30days' | 'custom' | 'all';

export default function ReuseAttemptsTable() {
  const [attempts, setAttempts] = useState<ReuseAttempt[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [addingToLicense, setAddingToLicense] = useState<string | null>(null);
  const itemsPerPage = 10;

  // Fetch reuse attempts
  const fetchAttempts = async () => {
    setLoading(true);
    try {
      let startDate = '';
      let endDate = '';

      // Calculate date range
      const now = new Date();
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          endDate = new Date(now.setHours(23, 59, 59, 999)).toISOString();
          break;
        case 'last7days':
          startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
          break;
        case 'last30days':
          startDate = new Date(now.setDate(now.getDate() - 30)).toISOString();
          break;
        case 'custom':
          startDate = customStartDate;
          endDate = customEndDate;
          break;
      }

      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/admin/reuse-attempts?${params}`);
      const data = await response.json();

      if (data.success) {
        setAttempts(data.attempts);
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Error fetching reuse attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, [dateRange, customStartDate, customEndDate]);

  // Add machine to license
  const handleAddToLicense = async (attempt: ReuseAttempt) => {
    if (!attempt.authorizedMachineIds || !attempt.licenseType) {
      alert('Cannot add to license: Missing license information');
      return;
    }

    // Check if we can add
    const maxMachines = attempt.authorizedMachineIds.length + 10; // Estimate, will be validated server-side
    if (attempt.authorizedMachineIds.length >= maxMachines) {
      alert('Cannot add to license: PC limit may be reached');
      return;
    }

    if (!confirm(`Add Machine ID ${attempt.attemptedMachineId.substring(0, 20)}... to license ${attempt.licenseKey}?`)) {
      return;
    }

    setAddingToLicense(attempt.id);
    try {
      // Find the license ID from the license key
      const licensesResponse = await fetch('/api/admin/licenses');
      const licensesData = await licensesResponse.json();
      
      if (!licensesData.success) {
        throw new Error('Failed to fetch licenses');
      }

      const license = licensesData.licenses.find((l: any) => l.licenseKey === attempt.licenseKey);
      
      if (!license) {
        throw new Error('License not found');
      }

      // Add the machine ID
      const response = await fetch(`/api/admin/licenses/${license.id}/machines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          machineId: attempt.attemptedMachineId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Machine ID added to license successfully!');
        fetchAttempts(); // Refresh the list
      } else {
        alert(`Failed to add machine: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error adding machine to license:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAddingToLicense(null);
    }
  };

  // Check if machine can be added to license
  const canAddToLicense = (attempt: ReuseAttempt): boolean => {
    if (!attempt.authorizedMachineIds || !attempt.licenseType) {
      return false;
    }
    // For multi-PC, we assume there might be room (server will validate)
    // For single-PC, cannot add
    return attempt.licenseType === 'multi-pc';
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Timestamp',
      'License Key',
      'License Type',
      'Attempted Machine ID',
      'Authorized Machines Count',
      'IP Address',
      'Status',
      'Details',
    ];

    const rows = attempts.map((attempt) => [
      new Date(attempt.timestamp).toLocaleString(),
      attempt.licenseKey,
      attempt.licenseType === 'multi-pc' ? 'Multi-PC' : 'Single-PC',
      attempt.attemptedMachineId,
      attempt.authorizedMachineIds?.length || 'N/A',
      attempt.ipAddress || 'N/A',
      attempt.blocked ? 'Blocked' : 'Allowed',
      attempt.details || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reuse-attempts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Pagination
  const totalPages = Math.ceil(attempts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAttempts = attempts.slice(startIndex, endIndex);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Attempts</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {statistics.totalAttempts}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Unique Licenses</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {statistics.uniqueLicenses}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Recent (7 days)</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {statistics.recentAttempts}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Single-PC</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {statistics.singlePCAttempts}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Multi-PC</div>
            <div className="text-3xl font-bold text-purple-600 mt-2">
              {statistics.multiPCAttempts}
            </div>
          </div>
        </div>
      )}

      {/* Filters and Export */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Date Range Filter */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as DateRangeFilter);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Range */}
          {dateRange === 'custom' && (
            <>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Export Button */}
          <div>
            <button
              onClick={exportToCSV}
              disabled={attempts.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {currentAttempts.length} of {attempts.length} reuse attempts
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : currentAttempts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No reuse attempts found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Timestamp
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    License Key
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    License Type
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Attempted Machine ID
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Authorized Machines
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    IP Address
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentAttempts.map((attempt) => (
                  <tr
                    key={attempt.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition"
                  >
                    <td className="py-3 px-4">
                      <div className="text-sm text-gray-900">
                        {formatDate(attempt.timestamp)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-sm text-gray-900">
                        {attempt.licenseKey}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          attempt.licenseType === 'multi-pc'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {attempt.licenseType === 'multi-pc' ? 'Multi-PC' : 'Single-PC'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-gray-600">
                        {attempt.attemptedMachineId.substring(0, 20)}...
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {attempt.authorizedMachineIds && attempt.authorizedMachineIds.length > 0 ? (
                        <div className="text-sm text-gray-900">
                          {attempt.authorizedMachineIds.length} machine{attempt.authorizedMachineIds.length !== 1 ? 's' : ''}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">N/A</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-gray-900">
                        {attempt.ipAddress || 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          attempt.blocked
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {attempt.blocked ? 'Blocked' : 'Allowed'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {canAddToLicense(attempt) ? (
                        <button
                          onClick={() => handleAddToLicense(attempt)}
                          disabled={addingToLicense === attempt.id}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {addingToLicense === attempt.id ? 'Adding...' : 'Add to License'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Previous
          </button>
          <div className="flex items-center px-4 py-2 text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
