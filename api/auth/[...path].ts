/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Catch-all Router for /api/auth/*.
 * Routes requests to dedicated zero-dependency auth micro-handlers without importing external server bundles.
 */

import sendOtpHandler from "./send-otp.ts";
import verifyOtpHandler from "./verify-otp.ts";
import verifyRoleHandler from "./verify-role.ts";
import debugOtpHandler from "./debug-otp.ts";
import { sendJsonResponse } from "./_auth-utils.ts";

export default function handler(req: any, res: any) {
  let sub = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  
  if (!sub && typeof req.url === 'string') {
    const rawPath = req.url.split('?')[0];
    if (rawPath.startsWith('/api/auth/')) {
      sub = rawPath.replace('/api/auth/', '');
    } else if (req.url.includes('path=')) {
      try {
        const qIndex = req.url.indexOf('?');
        const params = new URLSearchParams(req.url.substring(qIndex + 1));
        sub = params.get('path') || '';
      } catch {}
    }
  }

  const cleanSub = sub.replace(/^\/+/, '').split('?')[0].toLowerCase();

  if (cleanSub === 'send-otp' || cleanSub.endsWith('/send-otp') || cleanSub.includes('send')) {
    return sendOtpHandler(req, res);
  }
  if (cleanSub === 'verify-otp' || cleanSub.endsWith('/verify-otp') || cleanSub.includes('verify-otp')) {
    return verifyOtpHandler(req, res);
  }
  if (cleanSub === 'verify-role' || cleanSub.endsWith('/verify-role') || cleanSub.includes('role')) {
    return verifyRoleHandler(req, res);
  }
  if (cleanSub === 'debug-otp' || cleanSub.endsWith('/debug-otp') || cleanSub.includes('debug')) {
    return debugOtpHandler(req, res);
  }

  return sendJsonResponse(res, 200, {
    success: true,
    service: "nuvvo-auth-gateway",
    endpoints: ["/api/auth/send-otp", "/api/auth/verify-otp", "/api/auth/verify-role", "/api/auth/debug-otp"]
  });
}
