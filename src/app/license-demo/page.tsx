'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type DemoStep = 'welcome' | 'machine-id' | 'file-upload' | 'activation' | 'validation' | 'success' | 'multi-pc' | 'offline' | 'modules' | 'renewal';

export default function LicenseDemoPage() {
  const [currentStep, setCurrentStep] = useState<DemoStep>('welcome');
  const [licenseKey, setLicenseKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const formatLicenseKey = (value: string) => {
    const cleaned = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const segments = [];
    for (let i = 0; i < cleaned.length; i += 5) {
      segments.push(cleaned.substring(i, i + 5));
    }
    return segments.join('-');
  };

  const handleLicenseKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseKey(e.target.value);
    setLicenseKey(formatted);
  };

  const simulateValidation = () => {
    setIsValidating(true);
    setTimeout(() => {
      setIsValidating(false);
      setCurrentStep('validation');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Licensing Module Demo</h1>
          <p className="text-gray-600">Complete licensing flow for first-time users</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 text-xs">
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'welcome' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>1</div>
              <span className="font-medium">Welcome</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-1"></div>
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'machine-id' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>2</div>
              <span className="font-medium">Machine ID</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-1"></div>
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'file-upload' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>3</div>
              <span className="font-medium">Upload .lic</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-1"></div>
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'activation' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>4</div>
              <span className="font-medium">Activation</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-1"></div>
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'validation' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>5</div>
              <span className="font-medium">Validation</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-1"></div>
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep === 'success' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>6</div>
              <span className="font-medium">Success</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="col-span-2">
            {/* Step 1: Welcome */}
            {currentStep === 'welcome' && (
              <Card className="p-8">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome to PMS</h2>
                  <p className="text-gray-600 mb-6">Patient Management System - First Time Setup</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">What is License Activation?</h3>
                    <p className="text-sm text-blue-800">License activation binds your software to this computer. It enables all features and ensures compliance with your license agreement.</p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-2">Key Features</h3>
                    <ul className="text-sm text-green-800 space-y-1">
                      <li>✓ Single or Multi-PC licensing</li>
                      <li>✓ Automatic license sharing on LAN</li>
                      <li>✓ Offline mode support</li>
                      <li>✓ Module-based access control</li>
                    </ul>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => setCurrentStep('machine-id')}
                >
                  Continue to Machine ID
                </Button>
              </Card>
            )}

            {/* Step 2: Machine ID Collection */}
            {currentStep === 'machine-id' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Collect Machine ID</h2>
                  <p className="text-gray-600">Your unique computer identifier for license binding</p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">What is a Machine ID?</h3>
                    <p className="text-sm text-blue-800">A Machine ID is a unique identifier for your computer. It's used to bind the license to your specific hardware. This prevents license sharing across unauthorized computers.</p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-3">Your Machine ID</h3>
                    <div className="bg-white p-3 rounded border border-green-200 font-mono text-sm break-all mb-3">
                      MACHINE-12345678-12345678-12345678-12345678
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          navigator.clipboard.writeText('MACHINE-12345678-12345678-12345678-12345678');
                          alert('Machine ID copied to clipboard!');
                        }}
                      >
                        Copy to Clipboard
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                      >
                        Export to File
                      </Button>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-900 mb-2">For Multi-PC Setup</h3>
                    <p className="text-sm text-purple-800 mb-3">If you're setting up multiple computers, collect the Machine ID from each computer:</p>
                    <div className="bg-white p-3 rounded border border-purple-200 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>PC 1 (Reception):</span>
                        <span className="font-mono">MACHINE-AAAA...</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PC 2 (Doctor):</span>
                        <span className="font-mono">MACHINE-BBBB...</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PC 3 (Pharmacy):</span>
                        <span className="font-mono">MACHINE-CCCC...</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      💡 <strong>Next Step:</strong> Send this Machine ID to your administrator to generate your license file.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('welcome')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('file-upload')}
                  >
                    Continue to File Upload
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 3: File Upload */}
            {currentStep === 'file-upload' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload License File (.lic)</h2>
                  <p className="text-gray-600">Upload your .lic file received from your administrator</p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">What is a .lic File?</h3>
                    <p className="text-sm text-blue-800">The .lic file contains your license information including license key, expiry date, computer binding, and module access permissions. You received this file from your vendor.</p>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-gray-900 font-medium mb-1">Drag and drop your .lic file here</p>
                    <p className="text-sm text-gray-500">or click to browse</p>
                    <input type="file" accept=".lic" className="hidden" />
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      💡 <strong>Demo Tip:</strong> In this demo, you can simulate uploading a file. In production, the system will validate the .lic file signature and contents.
                    </p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-2">File Information</h3>
                    <div className="text-sm text-green-800 space-y-1">
                      <div className="flex justify-between">
                        <span>File Name:</span>
                        <span className="font-medium">clinic-license.lic</span>
                      </div>
                      <div className="flex justify-between">
                        <span>File Size:</span>
                        <span className="font-medium">2.4 KB</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className="font-medium text-green-600">✓ Valid</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('welcome')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('activation')}
                  >
                    Continue to Activation
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 4: Activation */}
            {currentStep === 'activation' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Activate Your License</h2>
                  <p className="text-gray-600">Enter your license key to activate the software</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="text-sm text-blue-900 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Computer Name:</span>
                      <span>CLINIC-PC-001</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">IP Address:</span>
                      <span>192.168.1.100</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">MAC Address:</span>
                      <span>00:1A:2B:3C:4D:5E</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      License Key
                    </label>
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={handleLicenseKeyChange}
                      placeholder="CLINIC-XXXXX-XXXXX-XXXXX-XXXXX"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      maxLength={29}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: CLINIC-DEMO1-DEMO2-DEMO3-DEMO4
                    </p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      💡 <strong>Demo Tip:</strong> Use any format like "CLINIC-XXXXX-XXXXX-XXXXX-XXXXX" to simulate activation
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('welcome')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={simulateValidation}
                    disabled={isValidating || !licenseKey}
                  >
                    {isValidating ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Validating...
                      </span>
                    ) : (
                      'Activate License'
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 5: Validation */}
            {currentStep === 'validation' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">License Validation</h2>
                  <p className="text-gray-600">Verifying your license key...</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-900">License Key Valid</p>
                      <p className="text-sm text-green-800">Key format and checksum verified</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-900">License Type: Multi-PC (LAN)</p>
                      <p className="text-sm text-green-800">Supports up to 5 computers on local network</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-900">Expiry Date: 31 Dec 2025</p>
                      <p className="text-sm text-green-800">License is valid for 1 year</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-900">Computer Binding</p>
                      <p className="text-sm text-green-800">License bound to CLINIC-PC-001 (00:1A:2B:3C:4D:5E)</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('activation')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('success')}
                  >
                    Continue to Success
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 6: Success */}
            {currentStep === 'success' && (
              <Card className="p-8">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">License Activated!</h2>
                  <p className="text-gray-600">Your software is now ready to use</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-2">Activation Summary</h3>
                    <div className="text-sm text-green-800 space-y-1">
                      <div className="flex justify-between">
                        <span>License Type:</span>
                        <span className="font-medium">Multi-PC (LAN)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Computers Allowed:</span>
                        <span className="font-medium">5</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expiry Date:</span>
                        <span className="font-medium">31 Dec 2025</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Activation Date:</span>
                        <span className="font-medium">{new Date().toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold text-indigo-900 mb-2">Your License Key</h3>
                    <div className="bg-white p-3 rounded border border-indigo-200 font-mono text-sm break-all mb-3">
                      CUST123-PLAN456-TIME-XXXXX
                    </div>
                    <p className="text-xs text-indigo-800 mb-3">Keep this key safe. You'll need it for support and license renewal.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        navigator.clipboard.writeText('CUST123-PLAN456-TIME-XXXXX');
                        alert('License key copied to clipboard!');
                      }}
                    >
                      Copy License Key
                    </Button>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Offline Mode</h3>
                    <p className="text-sm text-blue-800 mb-2">Your license supports offline usage:</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>✓ Works offline for up to 7 days</li>
                      <li>✓ Auto-syncs when network is available</li>
                      <li>✓ Perfect for clinics with intermittent connectivity</li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-900 mb-2">What's Next?</h3>
                    <ul className="text-sm text-purple-800 space-y-1">
                      <li>✓ You can now access all modules</li>
                      <li>✓ Other computers on LAN can auto-detect this license</li>
                      <li>✓ License will auto-renew 30 days before expiry</li>
                      <li>✓ You'll receive renewal notifications</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('multi-pc')}
                  >
                    View Multi-PC Setup
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('welcome')}
                  >
                    Restart Demo
                  </Button>
                </div>
              </Card>
            )}

            {/* Multi-PC Setup */}
            {currentStep === 'multi-pc' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Multi-PC LAN Setup</h2>
                  <p className="text-gray-600">How license sharing works on your network</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold text-indigo-900 mb-3">Network Configuration</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm text-indigo-800">
                      <div className="bg-white p-3 rounded border border-indigo-100">
                        <p className="font-medium mb-1">PC 1 (Primary)</p>
                        <p className="text-xs">192.168.1.100</p>
                        <p className="text-xs text-green-600">✓ License Holder</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-indigo-100">
                        <p className="font-medium mb-1">PC 2</p>
                        <p className="text-xs">192.168.1.101</p>
                        <p className="text-xs text-green-600">✓ Auto-detected</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-indigo-100">
                        <p className="font-medium mb-1">PC 3</p>
                        <p className="text-xs">192.168.1.102</p>
                        <p className="text-xs text-green-600">✓ Auto-detected</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-indigo-100">
                        <p className="font-medium mb-1">PC 4</p>
                        <p className="text-xs">192.168.1.103</p>
                        <p className="text-xs text-green-600">✓ Auto-detected</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-900 mb-2">How It Works</h3>
                    <ol className="text-sm text-purple-800 space-y-2">
                      <li>1. PC 1 activates with license key</li>
                      <li>2. License broadcasts on LAN every 5 minutes</li>
                      <li>3. Other PCs detect and cache the license</li>
                      <li>4. All PCs can work offline for up to 7 days</li>
                      <li>5. License auto-syncs when network is available</li>
                    </ol>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('success')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('modules')}
                  >
                    View Module Access
                  </Button>
                </div>
              </Card>
            )}

            {/* Module Access */}
            {currentStep === 'modules' && (
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Module Access Control</h2>
                  <p className="text-gray-600">Your license includes access to these modules</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  {[
                    { name: 'Appointments', icon: '📅', enabled: true },
                    { name: 'Doctor Panel', icon: '👨‍⚕️', enabled: true },
                    { name: 'Billing', icon: '💰', enabled: true },
                    { name: 'Pharmacy', icon: '💊', enabled: true },
                    { name: 'Prescriptions', icon: '📋', enabled: true },
                    { name: 'Reports', icon: '📊', enabled: true },
                    { name: 'Admin', icon: '⚙️', enabled: true },
                    { name: 'Settings', icon: '🔧', enabled: true },
                  ].map((module) => (
                    <div key={module.name} className={`p-4 rounded-lg border-2 ${module.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="text-3xl mb-2">{module.icon}</div>
                      <p className="font-medium text-gray-900">{module.name}</p>
                      <Badge variant={module.enabled ? 'success' : 'default'} className="mt-2">
                        {module.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCurrentStep('multi-pc')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setCurrentStep('welcome')}
                  >
                    Restart Demo
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar - Info Panel */}
          <div className="col-span-1">
            <Card className="p-6 sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Demo Information</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Current Step</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">{currentStep}</p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">License Types</p>
                  <div className="space-y-2">
                    <div className="text-xs">
                      <p className="font-medium text-gray-900">Single PC</p>
                      <p className="text-gray-600">1 computer only</p>
                    </div>
                    <div className="text-xs">
                      <p className="font-medium text-gray-900">Multi-PC (LAN)</p>
                      <p className="text-gray-600">Up to 5 computers</p>
                    </div>
                    <div className="text-xs">
                      <p className="font-medium text-gray-900">Enterprise</p>
                      <p className="text-gray-600">Unlimited computers</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Key Features</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>✓ Auto license detection</li>
                    <li>✓ Offline mode (7 days)</li>
                    <li>✓ Module-based access</li>
                    <li>✓ License expiry alerts</li>
                    <li>✓ Auto-renewal support</li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-4 bg-yellow-50 p-3 rounded">
                  <p className="text-xs font-medium text-yellow-900 mb-1">💡 Demo Tip</p>
                  <p className="text-xs text-yellow-800">This is a simulated flow. In production, license validation happens with our server.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
