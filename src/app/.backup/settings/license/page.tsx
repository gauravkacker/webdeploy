'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getCurrentUser } from '@/lib/permissions';
import { PcChangeWorkflow } from '@/components/license/PcChangeWorkflow';
import LicenseRenewal from '@/components/license/LicenseRenewal';

interface LicenseInfo {
  hasLicense: boolean;
  isValid: boolean;
  isLifetime?: boolean;
  licenseKey?: string;
  expiresAt?: Date;
  daysRemaining?: number;
  prescriptionsUsed?: number;
  maxPrescriptions?: number;
  prescriptionsRemaining?: number | null;
  patientsCreated?: number;
  maxPatients?: number;
  patientsRemaining?: number | null;
  modules: string[];
}

interface SessionStats {
  activeComputers: number;
  maxComputers: number;
  availableSlots: number;
  sessions: Array<{
    computerName: string;
    computerIp: string;
    userId?: string;
    lastHeartbeat: Date;
    connectedAt: Date;
  }>;
}

export default function LicenseSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    loadLicenseInfo();
  }, [router]);

  const loadLicenseInfo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/license/usage-stats');
      const data = await response.json();
      setLicenseInfo(data);

      // Load session stats if license is valid
      if (data.isValid) {
        const statsResponse = await fetch('/api/license/session-stats');
        const statsData = await statsResponse.json();
        setSessionStats(statsData);
      }
    } catch (error) {
      console.error('Error loading license info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLicense = async () => {
    if (!newLicenseKey.trim()) {
      setUpdateError('Please enter a license key');
      return;
    }

    setIsUpdating(true);
    setUpdateError('');

    try {
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: newLicenseKey.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setUpdateError(data.reason || data.error || 'Failed to update license');
        setIsUpdating(false);
        return;
      }

      // Success
      setShowUpdateModal(false);
      setNewLicenseKey('');
      loadLicenseInfo();
    } catch (error) {
      console.error('Update error:', error);
      setUpdateError('Failed to connect to server');
      setIsUpdating(false);
    }
  };

  const formatLicenseKey = (key: string) => {
    if (!key) return '';
    // Mask middle segments for security
    const parts = key.split('-');
    if (parts.length === 5) {
      return `${parts[0]}-${parts[1]}-***-***-${parts[4]}`;
    }
    return key;
  };

  const getExpirationColor = (daysRemaining?: number) => {
    if (!daysRemaining) return 'text-gray-600';
    if (daysRemaining <= 7) return 'text-red-600';
    if (daysRemaining <= 30) return 'text-orange-600';
    return 'text-green-600';
  };

  const getExpirationBadge = (daysRemaining?: number) => {
    if (!daysRemaining) return null;
    if (daysRemaining <= 0) return <Badge variant="danger">Expired</Badge>;
    if (daysRemaining <= 7) return <Badge variant="danger">Expiring Soon</Badge>;
    if (daysRemaining <= 30) return <Badge variant="warning">Expiring</Badge>;
    return <Badge variant="success">Active</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="ml-64">
          <Header title="License Settings" subtitle="Manage your software license" />
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64">
        <Header title="License Settings" subtitle="Manage your software license" />

        <main className="p-6 space-y-6">
          {/* License Status Card */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">License Information</h2>
                <p className="text-sm text-gray-500 mt-1">Your current license status and details</p>
              </div>
              {user?.role === 'admin' && (
                <Button variant="secondary" onClick={() => setShowUpdateModal(true)}>
                  Update License
                </Button>
              )}
            </div>

            {!licenseInfo?.hasLicense ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-yellow-900">No License Found</h3>
                    <p className="text-sm text-yellow-800 mt-1">
                      Please activate a license to use the software.
                    </p>
                    <Button variant="primary" className="mt-3" onClick={() => router.push('/license-activation')}>
                      Activate License
                    </Button>
                  </div>
                </div>
              </div>
            ) : !licenseInfo.isValid ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-red-900">License Invalid</h3>
                    <p className="text-sm text-red-800 mt-1">
                      Your license is no longer valid. Please contact your vendor to renew.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">License Key</label>
                    <p className="text-lg font-mono text-gray-900 mt-1">
                      {formatLicenseKey(licenseInfo.licenseKey || '')}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="mt-1">
                      {getExpirationBadge(licenseInfo.daysRemaining)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Expires On</label>
                    <p className={`text-lg font-semibold mt-1 ${getExpirationColor(licenseInfo.daysRemaining)}`}>
                      {licenseInfo.expiresAt
                        ? new Date(licenseInfo.expiresAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Days Remaining</label>
                    <p className={`text-lg font-semibold mt-1 ${getExpirationColor(licenseInfo.daysRemaining)}`}>
                      {licenseInfo.daysRemaining !== undefined 
                        ? (licenseInfo.daysRemaining >= 3650 ? 'Lifetime' : `${licenseInfo.daysRemaining} days`)
                        : 'Unlimited'}
                    </p>
                  </div>
                </div>

                {/* Usage Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Prescriptions Used</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {licenseInfo.prescriptionsUsed || 0} / {licenseInfo.maxPrescriptions === -1 ? '∞' : licenseInfo.maxPrescriptions}
                    </p>
                    {licenseInfo.prescriptionsRemaining !== null && (
                      <p className="text-xs text-gray-500 mt-1">
                        {licenseInfo.prescriptionsRemaining} remaining
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Patients Created</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {licenseInfo.patientsCreated || 0} / {licenseInfo.maxPatients === -1 ? '∞' : licenseInfo.maxPatients}
                    </p>
                    {licenseInfo.patientsRemaining !== null && (
                      <p className="text-xs text-gray-500 mt-1">
                        {licenseInfo.patientsRemaining} remaining
                      </p>
                    )}
                  </div>
                </div>

                {licenseInfo.daysRemaining !== undefined && licenseInfo.daysRemaining <= 30 && (
                  <div className={`${licenseInfo.daysRemaining <= 7 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4 mt-4`}>
                    <div className="flex items-start gap-3">
                      <svg className={`w-5 h-5 ${licenseInfo.daysRemaining <= 7 ? 'text-red-600' : 'text-orange-600'} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h3 className={`font-semibold ${licenseInfo.daysRemaining <= 7 ? 'text-red-900' : 'text-orange-900'}`}>
                          {licenseInfo.daysRemaining <= 0 ? 'License Expired' : 'License Expiring Soon'}
                        </h3>
                        <p className={`text-sm mt-1 ${licenseInfo.daysRemaining <= 7 ? 'text-red-800' : 'text-orange-800'}`}>
                          Please contact your vendor to renew your license.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* License Renewal Card */}
          {licenseInfo?.isValid && (
            <LicenseRenewal 
              machineId={licenseInfo.licenseKey || ''} 
              onRenewalComplete={loadLicenseInfo}
            />
          )}

          {/* PC Change Workflow Card */}
          {licenseInfo?.isValid && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Move License to New PC</h2>
              <p className="text-sm text-gray-500 mb-6">
                Transfer your license to a new computer while preserving remaining license days
              </p>
              <PcChangeWorkflow />
            </Card>
          )}

          {/* Computer Sessions Card */}
          {licenseInfo?.isValid && sessionStats && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Computers</h2>
              <p className="text-sm text-gray-500 mb-6">
                Computers currently using this license on your network
              </p>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-blue-600 font-medium">Active Computers</div>
                  <div className="text-3xl font-bold text-blue-900 mt-1">
                    {sessionStats.activeComputers}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm text-green-600 font-medium">Maximum Allowed</div>
                  <div className="text-3xl font-bold text-green-900 mt-1">
                    {sessionStats.maxComputers}
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-sm text-purple-600 font-medium">Available Slots</div>
                  <div className="text-3xl font-bold text-purple-900 mt-1">
                    {sessionStats.availableSlots}
                  </div>
                </div>
              </div>

              {sessionStats.sessions && sessionStats.sessions.length > 0 ? (
                <div className="space-y-2">
                  {sessionStats.sessions.map((session, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{session.computerName}</div>
                          <div className="text-sm text-gray-500">{session.computerIp}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">
                          Connected {new Date(session.connectedAt).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          Last seen {new Date(session.lastHeartbeat).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p>No active computers</p>
                </div>
              )}
            </Card>
          )}

          {/* Enabled Modules Card */}
          {licenseInfo?.isValid && licenseInfo.modules && Array.isArray(licenseInfo.modules) && licenseInfo.modules.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Enabled Modules</h2>
              <p className="text-sm text-gray-500 mb-6">
                Features available in your current license
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(licenseInfo.modules || []).map((module) => (
                  <div key={module} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-900">{module}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </main>
      </div>

      {/* Update License Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Update License Key</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter a new license key to update your software license
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New License Key
                </label>
                <input
                  type="text"
                  value={newLicenseKey}
                  onChange={(e) => setNewLicenseKey(e.target.value.toUpperCase())}
                  placeholder="CLINIC-XXXXX-XXXXX-XXXXX-XXXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-center"
                  disabled={isUpdating}
                />
              </div>

              {updateError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{updateError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setNewLicenseKey('');
                    setUpdateError('');
                  }}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleUpdateLicense}
                  disabled={isUpdating || !newLicenseKey}
                >
                  {isUpdating ? 'Updating...' : 'Update'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
