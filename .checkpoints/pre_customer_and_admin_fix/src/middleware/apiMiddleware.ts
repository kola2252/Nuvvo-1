/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Express API Interceptor Middleware:
 * 1. Intercepts all /api/* requests to measure response times (duration_ms) and status codes.
 * 2. Computes rolling error rates and persists structured telemetry to Supabase `public.api_logs`
 *    using a non-blocking, batched writer with automatic circuit-breaking if the table is unmigrated.
 * 3. Implements a 5-minute (300,000ms) in-memory cache for frequent GET requests to reduce external
 *    database and service load, with automatic cache invalidation on POST/PUT/PATCH/DELETE mutations.
 */

import type { Request, Response, NextFunction } from 'express';
import { getAdminSupabaseServerClient } from '../utils/supabase/server';

export const FIVE_MINUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)

export interface ApiLogRecord {
  id?: string;
  method: string;
  endpoint: string;
  status_code: number;
  duration_ms: number;
  is_error: boolean;
  error_rate: number;
  cache_hit: boolean;
  error_message?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  created_at: string;
}

interface CacheEntry {
  statusCode: number;
  body: any;
  timestamp: number;
  headers?: Record<string, string>;
}

// 5-Minute GET Response Cache Store
const getResponseCache = new Map<string, CacheEntry>();

// Rolling metrics & in-memory log ring buffer
let totalRequestsCount = 0;
let totalErrorsCount = 0;
let totalCacheHitsCount = 0;
let totalDurationMs = 0;

const recentApiLogs: ApiLogRecord[] = [];
const MAX_IN_MEMORY_LOGS = 200;

// Batched queue for non-blocking Supabase `api_logs` persistence
const pendingSupabaseLogs: ApiLogRecord[] = [];
const BATCH_FLUSH_INTERVAL_MS = 30_000; // Flush at most once every 30s to prevent rate limits
const MAX_BATCH_SIZE = 25;
let supabaseLogsPausedUntil = 0;
let isFlushingLogs = false;

// Endpoints excluded from GET caching (SSE streams, live health, diagnostics)
const NON_CACHEABLE_PREFIXES = [
  '/api/catalog/stream',
  '/api/catalog/events',
  '/api/catalog/live',
  '/api/health',
  '/api/admin/api-logs',
  '/api/admin/diagnostics',
  '/api/payment/phonepe/verify',
  '/api/payment/phonepe/callback'
];

// Frequent GET prefixes eligible for the 5-minute cache
// Note: Customer-scoped /api/orders is intentionally excluded so responses never leak across users.
const CACHEABLE_GET_PREFIXES = [
  '/api/dishes',
  '/api/food-items',
  '/api/restaurants',
  '/api/hotels',
  '/api/settings',
  '/api/payment/phonepe/status'
];

