/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Customer Profile Endpoint: GET / PUT /api/auth/customer-profile
 * Strictly verifies Supabase Bearer JWT, blocks cross-customer profile access,
 * and reads/updates only the authenticated customer's own profile row under RLS.
 */

import {
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  findLocalCustomerById,
  findLocalCustomerAccountByEmail,
  findLocalCustomerAccountById,
  upsertLocalCustomerAccount,
  upsertLocalCustomerProfileIndex,
  resolveCallerIdentity
} from "../../auth-utils";
import {
  getAdminSupabaseServerClient,
  getPublicSupabaseServerClient,
  createUserScopedSupabaseClient
} from "../../../src/utils/supabase/server";
import { parseValidWhatsAppPhone, saveCustomerWhatsAppConsent } from "../../../src/lib/whatsapp";

function extractBearerToken(req: any): string {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const token = extractBearerToken(req);
    if (!token) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Authentication required. Please sign in."
      });
    }

    let authUser: any = null;
    let isNuvvoCustomerJwt = false;
    if (token.startsWith("nuvvo_jwt_")) {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated || !caller.userId) {
        return sendJsonResponse(res, 401, {
          success: false,
          error: "Your session has expired or is invalid. Please sign in again."
        });
      }
      isNuvvoCustomerJwt = true;
      const acc = (caller.email ? findLocalCustomerAccountByEmail(caller.email) : null) || findLocalCustomerById(caller.userId);
      authUser = {
        id: caller.userId,
        email: caller.email || acc?.email || "",
        email_confirmed_at: (acc as any)?.isEmailVerified ? (acc as any)?.updatedAt : undefined,
        created_at: acc?.createdAt || new Date().toISOString(),
        user_metadata: {
          full_name: acc?.fullName,
          username: acc?.username,
          mobile: (acc as any)?.phone || (acc as any)?.mobile || caller.phone,
          location: acc?.location,
          delivery_address: acc?.deliveryAddress,
          addresses: acc?.addresses,
          preferred_language: acc?.preferredLanguage || "te"
        }
      };
    } else {
      const publicSupabase = getPublicSupabaseServerClient();
      const { data: userData, error: authErr } = await publicSupabase.auth.getUser(token);

      if (authErr || !userData?.user?.id) {
        return sendJsonResponse(res, 401, {
          success: false,
          error: "Your session has expired or is invalid. Please sign in again."
        });
      }
      authUser = userData.user;
    }

    const authUserId = authUser.id;
    const emailVerified = Boolean(authUser.email_confirmed_at);
    const emailVerifiedAt = authUser.email_confirmed_at || undefined;
    const meta = authUser.user_metadata || {};

    // Prevent customers from accessing or modifying any other customer's profile
    const queryTargetId =
      typeof req.query?.userId === "string"
        ? req.query.userId
        : typeof req.query?.id === "string"
        ? req.query.id
        : "";
    if (queryTargetId && queryTargetId !== authUserId) {
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Forbidden: You cannot access another customer's profile."
      });
    }

    const userClient = isNuvvoCustomerJwt ? null : createUserScopedSupabaseClient(token);
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();

    if (req.method === "GET") {
      let dbProfile: any = null;
      if (userClient) {
        try {
          const { data } = await userClient
            .from("customer_profiles")
            .select("*")
            .eq("id", authUserId)
            .maybeSingle();
          if (data) dbProfile = data;
        } catch {}
      }

      const localIdx = findLocalCustomerById(authUserId);
      const localAcc =
        (authUser.email ? findLocalCustomerAccountByEmail(authUser.email) : null) ||
        findLocalCustomerAccountById(authUserId);
      const source = dbProfile || localIdx || localAcc || {};

      const resolvedAddresses = Array.isArray(source.addresses)
        ? source.addresses
        : Array.isArray(meta.addresses)
        ? meta.addresses
        : [];

      const profile = {
        id: authUserId,
        name: source.full_name || source.fullName || (source as any).name || meta.full_name || authUser.email?.split("@")[0] || "Customer",
        username: source.username || meta.username || undefined,
        email: authUser.email || source.email || "",
        phone: source.mobile || source.phone || meta.mobile || "",
        location: source.location || meta.location || "",
        deliveryAddress: source.delivery_address || source.deliveryAddress || meta.delivery_address || "",
        addresses: resolvedAddresses,
        avatar: source.avatar || undefined,
        preferredLanguage: source.preferred_language || source.preferredLanguage || meta.preferred_language || "te",
        role: "Customer" as const,
        isProfileComplete: true,
        isEmailVerified: emailVerified,
        emailVerifiedAt,
        whatsappNumber: source.whatsapp_number || source.whatsappNumber || meta.whatsapp_number || undefined,
        whatsappOptIn: Boolean(source.whatsapp_consent ?? source.whatsappOptIn ?? meta.whatsapp_consent),
        whatsappOptInAt: source.whatsapp_opt_in_at || source.whatsappOptInAt || meta.whatsapp_opt_in_at || undefined,
        whatsappOptInSource: source.whatsapp_opt_in_source || source.whatsappOptInSource || meta.whatsapp_opt_in_source || undefined,
        createdAt: source.created_at || source.createdAt || authUser.created_at || new Date().toISOString()
      };

      return sendJsonResponse(res, 200, {
        success: true,
        emailVerified,
        user: profile
      });
    }

    if (req.method === "PUT" || req.method === "PATCH" || req.method === "POST") {
      const body = await parseRequestBody(req);

      const requestedBodyId = body?.id || body?.userId || body?.customerId;
      if (requestedBodyId && requestedBodyId !== authUserId) {
        return sendJsonResponse(res, 403, {
          success: false,
          error: "Forbidden: You cannot modify another customer's profile."
        });
      }

      // Fetch existing record to preserve immutable/unspecified fields
      let existingRow: any = null;
      if (userClient) {
        try {
          const { data } = await userClient
            .from("customer_profiles")
            .select("*")
            .eq("id", authUserId)
            .maybeSingle();
          if (data) existingRow = data;
        } catch {}
      }

      const localIdx = findLocalCustomerById(authUserId);
      const localAcc =
        (authUser.email ? findLocalCustomerAccountByEmail(authUser.email) : null) ||
        findLocalCustomerAccountById(authUserId);
      const base = existingRow || localIdx || localAcc || {};

      const nextName = String(body?.name ?? body?.fullName ?? base.full_name ?? base.fullName ?? meta.full_name ?? "").trim();
      if (!nextName || nextName.length < 2) {
        return sendJsonResponse(res, 400, {
          success: false,
          error: "Full Name must be at least 2 characters."
        });
      }

      let nextMobile = String(body?.phone ?? body?.mobile ?? base.mobile ?? meta.mobile ?? "").trim();
      if (nextMobile) {
        const cleanDigits = normalizePhone(nextMobile);
        if (cleanDigits.length < 10) {
          return sendJsonResponse(res, 400, {
            success: false,
            error: "Please provide a valid 10-digit mobile number."
          });
        }
        nextMobile = cleanDigits;
      }

      const nextLocation = String(body?.location ?? base.location ?? meta.location ?? "").trim();
      const nextAddresses = Array.isArray(body?.addresses)
        ? body.addresses
        : Array.isArray(base.addresses)
        ? base.addresses
        : Array.isArray(meta.addresses)
        ? meta.addresses
        : [];

      const primaryAddr = nextAddresses.find((a: any) => a?.isDefault) || nextAddresses[0];
      const nextDeliveryAddress = String(
        body?.deliveryAddress ??
          (primaryAddr ? `${primaryAddr.flatNo || ""}, ${primaryAddr.area || ""}, ${primaryAddr.city || ""}`.replace(/^,\s*|,\s*$/g, "") : "") ??
          base.delivery_address ??
          base.deliveryAddress ??
          ""
      ).trim();

      // Optional WhatsApp update
      let nextWhatsappNumber = base.whatsapp_number ?? base.whatsappNumber ?? meta.whatsapp_number ?? null;
      let nextWhatsappConsent = Boolean(base.whatsapp_consent ?? base.whatsappOptIn ?? meta.whatsapp_consent);
      let nextWhatsappOptInAt = base.whatsapp_opt_in_at ?? base.whatsappOptInAt ?? null;
      let nextWhatsappSource = base.whatsapp_opt_in_source ?? base.whatsappOptInSource ?? null;

      if (body?.whatsappNumber !== undefined) {
        const rawWa = String(body.whatsappNumber || "").trim();
        if (rawWa.includes("@")) {
          return sendJsonResponse(res, 400, {
            success: false,
            error: "Email address cannot be used as a WhatsApp number."
          });
        }
        if (rawWa) {
          const check = parseValidWhatsAppPhone(rawWa);
          if (!check.valid) {
            return sendJsonResponse(res, 400, {
              success: false,
              error: check.reason || "Invalid WhatsApp number."
            });
          }
          nextWhatsappNumber = check.e164;
        } else {
          nextWhatsappNumber = null;
        }
      }

      if (body?.whatsappOptIn !== undefined) {
        nextWhatsappConsent = Boolean(body.whatsappOptIn && nextWhatsappNumber);
        nextWhatsappOptInAt = nextWhatsappConsent ? body?.whatsappOptInAt || new Date().toISOString() : null;
        nextWhatsappSource = body?.whatsappOptInSource || "profile";
      }

      const preservedUsername = String(base.username || meta.username || authUser.email?.split("@")[0] || "").trim();
      const nextLanguage = body?.preferredLanguage || base.preferred_language || base.preferredLanguage || "te";
      const nextAvatar = body?.avatar !== undefined ? body.avatar : (base.avatar || null);
      const nowIso = new Date().toISOString();

      const updatePayload = {
        id: authUserId,
        full_name: nextName,
        username: preservedUsername,
        email: authUser.email || base.email || "",
        mobile: nextMobile,
        location: nextLocation,
        delivery_address: nextDeliveryAddress,
        addresses: nextAddresses,
        whatsapp_number: nextWhatsappNumber,
        whatsapp_consent: nextWhatsappConsent,
        whatsapp_opt_in_at: nextWhatsappOptInAt,
        whatsapp_opt_in_source: nextWhatsappSource,
        preferred_language: nextLanguage,
        avatar: nextAvatar,
        role: "Customer", // Strictly locked to Customer
        updated_at: nowIso
      };

      let savedDb = false;
      const writer = isServiceRole && adminClient ? adminClient : userClient;
      if (writer) {
        try {
          const { error: upsertErr } = await writer
            .from("customer_profiles")
            .upsert([updatePayload], { onConflict: "id" });

          if (!upsertErr) {
            savedDb = true;
          } else {
            console.warn("[Customer Profile PUT notice]:", upsertErr.message);
          }
        } catch (err: any) {
          console.warn("[Customer Profile PUT exception]:", err?.message);
        }
      }

      // Sync Supabase user metadata (never stores passwords) so profile stays consistent
      if (userClient) {
        try {
          await userClient.auth.updateUser({
            data: {
              full_name: nextName,
              mobile: nextMobile,
              location: nextLocation,
              delivery_address: nextDeliveryAddress,
              addresses: nextAddresses,
              whatsapp_number: nextWhatsappNumber,
              whatsapp_consent: nextWhatsappConsent,
              preferred_language: nextLanguage,
              role: "Customer"
            }
          });
        } catch {}
      }

      upsertLocalCustomerProfileIndex({
        id: authUserId,
        fullName: nextName,
        username: preservedUsername,
        usernameLower: preservedUsername.toLowerCase(),
        email: authUser.email || base.email || "",
        mobile: nextMobile,
        location: nextLocation,
        deliveryAddress: nextDeliveryAddress,
        addresses: nextAddresses,
        whatsappNumber: nextWhatsappNumber || undefined,
        whatsappOptIn: nextWhatsappConsent,
        whatsappOptInAt: nextWhatsappOptInAt || undefined,
        whatsappOptInSource: nextWhatsappSource || undefined,
        preferredLanguage: nextLanguage,
        avatar: nextAvatar || undefined,
        isEmailVerified: Boolean(authUser.email_confirmed_at),
        role: "Customer"
      });

      if (localAcc) {
        upsertLocalCustomerAccount({
          ...localAcc,
          fullName: nextName,
          phone: nextMobile,
          location: nextLocation,
          deliveryAddress: nextDeliveryAddress,
          addresses: nextAddresses,
          whatsappNumber: nextWhatsappNumber || undefined,
          whatsappOptIn: nextWhatsappConsent,
          whatsappOptInAt: nextWhatsappOptInAt || undefined,
          whatsappOptInSource: nextWhatsappSource || undefined,
          preferredLanguage: nextLanguage,
          role: "Customer",
          updatedAt: nowIso
        });
      }

      if (nextWhatsappNumber) {
        await saveCustomerWhatsAppConsent({
          customerId: authUserId,
          customerEmail: authUser.email || "",
          customerPhone: nextMobile,
          whatsappNumber: nextWhatsappNumber,
          consentGranted: nextWhatsappConsent,
          consentSource: "profile"
        }).catch(() => {});
      }

      return sendJsonResponse(res, 200, {
        success: true,
        savedToSupabaseTable: savedDb,
        user: {
          id: authUserId,
          name: nextName,
          username: preservedUsername,
          email: authUser.email || base.email || "",
          phone: nextMobile,
          location: nextLocation,
          deliveryAddress: nextDeliveryAddress,
          addresses: nextAddresses,
          avatar: nextAvatar || undefined,
          preferredLanguage: nextLanguage,
          role: "Customer",
          isProfileComplete: true,
          isEmailVerified: emailVerified,
          emailVerifiedAt,
          whatsappNumber: nextWhatsappNumber || undefined,
          whatsappOptIn: nextWhatsappConsent,
          whatsappOptInAt: nextWhatsappOptInAt || undefined,
          whatsappOptInSource: nextWhatsappSource || undefined,
          createdAt: base.created_at || base.createdAt || authUser.created_at || nowIso
        },
        message: "Profile updated successfully."
      });
    }

    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed." });
  } catch (err: any) {
    console.error("[Customer Profile API Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Failed to process profile request. Please try again."
    });
  }
}
