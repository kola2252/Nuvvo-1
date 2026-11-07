/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/email-diagnostics
 * Inspects Supabase Auth and SMTP email delivery readiness and diagnostics.
 */

import { sendJsonResponse } from "../../lib/auth-utils";
import { isSmtpConfigured, testSmtpConnection } from "../../lib/email-service";
import { getPublicSupabaseServerClient, getSupabaseUrl } from "../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  const supabaseUrl = getSupabaseUrl();
  const rawAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const emailPassConfigured = Boolean(process.env.EMAIL_PASS || process.env.SMTP_PASS);
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 465;

  // 1. Check Supabase Auth configuration
  let supabaseAuthStatus: {
    status: 'ok' | 'rate_limited' | 'error' | 'unreachable';
    code?: string;
    message?: string;
    httpStatus?: number;
  } = { status: 'ok', message: 'Ready' };

  try {
    const publicClient = getPublicSupabaseServerClient();
    // Test a dummy probe to test API connectivity
    const probeEmail = 'probe_test_nuvvo@gmail.com';
    const { error: sbError } = await publicClient.auth.signInWithOtp({
      email: probeEmail,
      options: { shouldCreateUser: true }
    });

    if (sbError) {
      if (sbError.status === 429 || sbError.message.toLowerCase().includes('rate limit')) {
        supabaseAuthStatus = {
          status: 'rate_limited',
          code: (sbError as any).code || 'over_email_send_rate_limit',
          httpStatus: 429,
          message: 'Supabase free email rate limit exceeded (3-4 emails/hour limit on Supabase default mail server).'
        };
      } else {
        supabaseAuthStatus = {
          status: 'error',
          code: (sbError as any).code || 'auth_api_error',
          httpStatus: sbError.status,
          message: sbError.message
        };
      }
    } else {
      supabaseAuthStatus = {
        status: 'ok',
        message: 'Supabase Auth responded successfully.'
      };
    }
  } catch (ex: any) {
    supabaseAuthStatus = {
      status: 'unreachable',
      message: ex?.message || 'Failed to contact Supabase Auth endpoint'
    };
  }

  // 2. Check SMTP configuration
  const smtpConfigured = isSmtpConfigured();
  let smtpVerificationResult: any = {
    configured: smtpConfigured,
    verified: false,
    message: 'SMTP credentials not configured in environment'
  };

  if (smtpConfigured) {
    smtpVerificationResult = await testSmtpConnection();
  }

  // 3. Overall diagnosis and recommendations
  const recommendations: string[] = [];
  if (supabaseAuthStatus.status === 'rate_limited') {
    recommendations.push(
      "Supabase default mailer has reached its free tier rate limit (3 emails/hr). Configure Custom SMTP in your Supabase Dashboard: Go to Authentication -> Providers -> Email -> Enable Custom SMTP."
    );
  }
  if (!smtpConfigured) {
    recommendations.push(
      "To enable reliable server-side email OTP delivery directly from Vercel/Node: Add EMAIL_USER and EMAIL_PASS to your Vercel Project Settings -> Environment Variables. (For Gmail, use a 16-character App Password)."
    );
  }

  return sendJsonResponse(res, 200, {
    success: true,
    timestamp: new Date().toISOString(),
    environment: {
      supabase: {
        url: supabaseUrl,
        anonKeyConfigured: Boolean(rawAnonKey),
        serviceRoleKeyConfigured: Boolean(serviceKey),
        authStatus: supabaseAuthStatus
      },
      smtp: {
        configured: smtpConfigured,
        user: emailUser ? `${emailUser.slice(0, 3)}••••@${emailUser.split('@')[1] || ''}` : null,
        passConfigured: emailPassConfigured,
        host: smtpHost,
        port: smtpPort,
        verification: smtpVerificationResult
      }
    },
    recommendations,
    statusSummary: {
      canDeliverViaSupabase: supabaseAuthStatus.status === 'ok',
      canDeliverViaSmtp: Boolean(smtpVerificationResult?.success),
      fallbackModeActive: supabaseAuthStatus.status !== 'ok' && !smtpVerificationResult?.success
    }
  });
}
