// ============================================
// Module 2: Authentication Context & Hooks
// ============================================

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { User, Role, AuthState, LoginMode, EmergencyMode, FrontdeskOverride } from '@/types';
import { userDb, roleDb, activityLogDb, sessionDb, ensureModule2DataSeeded, db } from '@/lib/db/database';
import { initDBSync } from '@/lib/db-sync';

// Default login mode (Module 2.4)
const DEFAULT_LOGIN_MODE: LoginMode = 'password';
const REMEMBER_ME_KEY = 'clinic_remember_me';
const CURRENT_USER_KEY = 'clinic_current_user';

// Auth Context Interface
interface AuthContextType extends AuthState {
  // Login methods
  login: (identifier: string, password?: string) => Promise<boolean>;
  logout: () => void;
  
  // Permission checks
  hasPermission: (permissionKey: string) => boolean;
  hasAnyPermission: (keys: string[]) => boolean;
  hasAllPermissions: (keys: string[]) => boolean;
  
  // Emergency mode (Module 2.13)
  enableEmergencyMode: (reason?: string) => void;
  disableEmergencyMode: () => void;
  
  // Frontdesk override (Module 2.9)
  enableFrontdeskOverride: () => void;
  disableFrontdeskOverride: () => void;
  
  // Activity logging (Module 2.10)
  logActivity: (action: string, module: string, details?: Record<string, unknown>, patientId?: string) => void;
  
