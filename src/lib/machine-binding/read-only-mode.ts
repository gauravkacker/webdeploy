/**
 * Read-Only Mode
 * Manages read-only mode state when license expires
 */

export interface ReadOnlyModeState {
  isReadOnly: boolean;
  reason: string | null;
  activatedAt: Date | null;
}

// Global read-only mode state
let readOnlyModeState: ReadOnlyModeState = {
  isReadOnly: false,
  reason: null,
  activatedAt: null,
};

/**
 * Activate read-only mode
 * 
 * @param reason - Reason for activating read-only mode
 */
export function activateReadOnlyMode(reason: string): void {
  readOnlyModeState = {
    isReadOnly: true,
    reason,
    activatedAt: new Date(),
  };
}

/**
 * Deactivate read-only mode
 */
export function deactivateReadOnlyMode(): void {
  readOnlyModeState = {
    isReadOnly: false,
    reason: null,
    activatedAt: null,
  };
}

/**
 * Check if read-only mode is active
 * 
 * @returns True if read-only mode is active
 */
export function isReadOnlyMode(): boolean {
  return readOnlyModeState.isReadOnly;
}

/**
 * Get read-only mode state
 * 
 * @returns Current read-only mode state
 */
export function getReadOnlyModeState(): ReadOnlyModeState {
  return { ...readOnlyModeState };
}

/**
 * Check if operation is allowed in read-only mode
 * 
 * @param operation - Operation type ('read' | 'write' | 'export')
 * @returns True if operation is allowed
 */
export function isOperationAllowed(operation: 'read' | 'write' | 'export'): boolean {
  if (!readOnlyModeState.isReadOnly) {
    return true; // All operations allowed when not in read-only mode
  }

  // In read-only mode, only read and export operations are allowed
  return operation === 'read' || operation === 'export';
}

/**
 * Get read-only mode message
 * 
 * @returns Message explaining read-only mode
 */
export function getReadOnlyMessage(): string | null {
  if (!readOnlyModeState.isReadOnly) {
    return null;
  }

  return readOnlyModeState.reason || 'Application is in read-only mode';
}
