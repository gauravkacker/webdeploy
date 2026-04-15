'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getCurrentUser } from '@/lib/permissions';

interface InvoiceSettings {
  feeInvoicePrefix: string;
  feeInvoiceStartNumber: number;
  billInvoicePrefix: string;
  billInvoiceStartNumber: number;
  thermalPrinterWidth: number; // in mm (80, 58, etc.)
  autocut: boolean;
  autocut_lines: number; // number of blank lines before cut
}

export default function InvoiceSettingsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [settings, setSettings] = useState<InvoiceSettings>({
    feeInvoicePrefix: 'FEE',
    feeInvoiceStartNumber: 1,
    billInvoicePrefix: 'BILL',
    billInvoiceStartNumber: 1,
    thermalPrinterWidth: 80,
    autocut: true,
    autocut_lines: 3,
  });
  const [saved, setSaved] = useState(false);

  // Load settings
  useEffect(() => {
    const saved = localStorage.getItem('invoiceSettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load invoice settings:', e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('invoiceSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (field: keyof InvoiceSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64 p-8">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-bold mb-2">Invoice Settings</h1>
          <p className="text-gray-600 mb-8">Configure invoice numbering, prefixes, and thermal printer settings</p>

          <div className="space-y-6">
            {/* Fee Invoice Settings */}
            <Card className="p-8">
              <h2 className="text-2xl font-semibold mb-6">Fee Invoice Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Prefix
                  </label>
                  <Input
                    type="text"
                    value={settings.feeInvoicePrefix}
                    onChange={(e) => handleChange('feeInvoicePrefix', e.target.value)}
                    placeholder="e.g., FEE"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Starting Invoice Number
                  </label>
                  <Input
                    type="number"
                    value={settings.feeInvoiceStartNumber}
                    onChange={(e) => handleChange('feeInvoiceStartNumber', parseInt(e.target.value))}
                    placeholder="e.g., 1"
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4 p-3 bg-gray-50 rounded">
                Example: <strong>{settings.feeInvoicePrefix}-{String(settings.feeInvoiceStartNumber).padStart(4, '0')}</strong>
              </p>
            </Card>

            {/* Bill Invoice Settings */}
            <Card className="p-8">
              <h2 className="text-2xl font-semibold mb-6">Bill Invoice Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Prefix
                  </label>
                  <Input
                    type="text"
                    value={settings.billInvoicePrefix}
                    onChange={(e) => handleChange('billInvoicePrefix', e.target.value)}
                    placeholder="e.g., BILL"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Starting Invoice Number
                  </label>
                  <Input
                    type="number"
                    value={settings.billInvoiceStartNumber}
                    onChange={(e) => handleChange('billInvoiceStartNumber', parseInt(e.target.value))}
                    placeholder="e.g., 1"
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4 p-3 bg-gray-50 rounded">
                Example: <strong>{settings.billInvoicePrefix}-{String(settings.billInvoiceStartNumber).padStart(4, '0')}</strong>
              </p>
            </Card>

            {/* Thermal Printer Settings */}
            <Card className="p-8">
              <h2 className="text-2xl font-semibold mb-6">Thermal Printer Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paper Width (mm)
                  </label>
                  <select
                    value={settings.thermalPrinterWidth}
                    onChange={(e) => handleChange('thermalPrinterWidth', parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={58}>58mm (Narrow)</option>
                    <option value={80}>80mm (Standard)</option>
                    <option value={100}>100mm (Wide)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Auto-cut Blank Lines
                  </label>
                  <Input
                    type="number"
                    value={settings.autocut_lines}
                    onChange={(e) => handleChange('autocut_lines', parseInt(e.target.value))}
                    placeholder="e.g., 3"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="mt-6">
                <label className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autocut}
                    onChange={(e) => handleChange('autocut', e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Enable Auto-cut After Print</span>
                </label>
              </div>
            </Card>

            {/* Save Button */}
            <div className="flex gap-3">
              <Button onClick={handleSave} variant="primary" className="px-8">
                Save Settings
              </Button>
            </div>

            {saved && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Settings saved successfully
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
