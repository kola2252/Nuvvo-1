/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Role-Based Access Control (RBAC) definitions and helpers for Nuvvo.
 * All actual administrative identity verification occurs securely on the server.
 * The client only receives the verified role ('normal_user' | 'admin' | 'super_admin').
 */

export type AppUserRole = 'normal_user' | 'admin' | 'super_admin' | 'Customer' | 'Delivery Partner' | 'Franchise' | 'Admin' | 'Super Admin';

/**
 * Checks if the role represents an authorized Admin or Super Admin.
 */
export function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]/g, '');
  // Explicitly deny any access to Customer, Delivery Partner/Rider, Franchise, or normal_user
  if (
    normalized.includes('customer') ||
    normalized.includes('delivery') ||
    normalized.includes('rider') ||
    normalized.includes('partner') ||
    normalized.includes('franchise') ||
    normalized === 'normaluser'
  ) {
    return false;
  }
  return normalized === 'admin' || normalized === 'superadmin';
}

/**
 * Checks if the role represents an authorized Super Admin.
 */
export function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]/g, '');
  // Explicitly deny any access to Customer, Delivery Partner/Rider, Franchise, or normal_user
  if (
    normalized.includes('customer') ||
    normalized.includes('delivery') ||
    normalized.includes('rider') ||
    normalized.includes('partner') ||
    normalized.includes('franchise') ||
    normalized === 'normaluser'
  ) {
    return false;
  }
  return normalized === 'superadmin';
}

/**
 * Normalizes any phone number string for formatting (stripping spaces, dashes, etc.)
 */
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Master administrator authorized phone number.
 * Exclusively 9063692135 possesses Admin and Super Admin access.
 */
export const AUTHORIZED_ADMIN_PHONE = '9063692135';
export const ADMIN_MASTER_PIN = '2135';

export function isAuthorizedAdminPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = normalizePhoneNumber(phone);
  return digits === AUTHORIZED_ADMIN_PHONE || digits === `91${AUTHORIZED_ADMIN_PHONE}` || digits.endsWith(AUTHORIZED_ADMIN_PHONE);
}

