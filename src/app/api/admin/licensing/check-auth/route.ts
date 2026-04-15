import { isAdminAuthenticated } from '@/lib/admin-auth/session';

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  
  if (authenticated) {
    return Response.json({ authenticated: true });
  }
  
  return Response.json({ authenticated: false }, { status: 401 });
}
