/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/reset-password
 * Handles Customer Forgot Password flow with verified Email OTP.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  hashPassword,
  verifyEmailOtpChallenge,
  createSignedSessionJwt,
  fallbackCustomerAccounts
} from "../../lib/auth-utils";
import { getAdminSupabaseServerClient, getPublicSupabaseServerClient } from "../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { email, otp, challengeToken, newPassword, confirmPassword } = body || {};

    if (!email) {
      return sendJsonResponse(res, 400, { success: false, error: "Email address is required." });
    }

    const cleanEmail = normalizeEmail(email);
    const inputCode = String(otp || '').trim();

    if (!inputCode || inputCode.length < 6) {
      return sendJsonResponse(res, 400, { success: false, error: "Please enter the 6-digit verification code sent to your email." });
    }

    const cleanPassword = String(newPassword || '');
    if (!cleanPassword || cleanPassword.length < 6) {
      return sendJsonResponse(res, 400, { success: false, error: "New password must be at least 6 characters in length." });
    }

    if (confirmPassword !== undefined && cleanPassword !== String(confirmPassword)) {
      return sendJsonResponse(res, 400, { success: false, error: "New password and Confirm Password do not match." });
    }

    let isVerified = false;
    let isExpired = false;

    // 1. Verify directly via Supabase Auth
    try {
      const publicSupabase = getPublicSupabaseServerClient();
      const { data: sbData, error: sbError } = await publicSupabase.auth.verifyOtp({
        email: cleanEmail,
        token: inputCode,
        type: 'email'
      });

      if (!sbError && sbData?.user) {
        isVerified = true;
      }
    } catch {}

    // 2. Verify via challenge token
    if (!isVerified && typeof challengeToken === 'string' && challengeToken.startsWith('emlotp_')) {
      const challengeCheck = verifyEmailOtpChallenge(challengeToken, cleanEmail, inputCode);
      if (challengeCheck.expired) {
        isExpired = true;
      } else if (challengeCheck.verified) {
        isVerified = true;
      }
    }

    if (isExpired) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Verification code has expired. Please request a new OTP."
      });
    }

    if (!isVerified) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Incorrect verification code. Please check your email and enter the valid 6-digit code."
      });
    }

    // Hash new password securely with PBKDF2
    const passwordHash = hashPassword(cleanPassword);

    // Retrieve existing customer account to preserve profile data
    let accountRecord: any = null;
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { data } = await adminClient
          .from('app_settings')
          .select('value')
          .eq('key', `account_${cleanEmail}`)
          .maybeSingle();

        if (data && data.value) {
          accountRecord = data.value;
        }
      }
    } catch {}

    if (!accountRecord) {
      accountRecord = fallbackCustomerAccounts.get(cleanEmail) || null;
    }

    if (!accountRecord) {
      return sendJsonResponse(res, 404, {
        success: false,
        error: "No customer account found for this email address. Please register for a new account."
      });
    }

    // Update password hash and timestamp
    accountRecord.password_hash = passwordHash;
    accountRecord.updated_at = new Date().toISOString();

    // Persist in Supabase app_settings
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        await adminClient
          .from('app_settings')
          .upsert([{
            key: `account_${cleanEmail}`,
            value: accountRecord,
            description: `Customer account credentials for ${cleanEmail}`,
            updated_at: new Date().toISOString()
          }], { onConflict: 'key' });
      }
    } catch (err: any) {
      console.warn("[Password Reset Database Notice]:", err?.message);
    }

    // Update fallback memory container
    fallbackCustomerAccounts.set(cleanEmail, accountRecord);

    // Issue signed session token
    const token = createSignedSessionJwt(accountRecord.id || `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`, 'normal_user', {
      email: cleanEmail,
      username: accountRecord.username
    });

    const safeUser = { ...accountRecord };
    delete safeUser.password_hash;

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      user: safeUser,
      message: "Password reset successfully. You are now logged in."
    });
  } catch (err: any) {
    console.error("[Reset Password Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while resetting password. Please try again."
    });
  }
}
