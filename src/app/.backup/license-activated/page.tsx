"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db/database";
import type { License } from "@/lib/db/schema";

interface ActivationDetails {
  machineId: string;
  licenseKey: string;
  plan: string;
  activationDate: string;
  expiryDate: string;
  daysRemaining: number;
  maxMachines: number;
}

export default function LicenseActivatedPage() {
  const router = useRouter();
  const [activationDetails, setActivationDetails] = useState<ActivationDetails | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to format YYYYMMDD date
  const formatExpiryDate = (dateStr: string): string => {
    if (!dateStr || dateStr.length !== 8) return 'Invalid Date';
    try {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return new Date(`${year}-${month}-${day}`).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  // Helper function to calculate days remaining
  const calculateDaysRemaining = (dateStr: string): number => {
    if (!dateStr || dateStr.length !== 8) return 0;
    try {
      const year = parseInt(dateStr.slice(0, 4));
      const month = parseInt(dateStr.slice(4, 6));
      const day = parseInt(dateStr.slice(6, 8));
      const expiryDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    // Get activation details from session storage or localStorage
    const detailsJson = sessionStorage.getItem('licenseActivationDetails');
    if (!detailsJson) {
      // No activation details, redirect to home
      router.push('/');
      return;
    }

    try {
      const details = JSON.parse(detailsJson);
      setActivationDetails(details);
      // Clear the session storage so this page can't be accessed again
      sessionStorage.removeItem('licenseActivationDetails');
    } catch {
      router.push('/');
    }
  }, [router]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword.trim()) {
      setError('Please enter a password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      // Get current user from localStorage
      const userJson = localStorage.getItem('clinic_current_user');
      if (!userJson) {
        setError('User session not found');
        setIsLoading(false);
        return;
      }

      const user = JSON.parse(userJson);

      // Update user password in database
      db.update('users', user.id, { password: newPassword });

      // Update localStorage with new user data
      const updatedUser = { ...user };
      localStorage.setItem('clinic_current_user', JSON.stringify(updatedUser));

      // Show success and redirect
      alert('Password set successfully! You can now login with your new password.');
      router.push('/');
    } catch (err) {
      console.error('Error setting password:', err);
      setError('Failed to set password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!activationDetails) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-gray-600">Loading activation details...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8">
        {!showPasswordChange ? (
          <>
            {/* Success Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">License Activated!</h1>
              <p className="text-gray-600 mt-2">Your system is now registered and ready to use</p>
            </div>

            {/* Activation Details */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Machine ID</label>
                  <p className="text-sm font-mono bg-white p-2 rounded border border-gray-200 break-all">{activationDetails.machineId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Key</label>
                  <p className="text-sm font-mono bg-white p-2 rounded border border-gray-200 break-all">{activationDetails.licenseKey}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type</label>
                  <p className="text-sm font-semibold text-gray-900 bg-white p-2 rounded border border-gray-200">
                    {activationDetails.plan === '1' ? 'Single PC' : `Multi-PC (${activationDetails.maxMachines} machines)`}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activation Date</label>
                  <p className="text-sm font-semibold text-gray-900 bg-white p-2 rounded border border-gray-200">
                    {new Date(activationDetails.activationDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <p className="text-sm font-semibold text-gray-900 bg-white p-2 rounded border border-gray-200">
                    {formatExpiryDate(activationDetails.expiryDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Days Remaining</label>
                  <p className={`text-sm font-semibold p-2 rounded border ${
                    calculateDaysRemaining(activationDetails.expiryDate) > 30
                      ? 'text-green-700 bg-green-50 border-green-200'
                      : calculateDaysRemaining(activationDetails.expiryDate) > 7
                      ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
                      : 'text-red-700 bg-red-50 border-red-200'
                  }`}>
                    {calculateDaysRemaining(activationDetails.expiryDate)} days
                  </p>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-blue-900">
                <strong>Next Step:</strong> Set a password for your account so you can login with your username and password in the future. 
                You can also change this password anytime from the settings.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={() => setShowPasswordChange(true)}
                className="flex-1"
              >
                Set Password
              </Button>
              <Button
                onClick={() => router.push('/')}
                variant="secondary"
                className="flex-1"
              >
                Skip for Now
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Password Change Form */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Set Your Password</h2>
              <p className="text-gray-600 mt-2">Create a password to login in the future</p>
            </div>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading ? 'Setting Password...' : 'Set Password'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowPasswordChange(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Back
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
