'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface Plan {
  id: string;
  name: string;
  validityDays: number;
  modules: string[];
}

interface CustomerLicense {
  customerId: string;
  customerName: string;
  licenseKey: string;
  machineIds: string[];
  expiresAt: string;
}

export default function LicenseRenewalAdmin() {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerLicense[]>([]);
  const [searching, setSearching] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [renewalDays, setRenewalDays] = useState('365');
  const [adminId, setAdminId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [renewalResult, setRenewalResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin/plans')
      .then(r => r.json())
      .then(data => setPlans(data.plans || []))
      .catch(() => {});
  }, []);

  const handleCustomerSearch = async (query: string) => {
    setCustomerSearch(query);
    if (query.length < 2) { setCustomerResults([]); return; }
    setSearching(true);
    try {
      const [custRes, licRes] = await Promise.all([
        fetch(`/api/admin/customers?search=${encodeURIComponent(query)}`),
        fetch('/api/admin/licenses'),
      ]);
      const custData = await custRes.json();
      const licData = await licRes.json();
      const customers = custData.customers || [];
      const licenses = licData.licenses || [];
      const results: CustomerLicense[] = customers.map((c: any) => {
        const lic = licenses.find((l: any) => l.customerId === c.id && l.status === 'active');
        return {
          customerId: c.id,
          customerName: c.name,
          licenseKey: lic?.licenseKey || '',
          machineIds: lic?.machineIds || [],
          expiresAt: lic?.expiresAt || '',
        };
      }).filter((r: CustomerLicense) => r.licenseKey);
      setCustomerResults(results);
    } catch {}
    setSearching(false);
  };

  const handleSelectCustomer = (customer: CustomerLicense) => {
    setLicenseKey(customer.licenseKey);
    setMachineId(customer.machineIds?.[0] || '');
    setCustomerSearch(customer.customerName);
    setCustomerResults([]);
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    if (planId) {
      const plan = plans.find(p => p.id === planId);
      if (plan) setRenewalDays(String(plan.validityDays));
    }
  };

  const handleGenerateRenewal = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setRenewalResult(null);

      // Validate inputs
      if (!machineId || !licenseKey || !renewalDays || !adminId) {
        setError('All fields are required');
        return;
      }

      const days = parseInt(renewalDays);
      if (isNaN(days) || days <= 0) {
        setError('Renewal days must be a positive number');
        return;
      }

      // Generate renewal .LIC file
      const response = await fetch('/api/license/renewal/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          machineId,
          licenseKey,
          renewalDays: days,
          adminId,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Failed to generate renewal .LIC file');
        return;
      }

      setSuccess('Renewal .LIC file generated successfully!');
      setRenewalResult(data);
    } catch (err) {
      setError('Failed to generate renewal .LIC file');
      console.error('Error generating renewal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLicFile = () => {
    if (!renewalResult?.licFile) return;

    // Convert base64 to blob
    const byteCharacters = atob(renewalResult.licFile);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/octet-stream' });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `renewal-${licenseKey}.lic`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Generate Renewal Form */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Renewal .LIC File</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Create a renewal .LIC file for a customer's license
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Search */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Search Customer</label>
            <div className="relative">
              <Input
                placeholder="Type customer name or email..."
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                disabled={loading}
              />
              {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
              {customerResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {customerResults.map(c => (
                    <button
                      key={c.customerId}
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.customerName}</p>
                      <p className="text-xs text-gray-500">{c.licenseKey} · expires {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'N/A'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">Select a customer to auto-fill license details below</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="machineId" className="block text-sm font-medium text-gray-700">Machine ID</label>
              <Input
                id="machineId"
                placeholder="MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                The customer's current Machine ID
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="licenseKey" className="block text-sm font-medium text-gray-700">License Key</label>
              <Input
                id="licenseKey"
                placeholder="KIRO-XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                The customer's current license key
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Change Plan (Optional)</label>
              <select
                value={selectedPlanId}
                onChange={(e) => handlePlanChange(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Keep current plan --</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.validityDays} days)</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">Select a plan to auto-fill renewal days</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="renewalDays" className="block text-sm font-medium text-gray-700">Renewal Days</label>
              <Input
                id="renewalDays"
                type="number"
                placeholder="365"
                value={renewalDays}
                onChange={(e) => setRenewalDays(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">Number of days to add (remaining days preserved)</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="adminId" className="block text-sm font-medium text-gray-700">Admin User ID</label>
            <Input
              id="adminId"
              placeholder="Your name or admin ID (for audit trail)"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Just a label for the audit log — put your name or any identifier</p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">How It Works</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>System calculates remaining days from current license</li>
              <li>Adds remaining days to renewal period</li>
              <li>Generates new .LIC file with extended expiration</li>
              <li>Old license is marked as renewed</li>
              <li>Customer uploads new .LIC file to activate renewal</li>
            </ol>
          </div>

          <Button
            onClick={handleGenerateRenewal}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Generate Renewal .LIC File
              </>
            )}
          </Button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal Result */}
      {renewalResult && (
        <Card>
          <CardHeader>
            <CardTitle>Renewal Details</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Review the renewal information and download the .LIC file
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">License Key</p>
                <p className="text-sm font-mono">{licenseKey}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500">Machine ID</p>
                <p className="text-sm font-mono">{machineId}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Remaining Days
                </p>
                <p className="text-sm font-medium text-orange-600">
                  {renewalResult.remainingDays} days
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Renewal Days
                </p>
                <p className="text-sm font-medium text-blue-600">
                  {renewalDays} days
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Total Days
                </p>
                <p className="text-sm font-medium text-green-600">
                  {renewalResult.totalDays} days
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-500">New Expiration Date</p>
              <p className="text-sm font-medium">
                {formatDate(renewalResult.newExpiresAt)}
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="text-sm font-medium text-green-900 mb-2">Next Steps</h3>
              <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
                <li>Download the renewal .LIC file using the button below</li>
                <li>Send the .LIC file to the customer</li>
                <li>Instruct customer to upload the file in their license settings</li>
                <li>Customer's license will be extended automatically</li>
              </ol>
            </div>

            <Button
              onClick={handleDownloadLicFile}
              className="w-full"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Renewal .LIC File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
