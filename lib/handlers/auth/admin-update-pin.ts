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
  AUTHORIZED_ADMIN_PHONE,
  parseRequestBody,
  sendJsonResponse,
  verifyAdminMasterCode,
  hashPassword,
  saveAdminMasterCodeHash,
  verifySignedSessionJwt
} from "../../auth-utils";

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { success: false, error: "Method not allowed. Use POST." });
  }

  try {
    const body = await parseRequestBody(req);

    // Authorized Admin Change Master Code (requires active session + current credential verification)
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return sendJsonResponse(res, 401, {
        success: false,
        error: "Unauthorized: Active administrator session required to update Master Code."
      });
    }

    const sessionCheck = verifySignedSessionJwt(token);
    if (!sessionCheck.valid || (sessionCheck.role !== 'admin' && sessionCheck.role !== 'super_admin')) {
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Forbidden: Only an authenticated Admin or Super Admin may update Master Code."
      });
    }

    const adminPhone = sessionCheck.phone || AUTHORIZED_ADMIN_PHONE;

    const currentCode = body?.currentMasterCode || body?.currentPin;
    const newCode = body?.newMasterCode || body?.newPin;

    if (!currentCode || !newCode) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Current Master Code and New Master Code are both required."
      });
    }

    const cleanCurrent = String(currentCode).trim();
    const cleanNew = String(newCode).trim();

    if (cleanNew.length < 4 || cleanNew.length > 32) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "New Master Code must be between 4 and 32 characters."
      });
    }

    const verifyResult = await verifyAdminMasterCode(adminPhone, cleanCurrent);
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
        error: "Current Master Code verification failed. Master Code was not updated."
      });
    }

    const newHash = hashPassword(cleanNew);
    await saveAdminMasterCodeHash(newHash);

    return sendJsonResponse(res, 200, {
      success: true,
      message: "Administrator Master Code updated and stored securely with PBKDF2-SHA512 hashing."
    });
  } catch (err: any) {
    console.error("[Admin Update Master Code Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred while updating administrator Master Code."
    });
  }
}
