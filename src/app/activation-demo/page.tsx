'use client';

import { useState } from 'react';

export default function ActivationDemoPage() {
  const [licenseKey, setLicenseKey] = useState('');
  const [activationMethod, setActivationMethod] = useState<'key-only' | 'lic-file'>('key-only');
  const [copied, setCopied] = useState(false);

  const copyMachineId = () => {
    navigator.clipboard.writeText('MACHINE-12345678-87654321-11111111-22222222');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLicenseKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLicenseKey(e.target.value.toUpperCase());
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '448px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '32px' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: '#4f46e5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg style={{ width: '32px', height: '32px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>Activate Your License</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>First-time setup for this computer</p>
        </div>

        {/* Machine ID */}
        <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', fontWeight: '600', color: '#92400e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Machine ID</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, fontSize: '12px', fontFamily: 'monospace', backgroundColor: 'white', border: '1px solid #fcd34d', borderRadius: '4px', padding: '8px 12px', color: '#1f2937', wordBreak: 'break-all' }}>
              MACHINE-12345678-87654321-11111111-22222222
            </code>
            <button
              onClick={copyMachineId}
              style={{ padding: '8px 12px', fontSize: '12px', backgroundColor: '#b45309', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#92400e')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#b45309')}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#b45309', marginTop: '8px' }}>
            Send this to your vendor if they need it to generate your license.
          </p>
          <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', color: '#b45309' }}>
            <span>Computer: <span style={{ fontWeight: '500' }}>DESKTOP-USER</span></span>
            <span>IP: <span style={{ fontWeight: '500' }}>192.168.1.100</span></span>
          </div>
        </div>

        {/* Activation Method Toggle */}
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
          <p style={{ fontSize: '12px', fontWeight: '600', color: '#1e40af', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activation Method</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setActivationMethod('key-only');
              }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', fontSize: '14px', fontWeight: '500', border: activationMethod === 'key-only' ? 'none' : '1px solid #d1d5db', backgroundColor: activationMethod === 'key-only' ? '#2563eb' : 'white', color: activationMethod === 'key-only' ? 'white' : '#374151', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              License Key Only
            </button>
            <button
              onClick={() => {
                setActivationMethod('lic-file');
              }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', fontSize: '14px', fontWeight: '500', border: activationMethod === 'lic-file' ? 'none' : '1px solid #d1d5db', backgroundColor: activationMethod === 'lic-file' ? '#2563eb' : 'white', color: activationMethod === 'lic-file' ? 'white' : '#374151', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              .lic File + Key
            </button>
          </div>
        </div>

        {/* License Key Input */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>License Key</label>
          <input
            type="text"
            value={licenseKey}
            onChange={handleLicenseKeyChange}
            placeholder="CLINIC-XXXXX-XXXXX-XXXXX-XXXXX"
            style={{ width: '100%', padding: '8px 12px', fontSize: '18px', fontFamily: 'monospace', textAlign: 'center', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            Enter the license key provided by your vendor (format: CLINIC-XXXXX-XXXXX-XXXXX-XXXXX)
          </p>
        </div>

        {/* Activate button */}
        <button
          style={{ width: '100%', padding: '10px 16px', fontSize: '16px', fontWeight: '600', backgroundColor: licenseKey ? '#2563eb' : '#d1d5db', color: 'white', border: 'none', borderRadius: '4px', cursor: licenseKey ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s' }}
          onMouseEnter={(e) => licenseKey && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => licenseKey && (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          Activate License
        </button>

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #f3f4f6' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>
            Need help? Contact your vendor for support.
          </p>
        </div>
      </div>
    </div>
  );
}
