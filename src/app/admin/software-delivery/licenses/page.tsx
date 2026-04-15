'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/SidebarComponent';

interface License {
  id: string;
  customerId: string;
  licenseKey: string;
  status: 'active' | 'inactive' | 'expired';
  expiresAt: string;
  maxPrescriptions: number;
  maxConcurrentComputers?: number;
  modules: string[];
}

export default function LicensesPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchLicenses();
  }, [status]);

  const fetchLicenses = async () => {
    try {
      const url = status ? `/api/admin/licenses?status=${status}` : '/api/admin/licenses';
      const res = await fetch(url);
      const data = await res.json();
      console.log('Licenses fetched:', data);
      setLicenses(data.licenses || []);
    } catch (error) {
      console.error('Failed to fetch licenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this license?')) return;
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('License deleted successfully');
        fetchLicenses();
      } else {
        const error = await res.json();
        alert('Failed to delete license: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to delete license:', error);
      alert('Failed to delete license');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('License key copied to clipboard');
  };

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />
      <div className={`min-h-screen bg-gray-50 p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/admin/software-delivery">
              <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
                ← Back
              </button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Licenses</h1>
            <p className="text-gray-600 mt-2">Manage and track license keys</p>
          </div>
          <Link href="/admin/software-delivery/generate-license">
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              + Generate License
            </button>
          </Link>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* Licenses Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">License Key</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Expires</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Max Computers</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Modules</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : licenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No licenses found
                  </td>
                </tr>
              ) : (
                licenses.map((license) => (
                  <tr key={license.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{license.licenseKey}</span>
                        <button
                          onClick={() => copyToClipboard(license.licenseKey)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          license.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : license.status === 'inactive'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {license.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(license.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {license.maxConcurrentComputers || 5}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {license.modules.length > 0 ? license.modules.join(', ') : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link href={`/admin/software-delivery/licenses/${license.id}`}>
                        <button className="text-blue-600 hover:text-blue-800 mr-4">View</button>
                      </Link>
                      <button
                        onClick={() => handleDelete(license.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </>
  );
}
