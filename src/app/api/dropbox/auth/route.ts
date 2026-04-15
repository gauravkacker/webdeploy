/**
 * Dropbox OAuth Authentication
 * For development: Uses generated access token from Dropbox app console
 * For production: Uses OAuth flow
 */

import { NextRequest, NextResponse } from 'next/server';

const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://www.dropboxapi.com/oauth2/token';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const code = searchParams.get('code');

  const appKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const generatedToken = process.env.DROPBOX_ACCESS_TOKEN;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dropbox/auth?action=callback`;

  if (!appKey || !appSecret) {
    return NextResponse.json(
      { error: 'Dropbox credentials not configured' },
      { status: 500 }
    );
  }

  // Development mode: Use generated access token
  if (action === 'start' && generatedToken) {
    console.log('🔐 Using generated access token (development mode)');
    const redirectUrl = new URL('/settings/backup', request.nextUrl.origin);
    redirectUrl.searchParams.set('dropboxToken', generatedToken);
    redirectUrl.searchParams.set('status', 'success');
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Step 1: Redirect to Dropbox authorization (OAuth mode)
  if (action === 'start') {
    console.log('🔐 Starting Dropbox OAuth flow...');
    console.log('Redirect URI:', redirectUri);
    
    const params = new URLSearchParams({
      client_id: appKey,
      response_type: 'code',
      redirect_uri: redirectUri,
      token_access_type: 'offline',
    });

    const authUrl = `${DROPBOX_AUTH_URL}?${params.toString()}`;
    console.log('Auth URL:', authUrl);
    
    return NextResponse.redirect(authUrl);
  }

  // Step 2: Handle callback and exchange code for token (OAuth mode)
  if (action === 'callback' && code) {
    try {
      console.log('🔐 Exchanging code for token...');
      console.log('Code:', code);
      console.log('Redirect URI:', redirectUri);
      console.log('App Key:', appKey);
      
      const tokenResponse = await fetch(DROPBOX_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: appKey,
          client_secret: appSecret,
          redirect_uri: redirectUri,
        }).toString(),
      });

      console.log('Token response status:', tokenResponse.status);
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('❌ Token exchange failed:', error);
        const redirectUrl = new URL('/settings/backup', request.nextUrl.origin);
        redirectUrl.searchParams.set('status', 'error');
        redirectUrl.searchParams.set('message', `Token exchange failed: ${error}`);
        return NextResponse.redirect(redirectUrl.toString());
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        token_type: string;
        expires_in?: number;
      };

      console.log('✅ Token received successfully');

      // Redirect back to settings with token
      const redirectUrl = new URL('/settings/backup', request.nextUrl.origin);
      redirectUrl.searchParams.set('dropboxToken', tokenData.access_token);
      redirectUrl.searchParams.set('status', 'success');

      return NextResponse.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      const redirectUrl = new URL('/settings/backup', request.nextUrl.origin);
      redirectUrl.searchParams.set('status', 'error');
      redirectUrl.searchParams.set('message', `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  return NextResponse.json(
    { error: 'Invalid request' },
    { status: 400 }
  );
}
