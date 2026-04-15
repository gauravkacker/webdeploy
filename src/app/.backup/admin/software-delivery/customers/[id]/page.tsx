'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  clinicName?: string;
  address?: string;
  status: 'active' | 'inactive' | 'expired';
  createdAt: string;
}

interface License {
  id: string;
  licenseKey: string;
  status: 'active' | 'inactive' | 'expired';
  expiresAt: string;
  maxPrescriptions: number;
  maxPatients: number;
}

interface Plan {
  id: string;
  name: string;
  validityDays: number;
}

function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (customerId) {
      fetchCustomer();
      fetchLicenses();
      fetchPlans();
    }
  }, [customerId]);

  useEffect(() => {
    calculateEndDate();
  }, [selectedPlan, startDate]);

  const fetchCustomer = async () => {
    try {
      console.log('Fetching customer with ID:', customerId);
      const res = await fetch(`/api/admin/customers/${customerId}`);
      const data = await res.json();
      console.log('Customer API Response:', data, 'Status:', res.status);
      if (res.ok) {
        setCustomer(data.customer);
      } else {
        console.error('Customer not found:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLicenses = async () => {
    try {
      const res = await fetch(`/api/admin/licenses?customerId=${customerId}`);
      const data = await res.json();
      setLicenses(data.licenses || []);
    } catch (error) {
      console.error('Failed to fetch licenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/admin/plans');
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const calculateEndDate = () => {
    if (!selectedPlan || !startDate) {
      setEndDate('');
      return;
    }

    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    const start = new Date(startDate);
    const end = new Date(start.getTime() + plan.validityDays * 24 * 60 * 60 * 1000);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !startDate) {
      alert('Please select a plan and start date');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          planId: selectedPlan,
          startDate,
        }),
      });

      if (res.ok) {
        alert('License generated successfully!');
        setShowLicenseForm(false);
        setSelectedPlan('');
        setStartDate(new Date().toISOString().split('T')[0]);
        fetchLicenses();
      } else {
        alert('Failed to generate license');
      }
    } catch (error) {
      console.error('Failed to generate license:', error);
      alert('Failed to generate license');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8 text-center">Loading...</div>;
  }

  if (!customer) {
    return <div className="min-h-screen bg-gray-50 p-8 text-center">Customer not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery/customers">
            <button className="text-blue-600 hover:text-blue-800 mb-4">← Back to Customers</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-gray-600 mt-2">{customer.email}</p>
        </div>

        {/* Customer Details */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm text-gray-600">Name</label>
              <p className="text-lg text-gray-900">{customer.name}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Email</label>
              <p className="text-lg text-gray-900">{customer.email}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Phone</label>
              <p className="text-lg text-gray-900">{customer.phone || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Clinic Name</label>
              <p className="text-lg text-gray-900">{customer.clinicName || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Status</label>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  customer.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : customer.status === 'inactive'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {customer.status}
              </span>
            </div>
            <div>
              <label className="text-sm text-gray-600">Created</label>
              <p className="text-lg text-gray-900">{new Date(customer.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          {customer.address && (
            <div className="mt-6">
              <label className="text-sm text-gray-600">Address</label>
              <p className="text-lg text-gray-900">{customer.address}</p>
            </div>
          )}
        </div>

        {/* Generate License Form */}
        {showLicenseForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Generate New License</h2>
            <form onSubmit={handleGenerateLicense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Select Plan</label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Choose a plan --</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.validityDays} days)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">End Date (Auto-calculated)</label>
                  <input
                    type="date"
                    value={endDate}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {generating ? 'Generating...' : 'Generate License'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLicenseForm(false)}
                  className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Licenses */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Licenses</h2>
            {!showLicenseForm && (
              <button
                onClick={() => setShowLicenseForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                + Generate License
              </button>
            )}
          </div>
          {licenses.length === 0 ? (
            <p className="text-gray-500">No licenses found for this customer</p>
          ) : (
            <div className="space-y-4">
              {licenses.map((license) => (
                <div key={license.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-mono text-sm text-gray-600">License Key:</p>
                      <p className="font-mono font-semibold text-gray-900 break-all">{license.licenseKey}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(license.licenseKey)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <label className="text-gray-600">Status</label>
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          license.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : license.status === 'inactive'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {license.status}
                      </span>
                    </div>
                    <div>
                      <label className="text-gray-600">Expires</label>
                      <p className="text-gray-900">{new Date(license.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="text-gray-600">Max Prescriptions</label>
                      <p className="text-gray-900">{license.maxPrescriptions === -1 ? 'Unlimited' : license.maxPrescriptions}</p>
                    </div>
                    <div>
                      <label className="text-gray-600">Max Patients</label>
                      <p className="text-gray-900">{license.maxPatients === -1 ? 'Unlimited' : license.maxPatients}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerDetailPage;
