/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Lightweight, high-performance Request Memoization & Stale-Time Query Client
 * Inspired by TanStack / React Query caching architecture.
 * 
 * Features:
 *  - In-flight request deduplication: Concurrent callers share the single pending promise.
 *  - Stale-while-revalidate: Returns instant cached data while transparently revalidating in background.
 *  - Configurable staleTime and cacheTime (TTL).
 *  - Window focus refetching with automatic throttle (prevents tab-switch rate-limit spikes).
 *  - Circuit breaker / Rate-limit (429) protection: Gracefully shields the server and returns stale data.
 *  - Optional localStorage persistence for expensive AI generation (e.g. food stories).
 *  - Full TypeScript safety and React 19 compatibility.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFrequencyMonitor } from './apiLogger';

export const FIVE_MINUTE_CACHE_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)

export type QueryKey = string | readonly unknown[] | (string | number | boolean | null | undefined)[];

export interface QueryEntry<T = any> {
  data: T;
  timestamp: number;
  error: Error | null;
  promise?: Promise<T>;
}

export interface QueryOptions<T = any> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number; // ms during which data is considered fresh (default 60,000ms = 1m)
  cacheTime?: number; // ms to keep inactive data in memory (default 300,000ms = 5m)
  refetchOnWindowFocus?: boolean;
  focusThrottleTime?: number; // ms minimum wait between focus-triggered refetches (default 30,000ms)
  enabled?: boolean;
  persistKey?: string; // Optional localStorage key to persist cached data across sessions
  retry?: number;
  retryDelay?: number;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  refetch: (force?: boolean) => Promise<T | undefined>;
}

