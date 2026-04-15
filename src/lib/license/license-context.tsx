'use client';

/**
 * License Context
 * Provides license module access info to all client components.
 * Fetches from /api/license/usage-stats on mount and re-checks every 5 minutes.
 *
 * If NEXT_PUBLIC_ENABLE_LICENSING is not 'true', all modules are considered accessible.
 * If NEXT_PUBLIC_IS_DEVELOPER is 'true', a runtime toggle (stored in localStorage as
 * 'devLicenseEnforcement') can override enforcement without touching .env.local.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface LicenseState {
  isLoading: boolean;
  hasLicense: boolean;
  isValid: boolean;
  modules: string[];
  daysRemaining: number | null;
  isLifetime: boolean;
}

interface LicenseContextType extends LicenseState {
  hasModule: (moduleId: string) => boolean;
  refresh: () => Promise<void>;
  /** Developer-only: whether license enforcement is currently active */
  devEnforcementOn: boolean;
  /** Developer-only: toggle enforcement on/off at runtime */
  toggleDevEnforcement: () => void;
}

const LICENSING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LICENSING === 'true';
const IS_DEVELOPER = process.env.NEXT_PUBLIC_IS_DEVELOPER === 'true';
const IS_DEV_MODE = process.env.NEXT_PUBLIC_BUILD_MODE === 'dev';
const DEV_OVERRIDE_KEY = 'devLicenseEnforcement';

const defaultState: LicenseState = {
  isLoading: true,
  hasLicense: false,
  isValid: false,
  modules: [],
  daysRemaining: null,
  isLifetime: false,
};

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LicenseState>(defaultState);
  // Dev override: true = enforce licensing, false = bypass. Default off for developer.
  const [devEnforcementOn, setDevEnforcementOn] = useState<boolean>(false);

  // Load dev override from localStorage on mount
  useEffect(() => {
    if (!IS_DEVELOPER) return;
    const stored = localStorage.getItem(DEV_OVERRIDE_KEY);
    setDevEnforcementOn(stored === 'true');
  }, []);

  const toggleDevEnforcement = useCallback(() => {
    if (!IS_DEVELOPER) return;
    setDevEnforcementOn((prev) => {
      const next = !prev;
      localStorage.setItem(DEV_OVERRIDE_KEY, String(next));
      return next;
    });
  }, []);

  // In dev mode (NEXT_PUBLIC_BUILD_MODE=dev): licensing is always disabled - show everything
  // In developer mode (NEXT_PUBLIC_IS_DEVELOPER=true): licensing is enabled only if dev enforcement is toggled ON
  // In production: licensing is enabled if NEXT_PUBLIC_ENABLE_LICENSING=true
  const effectiveLicensingEnabled = IS_DEV_MODE ? false : (IS_DEVELOPER ? (LICENSING_ENABLED && devEnforcementOn) : LICENSING_ENABLED);

  const fetchLicense = useCallback(async () => {
    if (!effectiveLicensingEnabled) {
      setState({
        isLoading: false,
        hasLicense: true,
        isValid: true,
        modules: ['*'],
        daysRemaining: null,
        isLifetime: true,
      });
      return;
    }

    try {
      const res = await fetch('/api/license/usage-stats');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setState({
        isLoading: false,
        hasLicense: data.hasLicense ?? false,
        isValid: data.isValid ?? false,
        modules: data.modules ?? [],
        daysRemaining: data.daysRemaining ?? null,
        isLifetime: data.isLifetime ?? false,
      });
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [effectiveLicensingEnabled]);

  useEffect(() => {
    fetchLicense();
    const interval = setInterval(fetchLicense, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLicense]);

  const hasModule = useCallback(
    (moduleId: string): boolean => {
      if (!effectiveLicensingEnabled) return true;
      if (state.isLoading) return true;
      if (!state.hasLicense) return true;
      if (!state.isValid) return false;
      if (state.modules.includes('*')) return true;
      if (moduleId === 'dashboard' || moduleId === 'settings' || moduleId === 'admin') return true;
      if (state.modules.length === 0) return true;
      return state.modules.includes(moduleId);
    },
    [effectiveLicensingEnabled, state.isLoading, state.hasLicense, state.isValid, state.modules]
  );

  return (
    <LicenseContext.Provider value={{ ...state, hasModule, refresh: fetchLicense, devEnforcementOn, toggleDevEnforcement }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextType {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
  return ctx;
}
