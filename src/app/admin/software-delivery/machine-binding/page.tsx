'use client';

import Link from 'next/link';
import MachineBindingList from '@/components/admin/MachineBindingList';

export default function MachineBindingPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Machine Binding Management</h1>
          <p className="text-gray-600 mt-2">
            View and manage all licensed machines with their binding status
          </p>
        </div>

        {/* Machine Binding List Component */}
        <MachineBindingList />
      </div>
    </div>
  );
}
