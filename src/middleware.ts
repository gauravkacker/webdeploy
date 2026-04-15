import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const buildMode = process.env.NEXT_PUBLIC_BUILD_MODE || 'prod';
  const pathname = request.nextUrl.pathname;

  // Skip middleware for API routes and static files
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/public')) {
    return NextResponse.next();
  }

  // Block LAN network selection page in web mode (server-side data storage)
  if (pathname === '/lan-network-selection') {
    return NextResponse.redirect(new URL('/queue', request.url));
  }

  // In dev mode, allow all pages
  if (buildMode === 'dev') {
    return NextResponse.next();
  }

  // In prod mode, check for authentication (ID + Password only, no license needed)
  if (buildMode === 'prod') {
    // Allow login page without authentication
    if (pathname === '/login') {
      return NextResponse.next();
    }

    // Redirect root path to login if not authenticated
    if (pathname === '/') {
      const authToken = request.cookies.get('auth_token')?.value;
      if (!authToken) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      // If authenticated, allow access to dashboard
      return NextResponse.next();
    }

    // For all other pages, check if user has auth_token cookie
    const authToken = request.cookies.get('auth_token')?.value;
    if (!authToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
