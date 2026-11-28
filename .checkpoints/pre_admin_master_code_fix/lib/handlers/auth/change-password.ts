/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authenticated Customer Change Password Endpoint: POST /api/auth/change-password
 * Requires active Supabase Bearer JWT, verifies the current password via Supabase Auth
 * before updating to the new password, applies strict rate limiting, and never stores
 * or logs plaintext passwords.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  checkCustomerAuthRateLimit,
  clearCustomerAuthRateLimit,
  createSignedSessionJwt,
  extractBearerToken,
  findLocalCustomerAccountByEmail,
  findLocalCustomerAccountById,
  getClientIp,
  hashPassword,
  normalizeEmail,
  parseRequestBody,
  recordCustomerAuthFailure,
  sendJsonResponse,
  upsertLocalCustomerAccount,
  verifyPassword,
  verifySignedSessionJwt
} from "../../auth-utils";
import {
  getPublicSupabaseServerClient,
  getSupabaseUrl
} from "../../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJsonResponse(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const token = extractBearerToken(req);
    if (!token) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Authentication required. Please sign in again."
      });
    }

    const body = await parseRequestBody(req);
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");
    const confirmPassword = String(body?.confirmPassword || "");

    const validatePasswords = () => {
      if (!currentPassword) {
        return "Current password is required.";
      }
      if (!newPassword || newPassword.length < 6) {
        return "New password must be at least 6 characters long.";
      }
      if (confirmPassword !== newPassword) {
        return "New password and confirmation do not match.";
      }
      if (currentPassword === newPassword) {
        return "New password must be different from your current password.";
      }
      return null;
    };

    const clientIp = getClientIp(req);

    // Handle signed Nuvvo Customer JWT sessions (fallback PBKDF2 customer accounts)
    if (token.startsWith("nuvvo_jwt_")) {
      const verified = verifySignedSessionJwt(token);
      if (!verified.valid || !verified.payload) {
        return sendJsonResponse(res, 401, {
          success: false,
          error: "Your session has expired or is invalid. Please sign in again."
        });
      }
      if (verified.role === "admin" || verified.role === "super_admin") {
        return sendJsonResponse(res, 403, {
          success: false,
          error: "Use Admin Settings to update your administrator Master Code."
        });
      }

      const subjectId = String(verified.payload.sub || "");
      const payloadEmail = normalizeEmail(verified.payload.email || "");
      const rateKey = `${subjectId || payloadEmail}:${clientIp}`;

      const rateCheck = checkCustomerAuthRateLimit("change_password", rateKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      });
      if (!rateCheck.allowed) {
        return sendJsonResponse(res, 429, {
          success: false,
          error: rateCheck.error || "Too many password change attempts. Please try again later.",
          retryAfterSeconds: rateCheck.retryAfterSeconds
        });
      }

      const validationErr = validatePasswords();
      if (validationErr) {
        return sendJsonResponse(res, 400, { success: false, error: validationErr });
      }

      const localAcc =
        (payloadEmail ? findLocalCustomerAccountByEmail(payloadEmail) : null) ||
        findLocalCustomerAccountById(subjectId);

      if (!localAcc || !localAcc.passwordHash) {
        return sendJsonResponse(res, 404, {
          success: false,
          error: "Customer account not found. Please sign in again."
        });
      }

      if (!verifyPassword(currentPassword, localAcc.passwordHash)) {
        const failRes = recordCustomerAuthFailure("change_password", rateKey, { maxAttempts: 5 });
        return sendJsonResponse(res, 401, {
          success: false,
          error: failRes.blocked
            ? "Too many incorrect password attempts. Please wait 15 minutes before trying again."
            : "Current password is incorrect."
        });
      }

      upsertLocalCustomerAccount({
        ...localAcc,
        passwordHash: hashPassword(newPassword),
        updatedAt: new Date().toISOString()
      });

      clearCustomerAuthRateLimit("change_password", rateKey);
      const freshToken = createSignedSessionJwt(localAcc.id, "normal_user", {
        email: localAcc.email,
        phone: localAcc.phone,
        username: localAcc.username
      });

      return sendJsonResponse(res, 200, {
        success: true,
        token: freshToken,
        message: "Password updated successfully."
      });
    }

    const publicSupabase = getPublicSupabaseServerClient();
    const { data: userData, error: userErr } = await publicSupabase.auth.getUser(token);
    if (userErr || !userData?.user?.id || !userData?.user?.email) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Your session has expired or is invalid. Please sign in again."
      });
    }

    const authUser = userData.user;
    const userEmail = String(authUser.email).trim().toLowerCase();
    const rateKey = `${authUser.id}:${clientIp}`;

    const rateCheck = checkCustomerAuthRateLimit("change_password", rateKey, {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000
    });
    if (!rateCheck.allowed) {
      return sendJsonResponse(res, 429, {
        success: false,
        error: rateCheck.error || "Too many password change attempts. Please try again later.",
        retryAfterSeconds: rateCheck.retryAfterSeconds
      });
    }

    const validationErr = validatePasswords();
    if (validationErr) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: validationErr
      });
    }

    // Re-authenticate with throwaway non-persisting Supabase client to verify current password
    const supabaseUrl = getSupabaseUrl();
    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_-uXD4j7ITcsUZWT7_IDQ3A_AXLPWBCX";

    const ephemeralClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: verifyData, error: verifyErr } = await ephemeralClient.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword
    });

    if (verifyErr || !verifyData?.session || verifyData?.user?.id !== authUser.id) {
      const failRes = recordCustomerAuthFailure("change_password", rateKey, { maxAttempts: 5 });
      return sendJsonResponse(res, 401, {
        success: false,
        error: failRes.blocked
          ? "Too many incorrect password attempts. Please wait 15 minutes before trying again."
          : "Current password is incorrect."
      });
    }

    // Update password cleanly under the verified user session
    const { error: updateErr } = await ephemeralClient.auth.updateUser({
      password: newPassword
    });

    if (updateErr) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: updateErr.message || "Unable to update password. Please choose a stronger password."
      });
    }

    const { data: latestSessionData } = await ephemeralClient.auth.getSession();
    const freshSession = latestSessionData?.session || verifyData.session;

    clearCustomerAuthRateLimit("change_password", rateKey);

    return sendJsonResponse(res, 200, {
      success: true,
      message: "Password updated successfully.",
      session: {
        access_token: freshSession.access_token,
        refresh_token: freshSession.refresh_token,
        expires_at: freshSession.expires_at
      }
    });
  } catch (err: any) {
    console.error("[Change Password Exception]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Unable to change password right now. Please try again."
    });
  }
}
