import { isAdminAuthenticated } from '@/lib/admin-auth/session';
import { redirect } from 'next/navigation';
import LicensingPageWrapper from '@/components/admin/LicensingPageWrapper';

export default async function LicensingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if admin is authenticated
  const authenticated = await isAdminAuthenticated();

  // If not authenticated, redirect to login
  if (!authenticated) {
    redirect('/admin/licensing/login');
  }

  // If authenticated, wrap with the licensing page wrapper
  return <LicensingPageWrapper>{children}</LicensingPageWrapper>;
}
