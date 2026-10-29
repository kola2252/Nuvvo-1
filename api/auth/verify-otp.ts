import {
  AUTHORIZED_ADMIN_PHONE,
  ADMIN_SECURITY_PIN,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  verifyOtpChallenge,
  createSignedSessionJwt
} from "./_auth-utils.ts";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { phone, otp, requestedRole, challengeToken } = body || {};

    if (!phone) {
      return sendJsonResponse(res, 400, { success: false, error: "Phone number is required." });
    }

    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length < 10) {
      return sendJsonResponse(res, 400, { success: false, error: "Valid 10-digit mobile number required." });
    }

    const inputCode = String(otp || '').trim();
    if (!inputCode || inputCode.length < 4 || inputCode.length > 6) {
      return sendJsonResponse(res, 400, { success: false, error: "A valid verification OTP code is required (6 digits)." });
    }

    let isVerified = false;
    let isExpired = false;

    // Admin master pin fallback verification (for protected administrator only)
    if (cleanPhone === AUTHORIZED_ADMIN_PHONE && inputCode === ADMIN_SECURITY_PIN) {
      isVerified = true;
    }

    // Verify using cryptographic signed challenge token
    if (!isVerified && typeof challengeToken === 'string' && challengeToken.startsWith('otp_')) {
      const challengeCheck = verifyOtpChallenge(challengeToken, cleanPhone, inputCode);
      if (challengeCheck.expired) {
        isExpired = true;
      } else if (challengeCheck.verified) {
        isVerified = true;
      }
    }

    if (isExpired) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "The verification code has expired (5-minute validity). Please request a fresh OTP."
      });
    }

    if (!isVerified) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: "The verification OTP code is incorrect. Please check the 6-digit code and try again."
      });
    }

    // Role assignment: strictly enforce super_admin role only for authorized admin phone
    let role: 'normal_user' | 'admin' | 'super_admin' = 'normal_user';
    if (cleanPhone === AUTHORIZED_ADMIN_PHONE && (requestedRole === 'Admin' || requestedRole === 'super_admin')) {
      role = 'super_admin';
    } else {
      role = 'normal_user';
    }

    // Issue signed session JWT
    const token = createSignedSessionJwt(cleanPhone, role);

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      role,
      isAuthorizedAdmin: role === 'super_admin',
      phone: cleanPhone,
      message: "Verification successful."
    });
  } catch (err: any) {
    console.error("[OTP Verify Serverless Error] Failed in /api/auth/verify-otp:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "An unexpected server error occurred during verification. Please try again."
    });
  }
}
