/**
 * Validates and manages environment-specific state
 * Clears incompatible data when switching between dev/prod modes
 * Supports real-time detection of .env.local changes
 */

const ENVIRONMENT_KEY = 'app_environment_mode';
let environmentCheckInterval: NodeJS.Timeout | null = null;

export const getEnvironmentMode = () => {
  return process.env.NEXT_PUBLIC_BUILD_MODE || 'dev';
};

export const validateEnvironmentState = () => {
  if (typeof window === 'undefined') return;

  const currentMode = getEnvironmentMode();
  const storedMode = localStorage.getItem(ENVIRONMENT_KEY);

  // First time or mode changed
  if (storedMode !== currentMode) {
    console.log(`Environment changed: ${storedMode} → ${currentMode}. Clearing incompatible state.`);
    clearEnvironmentSpecificData(storedMode, currentMode);
    localStorage.setItem(ENVIRONMENT_KEY, currentMode);
    // Don't reload here - let the app handle the state change naturally
  }

  // Start monitoring for real-time changes (for npm run dev)
  startEnvironmentMonitoring();
};

/**
 * Monitor for environment changes in real-time
 * Useful for npm run dev where .env.local changes should be detected
 * Only runs in development mode
 */
const startEnvironmentMonitoring = () => {
  // Never run monitoring in production - it causes reload loops
  if (process.env.NEXT_PUBLIC_BUILD_MODE === 'prod') return;
  if (environmentCheckInterval) return; // Already monitoring

  environmentCheckInterval = setInterval(() => {
    const currentMode = getEnvironmentMode();
    const storedMode = localStorage.getItem(ENVIRONMENT_KEY);

    if (storedMode && storedMode !== currentMode) {
      console.log(`Real-time environment change detected: ${storedMode} → ${currentMode}`);
      clearEnvironmentSpecificData(storedMode, currentMode);
      localStorage.setItem(ENVIRONMENT_KEY, currentMode);
      
      // Only reload once, not in a loop - use a flag to prevent multiple reloads
      if (!sessionStorage.getItem('env_reload_pending')) {
        sessionStorage.setItem('env_reload_pending', '1');
        setTimeout(() => {
          sessionStorage.removeItem('env_reload_pending');
          window.location.reload();
        }, 500);
      }
    }
  }, 1000); // Check every second
};

export const stopEnvironmentMonitoring = () => {
  if (environmentCheckInterval) {
    clearInterval(environmentCheckInterval);
    environmentCheckInterval = null;
  }
};

const clearEnvironmentSpecificData = (oldMode: string | null, newMode: string) => {
  // Always clear these when switching modes
  const keysToAlwaysClear = [
    'licenseData',
    'licenseKey',
    'activationToken',
    'machineId',
    'licenseActivated',
  ];

  keysToAlwaysClear.forEach(key => {
    localStorage.removeItem(key);
  });

  // Dev-specific cleanup
  if (oldMode === 'prod' && newMode === 'dev') {
    localStorage.removeItem('requiresLicenseActivation');
    localStorage.removeItem('licenseRequired');
  }

  // Prod-specific cleanup
  if (oldMode === 'dev' && newMode === 'prod') {
    localStorage.removeItem('skipLicenseActivation');
  }

  // Clear auth state to force re-login
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('session');

  // Notify app to refresh
  window.dispatchEvent(new Event('environmentChanged'));
};

export const isEnvironmentValid = (): boolean => {
  if (typeof window === 'undefined') return true;

  const currentMode = getEnvironmentMode();
  const storedMode = localStorage.getItem(ENVIRONMENT_KEY);

  return storedMode === currentMode;
};
