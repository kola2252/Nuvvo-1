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
import { getAdminSupabaseServerClient } from "../../src/utils/supabase/server";

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
    if (!verified.valid || !verified.payload) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Session has expired or is invalid. Please log in again."
      });
    }

    const body = await parseRequestBody(req);
    const { password } = body || {};

    if (!password) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Your current account password is required to confirm account deletion."
      });
    }

    const sessionEmail = normalizeEmail(verified.payload.email || '');
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
