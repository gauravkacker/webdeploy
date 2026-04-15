'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LicensingLoginForm from '@/components/admin/LicensingLoginForm';

export default function LicensingLoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/licensing/check-auth');
        if (response.ok) {
          // Already authenticated, redirect to licensing
          router.push('/licensing');
        } else {
          // Not authenticated, show login form
          setIsLoading(false);
        }
      } catch (error) {
        // Error checking auth, show login form
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <LicensingLoginForm />;
}
