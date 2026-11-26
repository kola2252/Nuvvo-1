/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Customer Forgot Password Endpoint: POST /api/auth/forgot-password
 * Sends a secure Supabase Auth password recovery email (supporting Username or Email resolution
 * strictly on backend) with rate limiting, SMTP fallback via Supabase Admin generateLink,
 * and clear error reporting.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  getClientIp,
  checkCustomerAuthRateLimit,
  recordCustomerAuthFailure,
  findLocalCustomerByUsername,
  getAppRedirectOrigin,
  fallbackUsernamesRegistry,
  resolveCustomerEmailFromSupabaseAuth
} from "../../auth-utils";
import { isSmtpConfigured, sendPasswordRecoveryEmail } from "../../email-service";
import { getAdminSupabaseServerClient, createFreshPublicSupabaseServerClient } from "../../../src/utils/supabase/server";

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
    const ipRateCheck = checkCustomerAuthRateLimit("forgot_password_ip", clientIp, {
      maxAttempts: 20,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
      incrementOnCheck: false
    });
    if (!ipRateCheck.allowed) {
      if (ipRateCheck.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(ipRateCheck.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        retryAfterSeconds: ipRateCheck.retryAfterSeconds || 60,
        error: ipRateCheck.error || "Too many password reset requests from this network. Please wait and try again."
      });
    }

    const rateCheck = checkCustomerAuthRateLimit("forgot_password", rateKey, {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
      minIntervalMs: 60 * 1000,
      incrementOnCheck: false
    });

    if (!rateCheck.allowed) {
      if (rateCheck.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds || 60,
        error: rateCheck.error || "Please wait 60 seconds before requesting another password reset email."
      });
    }

    let resolvedEmail = "";
    let customerName = "";
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();

    if (rawIdentifier.includes("@")) {
      resolvedEmail = normalizeEmail(rawIdentifier);
    } else {
      const cleanUsername = rawIdentifier.toLowerCase();
      if (adminClient && isServiceRole) {
        try {
          const { data } = await adminClient
            .from("customer_profiles")
            .select("email, full_name")
            .ilike("username", cleanUsername)
            .maybeSingle();
          if (data?.email) resolvedEmail = normalizeEmail(data.email);
          if (data?.full_name) customerName = String(data.full_name).trim();
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

        if (!resolvedEmail) {
          const authMatch = await resolveCustomerEmailFromSupabaseAuth(adminClient, cleanUsername, isServiceRole);
          if (authMatch?.email) {
            resolvedEmail = authMatch.email;
            if (authMatch.fullName && !customerName) customerName = authMatch.fullName;
          }
        }
      }

      if (!resolvedEmail) {
        const local = findLocalCustomerByUsername(cleanUsername);
        if (local?.email) {
          resolvedEmail = normalizeEmail(local.email);
          if (local.fullName) customerName = String(local.fullName).trim();
        }
      }
      if (!resolvedEmail) {
        resolvedEmail = fallbackUsernamesRegistry.get(cleanUsername) || "";
      }
    }

    if (!resolvedEmail) {
      recordCustomerAuthFailure("forgot_password", rateKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      });
      recordCustomerAuthFailure("forgot_password_ip", clientIp, {
        maxAttempts: 20,
        windowMs: 15 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      });
      return sendJsonResponse(res, 200, {
        success: true,
        cooldownSeconds: 60,
        message:
          "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
      });
    }

    const publicSupabase = createFreshPublicSupabaseServerClient();
    const baseOrigin = getAppRedirectOrigin(req, redirectTo);
    const targetRedirect = `${baseOrigin.replace(/\/+$/, "")}/?type=recovery`;

    // 1. Primary path: Supabase Auth built-in resetPasswordForEmail
    let primaryError: any = null;
    try {
      const { error } = await publicSupabase.auth.resetPasswordForEmail(resolvedEmail, {
        redirectTo: targetRedirect
      });
      primaryError = error;

      // Retry without custom query/redirect if Supabase rejected the redirect URL format
      if (primaryError && String(primaryError.message || "").toLowerCase().includes("redirect")) {
        const retryRes = await publicSupabase.auth.resetPasswordForEmail(resolvedEmail);
        primaryError = retryRes.error;
      }
    } catch (sdkErr: any) {
      primaryError = { message: sdkErr?.message || "Supabase Auth request failed", status: 502 };
    }

    if (!primaryError) {
      recordCustomerAuthFailure("forgot_password", rateKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      });
      recordCustomerAuthFailure("forgot_password_ip", clientIp, {
        maxAttempts: 20,
        windowMs: 15 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      });
      return sendJsonResponse(res, 200, {
        success: true,
        provider: "supabase_auth",
        cooldownSeconds: 60,
        message:
          "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
      });
    }

    // 2. Fallback path: Generate official Supabase recovery link via Admin API and deliver over configured custom SMTP
    if (adminClient && isServiceRole && isSmtpConfigured()) {
      try {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: resolvedEmail,
          options: { redirectTo: targetRedirect }
        });

        const actionLink = linkData?.properties?.action_link;
        if (!linkError && actionLink) {
          const mailRes = await sendPasswordRecoveryEmail(resolvedEmail, actionLink, customerName || undefined);
          if (mailRes.success) {
            recordCustomerAuthFailure("forgot_password", rateKey, {
              maxAttempts: 5,
              windowMs: 15 * 60 * 1000,
              blockMs: 15 * 60 * 1000
            });
            recordCustomerAuthFailure("forgot_password_ip", clientIp, {
              maxAttempts: 20,
              windowMs: 15 * 60 * 1000,
              blockMs: 15 * 60 * 1000
            });
            return sendJsonResponse(res, 200, {
              success: true,
              provider: "smtp",
              cooldownSeconds: 60,
              message:
                "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
            });
          }
        } else if (linkError && String(linkError.message || "").toLowerCase().includes("not found")) {
          // Preserve non-enumeration when no Auth user exists for that email
          recordCustomerAuthFailure("forgot_password", rateKey, {
            maxAttempts: 5,
            windowMs: 15 * 60 * 1000,
            blockMs: 15 * 60 * 1000
          });
          recordCustomerAuthFailure("forgot_password_ip", clientIp, {
            maxAttempts: 20,
            windowMs: 15 * 60 * 1000,
            blockMs: 15 * 60 * 1000
          });
          return sendJsonResponse(res, 200, {
            success: true,
            cooldownSeconds: 60,
            message:
              "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
          });
        }
      } catch (fallbackErr: any) {
        console.warn("[Forgot Password SMTP Fallback Warning]:", fallbackErr?.message || fallbackErr);
      }
    }

    // 3. Accurate error reporting (do not record server/SMTP outages against user's rate limit)
    const errMsg = String(primaryError?.message || "");
    const lowerErr = errMsg.toLowerCase();
    console.warn("[Forgot Password Dispatch Failed]:", primaryError?.status, errMsg);

    if (primaryError?.status === 429 || lowerErr.includes("rate limit")) {
      return sendJsonResponse(res, 429, {
        success: false,
        retryAfterSeconds: 60,
        error: "Email recovery rate limit reached. Please wait a few minutes before retrying."
      });
    }

    if (lowerErr.includes("user not found") || lowerErr.includes("not found")) {
      return sendJsonResponse(res, 200, {
        success: true,
        cooldownSeconds: 60,
        message:
          "If an account with a verified email matches those details, a secure password reset link has been sent to your email."
      });
    }

    if (lowerErr.includes("error sending") || primaryError?.status === 500 || primaryError?.status === 502) {
      const smtpReady = isSmtpConfigured();
      const missingParts: string[] = [];
      if (!isServiceRole) missingParts.push("SUPABASE_SERVICE_ROLE_KEY");
      if (!smtpReady) missingParts.push("EMAIL_USER / EMAIL_PASS (or SMTP_USER / SMTP_PASS)");

      return sendJsonResponse(res, 502, {
        success: false,
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        error:
          missingParts.length > 0
            ? `Unable to send password reset email: Supabase Auth mailer failed and fallback SMTP cannot run because ${missingParts.join(" and ")} ${missingParts.length === 1 ? "is" : "are"} not configured on the server. Configure Custom SMTP in Supabase Dashboard -> Authentication -> SMTP Settings, or set those environment variables.`
            : "Unable to send password reset email because both Supabase Auth and fallback SMTP failed. Please check your SMTP credentials and Supabase Dashboard -> Authentication -> SMTP Settings."
      });
    }

    return sendJsonResponse(res, primaryError?.status >= 400 && primaryError?.status < 600 ? primaryError.status : 400, {
      success: false,
      error: errMsg || "Unable to initiate password reset for this account. Please verify your email address and try again."
    });
  } catch (err: any) {
    console.error("[Forgot Password Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Unable to process password reset right now. Please try again later."
    });
  }
}
