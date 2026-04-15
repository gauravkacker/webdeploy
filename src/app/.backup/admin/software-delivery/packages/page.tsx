'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/SidebarComponent';

interface Customer {
  id: string;
  name: string;
  email: string;
}

export default function PackagesPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [packageType, setPackageType] = useState('pm2');
  const [modules, setModules] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [includeLicensingModule, setIncludeLicensingModule] = useState(false);
  const [includeVersionRelease, setIncludeVersionRelease] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      alert('Please select a customer');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/packages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer,
          packageType,
          modules,
          includeLicensingModule,
          includeVersionRelease,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error('Failed to generate package:', error);
      alert('Failed to generate package');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />
      <div className={`min-h-screen bg-gray-50 p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery">
            <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
              ← Back
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Generate Deployment Package</h1>
          <p className="text-gray-600 mt-2">Create deployment packages for customers</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <form onSubmit={handleGenerate}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">Select Customer</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- Choose a customer --</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">Package Type</label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="pm2"
                    checked={packageType === 'pm2'}
                    onChange={(e) => setPackageType(e.target.value)}
                    className="mr-3"
                  />
                  <span className="text-gray-900">PM2 Bundle (~200MB)</span>
                  <span className="text-gray-600 text-sm ml-2">Node.js runtime + source code</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="exe"
                    checked={packageType === 'exe'}
                    onChange={(e) => setPackageType(e.target.value)}
                    className="mr-3"
                  />
                  <span className="text-gray-900">Windows EXE (~300MB)</span>
                  <span className="text-gray-600 text-sm ml-2">Installer with auto-start</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="portable"
                    checked={packageType === 'portable'}
                    onChange={(e) => setPackageType(e.target.value)}
                    className="mr-3"
                  />
                  <span className="text-gray-900">Portable Executable (~250MB)</span>
                  <span className="text-gray-600 text-sm ml-2">No installation needed</span>
                </label>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeLicensingModule}
                  onChange={(e) => setIncludeLicensingModule(e.target.checked)}
                  className="mr-3 w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-900">Include Licensing Module</span>
                <span className="text-gray-600 text-sm ml-2">(Internal use only - disable for customer builds)</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeVersionRelease}
                  onChange={(e) => setIncludeVersionRelease(e.target.checked)}
                  className="mr-3 w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-900">Include Version Release Module</span>
                <span className="text-gray-600 text-sm ml-2">(Developer use only - disable for customer builds)</span>
              </label>
              
              <p className="text-xs text-gray-500 mt-2 ml-7">
                When unchecked, these developer modules will be completely hidden from the customer's installation.
              </p>
            </div>

            <div className="mb-6">
              <button
                type="submit"
                disabled={generating}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {generating ? 'Generating...' : 'Generate Package'}
              </button>
            </div>
          </form>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Package Generated</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Package ID</label>
                <div className="bg-gray-50 px-4 py-2 rounded border border-gray-300 font-mono text-sm">
                  {result.packageId}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">License Key</label>
                <div className="bg-gray-50 px-4 py-2 rounded border border-gray-300 font-mono text-sm">
                  {result.licenseKey}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Installation Instructions</label>
                <pre className="bg-gray-50 px-4 py-2 rounded border border-gray-300 text-sm overflow-auto max-h-64">
                  {result.instructions}
                </pre>
              </div>
              <div>
                <a
                  href={result.downloadUrl}
                  className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  Download Package
                </a>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