export function normalizeKey(key: QueryKey): string {
  if (typeof key === 'string') return key;
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

class QueryClientImpl {
  private cache = new Map<string, QueryEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private listeners = new Map<string, Set<() => void>>();
  private lastFocusRefetch = new Map<string, number>();
  private rateLimitedEndpoints = new Map<string, number>(); // endpoint -> cooldown expiry timestamp

  constructor() {
    if (typeof window !== 'undefined') {
      // Clean expired items periodically (every 2 minutes)
      setInterval(() => this.cleanup(), 120_000);
    }
  }

  /**
   * Checks if an endpoint or key is currently in rate-limit cooldown
   */
  public isRateLimited(key: string): boolean {
    const cooldownUntil = this.rateLimitedEndpoints.get(key);
    if (!cooldownUntil) return false;
    if (Date.now() > cooldownUntil) {
      this.rateLimitedEndpoints.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Sets rate limit cooldown for an endpoint/key (e.g. 30 seconds)
   */
  public recordRateLimit(key: string, cooldownMs: number = 30_000) {
    this.rateLimitedEndpoints.set(key, Date.now() + cooldownMs);
    console.warn(`[QueryCache] Endpoint "${key}" entered rate-limit backoff for ${cooldownMs / 1000}s`);
  }

  /**
   * Retrieves data directly from cache without triggering a fetch
   */
  public getQueryData<T>(queryKey: QueryKey): T | undefined {
    const key = normalizeKey(queryKey);
    const entry = this.cache.get(key);
    if (entry && entry.data !== undefined) {
      return entry.data as T;
    }
    return undefined;
  }

  /**
   * Manually seeds or mutates data in the cache and notifies active subscribers
   */
  public setQueryData<T>(queryKey: QueryKey, data: T | ((prev: T | undefined) => T), persistKey?: string): T {
    const key = normalizeKey(queryKey);
    const prev = this.getQueryData<T>(queryKey);
    const nextData = typeof data === 'function' ? (data as any)(prev) : data;

    this.cache.set(key, {
      data: nextData,
      timestamp: Date.now(),
      error: null
    });

    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(persistKey, JSON.stringify({ data: nextData, timestamp: Date.now() }));
      } catch {}
    }

    this.notify(key);
    return nextData;
  }

  /**
   * Checks if a cached entry is stale based on staleTime
   */
  public isStale(queryKey: QueryKey, staleTime: number = 60_000): boolean {
    const key = normalizeKey(queryKey);
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > staleTime;
  }

  /**
   * Primary fetch query method with memoization, in-flight deduplication, and stale-time check
   */
  public async fetchQuery<T>(options: {
    queryKey: QueryKey;
    queryFn: () => Promise<T>;
    staleTime?: number;
    persistKey?: string;
    force?: boolean;
    retry?: number;
  }): Promise<T> {
    const key = normalizeKey(options.queryKey);
    const staleTime = options.staleTime ?? 60_000;
    const force = options.force ?? false;
    const retryCount = options.retry ?? 1;

    // Check localStorage persistence if in-memory cache is empty
    if (!this.cache.has(key) && options.persistKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(options.persistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.data !== undefined) {
            this.cache.set(key, {
              data: parsed.data,
              timestamp: parsed.timestamp || Date.now(),
              error: null
            });
          }
        }
      } catch {}
    }

    const existing = this.cache.get(key);

    // 1. Fresh Cache Hit (Within staleTime and not forced)
    if (!force && existing && Date.now() - existing.timestamp < staleTime) {
      return existing.data as T;
    }

    // 2. In-Flight Request Deduplication: Return existing promise if request is already active
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    // 3. Rate Limit Protection: If throttled and we have cached data, return stale data safely
    if (this.isRateLimited(key)) {
      if (existing && existing.data !== undefined) {
        console.warn(`[QueryCache] Returning cached data for rate-limited query "${key}"`);
        return existing.data as T;
      }
    }

    // 4. Execute Fetch
    const fetchPromise = (async () => {
      let attempts = 0;
      let lastErr: any = null;

      while (attempts <= retryCount) {
        try {
          const result = await options.queryFn();

          // Store successful result in cache
          this.cache.set(key, {
            data: result,
            timestamp: Date.now(),
            error: null
          });

          // Optional persistent storage
          if (options.persistKey && typeof window !== 'undefined') {
            try {
              localStorage.setItem(options.persistKey, JSON.stringify({ data: result, timestamp: Date.now() }));
            } catch {}
          }

          this.notify(key);
          return result;
        } catch (err: any) {
          lastErr = err;
          attempts++;

          // Check if rate limited (429 or RESOURCE_EXHAUSTED)
          const isRateLimit = String(err?.message || err).includes('429') ||
                              String(err?.message || err).includes('Rate exceeded') ||
                              String(err?.message || err).includes('RESOURCE_EXHAUSTED');
          if (isRateLimit) {
            this.recordRateLimit(key, 30_000);
            if (existing && existing.data !== undefined) {
              return existing.data as T;
            }
          }

          if (attempts <= retryCount) {
            await new Promise(r => setTimeout(r, 800 * attempts));
          }
        }
      }

      // If all attempts failed, check if we can fall back to existing cached data
      if (existing && existing.data !== undefined) {
        console.warn(`[QueryCache] Query "${key}" failed, falling back to cached stale data:`, lastErr?.message);
        return existing.data as T;
      }

      const finalError = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      this.cache.set(key, {
        data: existing?.data,
        timestamp: Date.now(),
        error: finalError
      });
      this.notify(key);
      throw finalError;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Invalidates cached entries matching a key or prefix pattern
   */
  public invalidateQueries(keyOrPrefix: QueryKey | string) {
    const search = normalizeKey(keyOrPrefix);
    const isExact = search.endsWith('"') || !search.startsWith('[');

    for (const [k, entry] of this.cache.entries()) {
      if (k === search || (!isExact && k.startsWith(search.slice(0, -1)))) {
        // Mark as immediately stale
        entry.timestamp = 0;
        this.notify(k);
      }
    }
  }

  /**
   * Subscribes a callback to cache updates for a given key
   */
  public subscribe(queryKey: QueryKey, callback: () => void): () => void {
    const key = normalizeKey(queryKey);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const set = this.listeners.get(key)!;
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  private notify(key: string) {
    const set = this.listeners.get(key);
    if (set) {
      set.forEach(cb => {
        try { cb(); } catch {}
      });
    }
  }

  /**
   * Focus refetch throttle check
   */
  public shouldRefetchOnFocus(key: string, throttleTime: number = 30_000): boolean {
    const last = this.lastFocusRefetch.get(key) || 0;
    const now = Date.now();
    if (now - last > throttleTime) {
      this.lastFocusRefetch.set(key, now);
      return true;
    }
    return false;
  }

  private cleanup() {
    const now = Date.now();
    const maxAge = 600_000; // 10 minutes default cache purge for unpinned data
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAge && (!this.listeners.get(k) || this.listeners.get(k)!.size === 0)) {
        this.cache.delete(k);
      }
    }
  }

  public clear() {
    this.cache.clear();
    this.inFlight.clear();
    this.rateLimitedEndpoints.clear();
  }
}

export const queryClient = new QueryClientImpl();

/**
 * Universal cached fetch helper that provides automatic request memoization,
 * in-flight deduplication, 5-minute default GET caching, and response-time/error-rate logging.
 */
export async function fetchWithCache<T = any>(
  url: string,
  options?: RequestInit,
  config?: {
    staleTime?: number;
    cacheKey?: string;
    force?: boolean;
    retry?: number;
  }
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const caller = apiFrequencyMonitor.extractCaller();
  const startTime = Date.now();

  // Non-GET requests (mutations) bypass cache by default
  if (!isGet) {
    try {
      const res = await fetch(url, options);
      const durationMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        apiFrequencyMonitor.recordRequest(url, method, caller, {
          durationMs,
          statusCode: res.status,
          isError: true,
          cacheHit: false,
          errorMessage: errText
        });
        throw new Error(`Request failed (${res.status}): ${errText}`);
      }
      apiFrequencyMonitor.recordRequest(url, method, caller, {
        durationMs,
        statusCode: res.status,
        isError: false,
        cacheHit: false
      });
      return res.json() as Promise<T>;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      apiFrequencyMonitor.recordRequest(url, method, caller, {
        durationMs,
        statusCode: 500,
        isError: true,
        cacheHit: false,
        errorMessage: err?.message || 'Network error'
      });
      throw err;
    }
  }

  const queryKey = config?.cacheKey || `fetch_${url}`;
  const staleTime = config?.staleTime ?? FIVE_MINUTE_CACHE_MS; // Default 5-minute cache for frequent GET requests
  const existingData = !config?.force ? queryClient.getQueryData<T>(queryKey) : undefined;
  let wasNetworkFetched = false;

  const result = await queryClient.fetchQuery<T>({
    queryKey,
    queryFn: async () => {
      wasNetworkFetched = true;
      const netStart = Date.now();
      const res = await fetch(url, options);
      const durationMs = Date.now() - netStart;

      if (res.status === 429) {
        queryClient.recordRateLimit(queryKey, 30_000);
        apiFrequencyMonitor.recordRequest(url, method, caller, {
          durationMs,
          statusCode: 429,
          isError: true,
          cacheHit: false,
          errorMessage: '429 Rate exceeded: cooldown initiated'
        });
        throw new Error('429 Rate exceeded: cooldown initiated');
      }
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        apiFrequencyMonitor.recordRequest(url, method, caller, {
          durationMs,
          statusCode: res.status,
          isError: true,
          cacheHit: false,
          errorMessage: text
        });
        throw new Error(`Fetch error (${res.status}): ${text}`);
      }

      const isServerCacheHit = res.headers.get('X-Cache') === 'HIT';
      apiFrequencyMonitor.recordRequest(url, method, caller, {
        durationMs,
        statusCode: res.status,
        isError: false,
        cacheHit: isServerCacheHit
      });
      return res.json();
    },
    staleTime,
    force: config?.force ?? false,
    retry: config?.retry ?? 1
  });

  if (!wasNetworkFetched && existingData !== undefined) {
    apiFrequencyMonitor.recordRequest(url, method, caller, {
      durationMs: Date.now() - startTime,
      statusCode: 200,
      isError: false,
      cacheHit: true
    });
  }

  return result;
}

