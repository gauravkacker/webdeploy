"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { userDb, roleDb, ensureModule2DataSeeded } from "@/lib/db/database";
import type { User, Role } from "@/types";

const CURRENT_USER_KEY = 'clinic_current_user';
const REMEMBER_ME_KEY = 'clinic_remember_me';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPasswordForRecovery, setNewPasswordForRecovery] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState('');

  // Reset form immediately when page loads (after logout)
  useEffect(() => {
    console.log('[Login] Page loaded, resetting form state');
    setUsername('');
    setPassword('');
    setRememberMe(false);
    setError('');
    setIsLoading(false);
    setShowPassword(false);
    setShowForgotPasswordModal(false);
    setRecoveryUsername('');
    setSecurityAnswer('');
    setNewPasswordForRecovery('');
    setShowRecoveryPassword(false);
    setSecurityQuestion('');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Ensure Module 2 data is seeded first
      ensureModule2DataSeeded();
      
      console.log('Attempting login for username:', username);
      let user = userDb.getByIdentifier(username) as User | undefined;
      console.log('User found:', user ? 'Yes' : 'No');
      
      if (!user) {
        console.log('Available users:', userDb.getAll().map((u: any) => ({ id: u.id, identifier: u.identifier })));
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      console.log('User active status:', user.isActive);
      if (!user.isActive) {
        setError('User account is inactive');
        setIsLoading(false);
        return;
      }

      console.log('Checking password...');
      const isPasswordValid = user.password === password;

      if (!isPasswordValid) {
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      // Get user role
      console.log('Getting role for roleId:', user.roleId);
      const role = roleDb.getById(user.roleId) as Role | undefined;
      console.log('Role found:', role ? role.name : 'No');
      if (!role) {
        setError('User role not found');
        setIsLoading(false);
        return;
      }

      // Use custom permissions if they exist, otherwise use role permissions
      const userPermissions = user.customPermissions && user.customPermissions.length > 0
        ? user.customPermissions
        : Object.keys(role.permissions || {});

      console.log('User permissions:', userPermissions);

      // Store current user with permissions
      const userWithPermissions = {
        ...user,
        permissions: userPermissions,
        role: role.name.toLowerCase(),
      };
      console.log('Storing user in localStorage:', userWithPermissions);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userWithPermissions));
      
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
      
      // Set auth_token cookie for middleware authentication
      document.cookie = `auth_token=${user.id}; path=/; max-age=${7 * 24 * 60 * 60}`;
      console.log('Set auth_token cookie for middleware');
      
      console.log('Login successful, redirecting to queue...');
      
      // Redirect to queue (main software)
      setTimeout(() => {
        router.push('/queue');
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowForgotPasswordModal(true);
    setRecoveryUsername('');
    setSecurityAnswer('');
    setNewPasswordForRecovery('');
    setSecurityQuestion('');
    setError('');
  };

  const handleRecoverySubmit = () => {
    if (!recoveryUsername.trim()) {
      alert('Please enter your username');
      return;
    }

    ensureModule2DataSeeded();
    const user = userDb.getByIdentifier(recoveryUsername) as User | undefined;

    if (!user) {
      alert('User not found');
      return;
    }

    // Check if user has security question set
    const userWithSecurity = user as User & { securityQuestion?: string; securityAnswer?: string };
    if (!userWithSecurity.securityQuestion || !userWithSecurity.securityAnswer) {
      alert('This user has not set up security questions. Please contact the clinic administrator.');
      return;
    }

    // Show security question
    if (!securityQuestion) {
      setSecurityQuestion(userWithSecurity.securityQuestion);
      return;
    }

    // Verify security answer
    if (securityAnswer.toLowerCase().trim() !== userWithSecurity.securityAnswer.toLowerCase().trim()) {
      alert('Incorrect security answer');
      return;
    }

    // Reset password
    if (!newPasswordForRecovery.trim()) {
      alert('Please enter a new password');
      return;
    }

    userDb.update(user.id, { password: newPasswordForRecovery });
    alert('Password reset successfully! You can now login with your new password.');
    setShowForgotPasswordModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Management System</h1>
          <p className="text-sm text-gray-500 mt-2">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
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

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Card>

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reset Password</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <Input
                  value={recoveryUsername}
                  onChange={(e) => setRecoveryUsername(e.target.value)}
                  placeholder="Enter your username"
                  disabled={!!securityQuestion}
                />
              </div>

              {securityQuestion && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Security Question</label>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{securityQuestion}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Answer</label>
                    <Input
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      placeholder="Enter your answer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <Input
                        type={showRecoveryPassword ? "text" : "password"}
                        value={newPasswordForRecovery}
                        onChange={(e) => setNewPasswordForRecovery(e.target.value)}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showRecoveryPassword ? (
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
                </>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={handleRecoverySubmit}>
                {securityQuestion ? 'Reset Password' : 'Continue'}
              </Button>
              <Button variant="secondary" onClick={() => {
                setShowForgotPasswordModal(false);
                setSecurityQuestion('');
              }}>
                Cancel
              </Button>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              Note: If you haven't set up a security question, please contact the clinic administrator.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
