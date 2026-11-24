/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resend Email Verification Endpoint: POST /api/auth/resend-verification
 * Triggers Supabase Auth confirmation email resend for unverified accounts.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  getClientIp,
  checkCustomerAuthRateLimit,
  findLocalCustomerByUsername,
  getAppRedirectOrigin,
  fallbackUsernamesRegistry
} from "../../auth-utils";
import { getAdminSupabaseServerClient, getPublicSupabaseServerClient } from "../../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const body = await parseRequestBody(req);
    const { identifier, email, redirectTo } = body || {};
    const rawIdentifier = String(email || identifier || "").trim();

    if (!rawIdentifier) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Email address or Username is required."
      });
    }

    const clientIp = getClientIp(req);
    const rateCheck = checkCustomerAuthRateLimit("resend", `${clientIp}:${rawIdentifier.toLowerCase()}`, {
      maxAttempts: 3,
      windowMs: 10 * 60 * 1000,
      blockMs: 10 * 60 * 1000,
      incrementOnCheck: true
    });

    if (!rateCheck.allowed) {
      if (rateCheck.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        error: rateCheck.error || "Please wait before requesting another verification email."
      });
    }

    let resolvedEmail = "";
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();

    if (rawIdentifier.includes("@")) {
      resolvedEmail = normalizeEmail(rawIdentifier);
    } else {
      const cleanUsername = rawIdentifier.toLowerCase();
      if (adminClient && isServiceRole) {
        try {
          const { data } = await adminClient
            .from("customer_profiles")
            .select("email")
            .ilike("username", cleanUsername)
            .maybeSingle();
          if (data?.email) resolvedEmail = normalizeEmail(data.email);
        } catch {}
      }
      if (!resolvedEmail) {
        const local = findLocalCustomerByUsername(cleanUsername);
        if (local?.email) resolvedEmail = normalizeEmail(local.email);
      }
      if (!resolvedEmail) {
        resolvedEmail = fallbackUsernamesRegistry.get(cleanUsername) || "";
      }
    }

    if (resolvedEmail) {
      const publicSupabase = getPublicSupabaseServerClient();
      const targetRedirect = getAppRedirectOrigin(req, redirectTo);
      const { error } = await publicSupabase.auth.resend({
        type: "signup",
        email: resolvedEmail,
        options: { emailRedirectTo: targetRedirect }
      });

      if (error) {
        if (error.status === 429 || String(error.message || "").toLowerCase().includes("rate limit")) {
          return sendJsonResponse(res, 429, {
            success: false,
            error: "Too many verification email requests. Please wait a minute and check your spam folder."
          });
        }
        return sendJsonResponse(res, 400, {
          success: false,
          error: error.message || "Unable to resend verification email."
        });
      }
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message: "Verification email dispatched! Please check your inbox and spam folder."
    });
  } catch (err: any) {
    console.error("[Resend Verification Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Failed to resend verification email. Please try again."
    });
  }
}
