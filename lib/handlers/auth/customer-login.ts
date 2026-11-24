/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone Serverless Function: /api/auth/customer-login
 * Authenticates customers via Supabase Auth (signInWithPassword) using Username
 * (resolved securely on backend, case-insensitive) or Email + Password.
 * Enforces login rate limiting and preserves verified email status honestly.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  verifyPassword,
  createSignedSessionJwt,
  getClientIp,
  checkCustomerAuthRateLimit,
  recordCustomerAuthFailure,
  clearCustomerAuthRateLimit,
  findLocalCustomerByUsername,
  upsertLocalCustomerProfileIndex,
  fallbackCustomerAccounts,
  fallbackUsernamesRegistry,
  resolveCustomerEmailFromSupabaseAuth,
  findSupabaseAuthUserByEmail
} from "../../auth-utils";
import {
  getAdminSupabaseServerClient,
  createFreshPublicSupabaseServerClient,
  createUserScopedSupabaseClient
} from "../../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const body = await parseRequestBody(req);
    const { identifier, password } = body || {};

    if (!identifier || !password) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Username or Email and Password are required."
      });
    }

    const cleanInput = String(identifier).trim();
    const cleanInputLower = cleanInput.toLowerCase();
    const cleanPassword = String(password);
    const clientIp = getClientIp(req);

    // Rate limit per IP and per IP+identifier to block brute-force attempts
    const ipLimit = checkCustomerAuthRateLimit("login", `ip:${clientIp}`, {
      maxAttempts: 20,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000
    });
    if (!ipLimit.allowed) {
      if (ipLimit.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(ipLimit.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        error: ipLimit.error || "Too many login attempts from your network. Please try again later."
      });
    }

    const accountLimitKey = `id:${clientIp}:${cleanInputLower}`;
    const accountLimit = checkCustomerAuthRateLimit("login", accountLimitKey, {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000
    });
    if (!accountLimit.allowed) {
      if (accountLimit.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(accountLimit.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        error: accountLimit.error || "Too many failed login attempts. Please wait 15 minutes before retrying."
      });
    }

    // 1. Secure Backend Username-to-Email Resolution (case-insensitive)
    let targetEmail = "";
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();

    if (cleanInput.includes("@")) {
      targetEmail = normalizeEmail(cleanInput);
    } else {
      const cleanUsernameLower = cleanInputLower;

      // Lookup in Supabase customer_profiles (when service_role is configured)
      if (adminClient && isServiceRole) {
        try {
          const { data: profileMatch } = await adminClient
            .from("customer_profiles")
            .select("email")
            .ilike("username", cleanUsernameLower)
            .maybeSingle();

          if (profileMatch?.email) {
            targetEmail = normalizeEmail(profileMatch.email);
          }
        } catch {}

        // Legacy fallback lookup in app_settings customer_usernames
        if (!targetEmail) {
          try {
            const { data: settingsRow } = await adminClient
              .from("app_settings")
              .select("value")
              .eq("key", "customer_usernames")
              .maybeSingle();

            const usernamesMap: Record<string, string> = settingsRow?.value || {};
            if (usernamesMap[cleanUsernameLower]) {
              targetEmail = normalizeEmail(usernamesMap[cleanUsernameLower]);
            }
          } catch {}
        }
        // Fallback lookup in Supabase Auth user_metadata (works even when customer_profiles table is pending)
        if (!targetEmail) {
          const authMatch = await resolveCustomerEmailFromSupabaseAuth(adminClient, cleanUsernameLower, isServiceRole);
          if (authMatch?.email) {
            targetEmail = authMatch.email;
          }
        }
      }

      // Check local non-secret username index & memory registry
      if (!targetEmail) {
        const localMatch = findLocalCustomerByUsername(cleanUsernameLower);
        if (localMatch?.email) {
          targetEmail = normalizeEmail(localMatch.email);
        }
      }

      if (!targetEmail) {
        targetEmail = fallbackUsernamesRegistry.get(cleanUsernameLower) || "";
      }
    }

    if (!targetEmail) {
      recordCustomerAuthFailure("login", accountLimitKey, { maxAttempts: 5 });
      recordCustomerAuthFailure("login", `ip:${clientIp}`, { maxAttempts: 20 });
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Invalid username/email or password."
      });
    }

    // 2. Authenticate via Supabase Auth (signInWithPassword) using an isolated stateless client
    const publicSupabase = createFreshPublicSupabaseServerClient();
    const { data: sbData, error: sbError } = await publicSupabase.auth.signInWithPassword({
      email: targetEmail,
      password: cleanPassword
    });

    if (!sbError && sbData?.user && sbData?.session) {
      clearCustomerAuthRateLimit("login", accountLimitKey);

      const authUser = sbData.user;
      const meta = authUser.user_metadata || {};
      const emailVerified = Boolean(authUser.email_confirmed_at);
      const emailVerifiedAt = authUser.email_confirmed_at || undefined;

      // Load customer profile using user-scoped RLS client (or admin client)
      const userClient = createUserScopedSupabaseClient(sbData.session.access_token);
      let dbProfile: any = null;

      try {
        const { data: profData } = await userClient
          .from("customer_profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();
        if (profData) dbProfile = profData;
      } catch {}

      const localIdx = findLocalCustomerByUsername(meta.username || "") || null;

      // Backfill customer_profiles row if missing (e.g. first verified sign-in after confirmation)
      if (!dbProfile) {
        const nowIso = new Date().toISOString();
        const fallbackUsername =
          String(meta.username || localIdx?.username || targetEmail.split("@")[0]).trim();
        const fallbackLocation = String(meta.location || localIdx?.location || "Chirala").trim();
        const fallbackAddress = String(meta.delivery_address || localIdx?.deliveryAddress || "").trim();
        const fallbackAddresses = Array.isArray(meta.addresses) && meta.addresses.length
          ? meta.addresses
          : localIdx?.addresses?.length
          ? localIdx.addresses
          : fallbackAddress
          ? [
              {
                id: `addr_${Date.now()}`,
                type: "Home",
                flatNo: fallbackAddress,
                area: fallbackLocation || "Chirala",
                city: "Chirala",
                fullAddress: fallbackAddress,
                isDefault: true
              }
            ]
          : [];

        const newRow = {
          id: authUser.id,
          full_name: String(meta.full_name || localIdx?.fullName || fallbackUsername).trim(),
          username: fallbackUsername,
          email: targetEmail,
          mobile: String(meta.mobile || localIdx?.mobile || "").trim(),
          location: fallbackLocation,
          delivery_address: fallbackAddress,
          addresses: fallbackAddresses,
          whatsapp_number: meta.whatsapp_number || localIdx?.whatsappNumber || null,
          whatsapp_consent: Boolean(meta.whatsapp_consent ?? localIdx?.whatsappOptIn),
          whatsapp_opt_in_at: meta.whatsapp_opt_in_at || localIdx?.whatsappOptInAt || null,
          whatsapp_opt_in_source: meta.whatsapp_opt_in_source || localIdx?.whatsappOptInSource || null,
          preferred_language: meta.preferred_language || localIdx?.preferredLanguage || "te",
          role: "Customer",
          updated_at: nowIso
        };

        try {
          const writer = isServiceRole && adminClient ? adminClient : userClient;
          const { data: inserted } = await writer
            .from("customer_profiles")
            .upsert([newRow], { onConflict: "id" })
            .select("*")
            .maybeSingle();
          if (inserted) dbProfile = inserted;
        } catch {}

        if (!dbProfile) {
          dbProfile = newRow;
        }
      }

      const resolvedUsername = String(dbProfile.username || meta.username || targetEmail.split("@")[0]).trim();
      const resolvedAddresses = Array.isArray(dbProfile.addresses) ? dbProfile.addresses : [];

      upsertLocalCustomerProfileIndex({
        id: authUser.id,
        fullName: dbProfile.full_name || meta.full_name || resolvedUsername,
        username: resolvedUsername,
        usernameLower: resolvedUsername.toLowerCase(),
        email: targetEmail,
        mobile: dbProfile.mobile || meta.mobile || "",
        location: dbProfile.location || meta.location || "",
        deliveryAddress: dbProfile.delivery_address || meta.delivery_address || "",
        addresses: resolvedAddresses,
        whatsappNumber: dbProfile.whatsapp_number || undefined,
        whatsappOptIn: Boolean(dbProfile.whatsapp_consent),
        whatsappOptInAt: dbProfile.whatsapp_opt_in_at || undefined,
        whatsappOptInSource: dbProfile.whatsapp_opt_in_source || undefined,
        preferredLanguage: dbProfile.preferred_language || "te",
        avatar: dbProfile.avatar || undefined,
        role: "Customer"
      });

      const mappedUser = {
        id: authUser.id,
        name: dbProfile.full_name || meta.full_name || resolvedUsername,
        username: resolvedUsername,
        email: targetEmail,
        phone: dbProfile.mobile || meta.mobile || "",
        location: dbProfile.location || meta.location || "",
        addresses: resolvedAddresses,
        avatar: dbProfile.avatar || undefined,
        preferredLanguage: dbProfile.preferred_language || "te",
        role: "Customer" as const, // Strict: Customer login never grants Admin or Franchise
        isProfileComplete: true,
        isEmailVerified: emailVerified,
        emailVerifiedAt,
        whatsappNumber: dbProfile.whatsapp_number || undefined,
        whatsappOptIn: Boolean(dbProfile.whatsapp_consent),
        whatsappOptInAt: dbProfile.whatsapp_opt_in_at || undefined,
        whatsappOptInSource: dbProfile.whatsapp_opt_in_source || undefined,
        favoriteFoods: [],
        favoriteRestaurants: [],
        createdAt: dbProfile.created_at || authUser.created_at || new Date().toISOString()
      };

      return sendJsonResponse(res, 200, {
        success: true,
        session: {
          access_token: sbData.session.access_token,
          refresh_token: sbData.session.refresh_token,
          expires_at: sbData.session.expires_at
        },
        emailVerified,
        emailVerifiedAt: emailVerifiedAt || null,
        user: mappedUser,
        role: "Customer",
        message: "Login successful."
      });
    }

    // Check specifically if Supabase rejected because email has not yet been confirmed
    const errMsg = String(sbError?.message || "");
    if (errMsg.toLowerCase().includes("email not confirmed")) {
      return sendJsonResponse(res, 403, {
        success: false,
        code: "EMAIL_NOT_CONFIRMED",
        requiresEmailVerification: true,
        email: targetEmail,
        error: "Your email address is not verified yet. Please check your inbox and click the confirmation link before signing in."
      });
    }

    // Ensure Supabase Auth remains the single source of truth for any account registered in auth.users / customer_profiles
    let hasSupabaseAuthAccount = false;
    if (adminClient && isServiceRole) {
      const existingAuthUser = await findSupabaseAuthUserByEmail(adminClient, targetEmail, isServiceRole);
      if (existingAuthUser) {
        hasSupabaseAuthAccount = true;
      } else {
        try {
          const { data: cpMatch } = await adminClient
            .from("customer_profiles")
            .select("id")
            .ilike("email", targetEmail)
            .maybeSingle();
          if (cpMatch?.id) hasSupabaseAuthAccount = true;
        } catch {}
      }
    }

    // Preserve seamless sign-in ONLY for untouched legacy pre-Supabase accounts stored in app_settings
    if (!hasSupabaseAuthAccount && adminClient && isServiceRole) {
      try {
        const { data: legacyAccRow } = await adminClient
          .from("app_settings")
          .select("value")
          .eq("key", `account_${targetEmail}`)
          .maybeSingle();

        const legacyRecord = legacyAccRow?.value;
        if (legacyRecord?.password_hash && verifyPassword(cleanPassword, legacyRecord.password_hash)) {
          clearCustomerAuthRateLimit("login", accountLimitKey);
          const token = createSignedSessionJwt(legacyRecord.id || targetEmail, "normal_user", {
            email: targetEmail,
            phone: legacyRecord.phone,
            username: legacyRecord.username
          });
          const safeLegacy = { ...legacyRecord, role: "Customer" };
          delete safeLegacy.password_hash;

          return sendJsonResponse(res, 200, {
            success: true,
            token,
            emailVerified: Boolean(legacyRecord.isEmailVerified),
            user: safeLegacy,
            role: "Customer",
            message: "Login successful."
          });
        }
      } catch {}
    }

    // Legacy in-memory fallback check ONLY if no Supabase Auth account exists
    const legacyMem = !hasSupabaseAuthAccount ? fallbackCustomerAccounts.get(targetEmail) : null;
    if (legacyMem?.password_hash && verifyPassword(cleanPassword, legacyMem.password_hash)) {
      clearCustomerAuthRateLimit("login", accountLimitKey);
      const token = createSignedSessionJwt(legacyMem.id || targetEmail, "normal_user", {
        email: targetEmail,
        phone: legacyMem.phone,
        username: legacyMem.username
      });
      const safeMem = { ...legacyMem, role: "Customer" };
      delete safeMem.password_hash;
      return sendJsonResponse(res, 200, {
        success: true,
        token,
        emailVerified: Boolean(legacyMem.isEmailVerified),
        user: safeMem,
        role: "Customer",
        message: "Login successful."
      });
    }

    // Record failure and return uniform error to prevent account enumeration
    const failure = recordCustomerAuthFailure("login", accountLimitKey, { maxAttempts: 5 });
    recordCustomerAuthFailure("login", `ip:${clientIp}`, { maxAttempts: 20 });

    if (failure.blocked) {
      if (failure.retryAfterSeconds && typeof res.setHeader === "function") {
        res.setHeader("Retry-After", String(failure.retryAfterSeconds));
      }
      return sendJsonResponse(res, 429, {
        success: false,
        error: "Too many failed login attempts. Your login has been temporarily locked for 15 minutes."
      });
    }

    return sendJsonResponse(res, 401, {
      success: false,
      error: "Invalid username/email or password."
    });
  } catch (err: any) {
    console.error("[Customer Login Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during login. Please try again."
    });
  }
}
