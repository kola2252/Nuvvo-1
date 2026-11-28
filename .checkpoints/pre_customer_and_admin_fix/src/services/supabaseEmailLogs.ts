/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Email Logs Service
 * 
 * Provides unified, non-blocking telemetry logging for all OTP email attempts:
 * - signInWithOtp (dispatch, resend, rate limits, SMTP fallbacks)
 * - verifyOtp (verification checks, invalid codes, expired tokens, successes)
 * 
 * Persists to Supabase `public.email_logs` table with non-blocking async execution,
 * circuit-breaker protection (PGRST205 tolerance), and an in-memory buffer for instant inspection.
 */

import { supabase } from '../utils/supabase/client';

export type EmailOtpFlow = 'signInWithOtp' | 'verifyOtp';
export type EmailOtpStatus = 'initiated' | 'sent' | 'verified' | 'failed' | 'rate_limited' | 'expired';
export type EmailOtpProvider = 'supabase_auth' | 'smtp' | 'client_auth' | 'server' | 'user_otps' | 'hmac_challenge';

export interface EmailLogEntry {
  id?: string;
  recipient: string;
  flow: EmailOtpFlow;
  status: EmailOtpStatus;
  provider?: EmailOtpProvider;
  error_details?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
}

// In-memory buffer for fast inspection and offline/circuit-breaker fallback
const MAX_BUFFERED_LOGS = 100;
const memoryLogs: EmailLogEntry[] = [];

// Circuit breaker state for Supabase table availability
let supabasePausedUntil = 0;
let tableMissingWarned = false;

/**
 * Normalizes email address for consistent tracking
 */
export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Logs an OTP email attempt (both signInWithOtp and verifyOtp).
 * Executes asynchronously in the background so it never blocks or slows down authentication.
 */
export async function logEmailOtpAttempt(entry: {
  recipient: string;
  flow: EmailOtpFlow;
  status: EmailOtpStatus;
  provider?: EmailOtpProvider;
  error_details?: string | Error | null;
  metadata?: Record<string, any>;
  client?: any; // optional custom client (e.g. server-side client)
}): Promise<EmailLogEntry> {
  const cleanRecipient = normalizeEmail(entry.recipient);
  const nowIso = new Date().toISOString();

  const formattedError = entry.error_details
    ? typeof entry.error_details === 'string'
      ? entry.error_details.slice(0, 500)
      : (entry.error_details.message || String(entry.error_details)).slice(0, 500)
    : null;

  const record: EmailLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    recipient: cleanRecipient,
    flow: entry.flow,
    status: entry.status,
    provider: entry.provider || 'supabase_auth',
    error_details: formattedError,
    metadata: entry.metadata || {},
    created_at: nowIso,
  };

  // 1. Maintain in-memory ring buffer (most recent first)
  memoryLogs.unshift(record);
  if (memoryLogs.length > MAX_BUFFERED_LOGS) {
    memoryLogs.pop();
  }

  // 2. Asynchronous write to Supabase public.email_logs table
  if (Date.now() >= supabasePausedUntil) {
    const activeClient = entry.client || supabase;
    (async () => {
      try {
        const payload = {
          recipient: record.recipient,
          flow: record.flow,
          status: record.status,
          provider: record.provider,
          error_details: record.error_details,
          metadata: record.metadata,
          created_at: record.created_at,
        };

        const { error } = await activeClient.from('email_logs').insert([payload]);

        if (error) {
          // If table public.email_logs does not exist yet (PGRST205 / 42P01) or RLS restriction:
          const isTableMissing =
            error.code === 'PGRST205' ||
            error.code === '42P01' ||
            String(error.message || '').includes('email_logs');

          if (isTableMissing) {
            // Pause remote writes for 5 minutes to avoid repeated database error logs
            supabasePausedUntil = Date.now() + 5 * 60 * 1000;
            if (!tableMissingWarned) {
              console.warn(
                '[Supabase email_logs Notice]: Table "public.email_logs" is pending migration in Supabase project. Logs are safely stored in-memory buffer.'
              );
              tableMissingWarned = true;
            }
          } else {
            console.warn('[email_logs insert notice]:', error.message);
          }
        }
      } catch (err: any) {
        // Silently swallow network errors so user auth is never disrupted
        supabasePausedUntil = Date.now() + 60 * 1000;
      }
    })().catch(() => {});
  }

  return record;
}

/**
 * Retrieves recent email logs, querying Supabase public.email_logs with fallback to memory buffer.
 */
export async function getRecentEmailLogs(options?: {
  recipient?: string;
  limit?: number;
  client?: any;
}): Promise<{ logs: EmailLogEntry[]; source: 'supabase' | 'memory'; count: number }> {
  const limit = Math.min(options?.limit || 50, 100);
  const activeClient = options?.client || supabase;
  const filterRecipient = options?.recipient ? normalizeEmail(options.recipient) : null;

  // Try querying Supabase if circuit breaker is not paused
  if (Date.now() >= supabasePausedUntil) {
    try {
      let query = activeClient
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filterRecipient) {
        query = query.eq('recipient', filterRecipient);
      }

      const { data, error } = await query;

      if (!error && Array.isArray(data)) {
        return {
          logs: data,
          source: 'supabase',
          count: data.length,
        };
      }
    } catch {
      // Fall through to memory buffer
    }
  }

  // Fallback to memory logs
  const filtered = filterRecipient
    ? memoryLogs.filter((l) => l.recipient === filterRecipient)
    : memoryLogs;

  const sliced = filtered.slice(0, limit);
  return {
    logs: sliced,
    source: 'memory',
    count: sliced.length,
  };
}
