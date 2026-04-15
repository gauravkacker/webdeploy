'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PasswordGenerationModal } from '@/components/license/PasswordGenerationModal';
import { decryptPassword } from '@/lib/license/password-encryption';
import { getCurrentUser } from '@/lib/permissions';

interface License {
  id: string;
  licenseKey: string;
  customerId: string;
  planId: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: Array<{
    machineId: string;
    machineIdHash: string;
    addedAt: string;
    addedBy: string;
  }>;
  status: 'active' | 'suspended' | 'expired';
  expiresAt: string;
  modules: string[];
  createdAt: string;
  updatedAt: string;
  generatedPassword?: string; // Encrypted password
  passwordExpiryDate?: string; // Password expiry in YYYYMMDD format
  passwordGeneratedAt?: string; // When password was generated
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  clinicName?: string;
  clinicAddress?: string;
  drRegistration?: string;
  drDegree?: string;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  description?: string;
  modules?: string[];
  isFree?: boolean;
}

const AVAILABLE_MODULES = [
  { id: 'dashboard', name: 'Dashboard', icon: '🏠' },
  { id: 'patients', name: 'Patients', icon: '👥' },
  { id: 'appointments', name: 'Appointments', icon: '📅' },
  { id: 'queue', name: 'Queue', icon: '📋' },
  { id: 'doctor-panel', name: 'Doctor Panel', icon: '🩺' },
  { id: 'pharmacy', name: 'Pharmacy', icon: '💊' },
  { id: 'prescriptions', name: 'Prescriptions', icon: '📋' },
  { id: 'billing', name: 'Billing', icon: '💰' },
  { id: 'reports', name: 'Reports', icon: '📊' },
  { id: 'materia-medica', name: 'Materia Medica', icon: '📚' },
  { id: 'fee-settings', name: 'Fee Settings', icon: '💵' },
  { id: 'slot-settings', name: 'Slot Settings', icon: '🕐' },
  { id: 'queue-settings', name: 'Queue Settings', icon: '⚙️' },
  { id: 'settings', name: 'Settings', icon: '⚙️' },
  { id: 'admin', name: 'Admin', icon: '👨‍💼' },
  { id: 'version-release', name: 'Version Release', icon: '🚀' },
];