/**
 * React Hook implementing React Query's stale-time caching strategy.
 */
export function useQuery<T = any>(options: QueryOptions<T>): QueryResult<T> {
  const {
    queryKey,
    queryFn,
    staleTime = 60_000,
    refetchOnWindowFocus = true,
    focusThrottleTime = 30_000,
    enabled = true,
    persistKey,
    retry = 1
  } = options;

  const key = normalizeKey(queryKey);
  const initialCached = queryClient.getQueryData<T>(queryKey);

  const [data, setData] = useState<T | undefined>(initialCached);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached && enabled);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const executeFetch = useCallback(async (force: boolean = false): Promise<T | undefined> => {
    if (!enabled) return undefined;

    setIsFetching(true);
    try {
      const result = await queryClient.fetchQuery<T>({
        queryKey,
        queryFn: queryFnRef.current,
        staleTime,
        persistKey,
        force,
        retry
      });
      setData(result);
      setError(null);
      return result;
    } catch (err: any) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      return undefined;
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [key, enabled, staleTime, persistKey, retry]);

  // Subscribe to external cache updates
  useEffect(() => {
    const unsubscribe = queryClient.subscribe(queryKey, () => {
      const updated = queryClient.getQueryData<T>(queryKey);
      if (updated !== undefined) {
        setData(updated);
      }
    });
    return unsubscribe;
  }, [key]);

  // Initial fetch and stale check
  useEffect(() => {
    if (!enabled) return;

    const isStale = queryClient.isStale(queryKey, staleTime);
    if (!initialCached || isStale) {
      executeFetch(isStale && !initialCached);
    }
  }, [key, enabled, staleTime, executeFetch]);

  // Window Focus Revalidation with Throttle
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) return;

    const onFocus = () => {
      if (document.visibilityState === 'visible' && queryClient.shouldRefetchOnFocus(key, focusThrottleTime)) {
        if (queryClient.isStale(queryKey, staleTime)) {
          executeFetch(false);
        }
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [key, enabled, refetchOnWindowFocus, focusThrottleTime, staleTime, executeFetch]);

  return {
    data,
    error,
    isLoading,
    isFetching,
    isStale: queryClient.isStale(queryKey, staleTime),
    refetch: (force = true) => executeFetch(force)
  };
}
