/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Browser API Request Frequency Logger & Middleware
 * Intercepts and monitors outgoing API calls in development/preview to track request frequency,
 * identify components making excessive calls, and prevent rate limits.
 */

import { supabase } from './supabase/client';

export interface RequestRecord {
  url: string;
  method: string;
  caller: string;
  timestamp: number;
  durationMs: number;
  statusCode: number;
  isError: boolean;
  cacheHit: boolean;
  errorMessage?: string;
}

export interface EndpointStats {
  endpoint: string;
  method: string;
  totalCalls: number;
  errorCalls: number;
  cacheHits: number;
  totalDurationMs: number;
  avgDurationMs: number;
  errorRatePercent: number;
  callsDuringAppLoad: number; // First 6 seconds of app lifecycle
  lastCalledAt: number;
  recentCalls5s: number;
  recentCalls30s: number;
  callers: Record<string, number>;
}

export interface SupabaseApiLogRow {
  method: string;
  endpoint: string;
  status_code: number;
  duration_ms: number;
  is_error: boolean;
  error_rate: number;
  cache_hit: boolean;
  error_message?: string | null;
  created_at: string;
}

class ApiFrequencyMonitor {
  private history: RequestRecord[] = [];
  private stats = new Map<string, EndpointStats>();
  private appStartTime = Date.now();
  private isInstalled = false;
  private appLoadWindowMs = 6000;
  private hasReportedAppLoad = false;

  // Batched buffer for Supabase `api_logs` table persistence
  private pendingSupabaseLogs: SupabaseApiLogRow[] = [];
  private supabasePausedUntil = 0;
  private isFlushing = false;

  /**
   * Initializes the API telemetry monitor in browser environments
   * (Does NOT mutate native window.fetch to preserve sandboxed iframe compatibility)
   */
  public install() {
    if (this.isInstalled || typeof window === 'undefined') return;
    this.isInstalled = true;
    this.appStartTime = Date.now();

    // Attach developer inspection utilities to window safely
    (window as any).__nuvvoApiRequestStats = () => this.getReport();
    (window as any).__getApiFrequencyReport = () => {
      console.log('%c📊 [Nuvvo API Frequency & Response Time Report]', 'color: #3b82f6; font-weight: bold; font-size: 13px;');
      console.table(this.getReport());
      return this.stats;
    };

    // Flush queued logs to Supabase `api_logs` every 30 seconds
    setInterval(() => {
      this.flushToSupabase().catch(() => {});
    }, 30_000);
  }

  /**
   * Extracts the initiating component or module from the JavaScript call stack
   */
  public extractCaller(): string {
    try {
      const stack = new Error().stack || '';
      const lines = stack.split('\n');

      for (const line of lines) {
        if (
          line.includes('/src/') && 
          !line.includes('apiLogger') && 
          !line.includes('apiCache')
        ) {
          const match = line.match(/(?:src\/|\/)([a-zA-Z0-9_\-\/]+\.(?:tsx|ts|js|jsx)):?(\d+)?/);
          if (match) {
            const file = match[1];
            const lineNum = match[2] ? `:${match[2]}` : '';
            return `${file}${lineNum}`;
          }
        }
      }
    } catch {}
    return 'Anonymous / Context';
  }

  /**
   * Records a request along with its response time (durationMs), status code, error state,
   * and queues a record for the Supabase `api_logs` table.
   */
  public recordRequest(
    rawUrl: string,
    method: string,
    caller: string,
    options?: {
      durationMs?: number;
      statusCode?: number;
      isError?: boolean;
      cacheHit?: boolean;
      errorMessage?: string;
    }
  ) {
    const now = Date.now();
    const cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '') || rawUrl;
    const upperMethod = (method || 'GET').toUpperCase();
    const key = `${upperMethod} ${cleanUrl}`;

    const durationMs = Math.max(0, Math.round(options?.durationMs ?? 0));
    const statusCode = options?.statusCode ?? 200;
    const isError = options?.isError ?? statusCode >= 400;
    const cacheHit = options?.cacheHit ?? false;

    const record: RequestRecord = {
      url: cleanUrl,
      method: upperMethod,
      caller,
      timestamp: now,
      durationMs,
      statusCode,
      isError,
      cacheHit,
      errorMessage: options?.errorMessage
    };
    this.history.push(record);

    if (this.history.length > 200) {
      this.history.shift();
    }

