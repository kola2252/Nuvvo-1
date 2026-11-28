/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/send-email-otp
 * Dispatches a real, cryptographically secure 6-digit Email OTP for customer registration & login.
 * Strictly avoids any demo codes, testing OTPs, or bypass mechanisms.
 */

import crypto from "crypto";
import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  generateEmailOtpChallenge,
  checkEmailOtpSendRateLimit,
  emailOtpSendHistory
} from "../../auth-utils";
import { sendEmailOtp, isSmtpConfigured } from "../../email-service";
import { getPublicSupabaseServerClient } from "../../../src/utils/supabase/server";
import { logEmailOtpAttempt } from "../../../src/services/supabaseEmailLogs";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { email, fullName, location } = body || {};

    if (!email) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Email address is required."
      });
    }

    const cleanEmail = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please provide a valid email address (e.g., name@example.com)."
      });
    }

    if (!fullName || String(fullName).trim().length < 2) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Full name is required (at least 2 characters)."
      });
    }

    if (!location || String(location).trim().length < 2) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please provide your location / delivery area."
      });
    }

    // Extract retry_count if provided from client resend attempts
    const clientRetryCount = typeof body?.retry_count === "number" ? body.retry_count : (typeof body?.retryCount === "number" ? body.retryCount : 0);
    const retry_count = clientRetryCount > 0 ? clientRetryCount : ((emailOtpSendHistory.get(cleanEmail)?.count || 1) - 1);

    // Rate Limiting: 30s cooldown and max 8 requests per 15 minutes per email
    const rateCheck = checkEmailOtpSendRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
      logEmailOtpAttempt({
        recipient: cleanEmail,
        flow: 'signInWithOtp',
        status: 'rate_limited',
        provider: 'supabase_auth',
        error_details: rateCheck.error || "Rate limit exceeded",
        metadata: { retry_count }
      });

      return sendJsonResponse(res, 429, {
        success: false,
        error: rateCheck.error || "Too many OTP requests. Please wait before requesting another code."
      });
    }

    // Generate secure random 6-digit OTP (100000 - 999999)
    const generatedOtp = String(crypto.randomInt(100000, 1000000));
    
    // Create HMAC-signed challenge token with 5-minute expiry
    const { challengeToken } = generateEmailOtpChallenge(cleanEmail, generatedOtp, {
      fullName: String(fullName).trim(),
      location: String(location).trim()
    });

    // Store in Supabase user_otps table for persistent database verification
    try {
      const { storeUserOtp } = await import("../../../utils/supabase/otp");
      await storeUserOtp({
        identifier: cleanEmail,
        otp: generatedOtp,
        purpose: "email_login",
        expiresInSeconds: 300,
        metadata: {
          fullName: String(fullName).trim(),
          location: String(location).trim(),
          retry_count: retry_count
        }
      });
    } catch (storeErr: any) {
      console.warn("[user_otps notice]:", storeErr?.message || storeErr);
    }

    let emailDelivered = false;
    let deliveryError = "";

    // 1. Dispatch real Email OTP via Supabase Auth
    try {
      const publicSupabase = getPublicSupabaseServerClient();
      const { error: sbError } = await publicSupabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          data: {
            fullName: String(fullName).trim(),
            location: String(location).trim()
          }
        }
      });

      if (!sbError) {
        emailDelivered = true;
        logEmailOtpAttempt({
          recipient: cleanEmail,
          flow: 'signInWithOtp',
          status: 'sent',
          provider: 'supabase_auth',
          metadata: { fullName: String(fullName).trim(), location: String(location).trim(), retry_count }
        });
      } else {
        console.warn(`[Supabase Auth Notice] signInWithOtp message: ${sbError.message} (status: ${sbError.status}). Activating Supabase Auth registration confirmation pipeline...`);
        
        // GoTrue signInWithOtp may fail on some projects if the Magic Link email template is unconfigured.
        // Fallback to Supabase Auth's active confirmation pipeline (signUp / resend signup), which dispatches real emails directly to the customer.
        const tempPassword = `NuvvoAuth#${crypto.randomBytes(8).toString('hex')}!`;
        const { data: signUpData, error: signUpError } = await publicSupabase.auth.signUp({
          email: cleanEmail,
          password: tempPassword,
          options: {
            data: {
              fullName: String(fullName).trim(),
              location: String(location).trim()
            }
          }
        });

        const isNewUser = Boolean(!signUpError && signUpData?.user?.identities && signUpData.user.identities.length > 0);
        if (isNewUser) {
          emailDelivered = true;
          deliveryError = "";
          logEmailOtpAttempt({
            recipient: cleanEmail,
            flow: 'signInWithOtp',
            status: 'sent',
            provider: 'supabase_auth',
            metadata: { method: 'signUp', fullName: String(fullName).trim(), location: String(location).trim(), retry_count }
          });
        } else {
          // If user already exists in auth.users, dispatch a fresh confirmation code via resend()
          const { error: resendError } = await publicSupabase.auth.resend({
            type: 'signup',
            email: cleanEmail
          });

          if (!resendError) {
            emailDelivered = true;
            deliveryError = "";
            logEmailOtpAttempt({
              recipient: cleanEmail,
              flow: 'signInWithOtp',
              status: 'sent',
              provider: 'supabase_auth',
              metadata: { method: 'resend_signup', fullName: String(fullName).trim(), location: String(location).trim(), retry_count }
            });
          } else {
            deliveryError = resendError.message || signUpError?.message || sbError.message;
            console.warn(`[Supabase Auth Resend Notice]: ${resendError.message}`);
          }
        }
      }
    } catch (sbEx: any) {
      deliveryError = sbEx?.message || "Supabase connection error";
      console.warn(`[Supabase Auth Exception]:`, deliveryError);
      logEmailOtpAttempt({
        recipient: cleanEmail,
        flow: 'signInWithOtp',
        status: 'failed',
        provider: 'supabase_auth',
        error_details: deliveryError,
        metadata: { retry_count }
      });
    }

    // 2. If Supabase did not deliver (or was rate-limited), dispatch via configured custom SMTP
    if (!emailDelivered && isSmtpConfigured()) {
      try {
        const emailResult = await sendEmailOtp(cleanEmail, generatedOtp, String(fullName).trim());
        if (emailResult.success) {
          emailDelivered = true;
          deliveryError = "";
          logEmailOtpAttempt({
            recipient: cleanEmail,
            flow: 'signInWithOtp',
            status: 'sent',
            provider: 'smtp',
            metadata: { fullName: String(fullName).trim(), location: String(location).trim(), retry_count }
          });
        } else {
          deliveryError = emailResult.error || "SMTP delivery failed";
          console.warn(`[SMTP Warning] Custom SMTP delivery failed: ${emailResult.error}`);
          logEmailOtpAttempt({
            recipient: cleanEmail,
            flow: 'signInWithOtp',
            status: 'failed',
            provider: 'smtp',
            error_details: deliveryError,
            metadata: { retry_count }
          });
        }
      } catch (smtpErr: any) {
        deliveryError = smtpErr?.message || "SMTP error";
        console.warn(`[SMTP Error]:`, deliveryError);
        logEmailOtpAttempt({
          recipient: cleanEmail,
          flow: 'signInWithOtp',
          status: 'failed',
          provider: 'smtp',
          error_details: deliveryError,
          metadata: { retry_count }
        });
      }
    }

    // 3. Confirm real email delivery
    if (emailDelivered) {
      return sendJsonResponse(res, 200, {
        success: true,
        message: `A 6-digit verification code has been dispatched to ${cleanEmail}. Please enter the code below (valid for 5 minutes).`,
        challengeToken,
        expiresInSeconds: 300
      });
    }

    // 4. If email delivery failed, return clean error message (no dashboard template instructions to user)
    const finalErr = deliveryError
      ? `Email delivery failed: ${deliveryError}. Please verify your email address or retry.`
      : "Failed to dispatch verification email. Please check your email and try again.";

    logEmailOtpAttempt({
      recipient: cleanEmail,
      flow: 'signInWithOtp',
      status: 'failed',
      error_details: finalErr,
      metadata: { retry_count }
    });

    return sendJsonResponse(res, 400, {
      success: false,
      error: finalErr
    });
  } catch (err: any) {
    console.error("[Email OTP Serverless Error]:", err?.message || err);
    logEmailOtpAttempt({
      recipient: req?.body?.email || 'unknown',
      flow: 'signInWithOtp',
      status: 'failed',
      error_details: err?.message || 'Server error during OTP send'
    });
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while dispatching verification email. Please try again."
    });
  }
}
