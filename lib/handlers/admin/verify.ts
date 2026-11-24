/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/admin/verify
 * Validates admin mobile number and PBKDF2-hashed PIN.
 * Implements strict rate limiting, temporary account lockout, and security audit logging.
 */

import {
  AUTHORIZED_ADMIN_PHONE,
  isAuthorizedAdminAccountPhone,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  verifyAdminPin,
  createSignedSessionJwt
} from "../../auth-utils";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  // Strictly enforce POST method for credentials verification
  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const body = await parseRequestBody(req);
    const rawPhone = body?.phone || body?.mobile || body?.mobileNumber || body?.phoneNumber;
    const rawPin = body?.pin || body?.securityPin || body?.adminPin;

    if (!rawPhone || !rawPin) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Admin mobile number and Security PIN are required."
      });
    }

    const cleanPhone = normalizePhone(String(rawPhone));
    const cleanPin = String(rawPin).trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "A valid 10-digit administrator mobile number is required."
      });
    }

    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 8) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "Security PIN must be between 4 and 8 digits."
      });
    }

    // Step 1: Validate admin mobile number against authorized admin accounts
    const isAuthorized = isAuthorizedAdminAccountPhone(cleanPhone);
    const maskedPhone = cleanPhone.length >= 10
      ? `+91 ${cleanPhone.slice(0, 2)}••••••${cleanPhone.slice(-2)}`
      : `+91 ${cleanPhone}`;

    if (!isAuthorized) {
      console.warn(`[SECURITY AUDIT] Unauthorized admin verification attempt for cellular identifier: ${maskedPhone} at ${new Date().toISOString()}`);
      return sendJsonResponse(res, 403, {
        success: false,
        error: "Access Denied: This mobile number is not authorized for administrative access."
      });
    }

    // Step 2: Validate hashed PIN with rate limiting and temporary account lockout
    const result = verifyAdminPin(cleanPhone, cleanPin);

    // If temporarily locked out after repeated failed attempts
    if (result.locked) {
      console.warn(`[SECURITY AUDIT] Administrative account ${maskedPhone} is temporarily locked out due to repeated failed PIN attempts.`);
      return sendJsonResponse(res, 429, {
        success: false,
        locked: true,
        remainingAttempts: 0,
        error: result.message || "Account temporarily locked due to repeated failed attempts. Please retry in 15 minutes."
      });
    }

    // If PIN does not match server-side PBKDF2 hash
    if (!result.verified) {
      console.warn(`[SECURITY AUDIT] Failed PIN verification attempt for administrator ${maskedPhone}. Remaining attempts: ${result.remainingAttempts}`);
      return sendJsonResponse(res, 401, {
        success: false,
        locked: false,
        remainingAttempts: result.remainingAttempts,
        error: result.message || "Incorrect security PIN. Please try again."
      });
    }

    // Step 3: Identity & PIN verified successfully
    // Determine administrative role (Master Admin 9063692135 -> super_admin, Designated Admins -> admin)
    const isMaster = cleanPhone === AUTHORIZED_ADMIN_PHONE || cleanPhone === '9063692135' || cleanPhone === `91${AUTHORIZED_ADMIN_PHONE}`;
    const assignedRole: 'super_admin' | 'admin' = isMaster ? 'super_admin' : 'admin';

    // Issue cryptographic HMAC/PBKDF2-signed session JWT
    const token = createSignedSessionJwt(cleanPhone, assignedRole, {
      phone: cleanPhone,
      username: isMaster ? 'nuvvo_super_admin' : `admin_${cleanPhone.slice(-4)}`
    });

    console.log(`[SECURITY AUDIT] Administrative login verified successfully for ${maskedPhone} as [${assignedRole}] at ${new Date().toISOString()}`);

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      role: assignedRole,
      isAuthorizedAdmin: true,
      phone: cleanPhone,
      navigationOptions: [
        { id: 'dashboard', label: 'Open Admin Dashboard', route: isMaster ? 'super-admin' : 'admin' },
        { id: 'settings', label: 'Open Settings', route: 'admin' }
      ],
      message: "Administrator credentials and PIN verified successfully."
    });
  } catch (err: any) {
    console.error("[Admin Verify Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected error occurred during administrative verification."
    });
  }
}
