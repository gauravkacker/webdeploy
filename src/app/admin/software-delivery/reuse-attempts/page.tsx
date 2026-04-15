'use client';

import Link from 'next/link';
import ReuseAttemptsTable from '@/components/admin/ReuseAttemptsTable';

export default function ReuseAttemptsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">License Reuse Attempts</h1>
          <p className="text-gray-600 mt-2">
            Monitor and track all attempts to reuse licenses on different machines
          </p>
        </div>

        {/* Reuse Attempts Table Component */}
        <ReuseAttemptsTable />
      </div>
    </div>
  );
}
