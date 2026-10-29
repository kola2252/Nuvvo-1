/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Catch-All Router (/api/[...path]).
 * Directly intercepts key endpoints (dishes, catalog/stream, send-otp, verify-otp) 
 * and routes them to zero-dependency handlers to eliminate 500 errors and 504 timeouts on Vercel.
 */

import handler, { app } from "./index.ts";
import dishesHandler from "./dishes.ts";
import streamHandler from "./catalog/stream.ts";
import sendOtpHandler from "./auth/send-otp.ts";
import verifyOtpHandler from "./auth/verify-otp.ts";
import verifyRoleHandler from "./auth/verify-role.ts";

export default function catchAllHandler(req: any, res: any) {
  let sub = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (!sub && typeof req.url === 'string') {
    const raw = req.url.split('?')[0].replace(/^\/api\/?/, '');
    sub = raw;
  }
  const cleanSub = sub.replace(/^\/+/, '').split('?')[0].toLowerCase();

  if (cleanSub === 'dishes' || cleanSub.endsWith('/dishes')) {
    return dishesHandler(req, res);
  }
  if (cleanSub === 'catalog/stream' || cleanSub.endsWith('/stream')) {
    return streamHandler(req, res);
  }
  if (cleanSub === 'auth/send-otp' || cleanSub.endsWith('/send-otp')) {
    return sendOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-otp' || cleanSub.endsWith('/verify-otp')) {
    return verifyOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-role' || cleanSub.endsWith('/verify-role')) {
    return verifyRoleHandler(req, res);
  }

  return handler(req, res);
}

export { app };
