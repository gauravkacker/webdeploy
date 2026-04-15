import { isAdminAuthenticated } from '@/lib/admin-auth/session';
import { redirect } from 'next/navigation';
import OldLicensingPage from '@/app/admin/licensing/page';
import LicensingPageWrapper from '@/components/admin/LicensingPageWrapper';

// Mark this route as dynamic since it uses cookies
export const dynamic = 'force-dynamic';

export default async function LicensingPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect('/licensing/login');
  }

  return (
    <LicensingPageWrapper>
      <OldLicensingPage />
    </LicensingPageWrapper>
  );
}
