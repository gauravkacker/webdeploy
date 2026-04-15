'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface MachineBindingDetail {
  id: string;
  licenseKey: string;
  machineId: string;
  machineIdHash: string;
  expiresAt: string | null;
  status: string;
  activatedAt: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string;
  clinicName: string | null;
  modules: string[];
  validityDays: number | null;
}

interface ReuseAttempt {
  id: string;
  machineId: string;
  attemptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: string | null;
}

export default function MachineBindingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [binding, setBinding] = useState<MachineBindingDetail | null>(null);
  const [reuseAttempts, setReuseAttempts] = useState<ReuseAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBindingDetails();
    fetchReuseAttempts();
  }, [id]);

  const fetchBindingDetails = async () => {
    try {
      const response = await fetch(`/api/admin/licenses/${id}`);
      const data = await response.json();

      if (data.success) {
        setBinding(data.license);
      } else {
        setError('Failed to load machine binding details');
      }
    } catch (err) {
      console.error('Error fetching binding details:', err);
      setError('Error loading details');
    } finally {
      setLoading(false);
    }
  };

  const fetchReuseAttempts = async () => {
    try {
      const response = await fetch(`/api/admin/license/check-reuse?licenseId=${id}`);
      const data = await response.json();

      if (data.success && data.attempts) {
        setReuseAttempts(data.attempts);
      }
    } catch (err) {
      console.error('Error fetching reuse attempts:', err);
    }
  };

  const handleInvalidate = async () => {
    if (!confirm('Are you sure you want to invalidate this license? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/license/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: id }),
      });

      const data = await response.json();

      if (data.success) {
        alert('License invalidated successfully');
        fetchBindingDetails();
      } else {
        alert('Failed to invalidate license: ' + data.error);
      }
    } catch (err) {
      console.error('Error invalidating license:', err);
      alert('Error invalidating license');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysUntilExpiry = () => {
    if (!binding?.expiresAt) return null;
    const now = new Date();
    const expiry = new Date(binding.expiresAt);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !binding) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-red-600">{error || 'Binding not found'}</div>
        </div>
      </div>
    );
  }

  const daysUntilExpiry = getDaysUntilExpiry();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery/machine-binding">
            <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
              ← Back to Machine Bindings
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Machine Binding Details</h1>
        </div>

        {/* Main Details */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">License Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                License Key
              </label>
              <div className="font-mono text-lg text-gray-900">{binding.licenseKey}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
              <div>
                <span
                  className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    binding.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {binding.status}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Machine ID
              </label>
              <div className="font-mono text-sm text-gray-900 break-all">
                {binding.machineId}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Activated At
              </label>
              <div className="text-gray-900">{formatDate(binding.activatedAt)}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Expires At
              </label>
              <div className="text-gray-900">
                {formatDate(binding.expiresAt)}
                {daysUntilExpiry !== null && (
                  <span
                    className={`ml-2 text-sm ${
                      daysUntilExpiry < 0
                        ? 'text-red-600'
                        : daysUntilExpiry <= 30
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}
                  >
                    ({daysUntilExpiry > 0 ? `${daysUntilExpiry} days left` : `Expired`})
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Validity Days
              </label>
              <div className="text-gray-900">{binding.validityDays || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
              <div className="text-gray-900">{binding.customerName}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
              <div className="text-gray-900">{binding.customerEmail}</div>
            </div>

            {binding.clinicName && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Clinic Name
                </label>
                <div className="text-gray-900">{binding.clinicName}</div>
              </div>
            )}
          </div>
        </div>

        {/* Modules */}
        {binding.modules && binding.modules.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Licensed Modules</h2>
            <div className="flex flex-wrap gap-2">
              {binding.modules.map((module, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {module}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reuse Attempts */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            License Reuse Attempts ({reuseAttempts.length})
          </h2>
          {reuseAttempts.length === 0 ? (
            <p className="text-gray-500">No reuse attempts detected</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Machine ID
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Attempted At
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      IP Address
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reuseAttempts.map((attempt) => (
                    <tr key={attempt.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm text-gray-900">
                        {attempt.machineId.substring(0, 20)}...
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatDate(attempt.attemptedAt)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {attempt.ipAddress || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {attempt.details || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/admin/software-delivery/license-transfer?licenseKey=${binding.licenseKey}`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Transfer to New Machine
            </Link>

            <Link
              href={`/admin/software-delivery/license-renewal?licenseKey=${binding.licenseKey}`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              Renew License
            </Link>

            <button
              onClick={handleInvalidate}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Invalidate License
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
