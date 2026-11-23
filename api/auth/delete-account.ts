/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/delete-account
 * Allows customers to securely delete their profile and personal account.
 * Anonymizes historical orders to preserve accounting and business reports.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  verifyPassword,
  verifySignedSessionJwt,
  fallbackCustomerAccounts,
  fallbackUsernamesRegistry
} from "../../lib/auth-utils";
import { getAdminSupabaseServerClient, getPublicSupabaseServerClient } from "../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Authentication required to perform account deletion."
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const verified = verifySignedSessionJwt(token);

    let supabaseAuthUser: any = null;
    if (!verified.valid || !verified.payload) {
      const publicSupabase = getPublicSupabaseServerClient();
      const { data: sbUserData } = await publicSupabase.auth.getUser(token);
      if (!sbUserData?.user?.id) {
        return sendJsonResponse(res, 401, {
          success: false,
          error: "Session has expired or is invalid. Please log in again."
        });
      }
      supabaseAuthUser = sbUserData.user;
    }

    const body = await parseRequestBody(req);
    const { password } = body || {};

    if (!password) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Your current account password is required to confirm account deletion."
      });
    }

    if (supabaseAuthUser) {
      const publicSupabase = getPublicSupabaseServerClient();
      const { error: pwErr } = await publicSupabase.auth.signInWithPassword({
        email: supabaseAuthUser.email,
        password: String(password)
      });
      if (pwErr) {
        return sendJsonResponse(res, 403, {
          success: false,
          error: "Incorrect password. Account deletion aborted for security."
        });
      }

      const authEmail = normalizeEmail(supabaseAuthUser.email || '');
      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const dbClient = adminClient || publicSupabase;

      let profileUsername = '';
      let profilePhone = '';
      try {
        const { data: existingProfile } = await dbClient
          .from('customer_profiles')
          .select('username, phone')
          .eq('id', supabaseAuthUser.id)
          .maybeSingle();
        if (existingProfile?.username) profileUsername = String(existingProfile.username).toLowerCase();
        if (existingProfile?.phone) profilePhone = String(existingProfile.phone);
      } catch {}

      // Anonymize historical orders by customer_id while preserving financial accounting totals
      try {
        await dbClient
          .from('orders')
          .update({
            customer_name: 'Former Customer (Deleted)',
            customer_phone: '0000000000',
            customer_email: null,
            customer_whatsapp: null,
            instructions: 'Account deleted by customer'
          })
          .eq('customer_id', supabaseAuthUser.id);
      } catch {}

      try {
        await dbClient.from('customer_whatsapp_preferences').delete().eq('customer_id', supabaseAuthUser.id);
      } catch {}

      try {
        await dbClient.from('customer_profiles').delete().eq('id', supabaseAuthUser.id);
      } catch {}

      if (adminClient && isServiceRole) {
        if (authEmail) {
          try {
            await adminClient.from('app_settings').delete().eq('key', `account_${authEmail}`);
          } catch {}
        }
        if (profileUsername) {
          try {
            const { data: currentSettings } = await adminClient
              .from('app_settings')
              .select('value')
              .eq('key', 'customer_usernames')
              .maybeSingle();
            const usernamesMap: Record<string, string> = currentSettings?.value || {};
            if (usernamesMap[profileUsername]) {
              delete usernamesMap[profileUsername];
              await adminClient
                .from('app_settings')
                .upsert([{
                  key: 'customer_usernames',
                  value: usernamesMap,
                  updated_at: new Date().toISOString()
                }], { onConflict: 'key' });
            }
          } catch {}
        }
        await adminClient.auth.admin.deleteUser(supabaseAuthUser.id).catch(() => {});
      }

      if (authEmail) fallbackCustomerAccounts.delete(authEmail);
      if (profileUsername) fallbackUsernamesRegistry.delete(profileUsername);
      void profilePhone;

      return sendJsonResponse(res, 200, {
        success: true,
        requiresSignOut: true,
        message: "Your customer account and profile data have been permanently deleted and historical records anonymized."
      });
    }

    const sessionEmail = normalizeEmail(verified.payload!.email || '');
    if (!sessionEmail) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Unable to identify customer email associated with this session."
      });
    }

    // Retrieve customer account
    let accountRecord: any = null;
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { data } = await adminClient
          .from('app_settings')
          .select('value')
          .eq('key', `account_${sessionEmail}`)
          .maybeSingle();

        if (data && data.value) {
          accountRecord = data.value;
        }
      }
    } catch {}

    if (!accountRecord) {
      accountRecord = fallbackCustomerAccounts.get(sessionEmail) || null;
    }

    if (!accountRecord) {
      return sendJsonResponse(res, 404, {
        success: false,
        error: "Customer profile not found."
      });
    }

    // Verify current password
    if (accountRecord.password_hash) {
      const passwordMatch = verifyPassword(String(password), accountRecord.password_hash);
      if (!passwordMatch) {
        return sendJsonResponse(res, 403, {
          success: false,
          error: "Incorrect password. Account deletion aborted for security."
        });
      }
    }

    const registeredUsername = accountRecord.username ? String(accountRecord.username).toLowerCase() : '';

    // 1. Delete account record from Supabase app_settings
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        await adminClient
          .from('app_settings')
          .delete()
          .eq('key', `account_${sessionEmail}`);

        // Remove from customer_usernames registry
        if (registeredUsername) {
          const { data: currentSettings } = await adminClient
            .from('app_settings')
            .select('value')
            .eq('key', 'customer_usernames')
            .maybeSingle();

          const usernamesMap: Record<string, string> = currentSettings?.value || {};
          if (usernamesMap[registeredUsername]) {
            delete usernamesMap[registeredUsername];
            await adminClient
              .from('app_settings')
              .upsert([{
                key: 'customer_usernames',
                value: usernamesMap,
                updated_at: new Date().toISOString()
              }], { onConflict: 'key' });
          }
        }

        // Anonymize orders belonging to this user
        await adminClient
          .from('orders')
          .update({
            customer_name: 'Former Customer (Deleted)',
            customer_phone: '0000000000',
            instructions: 'Account deleted by customer'
          })
          .eq('customer_phone', accountRecord.phone || '');
      }
    } catch (err: any) {
      console.warn("[Account Deletion Database Notice]:", err?.message);
    }

    // 2. Clear fallback in-memory records
    fallbackCustomerAccounts.delete(sessionEmail);
    if (registeredUsername) {
      fallbackUsernamesRegistry.delete(registeredUsername);
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message: "Your customer account and profile data have been permanently deleted."
    });
  } catch (err: any) {
    console.error("[Account Deletion Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An error occurred while deleting your account. Please try again."
    });
  }
}
