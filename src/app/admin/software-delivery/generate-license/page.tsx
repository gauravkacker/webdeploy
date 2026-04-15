'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface Plan {
  id: string;
  name: string;
  validityDays: number;
}

function GenerateLicensePage() {
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get('customerId') || '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState(preselectedCustomerId);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [maxConcurrentComputers, setMaxConcurrentComputers] = useState(5);
  const [machineId, setMachineId] = useState('');
  const [licenseType, setLicenseType] = useState<'single-pc' | 'multi-pc'>('single-pc');
  const [maxMachines, setMaxMachines] = useState(2);
  const [machineIds, setMachineIds] = useState('');
  const [machineIdErrors, setMachineIdErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Smart machine ID input state
  const [machineIdInput, setMachineIdInput] = useState('');
  const [machineIdList, setMachineIdList] = useState<string[]>([]);

  const formatMachineIdInput = (raw: string): string => {
    // Strip everything except hex chars
    const hex = raw.replace(/[^A-F0-9]/gi, '').toUpperCase().slice(0, 32);
    if (!hex) return '';
    // Insert dashes after every 8 chars: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
    const parts = [];
    for (let i = 0; i < hex.length; i += 8) parts.push(hex.slice(i, i + 8));
    return 'MACHINE-' + parts.join('-');
  };

  const handleMachineIdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/^MACHINE-/i, '');
    setMachineIdInput(formatMachineIdInput(raw));
  };

  const handleMachineIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const id = machineIdInput.trim();
      const pattern = /^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
      if (pattern.test(id) && !machineIdList.includes(id)) {
        if (licenseType === 'single-pc') {
          setMachineId(id);
          setMachineIdInput('');
        } else {
          setMachineIdList(prev => [...prev, id]);
          setMachineIds(prev => prev ? prev + '\n' + id : id);
          setMachineIdInput('');
        }
      }
    }
    if (e.key === 'Backspace' && machineIdInput === '') {
      // Remove last added ID
      if (licenseType === 'multi-pc' && machineIdList.length > 0) {
        const newList = machineIdList.slice(0, -1);
        setMachineIdList(newList);
        setMachineIds(newList.join('\n'));
      }
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchPlans();
  }, []);

  useEffect(() => {
    calculateEndDate();
  }, [selectedPlan, startDate]);

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

  const validateMachineIds = (ids: string[]): string[] => {
    const errors: string[] = [];
    const machineIdPattern = /^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
    
    ids.forEach((id, index) => {
      const trimmedId = id.trim();
      if (trimmedId && !machineIdPattern.test(trimmedId)) {
        errors.push(`Line ${index + 1}: Invalid Machine ID format`);
      }
    });
    
    return errors;
  };

  const handleMachineIdsChange = (value: string) => {
    setMachineIds(value);
    
    if (licenseType === 'multi-pc') {
      const lines = value.split('\n').filter(line => line.trim());
      const errors = validateMachineIds(lines);
      setMachineIdErrors(errors);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!selectedCustomer || !selectedPlan || !startDate) {
      alert('Please fill in all required fields');
      return;
    }

    if (licenseType === 'single-pc') {
      if (!machineId) {
        alert('Please enter a Machine ID and press Enter to confirm');
        return;
      }
    } else {
      if (machineIdList.length === 0) {
        alert('Please enter at least one Machine ID and press Enter to add it');
        return;
      }
      if (machineIdList.length > maxMachines) {
        alert(`Number of Machine IDs (${machineIdList.length}) exceeds PC limit (${maxMachines})`);
        return;
      }
    }

    setGenerating(true);
    try {
      const payload: any = {
        customerId: selectedCustomer,
        planId: selectedPlan,
        startDate,
        maxConcurrentComputers,
        licenseType,
      };

      if (licenseType === 'single-pc') {
        payload.machineId = machineId;
      } else {
        payload.maxMachines = maxMachines;
        payload.initialMachineIds = machineIdList;
      }

      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data.license);
        setSelectedCustomer('');
        setSelectedPlan('');
        setMachineId('');
        setMachineIds('');
        setMachineIdErrors([]);
        setStartDate(new Date().toISOString().split('T')[0]);
      } else {
        const error = await res.json();
        alert(`Failed to generate license: ${error.error || 'Unknown error'}`);
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

  const downloadLicFile = (base64Data: string, licenseKey: string) => {
    try {
      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create blob and download
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${licenseKey}.lic`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download .LIC file:', error);
      alert('Failed to download .LIC file');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8 text-center">Loading...</div>;
  }

  return (
    <>
      <Sidebar />
      <div className="min-h-screen bg-gray-50 p-8 transition-all duration-300 ml-64">
        <div className="max-w-2xl mx-auto">
        <Link href="/admin/software-delivery">
          <button className="text-blue-600 hover:text-blue-800 mb-4">← Back to Dashboard</button>
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate License</h1>
        <p className="text-gray-600 mb-8">Create a new license for a customer</p>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <form onSubmit={handleGenerate} className="space-y-6">
            <div>
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

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                License Type
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="single-pc"
                    checked={licenseType === 'single-pc'}
                    onChange={(e) => setLicenseType(e.target.value as 'single-pc')}
                    className="mr-2"
                  />
                  <span className="text-gray-900">Single-PC License (1 computer)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="multi-pc"
                    checked={licenseType === 'multi-pc'}
                    onChange={(e) => setLicenseType(e.target.value as 'multi-pc')}
                    className="mr-2"
                  />
                  <span className="text-gray-900">Multi-PC License (2-100 computers)</span>
                </label>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Single-PC: One .LIC file for one computer. Multi-PC: One .LIC file works on multiple computers in a LAN.
              </p>
            </div>

            {licenseType === 'single-pc' ? (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Machine ID</label>
                {machineId ? (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded font-mono text-sm">{machineId}</span>
                    <button type="button" onClick={() => { setMachineId(''); setMachineIdInput(''); }} className="text-red-500 text-xs hover:text-red-700">✕ Remove</button>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Type hex chars — auto-formats to MACHINE-XXXXXXXX-..."
                    value={machineIdInput}
                    onChange={handleMachineIdInputChange}
                    onKeyDown={handleMachineIdKeyDown}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">Just type the hex characters — dashes are added automatically. Press Enter to confirm.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">PC Limit</label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={maxMachines}
                    onChange={(e) => setMaxMachines(parseInt(e.target.value) || 2)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">Maximum number of computers (2-100)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Machine IDs</label>
                  {/* Added IDs as tags */}
                  {machineIdList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {machineIdList.map((id, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">
                          {id}
                          <button type="button" onClick={() => {
                            const newList = machineIdList.filter((_, idx) => idx !== i);
                            setMachineIdList(newList);
                            setMachineIds(newList.join('\n'));
                          }} className="text-red-500 hover:text-red-700 ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Type hex chars — press Enter to add each Machine ID"
                    value={machineIdInput}
                    onChange={handleMachineIdInputChange}
                    onKeyDown={handleMachineIdKeyDown}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Type hex chars (auto-formatted), press Enter to add. {machineIdList.length} of {maxMachines} added. You can add more later.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Max Concurrent Computers
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={maxConcurrentComputers}
                onChange={(e) => setMaxConcurrentComputers(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Number of computers that can use this license simultaneously on a LAN (default: 5)
              </p>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {generating ? 'Generating...' : 'Generate License'}
            </button>
          </form>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">License Generated Successfully!</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">License Key</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={result.licenseKey}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(result.licenseKey)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {result.licFileBase64 && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">.LIC File</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadLicFile(result.licFileBase64, result.licenseKey)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Download .LIC File
                    </button>
                    <button
                      onClick={() => copyToClipboard(result.licFileBase64)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Copy Base64
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Send this .LIC file to the customer along with the license key
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Activated</label>
                  <p className="text-gray-900">{new Date(result.activatedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Expires</label>
                  <p className="text-gray-900">{new Date(result.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Max Concurrent Computers</label>
                <p className="text-gray-900">{result.maxConcurrentComputers || 5} computers</p>
              </div>

              {result.licenseType === 'multi-pc' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">License Type</label>
                    <p className="text-gray-900">Multi-PC License</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">PC Limit</label>
                    <p className="text-gray-900">{result.maxMachines} computers</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Authorized Machine IDs</label>
                    <div className="bg-gray-50 p-3 rounded border border-gray-200 max-h-40 overflow-y-auto">
                      {result.authorizedMachines?.map((id: string, index: number) => (
                        <div key={index} className="font-mono text-sm text-gray-900 mb-1">
                          {id}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {result.licenseType === 'single-pc' && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">License Type</label>
                  <p className="text-gray-900">Single-PC License</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Modules</label>
                <div className="flex flex-wrap gap-2">
                  {result.modules?.map((mod: string) => (
                    <span key={mod} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                      {mod}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setResult(null)}
                className="w-full bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Generate Another License
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

export default function GenerateLicensePageWrapper() {
  return (
    <Suspense>
      <GenerateLicensePage />
    </Suspense>
  );
}
