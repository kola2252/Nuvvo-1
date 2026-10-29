import {
  parseRequestBody,
  sendJsonResponse,
  verifySignedSessionJwt
} from "./_auth-utils.ts";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight OPTIONS request
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

    return sendJsonResponse(res, 200, {
      role: verified.role,
      phone: verified.phone,
      isAuthorizedAdmin: verified.role === 'admin' || verified.role === 'super_admin'
    });
  } catch (err: any) {
    console.error("[Verify Role Error]:", err?.message || err);
    return sendJsonResponse(res, 200, { role: 'normal_user', isAuthorizedAdmin: false });
  }
}
