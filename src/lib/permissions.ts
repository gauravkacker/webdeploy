// Permission checking utility for localStorage-based users
const CURRENT_USER_KEY = 'clinic_current_user';
const REMEMBER_ME_KEY = 'clinic_remember_me';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'doctor' | 'receptionist' | 'pharmacist';
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

// Get current logged-in user
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  if (!userJson) return null;
  
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

// Check if user has a specific permission
export function hasPermission(permissionId: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  
  // Doctor role (admin) has all permissions
  if (user.role === 'doctor') return true;
  
  // Handle case where permissions array doesn't exist
  if (!user.permissions || !Array.isArray(user.permissions)) {
    return false;
  }
  
  // Check if permission is in the user's permissions array
  return user.permissions.includes(permissionId);
}

// Check if user has any of the permissions
export function hasAnyPermission(permissionIds: string[]): boolean {
  return permissionIds.some(id => hasPermission(id));
}

// Check if user has all of the permissions
export function hasAllPermissions(permissionIds: string[]): boolean {
  return permissionIds.every(id => hasPermission(id));
}

// Get user's role
export function getUserRole(): string | null {
  const user = getCurrentUser();
  return user?.role || null;
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

// Logout user
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
    // Clear license_key cookie for middleware
    document.cookie = 'license_key=; path=/; max-age=0';
    // DO NOT clear the database - users and data should persist
    // localStorage.removeItem('pms_database');
    // localStorage.removeItem('pms_schema_version');
    // Redirect to login
    window.location.href = '/login';
  }
}
