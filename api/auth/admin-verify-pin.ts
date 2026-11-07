/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/admin-verify-pin
 * Secure server-side PIN verification for authorized Administrator.
 * Enforces rate limiting, prevents replay attacks, and audits operations.
 */

import {
  AUTHORIZED_ADMIN_PHONE,
  isAuthorizedAdminAccountPhone,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  verifyAdminPin,
  createSignedSessionJwt
} from "../../lib/auth-utils";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { phone, pin } = body || {};

    if (!phone || !pin) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Mobile number and Security PIN are required."
      });
    }

    const cleanPhone = normalizePhone(phone);

    // Condition 1: Must be authorized admin account
    if (!isAuthorizedAdminAccountPhone(cleanPhone)) {
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Access Denied: This mobile number is not authorized for administrative access."
      });
    }

    // Condition 2: Server-side PIN verification with rate limiting
    const result = verifyAdminPin(cleanPhone, String(pin));

    if (result.locked) {
      return sendJsonResponse(res, 429, {
        success: false,
        locked: true,
        remainingAttempts: 0,
        error: result.message || "Account temporarily locked due to repeated failed attempts."
      });
    }

    if (!result.verified) {
      return sendJsonResponse(res, 401, {
        success: false,
        remainingAttempts: result.remainingAttempts,
        error: result.message || "Incorrect security PIN. Please try again."
      });
    }

    // Both conditions satisfied: Assign role (Master admin -> super_admin, Designated admin -> admin)
    const isMaster = cleanPhone === AUTHORIZED_ADMIN_PHONE || cleanPhone === `91${AUTHORIZED_ADMIN_PHONE}`;
    const assignedRole = isMaster ? 'super_admin' : 'admin';

    const token = createSignedSessionJwt(cleanPhone, assignedRole, {
      phone: cleanPhone,
      username: isMaster ? 'nuvvo_super_admin' : `admin_${cleanPhone.slice(-4)}`
    });

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      role: assignedRole,
      isAuthorizedAdmin: true,
      phone: cleanPhone,
      navigationOptions: [
        { id: 'dashboard', label: 'Open Admin Dashboard', route: isMaster ? 'super-admin' : 'admin' },
        { id: 'settings', label: 'Open Admin Settings', route: 'admin' }
      ],
      message: "Administrator identity and PIN verified successfully."
    });
  } catch (err: any) {
    console.error("[Admin Verify PIN Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during administrative verification."
    });
  }
}