function isCacheableGetRequest(req: Request): boolean {
  if (req.method.toUpperCase() !== 'GET') return false;
  const path = req.path || req.originalUrl.split('?')[0];

  if (req.query?.force === 'true' || req.query?.refresh === 'true' || req.query?.nocache === 'true') {
    return false;
  }

  for (const excluded of NON_CACHEABLE_PREFIXES) {
    if (path.startsWith(excluded)) return false;
  }

  for (const prefix of CACHEABLE_GET_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Invalidates relevant GET cache entries when a mutation (POST/PUT/PATCH/DELETE) occurs
 */
export function invalidateServerGetCache(mutatedPath?: string) {
  if (!mutatedPath) {
    getResponseCache.clear();
    return;
  }

  if (mutatedPath.includes('dish') || mutatedPath.includes('food')) {
    for (const key of getResponseCache.keys()) {
      if (key.includes('/api/dishes') || key.includes('/api/food-items')) {
        getResponseCache.delete(key);
      }
    }
  } else if (mutatedPath.includes('restaurant') || mutatedPath.includes('hotel')) {
    for (const key of getResponseCache.keys()) {
      if (key.includes('/api/restaurants') || key.includes('/api/hotels')) {
        getResponseCache.delete(key);
      }
    }
  } else if (mutatedPath.includes('order') || mutatedPath.includes('payment')) {
    for (const key of getResponseCache.keys()) {
      if (key.includes('/api/orders')) {
        getResponseCache.delete(key);
      }
    }
  } else if (mutatedPath.includes('setting')) {
    for (const key of getResponseCache.keys()) {
      if (key.includes('/api/settings')) {
        getResponseCache.delete(key);
      }
    }
  } else {
    getResponseCache.clear();
  }
}

/**
 * Flushes queued API logs to the Supabase `public.api_logs` table in a single batch
 */
export async function flushApiLogsToSupabase(): Promise<void> {
  if (isFlushingLogs || pendingSupabaseLogs.length === 0) return;
  if (Date.now() < supabaseLogsPausedUntil) {
    // Discard queued items while circuit breaker is open so memory stays bounded
    pendingSupabaseLogs.length = 0;
    return;
  }

  isFlushingLogs = true;
  const batch = pendingSupabaseLogs.splice(0, MAX_BATCH_SIZE);

  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return;

    const { error } = await client.from('api_logs').insert(batch);

    if (error) {
      // If table `api_logs` does not exist yet (PGRST205 / 42P01) or RLS blocks it,
      // pause Supabase log writes for 10 minutes to avoid generating noisy error traffic.
      if (
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        error.code === '42501' ||
        String(error.message || '').includes('api_logs')
      ) {
        supabaseLogsPausedUntil = Date.now() + 10 * 60 * 1000;
      }
    }
  } catch {
    supabaseLogsPausedUntil = Date.now() + 5 * 60 * 1000;
  } finally {
    isFlushingLogs = false;
  }
}

// Periodic background flush every 30 seconds
const flushInterval = setInterval(() => {
  flushApiLogsToSupabase().catch(() => {});
}, BATCH_FLUSH_INTERVAL_MS);

if (typeof (flushInterval as any).unref === 'function') {
  (flushInterval as any).unref();
}

/**
 * Records an API log entry in memory and queues it for Supabase `api_logs` persistence
 */
export function recordApiLog(entry: Omit<ApiLogRecord, 'error_rate' | 'created_at'> & { created_at?: string }) {
  totalRequestsCount += 1;
  if (entry.is_error) {
    totalErrorsCount += 1;
  }
  if (entry.cache_hit) {
    totalCacheHitsCount += 1;
  }
  totalDurationMs += entry.duration_ms;

  const currentErrorRate = totalRequestsCount > 0
    ? Number(((totalErrorsCount / totalRequestsCount) * 100).toFixed(2))
    : 0;

  const fullRecord: ApiLogRecord = {
    ...entry,
    error_rate: currentErrorRate,
    created_at: entry.created_at || new Date().toISOString()
  };

  recentApiLogs.unshift(fullRecord);
  if (recentApiLogs.length > MAX_IN_MEMORY_LOGS) {
    recentApiLogs.pop();
  }

  if (Date.now() >= supabaseLogsPausedUntil) {
    pendingSupabaseLogs.push(fullRecord);
    if (pendingSupabaseLogs.length >= MAX_BATCH_SIZE) {
      flushApiLogsToSupabase().catch(() => {});
    }
  }
}

/**
 * Returns live API telemetry, response time averages, cache hit ratio, and error rates
 */
export function getApiTelemetrySummary() {
  const errorRate = totalRequestsCount > 0
    ? Number(((totalErrorsCount / totalRequestsCount) * 100).toFixed(2))
    : 0;
  const avgResponseTimeMs = totalRequestsCount > 0
    ? Number((totalDurationMs / totalRequestsCount).toFixed(2))
    : 0;
  const cacheHitRate = totalRequestsCount > 0
    ? Number(((totalCacheHitsCount / totalRequestsCount) * 100).toFixed(2))
    : 0;

  return {
    totalRequests: totalRequestsCount,
    totalErrors: totalErrorsCount,
    errorRatePercent: errorRate,
    avgResponseTimeMs,
    totalCacheHits: totalCacheHitsCount,
    cacheHitRatePercent: cacheHitRate,
    cachedEndpointsCount: getResponseCache.size,
    cacheTtlMs: FIVE_MINUTE_CACHE_TTL_MS,
    recentLogs: recentApiLogs.slice(0, 50)
  };
}

/**
 * Express Middleware:
 * - Intercepts all `/api/*` requests
 * - Serves frequent GET requests from a 5-minute in-memory cache
 * - Invalidates cache on mutating requests
 * - Tracks response times and error rates in Supabase `api_logs`
 */
export function apiInterceptorMiddleware(req: Request, res: Response, next: NextFunction) {
  const url = req.originalUrl || req.url || '';
  if (!url.startsWith('/api')) {
    return next();
  }

  const pathOnly = (req.path || url.split('?')[0]).replace(/\/+$/, '') || '/api';

  // Skip SSE stream connections from response wrapping
  for (const streamPrefix of ['/api/catalog/stream', '/api/catalog/events', '/api/catalog/live']) {
    if (pathOnly.startsWith(streamPrefix)) {
      return next();
    }
  }

  const startTime = Date.now();
  const method = req.method.toUpperCase();
  const cacheKey = `${method}:${url}`;

  // 1. Check 5-Minute GET Cache for frequent read endpoints
  if (isCacheableGetRequest(req)) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FIVE_MINUTE_CACHE_TTL_MS) {
      const durationMs = Date.now() - startTime;
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Age-Sec', String(Math.floor((Date.now() - cached.timestamp) / 1000)));

      if (!pathOnly.startsWith('/api/admin/api-logs')) {
        recordApiLog({
          method,
          endpoint: pathOnly,
          status_code: cached.statusCode,
          duration_ms: durationMs,
          is_error: false,
          cache_hit: true,
          client_ip: req.ip || null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 120) || null
        });
      }

      return res.status(cached.statusCode).json(cached.body);
    }
  }

  // 2. Intercept `res.json` to capture response payload for caching and error message logging
  const originalJson = res.json.bind(res);
  let capturedBody: any = undefined;

  res.json = function (body: any): Response {
    capturedBody = body;

    // Cache successful GET responses for 5 minutes
    if (isCacheableGetRequest(req) && res.statusCode >= 200 && res.statusCode < 300) {
      getResponseCache.set(cacheKey, {
        statusCode: res.statusCode,
        body,
        timestamp: Date.now()
      });
      res.setHeader('X-Cache', 'MISS');
    } else if (method !== 'GET' && method !== 'OPTIONS' && res.statusCode >= 200 && res.statusCode < 400) {
      // Automatically invalidate matching GET caches on successful mutations
      invalidateServerGetCache(pathOnly);
    }

    return originalJson(body);
  };

  // 3. Log response time and error rate once response finishes
  res.on('finish', () => {
    if (pathOnly.startsWith('/api/admin/api-logs')) return;

    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode || 200;
    const isError = statusCode >= 400;
    const errorMsg = isError && capturedBody && typeof capturedBody === 'object'
      ? String(capturedBody.error || capturedBody.message || `HTTP ${statusCode}`)
      : (isError ? `HTTP ${statusCode}` : null);

    recordApiLog({
      method,
      endpoint: pathOnly,
      status_code: statusCode,
      duration_ms: durationMs,
      is_error: isError,
      cache_hit: false,
      error_message: errorMsg,
      client_ip: req.ip || null,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 120) || null
    });
  });

  next();
}