    let item = this.stats.get(key);
    if (!item) {
      item = {
        endpoint: cleanUrl,
        method: upperMethod,
        totalCalls: 0,
        errorCalls: 0,
        cacheHits: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        errorRatePercent: 0,
        callsDuringAppLoad: 0,
        lastCalledAt: now,
        recentCalls5s: 0,
        recentCalls30s: 0,
        callers: {}
      };
      this.stats.set(key, item);
    }

    item.totalCalls += 1;
    if (isError) item.errorCalls += 1;
    if (cacheHit) item.cacheHits += 1;
    item.totalDurationMs += durationMs;
    item.avgDurationMs = Math.round(item.totalDurationMs / item.totalCalls);
    item.errorRatePercent = Number(((item.errorCalls / item.totalCalls) * 100).toFixed(2));
    item.lastCalledAt = now;
    item.callers[caller] = (item.callers[caller] || 0) + 1;

    if (now - this.appStartTime <= this.appLoadWindowMs) {
      item.callsDuringAppLoad += 1;
    }

    const callsInLast5s = this.history.filter(
      r => r.url === cleanUrl && r.method === upperMethod && now - r.timestamp <= 5000
    ).length;
    const callsInLast30s = this.history.filter(
      r => r.url === cleanUrl && r.method === upperMethod && now - r.timestamp <= 30000
    ).length;

    item.recentCalls5s = callsInLast5s;
    item.recentCalls30s = callsInLast30s;

    // Queue log entry for Supabase `api_logs` table (avoid logging /api/* calls twice since Express middleware already logs /api/*)
    if (!cleanUrl.startsWith('/api/') && !cleanUrl.includes('api_logs') && Date.now() >= this.supabasePausedUntil) {
      this.pendingSupabaseLogs.push({
        method: upperMethod,
        endpoint: cleanUrl,
        status_code: statusCode,
        duration_ms: durationMs,
        is_error: isError,
        error_rate: item.errorRatePercent,
        cache_hit: cacheHit,
        error_message: options?.errorMessage || null,
        created_at: new Date(now).toISOString()
      });

      if (this.pendingSupabaseLogs.length >= 20) {
        this.flushToSupabase().catch(() => {});
      }
    }
  }

  /**
   * Flushes buffered client logs to Supabase `api_logs` table with circuit breaker safety
   */
  public async flushToSupabase(): Promise<void> {
    if (this.isFlushing || this.pendingSupabaseLogs.length === 0) return;
    if (Date.now() < this.supabasePausedUntil) {
      this.pendingSupabaseLogs.length = 0;
      return;
    }

    this.isFlushing = true;
    const batch = this.pendingSupabaseLogs.splice(0, 20);

    try {
      const { error } = await supabase.from('api_logs').insert(batch);
      if (error) {
        // Pause client-side api_logs writes for 10m if table is unmigrated or RLS restricted
        this.supabasePausedUntil = Date.now() + 10 * 60 * 1000;
      }
    } catch {
      this.supabasePausedUntil = Date.now() + 10 * 60 * 1000;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Generates a clean tabular summary of endpoint call frequencies, response times, and error rates
   */
  public getReport(): any[] {
    const report: any[] = [];
    const now = Date.now();

    for (const item of this.stats.values()) {
      let topCaller = 'N/A';
      let maxCount = 0;
      for (const [caller, count] of Object.entries(item.callers)) {
        if (count > maxCount) {
          maxCount = count;
          topCaller = `${caller} (${count}x)`;
        }
      }

      report.push({
        'Method': item.method,
        'Endpoint': item.endpoint,
        'Total Calls': item.totalCalls,
        'Cache Hits': item.cacheHits,
        'Avg Time (ms)': `${item.avgDurationMs}ms`,
        'Error Rate': `${item.errorRatePercent}%`,
        'Last 5s': item.recentCalls5s,
        'Status': item.errorRatePercent > 10 ? '❌ High Errors' : (item.recentCalls5s >= 4 ? '⚠️ High Frequency' : '✅ Optimal'),
        'Primary Caller': topCaller,
        'Secs Since Last': ((now - item.lastCalledAt) / 1000).toFixed(1) + 's'
      });
    }

    return report.sort((a, b) => b['Total Calls'] - a['Total Calls']);
  }
}

export const apiFrequencyMonitor = new ApiFrequencyMonitor();

// Automatically install in browser environments
if (typeof window !== 'undefined') {
  apiFrequencyMonitor.install();
}
