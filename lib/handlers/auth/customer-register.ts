/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Customer Registration Endpoint: POST /api/auth/customer-register
 * Creates a password-based Customer account in Supabase Auth and persists
 * profile data (without passwords) in public.customer_profiles.
 */

import {
  normalizeEmail,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  getClientIp,
  checkCustomerAuthRateLimit,
  recordCustomerAuthFailure,
  upsertLocalCustomerProfileIndex,
  findLocalCustomerByUsername,
  findLocalCustomerByEmail,
  getAppRedirectOrigin
} from "../../auth-utils";
import {
  getAdminSupabaseServerClient,
  getPublicSupabaseServerClient,
  createUserScopedSupabaseClient
} from "../../../src/utils/supabase/server";
import { parseValidWhatsAppPhone, saveCustomerWhatsAppConsent } from "../../../src/lib/whatsapp";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkCustomerAuthRateLimit("register", clientIp, {
      maxAttempts: 6,
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
        error: rateCheck.error || "Too many registration attempts. Please wait a few minutes and try again."
      });
    }

    const body = await parseRequestBody(req);
    const {
      fullName,
      username,
      email,
      mobile,
      location,
      deliveryAddress,
      landmark,
      city,
      password,
      confirmPassword,
      whatsappNumber,
      whatsappOptIn,
      redirectTo
    } = body || {};

    // 1. Strict Field Validation
    const cleanFullName = String(fullName || "").trim();
    if (!cleanFullName || cleanFullName.length < 2) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Full Name is required (at least 2 characters)."
      });
    }

    const rawUsername = String(username || "").trim();
    const cleanUsernameLower = rawUsername.toLowerCase();
    if (!rawUsername || cleanUsernameLower.length < 3 || cleanUsernameLower.length > 30) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Username must be between 3 and 30 characters."
      });
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsernameLower)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Username can only contain letters, numbers, underscores (_), dots (.), and hyphens (-)."
      });
    }

    const cleanEmail = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please enter a valid email address."
      });
    }

    const cleanMobile = normalizePhone(mobile);
    if (cleanMobile.length !== 10) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please enter a valid 10-digit mobile number."
      });
    }

    const cleanLocation = String(location || "").trim();
    if (!cleanLocation || cleanLocation.length < 2) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Location / Area is required."
      });
    }

    const cleanDeliveryAddress = String(deliveryAddress || "").trim();
    if (!cleanDeliveryAddress || cleanDeliveryAddress.length < 5) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Full Delivery Address is required."
      });
    }

    const cleanPassword = String(password || "");
    if (!cleanPassword || cleanPassword.length < 6) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Password must be at least 6 characters long."
      });
    }

    if (confirmPassword === undefined || cleanPassword !== String(confirmPassword)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Password and Confirm Password do not match."
      });
    }

    // Validate optional WhatsApp Number & explicit opt-in consent
    const rawWa = String(whatsappNumber || "").trim();
    if (rawWa.includes("@")) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Email address cannot be used as a WhatsApp number. Enter a valid 10-digit mobile number."
      });
    }

    let validatedWhatsappE164 = "";
    if (rawWa) {
      const waCheck = parseValidWhatsAppPhone(rawWa);
      if (!waCheck.valid) {
        return sendJsonResponse(res, 400, {
          success: false,
          error: waCheck.reason || "Please enter a valid 10-digit WhatsApp mobile number."
        });
      }
      validatedWhatsappE164 = waCheck.e164;
    }

    const explicitOptIn = Boolean(whatsappOptIn);
    if (explicitOptIn && !validatedWhatsappE164) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Please enter a valid WhatsApp mobile number to enable WhatsApp order updates."
      });
    }

    // 2. Enforce Case-Insensitive Username Uniqueness & Duplicate Email Check
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();

    if (adminClient && isServiceRole) {
      try {
        const { data: existingUsernameRow } = await adminClient
          .from("customer_profiles")
          .select("id, email, username")
          .ilike("username", cleanUsernameLower)
          .maybeSingle();

        if (existingUsernameRow) {
          return sendJsonResponse(res, 409, {
            success: false,
            error: `The username "${rawUsername}" is already taken. Please choose another username.`
          });
        }

        const { data: existingEmailRow } = await adminClient
          .from("customer_profiles")
          .select("id, email")
          .ilike("email", cleanEmail)
          .maybeSingle();

        if (existingEmailRow) {
          return sendJsonResponse(res, 409, {
            success: false,
            error: "An account with this email address already exists. Please sign in instead."
          });
        }
      } catch {}

      try {
        const { data: settingsRow } = await adminClient
          .from("app_settings")
          .select("value")
          .eq("key", "customer_usernames")
          .maybeSingle();

        const legacyMap: Record<string, string> = settingsRow?.value || {};
        if (legacyMap[cleanUsernameLower] && legacyMap[cleanUsernameLower].toLowerCase() !== cleanEmail) {
          return sendJsonResponse(res, 409, {
            success: false,
            error: `The username "${rawUsername}" is already taken. Please choose another username.`
          });
        }
      } catch {}
    }

    // Check durable local index as well (prevents duplicates even when DB migration/service role is pending)
    const localByUsername = findLocalCustomerByUsername(cleanUsernameLower);
    if (localByUsername && localByUsername.email.toLowerCase() !== cleanEmail) {
      return sendJsonResponse(res, 409, {
        success: false,
        error: `The username "${rawUsername}" is already taken. Please choose another username.`
      });
    }

    const localByEmail = findLocalCustomerByEmail(cleanEmail);
    if (localByEmail) {
      return sendJsonResponse(res, 409, {
        success: false,
        error: "An account with this email address already exists. Please sign in instead."
      });
    }

    // 3. Create User Account in Supabase Auth (never stores plaintext password in profile tables)
    const publicSupabase = getPublicSupabaseServerClient();
    const cleanCity = String(city || "").trim() || "Chirala";
    const cleanLandmark = String(landmark || "").trim();
    const consentTimestamp = explicitOptIn ? new Date().toISOString() : null;
    const primaryAddress = {
      id: `addr_${Date.now()}`,
      type: "Home",
      flatNo: cleanDeliveryAddress,
      area: cleanLocation,
      landmark: cleanLandmark,
      city: cleanCity,
      fullAddress: cleanDeliveryAddress,
      isDefault: true,
      gpsCoordinates: { lat: 15.8281, lng: 80.3544 }
    };

    const emailRedirectTo = getAppRedirectOrigin(req, redirectTo);

    const { data: signUpData, error: signUpError } = await publicSupabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        emailRedirectTo,
        data: {
          full_name: cleanFullName,
          username: rawUsername,
          username_lower: cleanUsernameLower,
          mobile: cleanMobile,
          location: cleanLocation,
          delivery_address: cleanDeliveryAddress,
          addresses: [primaryAddress],
          whatsapp_number: validatedWhatsappE164 || null,
          whatsapp_consent: explicitOptIn,
          whatsapp_opt_in_at: consentTimestamp,
          whatsapp_opt_in_source: validatedWhatsappE164 ? "registration" : null,
          role: "Customer" // Strictly Customer only
        }
      }
    });

    if (signUpError) {
      const msg = signUpError.message || "Registration failed.";
      const lowerMsg = msg.toLowerCase();

      if (lowerMsg.includes("already registered") || lowerMsg.includes("already exists")) {
        return sendJsonResponse(res, 409, {
          success: false,
          error: "An account with this email address already exists. Please sign in or reset your password."
        });
      }

      if (signUpError.status === 429 || lowerMsg.includes("rate limit") || lowerMsg.includes("too many")) {
        recordCustomerAuthFailure("register", clientIp);
        return sendJsonResponse(res, 429, {
          success: false,
          error: "Too many registration requests right now. Please wait a minute and try again."
        });
      }

      if (lowerMsg.includes("error sending confirmation email")) {
        return sendJsonResponse(res, 502, {
          success: false,
          code: "SUPABASE_CONFIRMATION_EMAIL_FAILED",
          error:
            "Supabase Auth could not send the confirmation email because SMTP delivery is failing or unconfigured. Configure Custom SMTP in Supabase Dashboard -> Authentication -> SMTP Settings (or check Email Confirmation settings)."
        });
      }

      return sendJsonResponse(res, 400, {
        success: false,
        error: msg
      });
    }

    // Supabase returns identities: [] when Email Confirmation is ON and the email already exists
    if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
      return sendJsonResponse(res, 409, {
        success: false,
        error: "An account with this email address already exists. Please sign in or reset your password."
      });
    }

    if (!signUpData?.user?.id) {
      return sendJsonResponse(res, 500, {
        success: false,
        error: "Account creation did not return a valid user record. Please try again."
      });
    }

    const userId = signUpData.user.id;
    const nowIso = new Date().toISOString();
    // Strictly inspect real Supabase email_confirmed_at — NEVER falsify verification state
    const emailVerified = Boolean(signUpData.user.email_confirmed_at);
    const emailVerifiedAt = signUpData.user.email_confirmed_at || undefined;
    const requiresEmailVerification = !signUpData.session;

    const dbProfileRow = {
      id: userId,
      full_name: cleanFullName,
      username: rawUsername,
      email: cleanEmail,
      mobile: cleanMobile,
      location: cleanLocation,
      delivery_address: cleanDeliveryAddress,
      addresses: [primaryAddress],
      whatsapp_number: validatedWhatsappE164 || null,
      whatsapp_consent: explicitOptIn,
      whatsapp_opt_in_at: consentTimestamp,
      whatsapp_opt_in_source: validatedWhatsappE164 ? "registration" : null,
      preferred_language: "te",
      role: "Customer",
      created_at: nowIso,
      updated_at: nowIso
    };

    // 4. Persist Customer Profile permanently in Supabase (no plaintext passwords!)
    const dbClient =
      isServiceRole && adminClient
        ? adminClient
        : signUpData.session?.access_token
        ? createUserScopedSupabaseClient(signUpData.session.access_token)
        : null;

    if (dbClient) {
      try {
        const { error: profileErr } = await dbClient
          .from("customer_profiles")
          .upsert([dbProfileRow], { onConflict: "id" });

        if (profileErr) {
          console.warn("[Customer Register] customer_profiles insert notice:", profileErr.message);
        }
      } catch (err: any) {
        console.warn("[Customer Register] customer_profiles exception:", err?.message);
      }
    }

    // Update durable non-secret username index (for backend username->email lookup)
    upsertLocalCustomerProfileIndex({
      id: userId,
      fullName: cleanFullName,
      username: rawUsername,
      usernameLower: cleanUsernameLower,
      email: cleanEmail,
      mobile: cleanMobile,
      location: cleanLocation,
      deliveryAddress: cleanDeliveryAddress,
      addresses: [primaryAddress],
      whatsappNumber: validatedWhatsappE164 || undefined,
      whatsappOptIn: explicitOptIn,
      whatsappOptInAt: consentTimestamp || undefined,
      whatsappOptInSource: validatedWhatsappE164 ? "registration" : undefined,
      preferredLanguage: "te",
      role: "Customer",
      createdAt: nowIso,
      updatedAt: nowIso
    });

    if (validatedWhatsappE164) {
      await saveCustomerWhatsAppConsent({
        customerId: userId,
        customerEmail: cleanEmail,
        customerPhone: cleanMobile,
        whatsappNumber: validatedWhatsappE164,
        consentGranted: explicitOptIn,
        consentSource: "registration"
      }).catch(() => {});
    }

    const mappedUser = {
      id: userId,
      name: cleanFullName,
      username: rawUsername,
      email: cleanEmail,
      phone: cleanMobile,
      location: cleanLocation,
      addresses: [primaryAddress],
      role: "Customer" as const,
      isProfileComplete: true,
      isEmailVerified: emailVerified,
      emailVerifiedAt,
      whatsappNumber: validatedWhatsappE164 || undefined,
      whatsappOptIn: explicitOptIn,
      whatsappOptInAt: consentTimestamp || undefined,
      whatsappOptInSource: validatedWhatsappE164 ? "registration" : undefined,
      favoriteFoods: [],
      favoriteRestaurants: [],
      createdAt: nowIso
    };

    return sendJsonResponse(res, 201, {
      success: true,
      requiresEmailVerification,
      emailVerified,
      session: signUpData.session
        ? {
            access_token: signUpData.session.access_token,
            refresh_token: signUpData.session.refresh_token,
            expires_at: signUpData.session.expires_at
          }
        : null,
      user: mappedUser,
      message: requiresEmailVerification
        ? `Account created! Please check ${cleanEmail} and click the verification link before signing in.`
        : "Customer account created successfully."
    });
  } catch (err: any) {
    console.error("[Customer Register Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during registration. Please try again."
    });
  }
}
