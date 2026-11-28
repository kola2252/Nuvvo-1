/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/admin-verify-pin
 * Secure server-side PIN verification for authorized Administrator.
 * Enforces rate limiting, prevents replay attacks, and audits operations.
 */

import {
  isAuthorizedAdminAccountPhone,
  isMasterAdminPhone,
  maskAdminPhoneDisplay,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  verifyAdminMasterCode,
  createSignedSessionJwt
} from "../../auth-utils";

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const rawPhone = body?.phone || body?.mobile || body?.mobileNumber;
    const rawCode = body?.masterCode || body?.pin || body?.securityPin || body?.adminPin;

    if (!rawPhone || !rawCode) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Administrator mobile number and Master Code are required."
      });
    }

    const cleanPhone = normalizePhone(rawPhone);
    const cleanCode = String(rawCode).trim();

    if (cleanCode.length < 4 || cleanCode.length > 32) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Master Code must be between 4 and 32 characters."
      });
    }

    if (!isAuthorizedAdminAccountPhone(cleanPhone)) {
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Access Denied: This mobile number is not authorized for administrative access."
      });
    }

    const result = await verifyAdminMasterCode(cleanPhone, cleanCode);

    if (result.locked) {
      return sendJsonResponse(res, 429, {
        success: false,
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: result.retryAfterSeconds,
        error: result.message || "Account temporarily locked due to repeated failed attempts."
      });
    }

    if (!result.verified) {
      return sendJsonResponse(res, 401, {
        success: false,
        remainingAttempts: result.remainingAttempts,
        error: result.message || "Incorrect Master Code. Please try again."
      });
    }

    const isMaster = isMasterAdminPhone(cleanPhone);
    const assignedRole = isMaster ? 'super_admin' : 'admin';
    const maskedPhone = maskAdminPhoneDisplay(cleanPhone);

    const token = createSignedSessionJwt(cleanPhone, assignedRole, {
      phone: cleanPhone,
      username: isMaster ? 'nuvvo_super_admin' : `admin_${cleanPhone.slice(-4)}`
    });

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      role: assignedRole,
      isAuthorizedAdmin: true,
      phone: maskedPhone,
      maskedPhone,
      redirectTarget: 'admin',
      redirectTab: 'settings',
      message: "Administrator identity and Master Code verified successfully."
    });
  } catch (err: any) {
    console.error("[Admin Verify Master Code Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during administrative verification."
    });
  }
}
