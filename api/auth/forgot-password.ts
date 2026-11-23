/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Customer Forgot Password Endpoint: POST /api/auth/forgot-password
 * Sends a secure Supabase Auth password recovery email (supporting Username or Email resolution
 * strictly on backend) with rate limiting and non-enumerating responses.
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
} from "../../lib/auth-utils";
import { getAdminSupabaseServerClient, getPublicSupabaseServerClient } from "../../src/utils/supabase/server";

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
    const rawIdentifier = String(identifier || email || "").trim();

    if (!rawIdentifier) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please enter your registered Email Address or Username."
      });
    }

    const clientIp = getClientIp(req);
    const rateKey = `${clientIp}:${rawIdentifier.toLowerCase()}`;
    const rateCheck = checkCustomerAuthRateLimit("forgot_password", rateKey, {
      maxAttempts: 3,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
      incrementOnCheck: true
    });

    if (!rateCheck.allowed) {
      if (rateCheck.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        error: rateCheck.error || "Too many password reset requests. Please wait a few minutes and try again."
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

        if (!resolvedEmail) {
          try {
            const { data } = await adminClient
              .from("app_settings")
              .select("value")
              .eq("key", "customer_usernames")
              .maybeSingle();
            const map: Record<string, string> = data?.value || {};
            if (map[cleanUsername]) resolvedEmail = normalizeEmail(map[cleanUsername]);
          } catch {}
        }
      }

      if (!resolvedEmail) {
        const local = findLocalCustomerByUsername(cleanUsername);
        if (local?.email) resolvedEmail = normalizeEmail(local.email);
      }
      if (!resolvedEmail) {
        resolvedEmail = fallbackUsernamesRegistry.get(cleanUsername) || "";
      }
    }

    // Send recovery email only if resolved, while returning a uniform message to avoid enumeration
    if (resolvedEmail) {
      const publicSupabase = getPublicSupabaseServerClient();
      const targetRedirect = getAppRedirectOrigin(req, redirectTo);
      const { error } = await publicSupabase.auth.resetPasswordForEmail(resolvedEmail, {
        redirectTo: targetRedirect
      });

      if (error) {
        const lowerErr = String(error.message || "").toLowerCase();
        if (error.status === 429 || lowerErr.includes("rate limit")) {
          return sendJsonResponse(res, 429, {
            success: false,
            error: "Email recovery rate limit reached. Please wait a few minutes before retrying."
          });
        }
        if (lowerErr.includes("error sending")) {
          return sendJsonResponse(res, 502, {
            success: false,
            error: "Supabase Auth could not send the recovery email. Please configure Custom SMTP in Supabase Dashboard -> Authentication -> SMTP Settings."
          });
        }
      }
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message:
        "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
    });
  } catch (err: any) {
    console.error("[Forgot Password Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Unable to process password reset right now. Please try again later."
    });
  }
}
