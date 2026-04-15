import { useEffect } from 'react';
import { validateEnvironmentState } from '@/lib/config/environment-validator';

/**
 * Hook to validate environment on app startup
 * Clears incompatible state when switching between dev/prod modes
 */
export const useEnvironmentValidator = () => {
  useEffect(() => {
    validateEnvironmentState();
  }, []);
};
