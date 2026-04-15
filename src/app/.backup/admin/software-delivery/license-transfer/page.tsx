'use client';

import Link from 'next/link';
import LicenseTransfer from '@/components/admin/LicenseTransfer';

export default function LicenseTransferPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery">
            <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
              ← Back
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">License Transfer</h1>
          <p className="text-gray-600 mt-2">
            Transfer licenses to new machines and manage license transfers
          </p>
        </div>

        {/* License Transfer Component */}
        <LicenseTransfer />
      </div>
    </div>
  );
}
