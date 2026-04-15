'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ChangePasswordModal from './ChangePasswordModal';

interface LicensingPageWrapperProps {
  children: React.ReactNode;
}

export default function LicensingPageWrapper({
  children,
}: LicensingPageWrapperProps) {
  const router = useRouter();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/licensing/logout', {
        method: 'POST',
      });
      router.push('/licensing/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div>
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Licensing Admin</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Change Password
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
