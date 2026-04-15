'use client';

/**
 * useLicenseGuard
 * Redirects to /license-required if the given module is not in the active license.
 * Usage: call at the top of any page that requires a specific module.
 *
 * Example:
 *   useLicenseGuard('pharmacy');
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLicense } from '@/lib/license/license-context';

export function useLicenseGuard(moduleId: string): void {
  const router = useRouter();
  const { isLoading, hasModule } = useLicense();

  useEffect(() => {
    if (isLoading) return; // wait until license is fetched
    if (!hasModule(moduleId)) {
      router.replace(`/license-required?module=${encodeURIComponent(moduleId)}`);
    }
  }, [isLoading, hasModule, moduleId, router]);
}
