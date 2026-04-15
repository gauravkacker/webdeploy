'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PurchasePlan } from '@/lib/db/schema';

interface PlanDetailClientProps {
  initialPlan: PurchasePlan;
  planId: string;
}

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

export default function PlanDetailClient({ initialPlan, planId }: PlanDetailClientProps) {
  const [plan, setPlan] = useState<PurchasePlan>(initialPlan);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: initialPlan.name,
    description: initialPlan.description || '',
    price: initialPlan.price,
    isFree: initialPlan.price === 0,
    validityDays: initialPlan.validityDays,
    maxPrescriptions: initialPlan.maxPrescriptions,
    unlimitedPrescriptions: initialPlan.maxPrescriptions === -1,
    maxPatients: initialPlan.maxPatients,
    unlimitedPatients: initialPlan.maxPatients === -1,
    modules: initialPlan.modules || [],
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price: formData.isFree ? 0 : formData.price,
          validityDays: formData.validityDays,
          maxPrescriptions: formData.unlimitedPrescriptions ? -1 : formData.maxPrescriptions,
          maxPatients: formData.unlimitedPatients ? -1 : formData.maxPatients,
          modules: formData.modules,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
        alert('Plan updated successfully!');
        setEditing(false);
      } else {
        const error = await res.json();
        alert('Failed to update plan: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to update plan:', error);
      alert('Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this plan? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Plan deleted successfully');
        window.location.href = '/admin/software-delivery/plans';
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/admin/software-delivery/plans">
            <button className="text-blue-600 hover:text-blue-800 mb-4">← Back to Plans</button>
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{plan.name}</h1>
              <p className="text-gray-600 mt-2">{plan.description}</p>
            </div>
            {!editing && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {!editing && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-600">Price</label>
                <p className="text-2xl font-bold text-gray-900">₹{plan.price}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Validity</label>
                <p className="text-lg text-gray-900">{plan.validityDays} days</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Max Prescriptions</label>
                <p className="text-lg text-gray-900">{plan.maxPrescriptions === -1 ? 'Unlimited' : plan.maxPrescriptions}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Max Patients</label>
                <p className="text-lg text-gray-900">{plan.maxPatients === -1 ? 'Unlimited' : plan.maxPatients}</p>
              </div>
            </div>

            {plan.modules && plan.modules.length > 0 && (
              <div>
                <label className="text-sm text-gray-600 block mb-3">Modules ({plan.modules.length})</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {plan.modules.map((module) => (
                    <span
                      key={module}
                      className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm capitalize"
                    >
                      {module.replace('-', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-500 pt-4 border-t">
              <p>Created: {new Date(plan.createdAt).toLocaleString()}</p>
              <p>Updated: {new Date(plan.updatedAt).toLocaleString()}</p>
            </div>
          </div>
        )}

        {editing && (
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Plan Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 mb-2">
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
                    <span className="text-sm font-medium text-gray-900">Free Plan</span>
                  </label>
                  {!formData.isFree && (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={formData.price === 0 ? '' : formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value ? parseFloat(e.target.value) : 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Validity Days</label>
                  <input
                    type="number"
                    value={formData.validityDays === 0 ? '' : formData.validityDays}
                    onChange={(e) => setFormData({ ...formData, validityDays: e.target.value ? parseInt(e.target.value) : 365 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 mb-3">
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
                  <span className="text-sm font-medium text-gray-900">Unlimited Prescriptions</span>
                </label>
                {!formData.unlimitedPrescriptions && (
                  <input
                    type="number"
                    placeholder="Max Prescriptions"
                    value={formData.maxPrescriptions === -1 ? '' : formData.maxPrescriptions}
                    onChange={(e) => setFormData({ ...formData, maxPrescriptions: e.target.value ? parseInt(e.target.value) : 1000 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 mb-3">
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
                  <span className="text-sm font-medium text-gray-900">Unlimited Patient Creation</span>
                </label>
                {!formData.unlimitedPatients && (
                  <input
                    type="number"
                    placeholder="Max Patients"
                    value={formData.maxPatients === -1 ? '' : formData.maxPatients}
                    onChange={(e) => setFormData({ ...formData, maxPatients: e.target.value ? parseInt(e.target.value) : 100 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
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

              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
