/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/email-diagnostics
 * Inspects Supabase Auth and SMTP email delivery readiness and diagnostics.
 */

import { sendJsonResponse } from "../../auth-utils";
import { isSmtpConfigured, loadSmtpConfig, testSmtpConnection } from "../../email-service";
import { getPublicSupabaseKey, getSupabaseUrl } from "../../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  const supabaseUrl = getSupabaseUrl();
  const rawAnonKey = getPublicSupabaseKey();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

  const smtpCfg = loadSmtpConfig();
  const smtpConfigured = isSmtpConfigured();
  const explicitEmailUser =
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    (smtpConfigured ? smtpCfg.user : '');
  const emailPassConfigured = Boolean(smtpCfg.pass);

  // 1. Check Supabase Auth configuration passively via /auth/v1/settings (no spam OTP dispatch)
  let supabaseAuthStatus: {
    status: 'ok' | 'rate_limited' | 'error' | 'unreachable';
    code?: string;
    message?: string;
    httpStatus?: number;
    emailProviderEnabled?: boolean;
  } = { status: 'ok', message: 'Ready' };

  try {
    const headers: Record<string, string> = {};
    if (rawAnonKey) {
      headers.apikey = rawAnonKey;
    }
    const settingsRes = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
      method: 'GET',
      headers
    });

    if (settingsRes.ok) {
      const settingsJson = await settingsRes.json().catch(() => ({}));
      const emailEnabled = Boolean(settingsJson?.external?.email);
      supabaseAuthStatus = {
        status: emailEnabled ? 'ok' : 'error',
        httpStatus: settingsRes.status,
        emailProviderEnabled: emailEnabled,
        message: emailEnabled
          ? 'Supabase Auth endpoint is reachable and Email provider is enabled.'
          : 'Supabase Auth Email provider is disabled in Supabase Dashboard.'
      };
    } else if (settingsRes.status === 429) {
      supabaseAuthStatus = {
        status: 'rate_limited',
        code: 'over_email_send_rate_limit',
        httpStatus: 429,
        message: 'Supabase Auth rate limit reached.'
      };
    } else {
      const errBody = await settingsRes.json().catch(() => ({}));
      supabaseAuthStatus = {
        status: 'error',
        code: errBody?.error_code || 'auth_api_error',
        httpStatus: settingsRes.status,
        message: errBody?.msg || errBody?.message || `Supabase Auth returned HTTP ${settingsRes.status}`
      };
    }
  } catch (ex: any) {
    supabaseAuthStatus = {
      status: 'unreachable',
      message: ex?.message || 'Failed to contact Supabase Auth endpoint'
    };
  }

  // 2. Check SMTP configuration (env vars or saved server config)
  let smtpVerificationResult: any = {
    configured: smtpConfigured,
    verified: false,
    message: 'SMTP credentials not configured in environment'
  };

  if (smtpConfigured) {
    smtpVerificationResult = await testSmtpConnection();
  }

  // 3. Overall diagnosis and recommendations
  const missingEnvVars: string[] = [];
  if (!serviceKey) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!smtpConfigured) missingEnvVars.push('EMAIL_USER / EMAIL_PASS (or SMTP_USER / SMTP_PASS)');

  const canDeliverViaSmtp = Boolean(smtpVerificationResult?.success);
  const canSendPasswordResetViaFallback = Boolean(serviceKey && canDeliverViaSmtp);

  const recommendations: string[] = [];
  if (!canSendPasswordResetViaFallback) {
    recommendations.push(
      'For reliable Supabase password reset email delivery, configure Custom SMTP in Supabase Dashboard -> Authentication -> SMTP Settings.'
    );
  }
  if (!smtpConfigured) {
    recommendations.push(
      'To enable Nodemailer SMTP delivery from the Node/Vercel backend: Set EMAIL_USER and EMAIL_PASS (for Gmail, use a 16-character App Password) in environment variables.'
    );
  }
  if (!serviceKey) {
    recommendations.push(
      'To allow the backend /api/auth/forgot-password route to generate recovery links and fall back to Nodemailer SMTP when Supabase Auth mail fails, set SUPABASE_SERVICE_ROLE_KEY in environment variables.'
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
        user: explicitEmailUser
          ? `${explicitEmailUser.slice(0, 3)}••••@${explicitEmailUser.split('@')[1] || ''}`
          : null,
        passConfigured: emailPassConfigured,
        host: smtpCfg.host,
        port: smtpCfg.port,
        verification: smtpVerificationResult
      }
    },
    recommendations,
    statusSummary: {
      canDeliverViaSupabase: supabaseAuthStatus.status === 'ok',
      canDeliverViaSmtp,
      canSendPasswordResetViaFallback,
      missingEnvVars,
      fallbackModeActive: supabaseAuthStatus.status !== 'ok' && !canSendPasswordResetViaFallback
    }
  });
}
