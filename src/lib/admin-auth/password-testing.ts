// Testing utilities for admin password management
// These are only used in tests and should not be imported in production code

import { DEFAULT_ADMIN_PASSWORD_HASH } from './admin-credentials';

let currentPasswordHash = DEFAULT_ADMIN_PASSWORD_HASH;

export function getCurrentPasswordHashForTesting(): string {
  return currentPasswordHash;
}

export function resetPasswordHashForTesting(): void {
  currentPasswordHash = DEFAULT_ADMIN_PASSWORD_HASH;
}

export function setPasswordHashForTesting(hash: string): void {
  currentPasswordHash = hash;
}
