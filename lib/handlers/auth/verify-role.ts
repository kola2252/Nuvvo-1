import {
  maskAdminPhoneDisplay,
  parseRequestBody,
  sendJsonResponse,
  verifySignedSessionJwt
} from "../../auth-utils";

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (!token) {
      const body = await parseRequestBody(req);
      token = body?.token || null;
    }

    if (!token) {
      return sendJsonResponse(res, 200, { role: 'normal_user', isAuthorizedAdmin: false });
    }

    const verified = verifySignedSessionJwt(token);
    if (!verified.valid) {
      return sendJsonResponse(res, 200, { role: 'normal_user', isAuthorizedAdmin: false });
    }

    const isAuthorizedAdmin = verified.role === 'admin' || verified.role === 'super_admin';
    return sendJsonResponse(res, 200, {
      role: verified.role,
      phone: isAuthorizedAdmin ? maskAdminPhoneDisplay(verified.phone) : verified.phone,
      maskedPhone: isAuthorizedAdmin ? maskAdminPhoneDisplay(verified.phone) : undefined,
      isAuthorizedAdmin
    });
  } catch (err: any) {
    console.error("[Verify Role Error]:", err?.message || err);
    return sendJsonResponse(res, 200, { role: 'normal_user', isAuthorizedAdmin: false });
  }
}
