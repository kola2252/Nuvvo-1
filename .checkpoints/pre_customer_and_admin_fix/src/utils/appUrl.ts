/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const CANONICAL_PRODUCTION_URL = 'https://nuvvo-1-nu.vercel.app';

const OUTDATED_OR_INVALID_HOSTS = new Set([
  'nuvvo-1-nandu-tech.vercel.app',
  'nuvvo.app',
  'www.nuvvo.app',
]);

/**
 * Resolves the safe client-side application origin:
 * - Native Capacitor APK WebView (`capacitor://`, `ionic://`, or portless `https://localhost`) -> CANONICAL_PRODUCTION_URL
 * - Outdated / retired domain aliases -> CANONICAL_PRODUCTION_URL
 * - Vercel production, Vercel preview, AI Studio dev, and local dev (e.g. `localhost:3000`) -> preserves active origin
 */
export function getClientAppOrigin(): string {
  if (typeof window === 'undefined') {
    return CANONICAL_PRODUCTION_URL;
  }

  try {
    const { protocol, hostname, port, origin } = window.location;
    const lowerHost = (hostname || '').toLowerCase();
    const isCapacitorNative =
      Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) ||
      protocol === 'capacitor:' ||
      protocol === 'ionic:' ||
      protocol === 'file:' ||
      (protocol === 'https:' && lowerHost === 'localhost' && !port);

    if (isCapacitorNative) {
      return CANONICAL_PRODUCTION_URL;
    }

    if (
      OUTDATED_OR_INVALID_HOSTS.has(lowerHost) ||
      lowerHost.endsWith('.nuvvo-1-nandu-tech.vercel.app')
    ) {
      return CANONICAL_PRODUCTION_URL;
    }

    if (origin && (origin.startsWith('https://') || origin.startsWith('http://'))) {
      return origin.replace(/\/+$/, '');
    }
  } catch {
    // Fallback cleanly to canonical production domain
  }

  return CANONICAL_PRODUCTION_URL;
}

export function getClientRecoveryRedirectUrl(): string {
  return `${getClientAppOrigin()}/?type=recovery`;
}
