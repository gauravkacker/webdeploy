'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface MachineBinding {
  id: string;
  licenseKey: string;
  machineId: string;
  machineIdHash: string;
  expiresAt: string | null;
  status: 'active' | 'expired' | 'expiring-soon';
  activatedAt: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string;
  clinicName: string | null;
}

export default function MachineBindingList() {
  const [bindings, setBindings] = useState<MachineBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('expiresAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch machine bindings
  const fetchBindings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        status: statusFilter,
        sortBy,
        sortOrder,
      });

      const response = await fetch(`/api/admin/machine-binding/list?${params}`);
      const data = await response.json();

      if (data.success) {
        setBindings(data.bindings);
      }
    } catch (error) {
      console.error('Error fetching machine bindings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBindings();
  }, [search, statusFilter, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(bindings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentBindings = bindings.slice(startIndex, endIndex);

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
            Active
          </span>
        );
      case 'expired':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
            Expired
          </span>
        );
      case 'expiring-soon':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
            Expiring Soon
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate days until expiry
  const getDaysUntilExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Machine ID, License Key, Customer..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expiring-soon">Expiring Soon</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort By
            </label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="expiresAt">Expiration Date</option>
                <option value="activatedAt">Activation Date</option>
                <option value="licenseKey">License Key</option>
                <option value="customerName">Customer Name</option>
                <option value="status">Status</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {currentBindings.length} of {bindings.length} machine bindings
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : currentBindings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No machine bindings found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Machine ID
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    License Key
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Expiration
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
                {currentBindings.map((binding) => {
                  const daysUntilExpiry = getDaysUntilExpiry(binding.expiresAt);
                  return (
                    <tr
                      key={binding.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-sm text-gray-900">
                          {binding.machineId.substring(0, 16)}...
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-sm text-gray-900">
                          {binding.licenseKey}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900 font-medium">
                          {binding.customerName}
                        </div>
                        {binding.clinicName && (
                          <div className="text-xs text-gray-500">{binding.clinicName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900">
                          {formatDate(binding.expiresAt)}
                        </div>
                        {daysUntilExpiry !== null && (
                          <div className="text-xs text-gray-500">
                            {daysUntilExpiry > 0
                              ? `${daysUntilExpiry} days left`
                              : `Expired ${Math.abs(daysUntilExpiry)} days ago`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(binding.status)}</td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/software-delivery/machine-binding/${binding.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View Details →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
