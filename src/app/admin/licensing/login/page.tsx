import { redirect } from 'next/navigation';

// Mark this route as dynamic since it uses redirect (which requires runtime)
export const dynamic = 'force-dynamic';

export default function AdminLicensingLoginPage() {
  // Redirect to the new licensing login page
  redirect('/licensing/login');
}
