/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Customer-Namespaced Client Storage Utility
 * Ensures cart, orders, addresses, favorites, points, wallet, cards, UPIs,
 * and referral state are strictly isolated per authenticated customer userId
 * on shared devices and cleanly wiped on logout or account switch.
 */

const PREFIX = 'nuvvo_cust_';

const LEGACY_UNSCOPED_KEYS = [
  'nuvvo_orders',
  'nuvvo_address',
  'nuvvo_fav_foods',
  'nuvvo_fav_rests',
  'nuvvo_points',
  'nuvvo_points_history',
  'nuvvo_wallet_balance',
  'nuvvo_wallet_history',
  'nuvvo_referral_credits',
  'nuvvo_referral_code',
  'nuvvo_applied_referral_code',
  'nuvvo_referred_friends',
  'nuvvo_daily_pts_ts',
  'nuvvo_saved_cards',
  'nuvvo_saved_upis',
  'nuvvo_applied_coupon',
  'nuvvo_cart',
  'nuvvo_user',
  'nuvvo_auth_token'
];

export function getCustomerScopedKey(userId: string | undefined | null, key: string): string | null {
  const cleanId = String(userId || '').trim();
  if (!cleanId) return null;
  return `${PREFIX}${cleanId}_${key}`;
}

export function getUserScopedItem<T>(
  userId: string | undefined | null,
  key: string,
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback;
  const scopedKey = getCustomerScopedKey(userId, key);
  if (!scopedKey) return fallback;

  try {
    const raw = window.localStorage.getItem(scopedKey);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setUserScopedItem(
  userId: string | undefined | null,
  key: string,
  value: any
): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getCustomerScopedKey(userId, key);
  if (!scopedKey) return;

  try {
    if (value === undefined || value === null) {
      window.localStorage.removeItem(scopedKey);
    } else {
      window.localStorage.setItem(scopedKey, JSON.stringify(value));
    }
  } catch {}
}

export function removeUserScopedItem(
  userId: string | undefined | null,
  key: string
): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getCustomerScopedKey(userId, key);
  if (!scopedKey) return;

  try {
    window.localStorage.removeItem(scopedKey);
  } catch {}
}

/**
 * Clears all unscoped legacy keys that could bleed between customers on a device.
 */
export function clearUnscopedLegacyCustomerCache(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const k of LEGACY_UNSCOPED_KEYS) {
        storage.removeItem(k);
      }
      // Also clear older phone-keyed daily points timestamps
      for (const k of Object.keys(storage)) {
        if (k.startsWith('nuvvo_daily_pts_ts_')) {
          storage.removeItem(k);
        }
      }
    }
  } catch {}
}

/**
 * Clears cached customer data on this device.
 * When userId is passed, clears only that customer's scoped entries; otherwise clears all scoped entries.
 */
export function clearCustomerScopedCache(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const cleanId = userId ? String(userId).trim() : '';
  const exactPrefix = cleanId ? `${PREFIX}${cleanId}_` : PREFIX;

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const k of Object.keys(storage)) {
        if (k.startsWith(exactPrefix)) {
          storage.removeItem(k);
        }
      }
    }
  } catch {}
}
