import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'admin_licensing_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface AdminSession {
  authenticated: boolean;
  timestamp: number;
  expiresAt: number;
}

export async function createAdminSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const now = Date.now();
    const expiresAt = now + SESSION_TIMEOUT_MS;

    const sessionData: AdminSession = {
      authenticated: true,
      timestamp: now,
      expiresAt,
    };

    cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_TIMEOUT_MS / 1000,
      path: '/',
    });
  } catch (error) {
    console.error('Error creating admin session:', error);
    throw error;
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    const session: AdminSession = JSON.parse(sessionCookie.value);

    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      await clearAdminSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error getting admin session:', error);
    return null;
  }
}

export async function clearAdminSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error('Error clearing admin session:', error);
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const session = await getAdminSession();
    return session?.authenticated === true;
  } catch (error) {
    console.error('Error checking admin authentication:', error);
    return false;
  }
}
