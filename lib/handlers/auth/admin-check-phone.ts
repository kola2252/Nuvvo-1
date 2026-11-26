/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/admin-check-phone
 * Verifies if a mobile number belongs to an authorized Admin/Super Admin.
 * Displays PIN input field ONLY after successful server-side account verification.
 */

import {
  isAuthorizedAdminAccountPhone,
  maskAdminPhoneDisplay,
  normalizePhone,
  parseRequestBody,
  resolveAdminCredentialRecord,
  sendJsonResponse
} from "../../auth-utils";

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { phone } = body || {};

    if (!phone) {
      return sendJsonResponse(res, 400, { success: false, error: "Mobile number is required." });
    }

    const cleanPhone = normalizePhone(phone);
    const isAuthorized = isAuthorizedAdminAccountPhone(cleanPhone);

    if (isAuthorized) {
      const cred = await resolveAdminCredentialRecord();
      const maskedPhone = maskAdminPhoneDisplay(cleanPhone);

      return sendJsonResponse(res, 200, {
        success: true,
        isAuthorizedAdmin: true,
        promptForPin: true,
        masterCodeConfigured: cred.configured,
        maskedPhone,
        message: "Authorized administrator account verified."
      });
    }

    return sendJsonResponse(res, 403, {
      success: false,
      isAuthorizedAdmin: false,
      promptForPin: false,
      error: "Access Denied: This mobile number is not associated with an authorized Admin or Super Admin account."
    });
  } catch (err: any) {
    console.error("[Admin Check Phone Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An error occurred while verifying administrator credentials."
    });
  }
}
