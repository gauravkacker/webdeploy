'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getCurrentUser } from '@/lib/permissions';
import { ThermalPrinter, getInvoiceSettings } from '@/lib/thermal-printer';

interface BillPrintSettings {
  // Bill Settings
  billShowPatientName: boolean;
  billShowRegistrationNumber: boolean;
  billShowMobileNumber: boolean;
  billShowInvoiceNumber: boolean;
  billShowDate: boolean;
  billShowItems: boolean;
  billShowSubtotal: boolean;
  billShowDiscount: boolean;
  billShowTax: boolean;
  billShowTotal: boolean;
  billShowPaymentStatus: boolean;
  billShowPaymentMethod: boolean;
  billShowNotes: boolean;
  billHeaderText: string;
  billFooterText: string;
  
  // Fee Receipt Settings
  feeShowPatientName: boolean;
  feeShowRegistrationNumber: boolean;
  feeShowMobileNumber: boolean;
  feeShowInvoiceNumber: boolean;
  feeShowDate: boolean;
  feeShowAmount: boolean;
  feeShowPaymentStatus: boolean;
  feeShowPaymentMethod: boolean;
  feeHeaderText: string;
  feeFooterText: string;
}

export default function BillPrintSettingsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [settings, setSettings] = useState<BillPrintSettings>({
    billShowPatientName: true,
    billShowRegistrationNumber: true,
    billShowMobileNumber: true,
    billShowInvoiceNumber: true,
    billShowDate: true,
    billShowItems: true,
    billShowSubtotal: true,
    billShowDiscount: true,
    billShowTax: true,
    billShowTotal: true,
    billShowPaymentStatus: true,
    billShowPaymentMethod: true,
    billShowNotes: true,
    billHeaderText: 'MEDICINE BILL',
    billFooterText: 'Thank you for your visit!\nGet well soon.',
    
    feeShowPatientName: true,
    feeShowRegistrationNumber: true,
    feeShowMobileNumber: true,
    feeShowInvoiceNumber: true,
    feeShowDate: true,
    feeShowAmount: true,
    feeShowPaymentStatus: true,
    feeShowPaymentMethod: true,
    feeHeaderText: 'FEE RECEIPT',
    feeFooterText: 'Thank you for your visit!\nGet well soon.',
  });

  const [activeTab, setActiveTab] = useState<'bill' | 'fee'>('bill');
  const [saved, setSaved] = useState(false);

  // Load settings
  useEffect(() => {
    const saved = localStorage.getItem('billPrintSettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load bill print settings:', e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('billPrintSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (field: keyof BillPrintSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Generate preview data
  const generateBillPreview = () => {
    const invoiceSettings = getInvoiceSettings();
    const billData = {
      invoiceNumber: `${invoiceSettings.billInvoicePrefix}-0001`,
      patientName: 'John Doe',
      registrationNumber: 'REG-2024-001',
      mobileNumber: '9876543210',
      items: [
        {
          description: 'Arnica Montana 30CH 30ml',
          quantity: 1,
          unitPrice: 150,
          total: 150,
        },
        {
          description: 'Bryonia Alba 6X 30ml',
          quantity: 2,
          unitPrice: 120,
          total: 240,
        },
      ],
      subtotal: 390,
      discountPercent: 10,
      discountAmount: 39,
      taxAmount: 0,
      netAmount: 351,
      paymentStatus: 'paid' as const,
      amountPaid: 351,
      amountDue: 0,
      paymentMethod: 'cash',
      notes: 'Take medicines as prescribed',
    };

    const printer = new ThermalPrinter(invoiceSettings, settings);
    return printer.formatBill(billData, 'bill');
  };

  const generateFeePreview = () => {
    const invoiceSettings = getInvoiceSettings();
    const billData = {
      invoiceNumber: `${invoiceSettings.feeInvoicePrefix}-0001`,
      patientName: 'John Doe',
      registrationNumber: 'REG-2024-001',
      mobileNumber: '9876543210',
      items: [
        {
          description: 'CONSULTATION FEE',
          quantity: 1,
          unitPrice: 300,
          total: 300,
        },
      ],
      subtotal: 300,
      discountPercent: 0,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: 300,
      paymentStatus: 'paid' as const,
      amountPaid: 300,
      amountDue: 0,
      paymentMethod: 'cash',
      notes: '',
    };

    const printer = new ThermalPrinter(invoiceSettings, settings);
    return printer.formatBill(billData, 'fee');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64 p-8">
        <div className="max-w-7xl">
          <h1 className="text-3xl font-bold mb-2">Bill & Fee Receipt Print Settings</h1>
          <p className="text-gray-600 mb-8">Customize what information appears on your bills and fee receipts</p>

          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('bill')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'bill'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Medicine Bill Settings
            </button>
            <button
              onClick={() => setActiveTab('fee')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'fee'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Fee Receipt Settings
            </button>
          </div>

          {/* Bill Settings */}
          {activeTab === 'bill' && (
            <div className="grid grid-cols-2 gap-8">
              {/* Settings Panel */}
              <div className="space-y-6">
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Display Options</h2>
                  
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowPatientName}
                        onChange={(e) => handleChange('billShowPatientName', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Patient Name</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowRegistrationNumber}
                        onChange={(e) => handleChange('billShowRegistrationNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Registration Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowMobileNumber}
                        onChange={(e) => handleChange('billShowMobileNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Mobile Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowInvoiceNumber}
                        onChange={(e) => handleChange('billShowInvoiceNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Invoice Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowDate}
                        onChange={(e) => handleChange('billShowDate', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Date</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowItems}
                        onChange={(e) => handleChange('billShowItems', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Items</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowSubtotal}
                        onChange={(e) => handleChange('billShowSubtotal', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Subtotal</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowDiscount}
                        onChange={(e) => handleChange('billShowDiscount', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Discount</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowTax}
                        onChange={(e) => handleChange('billShowTax', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Tax</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowTotal}
                        onChange={(e) => handleChange('billShowTotal', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Total</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowPaymentStatus}
                        onChange={(e) => handleChange('billShowPaymentStatus', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Payment Status</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowPaymentMethod}
                        onChange={(e) => handleChange('billShowPaymentMethod', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Payment Method</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.billShowNotes}
                        onChange={(e) => handleChange('billShowNotes', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Notes</span>
                    </label>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Header & Footer</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Header Text</label>
                      <Input
                        type="text"
                        value={settings.billHeaderText}
                        onChange={(e) => handleChange('billHeaderText', e.target.value)}
                        placeholder="e.g., MEDICINE BILL"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Footer Text</label>
                      <textarea
                        value={settings.billFooterText}
                        onChange={(e) => handleChange('billFooterText', e.target.value)}
                        placeholder="e.g., Thank you for your visit!"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      />
                    </div>
                  </div>
                </Card>

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

              {/* Preview Panel */}
              <div>
                <Card className="p-6 sticky top-8">
                  <h2 className="text-xl font-semibold mb-4">Preview</h2>
                  <div className="border-2 border-gray-800 rounded-lg p-4 bg-white overflow-auto max-h-[600px] shadow-lg">
                    <pre 
                      className="text-sm font-mono whitespace-pre-wrap break-words" 
                      style={{
                        fontFamily: 'Courier New, Courier, monospace',
                        color: '#000000',
                        fontWeight: '700',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        backgroundColor: '#ffffff',
                        padding: '12px',
                        margin: '-4px'
                      }}
                    >
                      {generateBillPreview()}
                    </pre>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Fee Receipt Settings */}
          {activeTab === 'fee' && (
            <div className="grid grid-cols-2 gap-8">
              {/* Settings Panel */}
              <div className="space-y-6">
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Display Options</h2>
                  
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowPatientName}
                        onChange={(e) => handleChange('feeShowPatientName', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Patient Name</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowRegistrationNumber}
                        onChange={(e) => handleChange('feeShowRegistrationNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Registration Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowMobileNumber}
                        onChange={(e) => handleChange('feeShowMobileNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Mobile Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowInvoiceNumber}
                        onChange={(e) => handleChange('feeShowInvoiceNumber', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Invoice Number</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowDate}
                        onChange={(e) => handleChange('feeShowDate', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Date</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowAmount}
                        onChange={(e) => handleChange('feeShowAmount', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Amount</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowPaymentStatus}
                        onChange={(e) => handleChange('feeShowPaymentStatus', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Payment Status</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.feeShowPaymentMethod}
                        onChange={(e) => handleChange('feeShowPaymentMethod', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Show Payment Method</span>
                    </label>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Header & Footer</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Header Text</label>
                      <Input
                        type="text"
                        value={settings.feeHeaderText}
                        onChange={(e) => handleChange('feeHeaderText', e.target.value)}
                        placeholder="e.g., FEE RECEIPT"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Footer Text</label>
                      <textarea
                        value={settings.feeFooterText}
                        onChange={(e) => handleChange('feeFooterText', e.target.value)}
                        placeholder="e.g., Thank you for your visit!"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      />
                    </div>
                  </div>
                </Card>

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

              {/* Preview Panel */}
              <div>
                <Card className="p-6 sticky top-8">
                  <h2 className="text-xl font-semibold mb-4">Preview</h2>
                  <div className="border-2 border-gray-800 rounded-lg p-4 bg-white overflow-auto max-h-[600px] shadow-lg">
                    <pre 
                      className="text-sm font-mono whitespace-pre-wrap break-words" 
                      style={{
                        fontFamily: 'Courier New, Courier, monospace',
                        color: '#000000',
                        fontWeight: '700',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        backgroundColor: '#ffffff',
                        padding: '12px',
                        margin: '-4px'
                      }}
                    >
                      {generateFeePreview()}
                    </pre>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
