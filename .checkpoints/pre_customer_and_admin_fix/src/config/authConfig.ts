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
 * Normalizes administrator mobile numbers (handles +91, 91, 091, 0 prefixes) to 10 digits.
 */
export function normalizeAdminPhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * Incremental input sanitizer for #admin-phone-input that lets users type or paste
 * formats with +91, 91, 091, 0091, or 0 country prefixes cleanly without leaking numbers.
 */
export function normalizeAdminPhoneInput(value: string): string {
  const raw = String(value || '').replace(/\D/g, '');
  if (raw.startsWith('0091')) {
    return raw.length >= 14 ? raw.slice(4, 14) : raw;
  }
  if (raw.startsWith('091')) {
    return raw.length >= 13 ? raw.slice(3, 13) : raw;
  }
  if (raw.startsWith('91')) {
    return raw.length >= 12 ? raw.slice(2, 12) : raw;
  }
  if (raw.startsWith('0')) {
    return raw.length >= 11 ? raw.slice(1, 11) : raw;
  }
  return raw.slice(0, 10);
}

/**
 * Returns the active stored auth token from either localStorage or sessionStorage.
 */
export function getStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      window.localStorage.getItem('nuvvo_auth_token') ||
      window.sessionStorage.getItem('nuvvo_auth_token') ||
      ''
    );
  } catch {
    return '';
  }
}

/**
 * Checks whether the browser currently holds an unexpired server-issued Admin/Super-Admin
 * JWT token (`nuvvo_jwt_*`). Cryptographic signature verification occurs strictly on the backend.
 */
export function hasActiveAdminJwtSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = getStoredAuthToken();
    if (!token.startsWith('nuvvo_jwt_')) return false;
    const raw = token.slice('nuvvo_jwt_'.length);
    const dotIdx = raw.lastIndexOf('.');
    if (dotIdx <= 0) return false;
    const payloadB64 = raw.slice(0, dotIdx).replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadB64.length % 4 === 0 ? '' : '='.repeat(4 - (payloadB64.length % 4));
    const parsed = JSON.parse(atob(payloadB64 + pad));
    const role = parsed?.role;
    const exp = Number(parsed?.exp || 0);
    return (role === 'admin' || role === 'super_admin') && exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Legacy helper alias: never compares hardcoded phone numbers in client code;
 * strictly reflects an active server-verified Admin/Super-Admin JWT session.
 */
export function isAuthorizedAdminPhone(_phone?: string | null): boolean {
  return hasActiveAdminJwtSession();
}

