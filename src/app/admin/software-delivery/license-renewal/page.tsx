'use client';

import Link from 'next/link';
import LicenseRenewalAdmin from '@/components/admin/LicenseRenewalAdmin';

export default function LicenseRenewalPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery">
            <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
              ← Back to Software Delivery
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">License Renewal</h1>
          <p className="text-gray-600 mt-2">
            Generate renewal .LIC files for customers to extend their licenses
          </p>
        </div>

        {/* License Renewal Component */}
        <LicenseRenewalAdmin />
      </div>
    </div>
  );
}
