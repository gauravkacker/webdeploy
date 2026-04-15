'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getCurrentUser } from '@/lib/permissions';

interface PharmacyPrintSettings {
  paperWidth: number; // in characters (80, 58, 42)
  autocut: boolean;
  fontSize: number; // in pt
  lineHeight: number;
  topMargin: number; // in mm
  bottomMargin: number; // in mm
  leftMargin: number; // in mm
  rightMargin: number; // in mm
}

export default function PharmacyPrintSettingsPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<PharmacyPrintSettings>({
    paperWidth: 80,
    autocut: true,
    fontSize: 8,
    lineHeight: 1.0,
    topMargin: 2,
    bottomMargin: 2,
    leftMargin: 2,
    rightMargin: 2,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pharmacyPrintSettings');
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load pharmacy print settings:', error);
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('pharmacyPrintSettings', JSON.stringify(settings));
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      paperWidth: 80,
      autocut: true,
      fontSize: 8,
      lineHeight: 1.0,
      topMargin: 2,
      bottomMargin: 2,
      leftMargin: 2,
      rightMargin: 2,
    });
    setSaveMessage('Settings reset to defaults');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pharmacy Print Settings</h1>
              <p className="text-sm text-gray-500">Configure thermal printer settings for pharmacy prescriptions</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-2xl">
          {/* Success Message */}
          {saveMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              {saveMessage}
            </div>
          )}

          {/* Paper Width Settings */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Paper Width</h2>
            <p className="text-sm text-gray-600 mb-4">Select the thermal printer paper width</p>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={settings.paperWidth === 80}
                  onChange={() => setSettings({ ...settings, paperWidth: 80 })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium text-gray-900">80mm (Standard)</div>
                  <div className="text-xs text-gray-500">Most common thermal printer width</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={settings.paperWidth === 58}
                  onChange={() => setSettings({ ...settings, paperWidth: 58 })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium text-gray-900">58mm (Compact)</div>
                  <div className="text-xs text-gray-500">Smaller thermal printer</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={settings.paperWidth === 42}
                  onChange={() => setSettings({ ...settings, paperWidth: 42 })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium text-gray-900">42mm (Mini)</div>
                  <div className="text-xs text-gray-500">Mini thermal printer</div>
                </div>
              </label>
            </div>
          </Card>

          {/* Autocut Settings */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Autocut Mode</h2>
            <p className="text-sm text-gray-600 mb-4">Enable automatic paper cutting after each prescription</p>
            
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settings.autocut}
                onChange={() => setSettings({ ...settings, autocut: !settings.autocut })}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-gray-900">Enable Autocut</div>
                <div className="text-xs text-gray-500">Printer will automatically cut paper after printing</div>
              </div>
            </label>
          </Card>

          {/* Font Settings */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Font Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Font Size (pt)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="6"
                    max="12"
                    step="0.5"
                    value={settings.fontSize}
                    onChange={(e) => setSettings({ ...settings, fontSize: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-900 w-12">{settings.fontSize}pt</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Smaller = more content, Larger = more readable</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line Height
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.1"
                    value={settings.lineHeight}
                    onChange={(e) => setSettings({ ...settings, lineHeight: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-900 w-12">{settings.lineHeight.toFixed(1)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Spacing between lines</p>
              </div>
            </div>
          </Card>

          {/* Margin Settings */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Margins (mm)</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Top Margin
                </label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={settings.topMargin}
                  onChange={(e) => setSettings({ ...settings, topMargin: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bottom Margin
                </label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={settings.bottomMargin}
                  onChange={(e) => setSettings({ ...settings, bottomMargin: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Left Margin
                </label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={settings.leftMargin}
                  onChange={(e) => setSettings({ ...settings, leftMargin: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Right Margin
                </label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={settings.rightMargin}
                  onChange={(e) => setSettings({ ...settings, rightMargin: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </Card>

          {/* Preview */}
          <Card className="p-6 mb-6 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="bg-white p-4 rounded border border-gray-200 font-mono text-xs overflow-x-auto">
              <div>Paper Width: {settings.paperWidth}mm</div>
              <div>Font Size: {settings.fontSize}pt</div>
              <div>Line Height: {settings.lineHeight}</div>
              <div>Autocut: {settings.autocut ? 'Enabled' : 'Disabled'}</div>
              <div>Margins: {settings.topMargin}mm (top), {settings.bottomMargin}mm (bottom), {settings.leftMargin}mm (left), {settings.rightMargin}mm (right)</div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              variant="primary"
              className="flex-1"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button
              onClick={handleReset}
              variant="secondary"
              className="flex-1"
            >
              Reset to Defaults
            </Button>
          </div>

          {/* Help Section */}
          <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">Help & Tips</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• <strong>Paper Width:</strong> Choose based on your thermal printer model</li>
              <li>• <strong>Font Size:</strong> Smaller fonts fit more content, larger fonts are more readable</li>
              <li>• <strong>Autocut:</strong> Enable if your printer supports automatic paper cutting</li>
              <li>• <strong>Margins:</strong> Adjust if content is cut off or has too much white space</li>
              <li>• Settings are saved locally and applied to all pharmacy prescriptions</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
