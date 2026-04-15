'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

function LicenseRequiredContent() {
  const router = useRouter();
  const params = useSearchParams();
  const module = params.get('module') || 'this feature';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Module Not Included</h1>
        <p className="text-gray-600 text-sm mb-6">
          <span className="font-medium capitalize">{module}</span> is not included in your current license plan.
          Contact your vendor to upgrade.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => router.back()}>
            Go Back
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => router.push('/')}>
            Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function LicenseRequiredPage() {
  return (
    <Suspense>
      <LicenseRequiredContent />
    </Suspense>
  );
}
