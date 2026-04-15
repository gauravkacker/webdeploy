'use client';

import React, { useState, useEffect } from 'react';
import { MachineIdDisplay } from './MachineIdDisplay';
import { LicFileUpload } from './LicFileUpload';

interface LicenseActivationProps {
  onActivationComplete?: (licenseData: any) => void;
  onError?: (error: string) => void;
}

type ActivationStep = 'machine-id' | 'upload-license' | 'activating' | 'success' | 'error';

export const LicenseActivation: React.FC<LicenseActivationProps> = ({
  onActivationComplete,
  onError,
}) => {
  const [step, setStep] = useState<ActivationStep>('machine-id');
  const [machineId, setMachineId] = useState<string>('');
  const [licenseFile, setLicenseFile] = useState<Buffer | string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{
    licenseType?: 'single-pc' | 'multi-pc';
    maxMachines?: number;
    authorizedCount?: number;
  }>({});

  // Generate Machine ID on mount
  useEffect(() => {
    const generateMachineId = async () => {
      try {
        const response = await fetch('/api/license/machine-id', {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error('Failed to generate Machine ID');
        }

        const data = await response.json();
        setMachineId(data.machineId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to generate Machine ID';
        setErrorMessage(message);
        setStep('error');
        onError?.(message);
      }
    };

    generateMachineId();
  }, [onError]);

  const handleLicenseFileSelected = (file: Buffer | string) => {
    setLicenseFile(file);
    setStep('upload-license');
  };

  const handleActivate = async () => {
    if (!licenseFile) {
      setErrorMessage('Please select a license file');
      return;
    }

    setIsLoading(true);
    setStep('activating');
    setErrorMessage('');

    try {
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          machineId,
          licenseFile:
            typeof licenseFile === 'string'
              ? licenseFile
              : licenseFile.toString('base64'),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Activation failed');
      }

      const data = await response.json();
      setLicenseInfo({
        licenseType: data.licenseType,
        maxMachines: data.maxMachines,
        authorizedCount: data.authorizedCount
      });
      setStep('success');
      onActivationComplete?.(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Activation failed';
      setErrorMessage(message);
      setStep('error');
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setStep('machine-id');
    setLicenseFile(null);
    setErrorMessage('');
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          License Activation
        </h1>
        <p className="text-gray-600">
          Activate your license by providing your Machine ID and license file
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center ${
              step !== 'machine-id' ? 'text-blue-600' : 'text-gray-900'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                step !== 'machine-id'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {step !== 'machine-id' ? '✓' : '1'}
            </div>
            <span className="ml-2 font-medium">Machine ID</span>
          </div>

          <div className="flex-1 h-1 mx-4 bg-gray-200">
            <div
              className={`h-full transition-all ${
                step !== 'machine-id' ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          </div>

          <div
            className={`flex items-center ${
              step === 'success' ? 'text-blue-600' : 'text-gray-900'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                step === 'success'
                  ? 'bg-blue-600 text-white'
                  : step === 'machine-id'
                    ? 'bg-gray-200 text-gray-400'
                    : 'bg-blue-100 text-blue-600'
              }`}
            >
              {step === 'success' ? '✓' : '2'}
            </div>
            <span className="ml-2 font-medium">Upload License</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Machine ID Step */}
        {step === 'machine-id' && machineId && (
          <div className="space-y-6">
            <MachineIdDisplay 
              machineId={machineId} 
              isMultiPc={licenseInfo.licenseType === 'multi-pc'}
            />
            <button
              onClick={() => setStep('upload-license')}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Next: Upload License File
            </button>
          </div>
        )}

        {/* Upload License Step */}
        {step === 'upload-license' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Upload License File
              </h2>
              <p className="text-gray-600">
                Upload the .LIC file that your administrator generated for your Machine ID
              </p>
            </div>

            <LicFileUpload
              onFileSelected={handleLicenseFileSelected}
              onError={(error) => {
                setErrorMessage(error);
              }}
              isLoading={isLoading}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep('machine-id')}
                disabled={isLoading}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleActivate}
                disabled={!licenseFile || isLoading}
                className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Activating...' : 'Activate License'}
              </button>
            </div>
          </div>
        )}

        {/* Activating Step */}
        {step === 'activating' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4" />
            <p className="text-gray-600 font-medium">Activating your license...</p>
            <p className="text-sm text-gray-500 mt-2">
              Please wait while we validate your license file
            </p>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-2xl font-bold text-green-900 mb-2">
                License Activated Successfully
              </h2>
              <p className="text-green-800">
                Your license has been activated and is ready to use
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">License Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Machine ID:</dt>
                  <dd className="font-mono text-gray-900 text-xs break-all">{machineId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Status:</dt>
                  <dd className="text-green-600 font-medium">Active</dd>
                </div>
                {licenseInfo.licenseType === 'multi-pc' && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">License Type:</dt>
                      <dd className="text-gray-900 font-medium">Multi-PC License</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Authorized Computers:</dt>
                      <dd className="text-gray-900 font-medium">
                        {licenseInfo.authorizedCount} of {licenseInfo.maxMachines} PCs
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {licenseInfo.licenseType === 'multi-pc' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Multi-PC License Active</h3>
                <p className="text-sm text-blue-800">
                  This license can be used on {licenseInfo.maxMachines} computers. 
                  The same .LIC file works on all authorized computers.
                </p>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Continue to Application
            </button>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-lg font-bold text-red-900 mb-2">
                Activation Failed
              </h2>
              <p className="text-red-800 mb-4">{errorMessage}</p>
              
              {errorMessage.includes('MACHINE_NOT_AUTHORIZED') && (
                <div className="bg-red-100 rounded p-3 text-sm text-red-900 mb-4">
                  <p className="font-medium mb-2">Machine Not Authorized</p>
                  <p className="mb-2">
                    This Machine ID is not authorized for this license. This could mean:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>For Single-PC licenses: The .LIC file was generated for a different computer</li>
                    <li>For Multi-PC licenses: This Machine ID has not been added to the authorized list</li>
                  </ul>
                  <p className="mt-2 font-medium">
                    Contact your administrator to add this Machine ID to the license or generate a new license file.
                  </p>
                </div>
              )}
              
              <div className="bg-red-100 rounded p-3 text-sm text-red-900">
                <p className="font-medium mb-1">Troubleshooting:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Ensure the .LIC file is valid and not corrupted</li>
                  <li>Verify the Machine ID matches the one used to generate the license</li>
                  <li>Check that the license file is not expired</li>
                  <li>For Multi-PC licenses, ensure your Machine ID is in the authorized list</li>
                  <li>Contact your administrator if the problem persists</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Message Display */}
      {errorMessage && step !== 'error' && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}
    </div>
  );
};
