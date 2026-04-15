'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/SidebarComponent';

interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  validityDays: number;
  maxPrescriptions: number;
  maxPatients: number;
  modules: string[];
}

export default function PlansPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    isFree: false,
    validityType: 'time' as 'time' | 'lifetime',
    validityDays: 365,
    lifetimeYears: 10,
    maxPrescriptions: 1000,
    unlimitedPrescriptions: false,
    maxPatients: 100,
    unlimitedPatients: false,
    modules: [] as string[],
  });

  const availableModules = [
    'dashboard',
    'patients',
    'appointments',
    'queue',
    'doctor-panel',
    'pharmacy',
    'prescriptions',
    'billing',
    'reports',
    'materia-medica',
    'fee-settings',
    'slot-settings',
    'queue-settings',
    'settings',
    'admin',
  ];

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/admin/plans');
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormData({
          name: '',
          description: '',
          price: 0,
          isFree: false,
          validityType: 'time',
          validityDays: 365,
          lifetimeYears: 10,
          maxPrescriptions: 1000,
          unlimitedPrescriptions: false,
          maxPatients: 100,
          unlimitedPatients: false,
          modules: [],
        });
        setShowForm(false);
        fetchPlans();
      }
    } catch (error) {
      console.error('Failed to create plan:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    try {
      const res = await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Plan deleted successfully');
        fetchPlans();
      } else {
        const error = await res.json();
        alert('Failed to delete plan: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('Failed to delete plan');
    }
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
            <h1 className="text-3xl font-bold text-gray-900">Purchase Plans</h1>
            <p className="text-gray-600 mt-2">Create and manage subscription plans</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + New Plan
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Plan Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isFree}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        isFree: e.target.checked,
                        price: e.target.checked ? 0 : formData.price
                      })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Free Plan</span>
                  </label>
                  {!formData.isFree && (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price (e.g., 99.99)"
                      value={formData.price === 0 ? '' : formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value ? parseFloat(e.target.value) : 0 })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                      required
                    />
                  )}
                </div>
              </div>
              
              <textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              />
              
              {/* Validity Section */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-semibold text-gray-900 mb-3">Validity Period</label>
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="validityType"
                        checked={formData.validityType === 'time'}
                        onChange={() => setFormData({ ...formData, validityType: 'time' })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">Time-based (Days)</span>
                    </label>
                    {formData.validityType === 'time' && (
                      <input
                        type="number"
                        placeholder="Validity Days"
                        value={formData.validityDays === 0 ? '' : formData.validityDays}
                        onChange={(e) => setFormData({ ...formData, validityDays: e.target.value ? parseInt(e.target.value) : 365 })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                        required
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="validityType"
                        checked={formData.validityType === 'lifetime'}
                        onChange={() => setFormData({ ...formData, validityType: 'lifetime' })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">Lifetime</span>
                    </label>
                    {formData.validityType === 'lifetime' && (
                      <div className="flex items-center gap-2">
                        <select
                          value={formData.lifetimeYears}
                          onChange={(e) => setFormData({ ...formData, lifetimeYears: parseInt(e.target.value) })}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="5">5 years</option>
                          <option value="10">10 years</option>
                          <option value="15">15 years</option>
                          <option value="20">20 years</option>
                          <option value="25">25 years</option>
                          <option value="30">30 years</option>
                          <option value="50">50 years</option>
                          <option value="100">100 years</option>
                        </select>
                        <span className="text-xs text-gray-500">(defines lifetime duration)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Prescriptions Section */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-semibold text-gray-900 mb-3">Prescriptions</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.unlimitedPrescriptions}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        unlimitedPrescriptions: e.target.checked,
                        maxPrescriptions: e.target.checked ? -1 : 1000
                      })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Unlimited Prescriptions</span>
                  </label>
                  {!formData.unlimitedPrescriptions && (
                    <input
                      type="number"
                      placeholder="Max Prescriptions"
                      value={formData.maxPrescriptions === -1 ? '' : formData.maxPrescriptions}
                      onChange={(e) => setFormData({ ...formData, maxPrescriptions: e.target.value ? parseInt(e.target.value) : 1000 })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                      required
                    />
                  )}
                </div>
              </div>

              {/* Patients Section */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-semibold text-gray-900 mb-3">Patient Creation</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.unlimitedPatients}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        unlimitedPatients: e.target.checked,
                        maxPatients: e.target.checked ? -1 : 100
                      })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Unlimited Patient Creation</span>
                  </label>
                  {!formData.unlimitedPatients && (
                    <input
                      type="number"
                      placeholder="Max Patients"
                      value={formData.maxPatients === -1 ? '' : formData.maxPatients}
                      onChange={(e) => setFormData({ ...formData, maxPatients: e.target.value ? parseInt(e.target.value) : 100 })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                      required
                    />
                  )}
                </div>
              </div>

              {/* Modules Section */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-semibold text-gray-900">Modules (Total: {formData.modules.length})</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, modules: availableModules })}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, modules: [] })}
                      className="text-xs bg-gray-400 text-white px-2 py-1 rounded hover:bg-gray-500"
                    >
                      Unselect All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {availableModules.map((module) => (
                    <label key={module} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.modules.includes(module)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, modules: [...formData.modules, module] });
                          } else {
                            setFormData({ ...formData, modules: formData.modules.filter(m => m !== module) });
                          }
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700 capitalize">{module.replace('-', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Create Plan
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {loading ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : plans.length === 0 ? (
            <div className="text-center text-gray-500">No plans found</div>
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-gray-600 text-sm mt-2">{plan.description}</p>
                <div className="mt-4 space-y-2">
                  <div className="text-2xl font-bold text-gray-900">₹{plan.price}</div>
                  <div className="text-sm text-gray-600">
                    <div>Validity: {plan.validityDays >= 3650 ? 'Lifetime' : `${plan.validityDays} days`}</div>
                    <div>Prescriptions: {plan.maxPrescriptions === -1 ? 'Unlimited' : plan.maxPrescriptions}</div>
                    <div>Patients: {plan.maxPatients === -1 ? 'Unlimited' : plan.maxPatients}</div>
                    <div>Modules: {plan.modules?.length || 0}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => handleDelete(plan.id)}
                    className="w-full text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </>
  );
}