export default function LicensingPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'customers' | 'plans' | 'licenses' | 'passwords'>('customers');
  const [licenses, setLicenses] = useState<License[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [showRenewalForm, setShowRenewalForm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPassword, setShowPassword] = useState<string | null>(null); // Track which license's password is visible
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null); // Track which password was copied

  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', clinicName: '', clinicAddress: '', drRegistration: '', drDegree: '' });
  const [planForm, setPlanForm] = useState({ name: '', price: '', description: '', modules: [] as string[], isFree: false });
  const [licenseForm, setLicenseForm] = useState({
    customerId: '',
    planId: '',
    licenseType: 'single-pc' as 'single-pc' | 'multi-pc',
    maxMachines: 1,
    expiryType: 'days' as 'days' | 'months' | 'years' | 'lifetime',
    expiryValue: 1,
    isLifetime: false,
    maxPatients: '',
    isUnlimitedPatients: false,
    maxPrescriptions: '',
    isUnlimitedPrescriptions: false,
    machineId: '',
  });

  const [renewalForm, setRenewalForm] = useState({
    planId: '',
    expiryType: 'days' as 'days' | 'months' | 'years' | 'lifetime',
    expiryValue: 1,
    isLifetime: false,
  });

  const [passwordSearchQuery, setPasswordSearchQuery] = useState('');
  const [passwordSearchResults, setPasswordSearchResults] = useState<License[]>([]);
  const [selectedPasswordLicense, setSelectedPasswordLicense] = useState<License | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [licensesRes, customersRes, plansRes] = await Promise.all([
        fetch('/api/admin/licenses'),
        fetch('/api/admin/customers'),
        fetch('/api/admin/plans'),
      ]);

      let licensesData = [];
      let customersData = [];
      let plansData = [];

      if (licensesRes.ok) {
        licensesData = await licensesRes.json();
        console.log('Licenses loaded from API:', licensesData);
        setLicenses(licensesData);
      } else {
        console.error('Failed to fetch licenses:', licensesRes.status);
      }
      
      if (customersRes.ok) {
        customersData = await customersRes.json();
        setCustomers(customersData);
      }
      
      if (plansRes.ok) {
        plansData = await plansRes.json();
        setPlans(plansData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetLicenses = async () => {
    if (!confirm('Delete ALL old licenses? This cannot be undone.')) return;
    
    try {
      const res = await fetch('/api/admin/licenses/reset', {
        method: 'POST',
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`Cleared ${data.count} old licenses`);
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to reset licenses:', error);
    }
  };

  const getCustomerLicenses = (customerId: string) => {
    return licenses.filter(l => l.customerId === customerId);
  };

  const searchCustomers = () => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(query) || 
      (c.phone && c.phone.includes(query))
    );
  };

  const searchPasswordsByCustomer = () => {
    if (!passwordSearchQuery.trim()) {
      setPasswordSearchResults([]);
      return;
    }
    const query = passwordSearchQuery.toLowerCase();
    const matchingCustomers = customers.filter(c => 
      c.name.toLowerCase().includes(query) || 
      (c.phone && c.phone.includes(query))
    );
    const matchingLicenses = licenses.filter(l => 
      matchingCustomers.some(c => c.id === l.customerId)
    );
    setPasswordSearchResults(matchingLicenses);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCustomerId 
        ? `/api/admin/customers/${editingCustomerId}`
        : '/api/admin/customers';
      const method = editingCustomerId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerForm),
      });

      if (res.ok) {
        setShowCustomerForm(false);
        setEditingCustomerId(null);
        setCustomerForm({ name: '', email: '', phone: '', clinicName: '', clinicAddress: '', drRegistration: '', drDegree: '' });
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to save customer:', error);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to delete customer:', error);
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm({ 
      name: customer.name, 
      email: customer.email, 
      phone: customer.phone || '',
      clinicName: customer.clinicName || '',
      clinicAddress: customer.clinicAddress || '',
      drRegistration: customer.drRegistration || '',
      drDegree: customer.drDegree || ''
    });
    setShowCustomerForm(true);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingPlanId 
        ? `/api/admin/plans/${editingPlanId}`
        : '/api/admin/plans';
      const method = editingPlanId ? 'PUT' : 'POST';

      const planPayload = { 
        ...planForm, 
        price: planForm.isFree ? 0 : parseFloat(planForm.price),
        modules: planForm.modules.length > 0 ? planForm.modules : AVAILABLE_MODULES.map(m => m.id)
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planPayload),
      });

      if (res.ok) {
        setShowPlanForm(false);
        setEditingPlanId(null);
        setPlanForm({ name: '', price: '', description: '', modules: [], isFree: false });
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to save plan:', error);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Delete this plan?')) return;
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlanId(plan.id);
    setPlanForm({ 
      name: plan.name, 
      price: plan.isFree ? '' : plan.price.toString(), 
      description: plan.description || '',
      modules: plan.modules || [],
      isFree: plan.isFree || false
    });
    setShowPlanForm(true);
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Calculate expiry date
      let expiresAt = new Date();
      if (!licenseForm.isLifetime) {
        if (licenseForm.expiryType === 'days') {
          expiresAt.setDate(expiresAt.getDate() + licenseForm.expiryValue);
        } else if (licenseForm.expiryType === 'months') {
          expiresAt.setMonth(expiresAt.getMonth() + licenseForm.expiryValue);
        } else if (licenseForm.expiryType === 'years') {
          expiresAt.setFullYear(expiresAt.getFullYear() + licenseForm.expiryValue);
        }
      } else {
        // Lifetime: set to expiryValue years from now
        expiresAt.setFullYear(expiresAt.getFullYear() + licenseForm.expiryValue);
      }

      // Get the selected plan to get its modules
      const selectedPlan = plans.find(p => p.id === licenseForm.planId);
      const planModules = selectedPlan?.modules || AVAILABLE_MODULES.map(m => m.id);

      const payload = {
        customerId: licenseForm.customerId,
        planId: licenseForm.planId,
        licenseType: licenseForm.licenseType,
        maxMachines: parseInt(licenseForm.maxMachines.toString()),
        expiresAt: expiresAt.toISOString(),
        initialMachineIds: licenseForm.licenseType === 'single-pc' && licenseForm.machineId ? [licenseForm.machineId] : [],
        modules: planModules,
        isLifetime: licenseForm.isLifetime,
        maxPatients: licenseForm.isUnlimitedPatients ? null : parseInt(licenseForm.maxPatients),
        maxPrescriptions: licenseForm.isUnlimitedPrescriptions ? null : parseInt(licenseForm.maxPrescriptions),
      };

      console.log('Creating license with payload:', payload);

      const res = await fetch('/api/admin/licenses/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('License creation response status:', res.status, 'ok:', res.ok);

      let responseData;
      try {
        const text = await res.text();
        console.log('License creation response text:', text);
        responseData = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        responseData = { error: 'Invalid response from server' };
      }

      console.log('License creation response:', responseData);

      if (res.ok && responseData.success) {
        alert('License created successfully! License Key: ' + responseData.licenseKey);
        setShowLicenseForm(false);
        setLicenseForm({
          customerId: '',
          planId: '',
          licenseType: 'single-pc',
          maxMachines: 1,
          expiryType: 'days',
          expiryValue: 1,
          isLifetime: false,
          maxPatients: '',
          isUnlimitedPatients: false,
          maxPrescriptions: '',
          isUnlimitedPrescriptions: false,
          machineId: '',
        });
        // Reload data from API (which reads from server-side database)
        console.log('Reloading licenses after creation...');
        setTimeout(() => {
          console.log('Calling loadData()...');
          loadData();
        }, 500);
      } else {
        alert('Error creating license: ' + (responseData.error || 'Unknown error'));
        console.error('License creation failed:', responseData);
      }
    } catch (error) {
      console.error('Failed to create license:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Failed to create license'));
    }
  };

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLicense) return;

    try {
      const res = await fetch(`/api/admin/licenses/${selectedLicense.id}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: licenseForm.machineId }),
      });

      if (res.ok) {
        setLicenseForm({ ...licenseForm, machineId: '' });
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to add machine:', error);
    }
  };

  const handleRemoveMachine = async (machineId: string) => {
    if (!selectedLicense) return;
    if (!confirm('Remove this machine from the license?')) return;

    try {
      const res = await fetch(`/api/admin/licenses/${selectedLicense.id}/machines/${machineId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to remove machine:', error);
    }
  };

  const handleDeleteLicense = async (licenseId: string) => {
    if (!confirm('Delete this license?')) return;
    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelectedLicense(null);
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to delete license:', error);
    }
  };

  const handleUpgradeToMultiPC = async (licenseId: string) => {
    const newMax = prompt('Enter new max machines (2-100):', '5');
    if (!newMax) return;

    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}/upgrade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMaxMachines: parseInt(newMax) }),
      });

      if (res.ok) {
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to upgrade license:', error);
    }
  };

  const handleRenewLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLicense) return;

    try {
      const res = await fetch(`/api/admin/licenses/${selectedLicense.id}/renew`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: renewalForm.planId,
          expiryType: renewalForm.expiryType,
          expiryValue: renewalForm.expiryValue,
          isLifetime: renewalForm.isLifetime,
        }),
      });

      if (res.ok) {
        setShowRenewalForm(false);
        setRenewalForm({
          planId: '',
          expiryType: 'days',
          expiryValue: 1,
          isLifetime: false,
        });
        setTimeout(() => loadData(), 400);
      }
    } catch (error) {
      console.error('Failed to renew license:', error);
    }
  };

  const handleCopyPassword = async (licenseId: string, encryptedPassword: string) => {
    try {
      const decrypted = decryptPassword(encryptedPassword);
      await navigator.clipboard.writeText(decrypted);
      setCopiedPasswordId(licenseId);
      setTimeout(() => setCopiedPasswordId(null), 2000);
    } catch (error) {
      console.error('Failed to copy password:', error);
    }
  };

  const calculatePasswordDaysRemaining = (expiryDateStr: string): number => {
    if (!expiryDateStr || expiryDateStr.length !== 8) return 0;
    try {
      const year = parseInt(expiryDateStr.slice(0, 4));
      const month = parseInt(expiryDateStr.slice(4, 6));
      const day = parseInt(expiryDateStr.slice(6, 8));
      const expiryDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch {
      return 0;
    }
  };

  const formatPasswordExpiryDate = (expiryDateStr: string): string => {
    if (!expiryDateStr || expiryDateStr.length !== 8) return 'Invalid Date';
    try {
      const year = expiryDateStr.slice(0, 4);
      const month = expiryDateStr.slice(4, 6);
      const day = expiryDateStr.slice(6, 8);
      return `${year}-${month}-${day}`;
    } catch {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <Header 
          title="License Manager"
          subtitle="Manage customers, plans, and licenses"
          actions={
            <Button 
              onClick={() => router.push('/')} 
              variant="secondary" 
              size="sm"
              className="flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
          }
        />

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-6">
          <div className="flex gap-8">
            {(['customers', 'plans', 'licenses', 'passwords'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-4 font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'passwords' ? '🔐 Passwords' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Customers Tab */}
          {activeTab === 'customers' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
                <Button 
                  onClick={() => setShowCustomerForm(!showCustomerForm)}
                  variant="primary"
                  size="sm"
                >
                  {showCustomerForm ? 'Cancel' : '+ Add Customer'}
                </Button>
              </div>

              {/* Search Section */}
              <Card className="p-4 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">🔍 Search Customer</h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by name or phone number..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedCustomer(null);
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => setSearchQuery('')}
                      variant="secondary"
                      size="sm"
                    >
                      Clear
                    </Button>
                  </div>

                  {/* Search Results */}
                  {searchQuery.trim() && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Search Results:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {searchCustomers().length > 0 ? (
                          searchCustomers().map((customer) => (
                            <button
                              key={customer.id}
                              onClick={() => setSelectedCustomer(customer)}
                              className={`p-3 rounded-lg border-2 text-left transition ${
                                selectedCustomer?.id === customer.id
                                  ? 'border-blue-600 bg-blue-50'
                                  : 'border-gray-200 hover:border-blue-400 bg-white'
                              }`}
                            >
                              <p className="font-medium text-gray-900">{customer.name}</p>
                              <p className="text-xs text-gray-600">{customer.email}</p>
                              {customer.phone && <p className="text-xs text-gray-600">📱 {customer.phone}</p>}
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 col-span-2">No customers found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Selected Customer Details with Licenses */}
              {selectedCustomer && (
                <Card className="p-6 mb-6 border-2 border-green-300 bg-green-50">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Customer Info */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Customer Details</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-gray-600 font-medium">Name</p>
                          <p className="text-gray-900">{selectedCustomer.name}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 font-medium">Email</p>
                          <p className="text-gray-900">{selectedCustomer.email}</p>
                        </div>
                        {selectedCustomer.phone && (
                          <div>
                            <p className="text-gray-600 font-medium">Phone</p>
                            <p className="text-gray-900">{selectedCustomer.phone}</p>
                          </div>
                        )}
                        {selectedCustomer.clinicName && (
                          <div>
                            <p className="text-gray-600 font-medium">Clinic</p>
                            <p className="text-gray-900">{selectedCustomer.clinicName}</p>
                          </div>
                        )}
                        {selectedCustomer.clinicAddress && (
                          <div>
                            <p className="text-gray-600 font-medium">Address</p>
                            <p className="text-gray-900 text-xs">{selectedCustomer.clinicAddress}</p>
                          </div>
                        )}
                        {selectedCustomer.drRegistration && (
                          <div>
                            <p className="text-gray-600 font-medium">Registration</p>
                            <p className="text-gray-900">{selectedCustomer.drRegistration}</p>
                          </div>
                        )}
                        {selectedCustomer.drDegree && (
                          <div>
                            <p className="text-gray-600 font-medium">Qualification</p>
                            <p className="text-gray-900">{selectedCustomer.drDegree}</p>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => handleEditCustomer(selectedCustomer)}
                        variant="secondary"
                        size="sm"
                        className="w-full mt-4"
                      >
                        Edit Customer
                      </Button>
                    </div>

                    {/* Licenses */}
                    <div className="lg:col-span-2">
                      <h3 className="font-semibold text-gray-900 mb-4">Associated Licenses</h3>
                      {getCustomerLicenses(selectedCustomer.id).length > 0 ? (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {getCustomerLicenses(selectedCustomer.id).map((license) => {
                            const plan = plans.find(p => p.id === license.planId);
                            return (
                              <Card key={license.id} className="p-4 bg-white border border-gray-200">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex-1">
                                    <p className="font-semibold text-gray-900">{plan?.name || 'Unknown Plan'}</p>
                                    <p className="text-xs text-gray-500 font-mono mt-1">{license.licenseKey}</p>
                                  </div>
                                  <Badge
                                    variant={license.status === 'active' ? 'success' : license.status === 'expired' ? 'danger' : 'warning'}
                                    size="sm"
                                  >
                                    {license.status}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                                  <span>Type: {license.licenseType}</span>
                                  <span>Machines: {license.authorizedMachines.length}/{license.maxMachines}</span>
                                  <span>Expires: {new Date(license.expiresAt).toLocaleDateString()}</span>
                                  <span>Price: {plan?.isFree ? 'FREE' : `₹${plan?.price}`}</span>
                                </div>

                                {/* Display Generated Password if it exists */}
                                {license.generatedPassword && (
                                  <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
                                    <div className="flex justify-between items-center mb-1">
                                      <p className="text-xs font-medium text-green-900">Generated Password</p>
                                      <button
                                        onClick={() => setShowPassword(showPassword === license.id ? null : license.id)}
                                        className="text-xs text-green-700 hover:text-green-900 font-medium"
                                      >
                                        {showPassword === license.id ? 'Hide' : 'Show'}
                                      </button>
                                    </div>
                                    {showPassword === license.id ? (
                                      <div className="space-y-1">
                                        <div className="bg-white border border-green-300 rounded p-1 font-mono text-xs break-all text-gray-900 select-all">
                                          {decryptPassword(license.generatedPassword)}
                                        </div>
                                        <div className="text-xs text-green-700 space-y-0.5">
                                          <p>Password Expiry: {formatPasswordExpiryDate(license.passwordExpiryDate || '')}</p>
                                          <p>Days Remaining: <span className={calculatePasswordDaysRemaining(license.passwordExpiryDate || '') <= 3 ? 'text-red-600 font-semibold' : ''}>{calculatePasswordDaysRemaining(license.passwordExpiryDate || '')}</span> days</p>
                                        </div>
                                        <Button
                                          onClick={() => handleCopyPassword(license.id, license.generatedPassword!)}
                                          variant={copiedPasswordId === license.id ? 'success' : 'primary'}
                                          size="sm"
                                          className="w-full"
                                        >
                                          {copiedPasswordId === license.id ? '✓ Copied' : '📋 Copy'}
                                        </Button>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-green-700">••••••••••••••••</p>
                                    )}
                                  </div>
                                )}

                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => {
                                      setSelectedLicense(license);
                                      setShowRenewalForm(true);
                                      setRenewalForm({
                                        planId: license.planId,
                                        expiryType: 'days',
                                        expiryValue: 1,
                                        isLifetime: false,
                                      });
                                    }}
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1"
                                  >
                                    🔄 Renew
                                  </Button>
                                  <Button
                                    onClick={() => setSelectedLicense(license)}
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1"
                                  >
                                    ✏️ Edit
                                  </Button>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>No licenses found for this customer</p>
                          <Button
                            onClick={() => {
                              setActiveTab('licenses');
                              setLicenseForm({ ...licenseForm, customerId: selectedCustomer.id });
                              setShowLicenseForm(true);
                            }}
                            variant="primary"
                            size="sm"
                            className="mt-3"
                          >
                            Create License
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {showCustomerForm && (
                <Card className="p-6 mb-6 border-2 border-blue-300">
                  <h3 className="text-lg font-semibold mb-4">
                    {editingCustomerId ? 'Edit Customer' : 'Create New Customer'}
                  </h3>
                  <form onSubmit={handleCreateCustomer} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Customer Name"
                        value={customerForm.name}
                        onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                        required
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={customerForm.email}
                        onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                        required
                      />
                      <Input
                        label="Phone"
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      />
                    </div>

                    {/* Optional Clinic & Doctor Details */}
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Optional: Clinic & Doctor Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Clinic Name"
                          value={customerForm.clinicName}
                          onChange={(e) => setCustomerForm({ ...customerForm, clinicName: e.target.value })}
                          placeholder="e.g., ABC Clinic"
                        />
                        <Input
                          label="Clinic Address"
                          value={customerForm.clinicAddress}
                          onChange={(e) => setCustomerForm({ ...customerForm, clinicAddress: e.target.value })}
                          placeholder="e.g., 123 Main St, City"
                        />
                        <Input
                          label="Doctor Registration Number"
                          value={customerForm.drRegistration}
                          onChange={(e) => setCustomerForm({ ...customerForm, drRegistration: e.target.value })}
                          placeholder="e.g., MCI-12345"
                        />
                        <Input
                          label="Doctor Degree/Qualification"
                          value={customerForm.drDegree}
                          onChange={(e) => setCustomerForm({ ...customerForm, drDegree: e.target.value })}
                          placeholder="e.g., MBBS, MD"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" variant="primary">
                        {editingCustomerId ? 'Update Customer' : 'Create Customer'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => {
                        setShowCustomerForm(false);
                        setEditingCustomerId(null);
                        setCustomerForm({ name: '', email: '', phone: '', clinicName: '', clinicAddress: '', drRegistration: '', drDegree: '' });
                      }}>Cancel</Button>
                    </div>
                  </form>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map((customer) => (
                  <Card key={customer.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                        <div className="space-y-1 text-sm text-gray-600 mt-2">
                          <p>📧 {customer.email}</p>
                          {customer.phone && <p>📱 {customer.phone}</p>}
                          {customer.clinicName && <p>🏥 {customer.clinicName}</p>}
                          {customer.drRegistration && <p>📋 Reg: {customer.drRegistration}</p>}
                          {customer.drDegree && <p>🎓 {customer.drDegree}</p>}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Created: {new Date(customer.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditCustomer(customer)}
                        className="flex-1"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="flex-1"
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Plans Tab */}
          {activeTab === 'plans' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Plans</h2>
                <Button 
                  onClick={() => setShowPlanForm(!showPlanForm)}
                  variant="primary"
                  size="sm"
                >
                  {showPlanForm ? 'Cancel' : '+ Add Plan'}
                </Button>
              </div>

              {showPlanForm && (
                <Card className="p-6 mb-6 border-2 border-blue-300">
                  <h3 className="text-lg font-semibold mb-4">
                    {editingPlanId ? 'Edit Plan' : 'Create New Plan'}
                  </h3>
                  <form onSubmit={handleCreatePlan} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Plan Name"
                        value={planForm.name}
                        onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                        required
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={planForm.price}
                            onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                            disabled={planForm.isFree}
                            required={!planForm.isFree}
                            placeholder="0.00"
                          />
                          <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 cursor-pointer transition whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={planForm.isFree}
                              onChange={(e) => setPlanForm({ 
                                ...planForm, 
                                isFree: e.target.checked,
                                price: e.target.checked ? '' : planForm.price
                              })}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-sm font-medium text-gray-700">Free</span>
                          </label>
                        </div>
                      </div>
                      <Input
                        label="Description"
                        value={planForm.description}
                        onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                        className="md:col-span-2"
                      />
                    </div>

                    {/* Module Selection */}
                    <div className="md:col-span-2">
                      <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-gray-700">Select Modules</label>
                        <button
                          type="button"
                          onClick={() => {
                            const allModuleIds = AVAILABLE_MODULES.map(m => m.id);
                            setPlanForm({
                              ...planForm,
                              modules: planForm.modules.length === allModuleIds.length ? [] : allModuleIds
                            });
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                        >
                          {planForm.modules.length === AVAILABLE_MODULES.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {AVAILABLE_MODULES.map((module) => (
                          <label key={module.id} className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg hover:bg-blue-50 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={planForm.modules.includes(module.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPlanForm({
                                    ...planForm,
                                    modules: [...planForm.modules, module.id]
                                  });
                                } else {
                                  setPlanForm({
                                    ...planForm,
                                    modules: planForm.modules.filter(m => m !== module.id)
                                  });
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-lg">{module.icon}</span>
                            <span className="text-sm font-medium text-gray-700">{module.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {planForm.modules.length === 0 
                          ? 'No modules selected - all modules will be included' 
                          : `${planForm.modules.length} module(s) selected`}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" variant="primary">
                        {editingPlanId ? 'Update Plan' : 'Create Plan'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => {
                        setShowPlanForm(false);
                        setEditingPlanId(null);
                        setPlanForm({ name: '', price: '', description: '', modules: [], isFree: false });
                      }}>Cancel</Button>
                    </div>
                  </form>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <Card key={plan.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                      {plan.isFree && (
                        <Badge variant="success" size="sm">
                          Free
                        </Badge>
                      )}
                    </div>
                    <p className={`text-2xl font-bold mb-2 ${plan.isFree ? 'text-green-600' : 'text-blue-600'}`}>
                      {plan.isFree ? 'FREE' : `₹${plan.price}`}
                    </p>
                    {plan.description && <p className="text-sm text-gray-600 mb-3">{plan.description}</p>}
                    {plan.modules && plan.modules.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {plan.modules.slice(0, 3).map((moduleId) => {
                          const module = AVAILABLE_MODULES.find(m => m.id === moduleId);
                          return module ? (
                            <Badge key={moduleId} variant="default" size="sm" className="text-xs">
                              {module.icon} {module.name}
                            </Badge>
                          ) : null;
                        })}
                        {plan.modules.length > 3 && (
                          <Badge variant="default" size="sm" className="text-xs">
                            +{plan.modules.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditPlan(plan)}
                        className="flex-1"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeletePlan(plan.id)}
                        className="flex-1"
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Licenses Tab */}
          {activeTab === 'licenses' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Licenses</h2>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleResetLicenses}
                    variant="danger"
                    size="sm"
                  >
                    🗑️ Clear Old Licenses
                  </Button>
                  <Button 
                    onClick={() => setShowLicenseForm(!showLicenseForm)}
                    variant="primary"
                    size="sm"
                  >
                    {showLicenseForm ? 'Cancel' : '+ Create License'}
                  </Button>
                </div>
              </div>

              {showLicenseForm && (
                <Card className="p-6 mb-6 border-2 border-blue-300">
                  <h3 className="text-lg font-semibold mb-4">Create New License</h3>
                  <form onSubmit={handleCreateLicense} className="space-y-6">
                    {/* Customer & Plan Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                        <select
                          value={licenseForm.customerId}
                          onChange={(e) => setLicenseForm({ ...licenseForm, customerId: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          required
                        >
                          <option value="">Select customer</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
                        <select
                          value={licenseForm.planId}
                          onChange={(e) => setLicenseForm({ ...licenseForm, planId: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          required
                        >
                          <option value="">Select plan</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* License Type & Machines */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">License Type</label>
                        <select
                          value={licenseForm.licenseType}
                          onChange={(e) => setLicenseForm({
                            ...licenseForm,
                            licenseType: e.target.value as 'single-pc' | 'multi-pc',
                            maxMachines: e.target.value === 'single-pc' ? 1 : 2,
                          })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        >
                          <option value="single-pc">Single-PC</option>
                          <option value="multi-pc">Multi-PC</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Max Machines</label>
                        <Input
                          type="number"
                          min={licenseForm.licenseType === 'single-pc' ? 1 : 2}
                          max="100"
                          value={licenseForm.maxMachines.toString()}
                          onChange={(e) => setLicenseForm({ ...licenseForm, maxMachines: parseInt(e.target.value) || 1 })}
                          disabled={licenseForm.licenseType === 'single-pc'}
                        />
                      </div>
                    </div>

                    {/* Expiry Configuration */}
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3">License Expiry</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Type</label>
                          <select
                            value={licenseForm.isLifetime ? 'lifetime' : licenseForm.expiryType}
                            onChange={(e) => {
                              if (e.target.value === 'lifetime') {
                                setLicenseForm({ ...licenseForm, isLifetime: true });
                              } else {
                                setLicenseForm({ 
                                  ...licenseForm, 
                                  isLifetime: false,
                                  expiryType: e.target.value as 'days' | 'months' | 'years'
                                });
                              }
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          >
                            <option value="days">Days</option>
                            <option value="months">Months</option>
                            <option value="years">Years</option>
                            <option value="lifetime">Lifetime</option>
                          </select>
                        </div>
                        {!licenseForm.isLifetime && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Duration ({licenseForm.expiryType === 'days' ? 'Days' : licenseForm.expiryType === 'months' ? 'Months' : 'Years'})
                            </label>
                            <Input
                              type="number"
                              min="1"
                              max={licenseForm.expiryType === 'days' ? '3650' : licenseForm.expiryType === 'months' ? '120' : '50'}
                              value={licenseForm.expiryValue.toString()}
                              onChange={(e) => setLicenseForm({ ...licenseForm, expiryValue: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                        )}
                        {licenseForm.isLifetime && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Lifetime Duration (Years)</label>
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              value={licenseForm.expiryValue.toString()}
                              onChange={(e) => setLicenseForm({ ...licenseForm, expiryValue: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Expires On</label>
                          <div className="flex items-center px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                            <span className="text-sm text-gray-600">
                              {(() => {
                                let date = new Date();
                                if (!licenseForm.isLifetime) {
                                  if (licenseForm.expiryType === 'days') {
                                    date.setDate(date.getDate() + licenseForm.expiryValue);
                                  } else if (licenseForm.expiryType === 'months') {
                                    date.setMonth(date.getMonth() + licenseForm.expiryValue);
                                  } else {
                                    date.setFullYear(date.getFullYear() + licenseForm.expiryValue);
                                  }
                                } else {
                                  date.setFullYear(date.getFullYear() + licenseForm.expiryValue);
                                }
                                return date.toLocaleDateString();
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Patient & Prescription Limits */}
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Usage Limits</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Max Patients</label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              min="1"
                              value={licenseForm.maxPatients}
                              onChange={(e) => setLicenseForm({ ...licenseForm, maxPatients: e.target.value })}
                              disabled={licenseForm.isUnlimitedPatients}
                              placeholder="Enter number"
                              required={!licenseForm.isUnlimitedPatients}
                            />
                            <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 cursor-pointer transition whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={licenseForm.isUnlimitedPatients}
                                onChange={(e) => setLicenseForm({ 
                                  ...licenseForm, 
                                  isUnlimitedPatients: e.target.checked,
                                  maxPatients: e.target.checked ? '' : licenseForm.maxPatients
                                })}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-sm font-medium text-gray-700">Unlimited</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Max Prescriptions</label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              min="1"
                              value={licenseForm.maxPrescriptions}
                              onChange={(e) => setLicenseForm({ ...licenseForm, maxPrescriptions: e.target.value })}
                              disabled={licenseForm.isUnlimitedPrescriptions}
                              placeholder="Enter number"
                              required={!licenseForm.isUnlimitedPrescriptions}
                            />
                            <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 cursor-pointer transition whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={licenseForm.isUnlimitedPrescriptions}
                                onChange={(e) => setLicenseForm({ 
                                  ...licenseForm, 
                                  isUnlimitedPrescriptions: e.target.checked,
                                  maxPrescriptions: e.target.checked ? '' : licenseForm.maxPrescriptions
                                })}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-sm font-medium text-gray-700">Unlimited</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Initial Machine ID - Only for Single-PC */}
                    {licenseForm.licenseType === 'single-pc' && (
                      <div>
                        <Input
                          label="Machine ID (Required for Single-PC)"
                          placeholder="MACHINE-XXXX-XXXX-XXXX-XXXX"
                          value={licenseForm.machineId}
                          onChange={(e) => setLicenseForm({ ...licenseForm, machineId: e.target.value })}
                          required={licenseForm.licenseType === 'single-pc'}
                        />
                      </div>
                    )}
                    {licenseForm.licenseType === 'multi-pc' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-900">
                          <strong>Multi-PC License:</strong> You can add machine IDs now or add them later from the license details panel.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button type="submit" variant="primary">Create License</Button>
                      <Button type="button" variant="secondary" onClick={() => setShowLicenseForm(false)}>Cancel</Button>
                    </div>
                  </form>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {licenses.map((license) => {
                    const customer = customers.find((c) => c.id === license.customerId);
                    return (
                      <Card
                        key={license.id}
                        onClick={() => setSelectedLicense(license)}
                        className={`p-4 cursor-pointer transition ${
                          selectedLicense?.id === license.id
                            ? 'ring-2 ring-blue-500 bg-blue-50'
                            : 'hover:shadow-md'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">{customer?.name || 'Unknown'}</h3>
                            <p className="text-xs text-gray-500 font-mono mt-1">{license.licenseKey}</p>
                          </div>
                          <Badge
                            variant={license.status === 'active' ? 'success' : license.status === 'expired' ? 'danger' : 'warning'}
                            size="sm"
                          >
                            {license.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <span>Type: {license.licenseType}</span>
                          <span>Machines: {license.authorizedMachines.length}/{license.maxMachines}</span>
                          <span>Expires: {new Date(license.expiresAt).toLocaleDateString()}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {selectedLicense && (
                  <Card className="p-6 h-fit sticky top-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-gray-900">License Details</h3>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteLicense(selectedLicense.id)}
                      >
                        Delete
                      </Button>
                    </div>

                    {/* Customer Info */}
                    {(() => {
                      const customer = customers.find(c => c.id === selectedLicense.customerId);
                      return customer ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                          <p className="text-xs text-gray-600 font-medium mb-1">Customer</p>
                          <p className="font-semibold text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-600">{customer.email}</p>
                          {customer.phone && <p className="text-xs text-gray-600">{customer.phone}</p>}
                        </div>
                      ) : null;
                    })()}

                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="text-gray-600 font-medium">License Key</p>
                        <p className="font-mono text-xs break-all text-gray-900">{selectedLicense.licenseKey}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 font-medium">Type</p>
                        <p className="text-gray-900">{selectedLicense.licenseType}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 font-medium">Expires On</p>
                        <p className="text-gray-900">{new Date(selectedLicense.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 font-medium">Machines</p>
                        <p className="text-gray-900">{selectedLicense.authorizedMachines.length} / {selectedLicense.maxMachines}</p>
                      </div>
                      <div className="pt-4 border-t">
                        <p className="text-gray-600 font-medium mb-2">Authorized Machines</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {selectedLicense.authorizedMachines.map((machine) => (
                            <div key={machine.machineId} className="bg-gray-100 p-2 rounded text-xs flex justify-between items-center">
                              <span className="font-mono truncate">{machine.machineId}</span>
                              {selectedLicense.licenseType === 'multi-pc' && (
                                <button
                                  onClick={() => handleRemoveMachine(machine.machineId)}
                                  className="text-red-600 hover:text-red-800 ml-2"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="pt-4 space-y-2">
                        {selectedLicense.licenseType === 'multi-pc' && selectedLicense.authorizedMachines.length < selectedLicense.maxMachines && (
                          <form onSubmit={handleAddMachine} className="space-y-2">
                            <Input
                              placeholder="MACHINE-XXXX-XXXX-XXXX-XXXX"
                              value={licenseForm.machineId}
                              onChange={(e) => setLicenseForm({ ...licenseForm, machineId: e.target.value })}
                              required
                            />
                            <Button type="submit" variant="primary" size="sm" className="w-full">Add Machine</Button>
                          </form>
                        )}
                        {selectedLicense.licenseType === 'single-pc' && (
                          <Button
                            onClick={() => handleUpgradeToMultiPC(selectedLicense.id)}
                            variant="secondary"
                            size="sm"
                            className="w-full"
                          >
                            Upgrade to Multi-PC
                          </Button>
                        )}
                      </div>

                      {/* Renewal Section */}
                      <div className="pt-4 border-t">
                        <Button
                          onClick={() => {
                            setShowRenewalForm(!showRenewalForm);
                            if (!showRenewalForm) {
                              setRenewalForm({
                                planId: selectedLicense.planId || '',
                                expiryType: 'days',
                                expiryValue: 1,
                                isLifetime: false,
                              });
                            }
                          }}
                          variant="secondary"
                          size="sm"
                          className="w-full"
                        >
                          {showRenewalForm ? 'Cancel Renewal' : '🔄 Renew License'}
                        </Button>

                        {/* Display Generated Password if it exists */}
                        {selectedLicense.generatedPassword && (
                          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-medium text-green-900">Generated Password</p>
                              <button
                                onClick={() => setShowPassword(showPassword === selectedLicense.id ? null : selectedLicense.id)}
                                className="text-xs text-green-700 hover:text-green-900 font-medium"
                              >
                                {showPassword === selectedLicense.id ? 'Hide' : 'Show'}
                              </button>
                            </div>
                            {showPassword === selectedLicense.id ? (
                              <div className="space-y-2">
                                <div className="bg-white border border-green-300 rounded p-2 font-mono text-sm break-all text-gray-900 select-all">
                                  {decryptPassword(selectedLicense.generatedPassword)}
                                </div>
                                <div className="text-xs text-green-700 space-y-1">
                                  <p>Password Expiry: {formatPasswordExpiryDate(selectedLicense.passwordExpiryDate || '')}</p>
                                  <p>Days Remaining: <span className={calculatePasswordDaysRemaining(selectedLicense.passwordExpiryDate || '') <= 3 ? 'text-red-600 font-semibold' : ''}>{calculatePasswordDaysRemaining(selectedLicense.passwordExpiryDate || '')}</span> days</p>
                                </div>
                                <Button
                                  onClick={() => handleCopyPassword(selectedLicense.id, selectedLicense.generatedPassword!)}
                                  variant={copiedPasswordId === selectedLicense.id ? 'success' : 'primary'}
                                  size="sm"
                                  className="w-full"
                                >
                                  {copiedPasswordId === selectedLicense.id ? '✓ Copied' : '📋 Copy Password'}
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs text-green-700">••••••••••••••••</p>
                            )}
                          </div>
                        )}

                        <Button
                          onClick={() => setShowPasswordModal(true)}
                          variant="primary"
                          size="sm"
                          className="w-full mt-3"
                        >
                          🔐 Generate Password
                        </Button>

                        {showRenewalForm && (
                          <form onSubmit={handleRenewLicense} className="space-y-3 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Select Plan</label>
                              <select
                                value={renewalForm.planId}
                                onChange={(e) => setRenewalForm({ ...renewalForm, planId: e.target.value })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                required
                              >
                                <option value="">Choose plan</option>
                                {plans.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Type</label>
                              <select
                                value={renewalForm.isLifetime ? 'lifetime' : renewalForm.expiryType}
                                onChange={(e) => {
                                  if (e.target.value === 'lifetime') {
                                    setRenewalForm({ ...renewalForm, isLifetime: true });
                                  } else {
                                    setRenewalForm({
                                      ...renewalForm,
                                      isLifetime: false,
                                      expiryType: e.target.value as 'days' | 'months' | 'years'
                                    });
                                  }
                                }}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                <option value="days">Days</option>
                                <option value="months">Months</option>
                                <option value="years">Years</option>
                                <option value="lifetime">Lifetime</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Duration ({renewalForm.isLifetime ? 'Years' : renewalForm.expiryType === 'days' ? 'Days' : renewalForm.expiryType === 'months' ? 'Months' : 'Years'})
                              </label>
                              <input
                                type="number"
                                min="1"
                                max={renewalForm.isLifetime ? '100' : renewalForm.expiryType === 'days' ? '3650' : renewalForm.expiryType === 'months' ? '120' : '50'}
                                value={renewalForm.expiryValue}
                                onChange={(e) => setRenewalForm({ ...renewalForm, expiryValue: parseInt(e.target.value) })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              />
                            </div>

                            <div className="bg-white p-2 rounded text-xs text-gray-600">
                              <p className="font-medium">New Expiry Date:</p>
                              <p>
                                {(() => {
                                  let date = new Date();
                                  if (!renewalForm.isLifetime) {
                                    if (renewalForm.expiryType === 'days') {
                                      date.setDate(date.getDate() + renewalForm.expiryValue);
                                    } else if (renewalForm.expiryType === 'months') {
                                      date.setMonth(date.getMonth() + renewalForm.expiryValue);
                                    } else {
                                      date.setFullYear(date.getFullYear() + renewalForm.expiryValue);
                                    }
                                  } else {
                                    date.setFullYear(date.getFullYear() + renewalForm.expiryValue);
                                  }
                                  return date.toLocaleDateString();
                                })()}
                              </p>
                            </div>

                            <Button type="submit" variant="primary" size="sm" className="w-full">
                              Renew License
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Passwords Tab */}
          {activeTab === 'passwords' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">🔐 License Passwords</h2>
              
              {/* Search Section */}
              <Card className="p-4 mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Search Customer</h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by customer name or phone..."
                      value={passwordSearchQuery}
                      onChange={(e) => {
                        setPasswordSearchQuery(e.target.value);
                        searchPasswordsByCustomer();
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        setPasswordSearchQuery('');
                        setPasswordSearchResults([]);
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Search Results */}
              {passwordSearchResults.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Found {passwordSearchResults.length} license(s)</p>
                  {passwordSearchResults.map((license) => {
                    const customer = customers.find(c => c.id === license.customerId);
                    const plan = plans.find(p => p.id === license.planId);
                    
                    return (
                      <Card key={license.id} className="p-4 border-l-4 border-l-green-500">
                        <div className="space-y-3">
                          {/* Customer Info */}
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-gray-900">{customer?.name}</p>
                              <p className="text-xs text-gray-600">{customer?.email}</p>
                              {customer?.phone && <p className="text-xs text-gray-600">{customer.phone}</p>}
                            </div>
                            <Badge variant={license.status === 'active' ? 'success' : 'warning'}>
                              {license.status}
                            </Badge>
                          </div>

                          {/* License Info */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-gray-600">License Key</p>
                              <p className="font-mono text-gray-900">{license.licenseKey}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Plan</p>
                              <p className="text-gray-900">{plan?.name}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Type</p>
                              <p className="text-gray-900">{license.licenseType === 'single-pc' ? 'Single-PC' : `Multi-PC (${license.maxMachines})`}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Expires</p>
                              <p className="text-gray-900">{new Date(license.expiresAt).toLocaleDateString()}</p>
                            </div>
                          </div>

                          {/* Password Section */}
                          {license.generatedPassword ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                              <div className="flex justify-between items-center">
                                <p className="text-sm font-medium text-green-900">✓ Password Generated</p>
                                <button
                                  onClick={() => setSelectedPasswordLicense(selectedPasswordLicense?.id === license.id ? null : license)}
                                  className="text-xs text-green-700 hover:text-green-900 font-medium"
                                >
                                  {selectedPasswordLicense?.id === license.id ? 'Hide' : 'Show'}
                                </button>
                              </div>
                              
                              {selectedPasswordLicense?.id === license.id && (
                                <div className="space-y-2">
                                  <div className="bg-white border border-green-300 rounded p-2 font-mono text-sm break-all text-gray-900 select-all">
                                    {decryptPassword(license.generatedPassword)}
                                  </div>
                                  <div className="text-xs text-green-700 space-y-1">
                                    <p>Password Expiry: {formatPasswordExpiryDate(license.passwordExpiryDate || '')}</p>
                                    <p>Days Remaining: <span className={calculatePasswordDaysRemaining(license.passwordExpiryDate || '') <= 3 ? 'text-red-600 font-semibold' : ''}>{calculatePasswordDaysRemaining(license.passwordExpiryDate || '')}</span> days</p>
                                  </div>
                                  <Button
                                    onClick={() => {
                                      navigator.clipboard.writeText(decryptPassword(license.generatedPassword!));
                                      alert('Password copied to clipboard!');
                                    }}
                                    variant="primary"
                                    size="sm"
                                    className="w-full"
                                  >
                                    📋 Copy Password
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <p className="text-sm text-yellow-900 mb-2">No password generated yet</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setSelectedLicense(license);
                                setShowPasswordModal(true);
                              }}
                              variant="primary"
                              size="sm"
                              className="flex-1"
                            >
                              {license.generatedPassword ? '🔄 Generate New' : '✨ Generate Password'}
                            </Button>
                            <Button
                              onClick={() => {
                                setSelectedLicense(license);
                                setActiveTab('licenses');
                              }}
                              variant="secondary"
                              size="sm"
                              className="flex-1"
                            >
                              View License
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : passwordSearchQuery ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No licenses found for "{passwordSearchQuery}"</p>
                  <Button
                    onClick={() => {
                      setPasswordSearchQuery('');
                      setPasswordSearchResults([]);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Clear Search
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">Search for a customer to view and manage their license passwords</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Password Generation Modal */}
        {selectedLicense && (
          <PasswordGenerationModal
            isOpen={showPasswordModal}
            licenseId={selectedLicense.id}
            licenseKey={selectedLicense.licenseKey}
            onClose={() => setShowPasswordModal(false)}
            onGenerate={async () => {
              // Reload data after password generation
              await loadData();
              // After loadData completes, update selectedLicense with fresh data
              if (selectedLicense) {
                try {
                  const res = await fetch('/api/admin/licenses');
                  if (res.ok) {
                    const licensesData = await res.json();
                    const updated = licensesData.find((l: License) => l.id === selectedLicense.id);
                    if (updated) {
                      setSelectedLicense(updated);
                    }
                  }
                } catch (err) {
                  console.error('Failed to fetch updated license:', err);
                }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}