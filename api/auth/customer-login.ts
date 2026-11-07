/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/customer-login
 * Performs secure Username/Email + Password authentication with server-side lookup.
 */

import {
  normalizeEmail,
  parseRequestBody,
  sendJsonResponse,
  verifyPassword,
  createSignedSessionJwt,
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
    const body = await parseRequestBody(req);
    const { identifier, password } = body || {};

    if (!identifier || !password) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Username/Email and password are required."
      });
    }

    const cleanInput = String(identifier).trim();
    const cleanPassword = String(password);

    let targetEmail = '';

    if (cleanInput.includes('@')) {
      targetEmail = normalizeEmail(cleanInput);
    } else {
      // Username lookup performed strictly on the server
      const cleanUsername = cleanInput.toLowerCase();
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const { data } = await adminClient
            .from('app_settings')
            .select('value')
            .eq('key', 'customer_usernames')
            .maybeSingle();

          const usernamesMap: Record<string, string> = data?.value || {};
          targetEmail = usernamesMap[cleanUsername] || '';
        }
      } catch (err: any) {
        console.warn("[Username Lookup Warning]:", err?.message);
      }

      // Check fallback container registry
      if (!targetEmail) {
        targetEmail = fallbackUsernamesRegistry.get(cleanUsername) || '';
      }
    }

    if (!targetEmail) {
      // Constant-time message to prevent account enumeration
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Invalid username/email or password. Please verify your credentials."
      });
    }

    // Retrieve account record
    let accountRecord: any = null;
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { data } = await adminClient
          .from('app_settings')
          .select('value')
          .eq('key', `account_${targetEmail}`)
          .maybeSingle();

        if (data && data.value) {
          accountRecord = data.value;
        }
      }
    } catch {}

    // Check fallback container registry
    if (!accountRecord) {
      accountRecord = fallbackCustomerAccounts.get(targetEmail) || null;
    }

    if (!accountRecord || !accountRecord.password_hash) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Invalid username/email or password. Please verify your credentials."
      });
    }

    // Verify password cryptographically
    const isPasswordValid = verifyPassword(cleanPassword, accountRecord.password_hash);
    if (!isPasswordValid) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Invalid username/email or password. Please verify your credentials."
      });
    }

    // Issue signed session token
    const token = createSignedSessionJwt(accountRecord.id || targetEmail, 'normal_user', {
      email: targetEmail,
      phone: accountRecord.phone,
      username: accountRecord.username
    });

    const safeUser = { ...accountRecord };
    delete safeUser.password_hash;

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      user: safeUser,
      role: safeUser.role || 'Customer',
      message: "Login successful."
    });
  } catch (err: any) {
    console.error("[Customer Login Serverless Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during login. Please try again."
    });
  }
}
