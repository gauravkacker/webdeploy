'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasPermission } from '@/lib/permissions';

/**
 * Hook to check if user has required permissions
 * Redirects to login if not authenticated
 * Redirects to home if user lacks required permission
 */
export function usePermissionCheck(requiredPermission?: string) {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();

    // Redirect to login if not authenticated
    if (!user) {
      router.push('/login');
      return;
    }

    // Check specific permission if provided
    if (requiredPermission && !hasPermission(requiredPermission)) {
      router.push('/');
      return;
    }
  }, [requiredPermission, router]);
}

/**
 * Hook to check if user is authenticated
 * Redirects to login if not
 */
export function useRequireAuth() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
}
