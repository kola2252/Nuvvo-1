/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/admin-update-pin
 * Allows an authenticated Admin / Super Admin to securely change their PIN.
 * Stores strictly a PBKDF2-SHA512 hash on the server / Supabase.
 * Enforces rate limiting, prevents unauthorized changes, and never exposes the PIN.
 */

import {
  parseRequestBody,
  sendJsonResponse,
  verifyAdminPin,
  hashPassword,
  setAdminPinHash,
  verifySignedSessionJwt
} from "../../auth-utils";
import { getAdminSupabaseServerClient } from "../../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed. Use POST." });
  }

  try {
    // 1. Authorize caller via signed session token (must be admin or super_admin)
    const authHeader = req.headers?.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Unauthorized: Active administrator session required to update PIN."
      });
    }

    const sessionCheck = verifySignedSessionJwt(token);
    if (!sessionCheck.valid || (sessionCheck.role !== 'admin' && sessionCheck.role !== 'super_admin')) {
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Forbidden: Only an authenticated Admin or Super Admin may update security PINs."
      });
    }

    const adminPhone = sessionCheck.phone || '9063692135';

    // 2. Validate request body
    const body = await parseRequestBody(req);
    const { currentPin, newPin } = body || {};

    if (!currentPin || !newPin) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Current PIN and New PIN are both required."
      });
    }

    const cleanCurrent = String(currentPin).trim();
    const cleanNew = String(newPin).trim();

    if (cleanNew.length < 4 || cleanNew.length > 8) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "New PIN must be between 4 and 8 digits."
      });
    }

    // 3. Verify current PIN with rate limiting
    const verifyResult = verifyAdminPin(adminPhone, cleanCurrent);
    if (verifyResult.locked) {
      return sendJsonResponse(res, 429, {
        success: false,
        locked: true,
        error: verifyResult.message || "Account is locked due to repeated failed attempts."
      });
    }

    if (!verifyResult.verified) {
      return sendJsonResponse(res, 401, {
        success: false,
        remainingAttempts: verifyResult.remainingAttempts,
        error: "Current PIN verification failed. PIN was not updated."
      });
    }

    // 4. Hash new PIN with PBKDF2-SHA512
    const newHash = hashPassword(cleanNew);
    setAdminPinHash(newHash);

    // 5. Persist to Supabase app_settings table (under admin_security_pin_hash key)
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        await adminClient
          .from('app_settings')
          .upsert([{
            key: 'admin_security_pin_hash',
            value: newHash,
            description: 'PBKDF2-SHA512 hashed administrator security PIN',
            updated_at: new Date().toISOString()
          }], { onConflict: 'key' });
      }
    } catch (dbErr: any) {
      console.warn('[Admin Update PIN] Supabase sync notice:', dbErr?.message);
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message: "Administrator security PIN updated and hashed successfully."
    });
  } catch (err: any) {
    console.error("[Admin Update PIN Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while updating administrator PIN."
    });
  }
}
