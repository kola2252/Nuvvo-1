/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/verify-db-otp
 * Validates a user-supplied OTP against the Supabase `user_otps` table.
 */

import { parseRequestBody, sendJsonResponse, createSignedSessionJwt, normalizeEmail } from "../../auth-utils";
import { validateUserOtp } from "../../../utils/supabase/otp";

export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed. Use POST." });
  }

  try {
    const body = await parseRequestBody(req);
    const { identifier, otp, purpose = "login" } = body || {};

    if (!identifier || !otp) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Identifier (email or mobile number) and OTP code are required."
      });
    }

    const cleanIdentifier = String(identifier).trim();
    const cleanOtp = String(otp).trim();

    const result = await validateUserOtp({
      identifier: cleanIdentifier,
      otp: cleanOtp,
      purpose
    });

    if (!result.valid) {
      return sendJsonResponse(res, 400, {
        success: false,
        expired: result.expired,
        consumed: result.consumed,
        exceededAttempts: result.exceededAttempts,
        remainingAttempts: result.remainingAttempts,
        error: result.error || "Invalid verification code."
      });
    }

    // Determine role and issue session token
    const isEmail = cleanIdentifier.includes("@");
    const role = "normal_user";
    const sub = isEmail ? `usr_${cleanIdentifier.replace(/[^a-z0-9]/g, "_")}` : cleanIdentifier;

    const token = createSignedSessionJwt(sub, role, {
      email: isEmail ? cleanIdentifier : undefined,
      phone: !isEmail ? cleanIdentifier : undefined
    });

    return sendJsonResponse(res, 200, {
      success: true,
      verified: true,
      token,
      identifier: cleanIdentifier,
      role,
      metadata: result.metadata || {},
      message: "OTP successfully verified against Supabase user_otps database."
    });
  } catch (err: any) {
    console.error("[Verify DB OTP Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while validating the OTP against the database."
    });
  }
}
