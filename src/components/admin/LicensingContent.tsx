'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PasswordGenerationModal } from '@/components/license/PasswordGenerationModal';
import { decryptPassword } from '@/lib/license/password-encryption';

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
  generatedPassword?: string;
  passwordExpiryDate?: string;
  passwordGeneratedAt?: string;
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
  // Fee Settings - HIDDEN from modules (available in Settings page)
  // Slot Settings - HIDDEN from modules (available in Settings page)
  { id: 'queue-settings', name: 'Queue Settings', icon: '⚙️' },
  { id: 'settings', name: 'Settings', icon: '⚙️' },
  { id: 'admin', name: 'Admin', icon: '👨‍💼' },
  { id: 'version-release', name: 'Version Release', icon: '🚀' },
];

export default function LicensingContent() {
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
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 -mx-6 -mt-8 px-6 mb-6">
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

          {/* Selected Customer Details */}
          {selectedCustomer && (
            <Card className="p-6 border-2 border-green-300 bg-green-50">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  </div>
                </div>

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
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                              <span>Type: {license.licenseType}</span>
                              <span>Machines: {license.authorizedMachines.length}/{license.maxMachines}</span>
                              <span>Expires: {new Date(license.expiresAt).toLocaleDateString()}</span>
                              <span>Price: {plan?.isFree ? 'FREE' : `₹${plan?.price}`}</span>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No licenses for this customer</p>
                  )}
                </div>
              </div>
            </Card>
          )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-4">
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-600 mt-2">
                  {plan.isFree ? 'FREE' : `₹${plan.price}`}
                </p>
                {plan.description && (
                  <p className="text-xs text-gray-500 mt-2">{plan.description}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Licenses Tab */}
      {activeTab === 'licenses' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Licenses</h2>
          <div className="grid grid-cols-1 gap-4">
            {licenses.map((license) => {
              const customer = customers.find(c => c.id === license.customerId);
              const plan = plans.find(p => p.id === license.planId);
              return (
                <Card key={license.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{customer?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-1">{license.licenseKey}</p>
                      <p className="text-sm text-gray-600 mt-2">{plan?.name || 'Unknown Plan'}</p>
                    </div>
                    <Badge
                      variant={license.status === 'active' ? 'success' : license.status === 'expired' ? 'danger' : 'warning'}
                      size="sm"
                    >
                      {license.status}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Passwords Tab */}
      {activeTab === 'passwords' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Generated Passwords</h2>
          <div className="grid grid-cols-1 gap-4">
            {licenses.filter(l => l.generatedPassword).map((license) => {
              const customer = customers.find(c => c.id === license.customerId);
              return (
                <Card key={license.id} className="p-4 bg-green-50 border border-green-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{customer?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-1">{license.licenseKey}</p>
                    </div>
                    <Button
                      onClick={() => {
                        if (license.generatedPassword) {
                          const decrypted = decryptPassword(license.generatedPassword);
                          navigator.clipboard.writeText(decrypted);
                          setCopiedPasswordId(license.id);
                          setTimeout(() => setCopiedPasswordId(null), 2000);
                        }
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      {copiedPasswordId === license.id ? 'Copied!' : 'Copy Password'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