  // Session management
  updateLastActivity: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Generate session ID
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Provider Component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialization function
  const initializeAuth = useCallback(() => {
    // Validate environment and clear incompatible state
    if (typeof window !== 'undefined') {
      const { validateEnvironmentState } = require('@/lib/config/environment-validator');
      validateEnvironmentState();
    }
    
    // Ensure Module 2 data is seeded
    ensureModule2DataSeeded();
    
    // Always try to restore session from localStorage (regardless of remember me)
    if (typeof window !== 'undefined') {
      const currentUserJson = localStorage.getItem(CURRENT_USER_KEY);
      
      if (currentUserJson) {
        try {
          const currentUser = JSON.parse(currentUserJson);
          
          // First check if it's an admin user (has permissions array directly)
          if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
            // This is an admin user, create a mock role object
            const mockRole: Role = {
              id: 'role-' + currentUser.role,
              name: currentUser.role === 'doctor' ? 'Doctor' : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1),
              description: currentUser.role,
              isSystem: false,
              permissions: currentUser.permissions.reduce((acc: Record<string, boolean>, perm: string) => {
                acc[perm] = true;
                return acc;
              }, {}),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            return {
              isAuthenticated: true,
              user: currentUser as User,
              role: mockRole,
              loginMode: DEFAULT_LOGIN_MODE,
              sessionId: generateSessionId(),
              emergencyMode: false,
              frontdeskOverride: false,
            };
          }
          
          // Otherwise try to find the user in the Module 2 database
          const user = userDb.getByIdentifier(currentUser.username) as User | undefined;
          if (user && user.isActive) {
            const role = roleDb.getById(user.roleId) as Role;
            if (role) {
              return {
                isAuthenticated: true,
                user,
                role,
                loginMode: DEFAULT_LOGIN_MODE,
                sessionId: generateSessionId(),
                emergencyMode: false,
                frontdeskOverride: false,
              };
            }
          }
        } catch (e) {
          // If parsing fails, clear the stored data
          localStorage.removeItem(CURRENT_USER_KEY);
        }
      }
    }
    
    return {
      isAuthenticated: false,
      user: null,
      role: null,
      loginMode: DEFAULT_LOGIN_MODE,
      sessionId: null,
      emergencyMode: false,
      frontdeskOverride: false,
    };
  }, []);

  const [authState, setAuthState] = useState<AuthState>(initializeAuth);

  // On mount, initialize LAN sync
  useEffect(() => {
    initDBSync();
    
    // Listen for environment changes - just refresh auth state, no reload needed
    const handleEnvironmentChange = () => {
      console.log('Environment changed, refreshing auth state');
      setAuthState(initializeAuth());
      // Removed window.location.reload() - was causing infinite reload loop
    };
    
    window.addEventListener('environmentChanged', handleEnvironmentChange);
    return () => window.removeEventListener('environmentChanged', handleEnvironmentChange);
  }, [initializeAuth]);

  // License check is handled by middleware - no need to redirect here
  // In prod mode, middleware will redirect to /login if no license_key cookie exists
  // The login page handles both normal login and license password activation

  const [emergencyMode, setEmergencyMode] = useState<EmergencyMode>({
    enabled: false,
    enabledBy: '',
    enabledAt: new Date(),
    restrictionsDisabled: false,
  });

  const [frontdeskOverride, setFrontdeskOverride] = useState<FrontdeskOverride>({
    enabled: false,
    enabledBy: '',
    enabledAt: new Date(),
  });

  // Sync auth state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (authState.isAuthenticated && authState.user && authState.role) {
      // Store user with permissions from role
      const userWithPermissions = {
        ...authState.user,
        permissions: Object.keys(authState.role.permissions || {}),
        role: authState.role.name.toLowerCase(),
      };
      localStorage.setItem('clinic_current_user', JSON.stringify(userWithPermissions));
    } else {
      localStorage.removeItem('clinic_current_user');
    }
  }, [authState.isAuthenticated, authState.user, authState.role]);

  // Use ref for logActivity to avoid circular dependencies
  const logActivityRef = useRef<(action: string, module: string, details?: Record<string, unknown>, patientId?: string) => void>((action: string, module: string, details?: Record<string, unknown>) => {
    if (authState.user) {
      activityLogDb.create({
        userId: authState.user.id,
        userName: authState.user.name,
        action,
        module,
        details: details || {},
        patientId: undefined,
        ipAddress: '127.0.0.1',
        timestamp: new Date(),
      });
    }
  });

  // Update ref when user changes
  useEffect(() => {
    logActivityRef.current = (action: string, module: string, details?: Record<string, unknown>) => {
      if (authState.user) {
        activityLogDb.create({
          userId: authState.user.id,
          userName: authState.user.name,
          action,
          module,
          details: details || {},
          patientId: undefined,
          ipAddress: '127.0.0.1',
          timestamp: new Date(),
        });
      }
    };
  }, [authState.user]);

  // Login function (Module 2.5)
  const login = useCallback(async (identifier: string, password?: string): Promise<boolean> => {
    // Check if system requires re-activation after deregistration
    const settings = db.getAll('settings') || [];
    const reactivationFlag = settings.find((s: any) => s.key === 'requires_reactivation');
    const requiresReactivation = (reactivationFlag as any)?.value === 'true';

    // If system requires re-activation, only allow login with activation password
    // Block default credentials like "doctor/doctor123"
    if (requiresReactivation) {
      // Check if this is an activation password attempt
      // Activation passwords are stored in license_activation_passwords table
      const activationPasswords = db.getAll('license_activation_passwords') || [];
      const validActivationPassword = activationPasswords.find((ap: any) => ap.password === password && ap.isUsed === false);
      
      if (!validActivationPassword) {
        console.warn('[Auth] System requires re-activation. Login with default credentials blocked.');
        return false;
      }
      
      // Mark activation password as used
      db.update('license_activation_passwords', (validActivationPassword as any).id, {
        isUsed: true,
        usedAt: new Date(),
      });
      
      // Clear the re-activation flag
      if (reactivationFlag) {
        db.update('settings', (reactivationFlag as any).id, {
          value: 'false',
          updatedAt: new Date(),
        });
      }
      
      // Create a default user session after activation
      const defaultUser = userDb.getByIdentifier('doctor') as User | undefined;
      if (defaultUser) {
        const role = roleDb.getById(defaultUser.roleId) as Role;
        if (role) {
          const sessionId = generateSessionId();
          sessionDb.create({
            userId: defaultUser.id,
            deviceId: 'default',
            deviceName: 'Browser',
            ipAddress: '127.0.0.1',
            isActive: true,
            lastActivity: new Date(),
          });

          setAuthState({
            isAuthenticated: true,
            user: defaultUser,
            role,
            loginMode: authState.loginMode,
            sessionId,
            emergencyMode: false,
            frontdeskOverride: false,
          });

          logActivityRef.current('login_after_reactivation', 'auth', { activationMethod: 'password' });
          return true;
        }
      }
      
      return false;
    }

    // Normal login flow (when system is activated)
    // Find user by identifier
    const user = userDb.getByIdentifier(identifier) as User | undefined;
    
    if (!user) {
      return false;
    }

    if (!user.isActive) {
      return false;
    }

    // For 'none' login mode, skip password check
    if (authState.loginMode !== 'none' && password) {
      if (user.password !== password) {
        return false;
      }
    }

    // Get user role
    const role = roleDb.getById(user.roleId) as Role;
    
    if (!role) {
      return false;
    }

    // Update last login
    userDb.update(user.id, { lastLogin: new Date() });

    // Create session
    const sessionId = generateSessionId();
    sessionDb.create({
      userId: user.id,
      deviceId: 'default',
      deviceName: 'Browser',
      ipAddress: '127.0.0.1',
      isActive: true,
      lastActivity: new Date(),
    });

    setAuthState({
      isAuthenticated: true,
      user,
      role,
      loginMode: authState.loginMode,
      sessionId,
      emergencyMode: false,
      frontdeskOverride: false,
    });

    // Log activity using ref
    logActivityRef.current('login', 'auth', { loginMode: authState.loginMode });

    return true;
  }, [authState.loginMode]);

  // Logout function
  const logout = useCallback(() => {
    if (authState.sessionId) {
      sessionDb.update(authState.sessionId, { isActive: false });
    }

    // Clear user data from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_USER_KEY);
      // Only clear remember me on explicit logout
      localStorage.removeItem(REMEMBER_ME_KEY);
    }

    // Log activity using ref
    logActivityRef.current('logout', 'auth');

    setAuthState({
      isAuthenticated: false,
      user: null,
      role: null,
      loginMode: authState.loginMode,
      sessionId: null,
      emergencyMode: false,
      frontdeskOverride: false,
    });
  }, [authState.sessionId, authState.loginMode]);

  // Permission check (Module 2.6)
  const hasPermission = useCallback((permissionKey: string): boolean => {
    // Emergency mode bypasses all restrictions (Module 2.13)
    if (emergencyMode.enabled) {
      return true;
    }

    // Frontdesk override allows frontdesk permissions (Module 2.9)
    if (authState.frontdeskOverride && authState.role?.name === 'Doctor') {
      // Doctor can act as frontdesk
      const frontdeskRole = roleDb.getById('role-frontdesk') as Role;
      return frontdeskRole?.permissions[permissionKey] ?? false;
    }

    if (!authState.role) {
      return false;
    }

    return authState.role.permissions[permissionKey] ?? false;
  }, [authState.role, emergencyMode.enabled, authState.frontdeskOverride]);

  const hasAnyPermission = useCallback((keys: string[]): boolean => {
    return keys.some((key) => hasPermission(key));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((keys: string[]): boolean => {
    return keys.every((key) => hasPermission(key));
  }, [hasPermission]);

  // Emergency mode (Module 2.13)
  const enableEmergencyMode = useCallback((reason?: string) => {
    if (authState.user) {
      setEmergencyMode({
        enabled: true,
        enabledBy: authState.user.id,
        enabledAt: new Date(),
        reason,
        restrictionsDisabled: true,
      });

      setAuthState((prev) => ({
        ...prev,
        emergencyMode: true,
      }));

      // Log activity using ref
      logActivityRef.current('enable_emergency_mode', 'system', { reason });
    }
  }, [authState.user]);

  const disableEmergencyMode = useCallback(() => {
    setEmergencyMode((prev) => ({
      ...prev,
      enabled: false,
      restrictionsDisabled: false,
    }));

    setAuthState((prev) => ({
      ...prev,
      emergencyMode: false,
    }));

    // Log activity using ref
    logActivityRef.current('disable_emergency_mode', 'system');
  }, []);

  // Frontdesk override (Module 2.9)
  const enableFrontdeskOverride = useCallback(() => {
    if (authState.user?.isDoctor && authState.user) {
      setFrontdeskOverride({
        enabled: true,
        enabledBy: authState.user.id,
        enabledAt: new Date(),
      });

      setAuthState((prev) => ({
        ...prev,
        frontdeskOverride: true,
      }));

      // Log activity using ref
      logActivityRef.current('enable_frontdesk_override', 'system');
    }
  }, [authState.user]);

  const disableFrontdeskOverride = useCallback(() => {
    setFrontdeskOverride((prev) => ({
      ...prev,
      enabled: false,
    }));

    setAuthState((prev) => ({
      ...prev,
      frontdeskOverride: false,
    }));

    // Log activity using ref
    logActivityRef.current('disable_frontdesk_override', 'system');
  }, []);

  // Activity logging (Module 2.10)
  const logActivity = useCallback((
    action: string,
    module: string,
    details?: Record<string, unknown>,
    patientId?: string
  ) => {
    logActivityRef.current(action, module, details, patientId);
  }, []);

  // Update last activity (Module 2.12)
  const updateLastActivity = useCallback(() => {
    if (authState.user) {
      userDb.update(authState.user.id, { lastActivity: new Date() });
      
      if (authState.sessionId) {
        sessionDb.update(authState.sessionId, { lastActivity: new Date() });
      }
    }
  }, [authState.user, authState.sessionId]);

  // Activity heartbeat
  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const interval = setInterval(() => {
      updateLastActivity();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, updateLastActivity]);

  const value: AuthContextType = {
    ...authState,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    enableEmergencyMode,
    disableEmergencyMode,
    enableFrontdeskOverride,
    disableFrontdeskOverride,
    logActivity,
    updateLastActivity,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook to require permission (redirects or throws)
export function useRequirePermission(permissionKey: string): void {
  const { hasPermission, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !hasPermission(permissionKey)) {
      // Could redirect to access denied page
      console.warn(`Permission denied: ${permissionKey}`);
    }
  }, [isAuthenticated, hasPermission, permissionKey]);
}
