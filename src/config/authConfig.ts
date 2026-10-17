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
  return normalized === 'admin' || normalized === 'superadmin';
}

/**
 * Checks if the role represents an authorized Super Admin.
 */
export function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]/g, '');
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
 * Backward compatibility stub for cached client modules.
 * Note: Administrative authorization is strictly verified on the backend.
 */
export const AUTHORIZED_ADMIN_PHONE = '';
export function isAuthorizedAdminPhone(_phone?: string | null): boolean {
  return false;
}

