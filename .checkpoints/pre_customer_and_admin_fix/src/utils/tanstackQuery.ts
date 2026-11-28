/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Official TanStack Query (React Query v5) Core Engine & Supabase Cache Strategy
 * 
 * Enforces specific, domain-tailored staleTime configurations:
 *  - FOOD_CATALOG: 2 minutes (120,000ms) - Dishes change infrequently
 *  - USER_ORDERS: 30 seconds (30,000ms) - Fast enough for active orders, stops redundant renders
 *  - ALL_ORDERS: 20 seconds (20,000ms) - Admin dashboard real-time pulse
 *  - APP_SETTINGS: 5 minutes (300,000ms) - Payment configs, banners, franchise settings
 *  - VERIFY_ORDER: 10 seconds (10,000ms) - Single order cloud confirmation
 */

import { QueryClient, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const STALE_TIMES = {
  /** Dishes & food items catalog - 5-minute cache for frequent GET requests unless invalidated by mutations */
  FOOD_CATALOG: 5 * 60 * 1000,
  /** User's personal order history - 30s stale window stops spamming when navigating back and forth */
  USER_ORDERS: 30 * 1000,
  /** Admin and SuperAdmin aggregated orders stream - 20s stale window */
  ALL_ORDERS: 20 * 1000,
  /** Administrative application settings (payment config, banners, franchise applications) - 5 minutes */
  APP_SETTINGS: 5 * 60 * 1000,
  /** Single order cloud confirmation check */
  VERIFY_ORDER: 10 * 1000,
  /** Payment gateway environment & credentials check - 1 minute */
  PAYMENT_STATUS: 60 * 1000,
  /** AI-generated food stories & culinary reviews - 24 hours */
  FOOD_STORY: 24 * 60 * 60 * 1000,
} as const;

export const QUERY_KEYS = {
  FOOD_ITEMS: ['supabase', 'food_items'] as const,
  USER_ORDERS: (phone?: string) => ['supabase', 'orders', 'user', phone || 'anonymous'] as const,
  ALL_ORDERS: ['supabase', 'orders', 'all'] as const,
  APP_SETTING: (key: string) => ['supabase', 'app_setting', key] as const,
  SINGLE_ORDER: (orderId: string | number) => ['supabase', 'orders', 'single', String(orderId)] as const,
  PAYMENT_STATUS: ['api', 'payment', 'phonepe', 'status'] as const,
  FOOD_STORY: (idOrName: string | number) => ['ai', 'food_story', String(idOrName)] as const,
} as const;

/**
 * Global TanStack QueryClient configured with anti-rate-limit defaults
 */
export const tanstackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.FOOD_CATALOG,
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention (formerly cacheTime in v4)
      refetchOnWindowFocus: false, // Prevents aggressive tab-switch refetches
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Invalidation helpers to ensure cache coherence on mutations
 */
export function invalidateFoodCatalog() {
  tanstackQueryClient.invalidateQueries({ queryKey: QUERY_KEYS.FOOD_ITEMS });
}

export function invalidateOrders() {
  tanstackQueryClient.invalidateQueries({ queryKey: ['supabase', 'orders'] });
}

export function invalidateAppSetting(key: string) {
  tanstackQueryClient.invalidateQueries({ queryKey: QUERY_KEYS.APP_SETTING(key) });
}

export { useQuery, useMutation, useQueryClient };
