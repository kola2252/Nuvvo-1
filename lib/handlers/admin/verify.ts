/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/admin/verify
 * Validates admin mobile number and PBKDF2-hashed PIN.
 * Implements strict rate limiting, temporary account lockout, and security audit logging.
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

  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const body = await parseRequestBody(req);
    const rawPhone = body?.phone || body?.mobile || body?.mobileNumber || body?.phoneNumber;
    const rawMasterCode = body?.masterCode || body?.pin || body?.securityPin || body?.adminPin;

    if (!rawPhone || !rawMasterCode) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Administrator mobile number and Master Code are required."
      });
    }

    const cleanPhone = normalizePhone(String(rawPhone));
    const cleanCode = String(rawMasterCode).trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "A valid 10-digit administrator mobile number is required."
      });
    }

    if (!cleanCode || cleanCode.length < 4 || cleanCode.length > 32) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Master Code must be between 4 and 32 characters."
      });
    }

    const isAuthorized = isAuthorizedAdminAccountPhone(cleanPhone);
    const maskedPhone = maskAdminPhoneDisplay(cleanPhone);

    if (!isAuthorized) {
      console.warn(`[SECURITY AUDIT] Unauthorized admin verification attempt at ${new Date().toISOString()}`);
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Access Denied: This mobile number is not authorized for administrative access."
      });
    }

    const result = await verifyAdminMasterCode(cleanPhone, cleanCode);

    if (result.locked) {
      console.warn(`[SECURITY AUDIT] Administrative account ${maskedPhone} temporarily locked out.`);
      return sendJsonResponse(res, 429, {
        success: false,
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: result.retryAfterSeconds,
        error: result.message || "Account temporarily locked due to repeated failed attempts. Please retry later."
      });
    }

    if (!result.verified) {
      console.warn(`[SECURITY AUDIT] Failed Master Code verification for ${maskedPhone}. Remaining attempts: ${result.remainingAttempts}`);
      return sendJsonResponse(res, 401, {
        success: false,
        locked: false,
        remainingAttempts: result.remainingAttempts,
        error: result.message || "Incorrect Master Code. Please try again."
      });
    }

    const isMaster = isMasterAdminPhone(cleanPhone);
    const assignedRole: 'super_admin' | 'admin' = isMaster ? 'super_admin' : 'admin';

    const token = createSignedSessionJwt(cleanPhone, assignedRole, {
      phone: cleanPhone,
      username: isMaster ? 'nuvvo_super_admin' : `admin_${cleanPhone.slice(-4)}`
    });

    console.log(`[SECURITY AUDIT] Administrative login verified for ${maskedPhone} as [${assignedRole}] at ${new Date().toISOString()}`);

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      role: assignedRole,
      isAuthorizedAdmin: true,
      phone: maskedPhone,
      maskedPhone,
      redirectTarget: 'admin',
      redirectTab: 'settings',
      message: "Administrator credentials and Master Code verified successfully."
    });
  } catch (err: any) {
    console.error("[Admin Verify Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during administrative verification."
    });
  }
}
