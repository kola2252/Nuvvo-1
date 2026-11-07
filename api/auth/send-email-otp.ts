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
  checkEmailOtpSendRateLimit
} from "../../lib/auth-utils";
import { sendEmailOtp, isSmtpConfigured } from "../../lib/email-service";
import { getPublicSupabaseServerClient } from "../../src/utils/supabase/server";

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

    // Rate Limiting: 60s cooldown and max 5 requests per 15 minutes per email
    const rateCheck = checkEmailOtpSendRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
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
      const { storeUserOtp } = await import("../../utils/supabase/otp");
      await storeUserOtp({
        identifier: cleanEmail,
        otp: generatedOtp,
        purpose: "email_login",
        expiresInSeconds: 300,
        metadata: {
          fullName: String(fullName).trim(),
          location: String(location).trim()
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
      } else {
        deliveryError = sbError.message;
        console.warn(`[Supabase Auth Notice] signInWithOtp message: ${sbError.message} (status: ${sbError.status})`);
      }
    } catch (sbEx: any) {
      deliveryError = sbEx?.message || "Supabase connection error";
      console.warn(`[Supabase Auth Exception]:`, deliveryError);
    }

    // 2. If Supabase did not deliver (or was rate-limited), dispatch via configured custom SMTP
    if (!emailDelivered && isSmtpConfigured()) {
      try {
        const emailResult = await sendEmailOtp(cleanEmail, generatedOtp, String(fullName).trim());
        if (emailResult.success) {
          emailDelivered = true;
          deliveryError = "";
        } else {
          deliveryError = emailResult.error || "SMTP delivery failed";
          console.warn(`[SMTP Warning] Custom SMTP delivery failed: ${emailResult.error}`);
        }
      } catch (smtpErr: any) {
        deliveryError = smtpErr?.message || "SMTP error";
        console.warn(`[SMTP Error]:`, deliveryError);
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

    // 4. Strict Failure: When no email could be dispatched, do NOT generate or return demo OTPs
    const errorMessage = deliveryError.toLowerCase().includes("rate limit")
      ? "Email sending limit reached on free-tier mailer (3/hr). Please configure Custom SMTP in your Supabase Dashboard or add EMAIL_USER and EMAIL_PASS to your Vercel Project Settings."
      : "Email delivery service is currently unavailable. Please ensure Custom SMTP is enabled in Supabase or EMAIL_USER/EMAIL_PASS are set in your Vercel environment.";

    return sendJsonResponse(res, 503, {
      success: false,
      error: errorMessage
    });
  } catch (err: any) {
    console.error("[Email OTP Serverless Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while dispatching verification email. Please try again."
    });
  }
}
