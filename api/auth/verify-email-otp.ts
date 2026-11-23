/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/verify-email-otp
 * Verifies 6-digit Email OTP securely using Supabase Auth or cryptographic HMAC challenge tokens.
 * Strictly avoids any demo codes, testing OTPs, or login bypasses.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  verifyEmailOtpChallenge,
  createSignedSessionJwt,
  recordEmailOtpVerifyAttempt,
  fallbackCustomerAccounts
} from "../../lib/auth-utils";
import { getPublicSupabaseServerClient, getAdminSupabaseServerClient } from "../../src/utils/supabase/server";
import { logEmailOtpAttempt } from "../../src/services/supabaseEmailLogs";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { email, otp, challengeToken } = body || {};

    if (!email) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Email address is required."
      });
    }

    const cleanEmail = normalizeEmail(email);
    const inputCode = String(otp || '').trim();

    if (!inputCode || inputCode.length !== 6 || !/^\d{6}$/.test(inputCode)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please enter a valid 6-digit verification code."
      });
    }

    // Attempt rate limiting & lockout check
    const attemptCheck = recordEmailOtpVerifyAttempt(cleanEmail, false);
    if (!attemptCheck.allowed && attemptCheck.locked) {
      logEmailOtpAttempt({
        recipient: cleanEmail,
        flow: 'verifyOtp',
        status: 'rate_limited',
        error_details: attemptCheck.error || "Too many failed attempts. Verification temporarily locked."
      });

      return sendJsonResponse(res, 429, {
        success: false,
        error: attemptCheck.error || "Too many failed attempts. Verification temporarily locked."
      });
    }

    let isVerified = false;
    let isExpired = false;
    let verifiedProvider: 'supabase_auth' | 'hmac_challenge' | 'user_otps' = 'supabase_auth';
    let supabaseUserId = '';
    let registrationMeta: { fullName?: string; location?: string } = {};

    // 1. Verify directly via Supabase Auth verifyOtp (both signup and email token types)
    try {
      const publicSupabase = getPublicSupabaseServerClient();
      // First attempt type: 'signup' (used for customer signup and resend confirmation)
      let { data: sbData, error: sbError } = await publicSupabase.auth.verifyOtp({
        email: cleanEmail,
        token: inputCode,
        type: 'signup'
      });

      // If signup token did not match, attempt type: 'email' (magic link / email OTP)
      if (sbError || !sbData?.user) {
        const emailAttempt = await publicSupabase.auth.verifyOtp({
          email: cleanEmail,
          token: inputCode,
          type: 'email'
        });
        if (!emailAttempt.error && emailAttempt.data?.user) {
          sbData = emailAttempt.data;
          sbError = null;
        }
      }

      if (!sbError && sbData?.user) {
        isVerified = true;
        verifiedProvider = 'supabase_auth';
        supabaseUserId = sbData.user.id;
        if (sbData.user.user_metadata) {
          registrationMeta = {
            fullName: sbData.user.user_metadata.fullName,
            location: sbData.user.user_metadata.location
          };
        }
      } else if (sbError) {
        console.warn(`[Supabase verifyOtp notice]: ${sbError.message}`);
      }
    } catch (sbEx: any) {
      console.warn(`[Supabase Auth Verify Exception]:`, sbEx?.message || sbEx);
    }

    // 2. Verify via signed cryptographic HMAC challenge token (when SMTP was used)
    if (!isVerified && typeof challengeToken === 'string' && challengeToken.startsWith('emlotp_')) {
      const challengeCheck = verifyEmailOtpChallenge(challengeToken, cleanEmail, inputCode);
      if (challengeCheck.expired) {
        isExpired = true;
      } else if (challengeCheck.verified) {
        isVerified = true;
        verifiedProvider = 'hmac_challenge';
        if (challengeCheck.payload) {
          registrationMeta = {
            fullName: challengeCheck.payload.fullName || registrationMeta.fullName,
            location: challengeCheck.payload.location || registrationMeta.location
          };
        }
      }
    }

    // 3. Verify against Supabase user_otps database table
    if (!isVerified && !isExpired) {
      try {
        const { validateUserOtp } = await import("../../utils/supabase/otp");
        const dbCheck = await validateUserOtp({
          identifier: cleanEmail,
          otp: inputCode,
          purpose: "email_login"
        });

        if (dbCheck.valid) {
          isVerified = true;
          verifiedProvider = 'user_otps';
          if (dbCheck.metadata) {
            registrationMeta = {
              fullName: dbCheck.metadata.fullName || registrationMeta.fullName,
              location: dbCheck.metadata.location || registrationMeta.location
            };
          }
        } else if (dbCheck.expired) {
          isExpired = true;
        }
      } catch (dbErr: any) {
        console.warn("[user_otps validation notice]:", dbErr?.message || dbErr);
      }
    }

    // Expired OTP rejection
    if (isExpired) {
      const expErr = "The verification code has expired (5-minute validity). Please request a fresh OTP.";
      logEmailOtpAttempt({
        recipient: cleanEmail,
        flow: 'verifyOtp',
        status: 'expired',
        error_details: expErr
      });

      return sendJsonResponse(res, 400, {
        success: false,
        error: expErr
      });
    }

    // Invalid OTP rejection (Strict: No bypasses or demo codes allowed)
    if (!isVerified) {
      const invErr = attemptCheck.error || "Incorrect verification code. Please check your email and enter the valid 6-digit code.";
      logEmailOtpAttempt({
        recipient: cleanEmail,
        flow: 'verifyOtp',
        status: 'failed',
        error_details: invErr
      });

      return sendJsonResponse(res, 400, {
        success: false,
        error: invErr
      });
    }

    // Verification succeeded: Reset attempt tracking
    recordEmailOtpVerifyAttempt(cleanEmail, true);

    logEmailOtpAttempt({
      recipient: cleanEmail,
      flow: 'verifyOtp',
      status: 'verified',
      provider: verifiedProvider,
      metadata: {
        supabaseUserId: supabaseUserId || undefined,
        fullName: registrationMeta.fullName
      }
    });

    const customerId = supabaseUserId || `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const nowIso = new Date().toISOString();

    const profileRecord = {
      customer_id: customerId,
      full_name: registrationMeta.fullName || 'Valued Customer',
      email: cleanEmail,
      location: registrationMeta.location || 'Chirala',
      created_at: nowIso,
      updated_at: nowIso
    };

    // 4. Save Customer Profile in Supabase (upsert operation to prevent duplicates)
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        // Attempt upsert into public.customer_profiles
        const { error: upsertErr } = await adminClient
          .from('customer_profiles')
          .upsert([profileRecord], { onConflict: 'email' });

        if (upsertErr) {
          // If customer_profiles table does not exist in schema yet, persist in app_settings registry
          console.warn("[Customer Profile Supabase Notice]:", upsertErr.message);
          try {
            await adminClient
              .from('app_settings')
              .upsert([{
                key: `customer_profile_${cleanEmail}`,
                value: profileRecord,
                description: `Verified customer profile for ${cleanEmail}`,
                updated_at: nowIso
              }], { onConflict: 'key' });
          } catch {}
        }
      }
    } catch (dbErr: any) {
      console.warn("[Database Notice]:", dbErr?.message);
    }

    // Maintain in persistent memory cache
    const existing = fallbackCustomerAccounts.get(cleanEmail) || {};
    fallbackCustomerAccounts.set(cleanEmail, {
      ...existing,
      id: customerId,
      email: cleanEmail,
      name: profileRecord.full_name,
      location: profileRecord.location,
      isEmailVerified: true,
      updated_at: nowIso
    });

    // Issue signed session token with normal_user role
    const token = createSignedSessionJwt(customerId, 'normal_user', { 
      email: cleanEmail, 
      supabaseUserId 
    } as any);

    return sendJsonResponse(res, 200, {
      success: true,
      verified: true,
      token,
      customerId,
      email: cleanEmail,
      fullName: profileRecord.full_name,
      location: profileRecord.location,
      role: 'normal_user',
      message: "Email verification successful."
    });
  } catch (err: any) {
    console.error("[Verify Email OTP Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during OTP verification. Please try again."
    });
  }
}
