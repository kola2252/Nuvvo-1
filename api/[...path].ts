/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Catch-All Router (/api/[...path]).
 * Directly intercepts key endpoints (dishes, catalog/stream, auth micro-handlers) 
 * and routes them to zero-dependency handlers to eliminate 500 errors and 504 timeouts on Vercel.
 */

import handler, { app } from "./index";
import dishesHandler from "./dishes";
import streamHandler from "./catalog/stream";
import sendOtpHandler from "./auth/send-otp";
import verifyOtpHandler from "./auth/verify-otp";
import verifyRoleHandler from "./auth/verify-role";
import sendEmailOtpHandler from "./auth/send-email-otp";
import verifyEmailOtpHandler from "./auth/verify-email-otp";
import verifyDbOtpHandler from "./auth/verify-db-otp";
import setupProfileHandler from "./auth/setup-profile";
import customerLoginHandler from "./auth/customer-login";
import adminCheckPhoneHandler from "./auth/admin-check-phone";
import adminVerifyPinHandler from "./auth/admin-verify-pin";
import verifyEmailHandler from "./verify-email";

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
  if (cleanSub === 'verify-email' || cleanSub.endsWith('/verify-email')) {
    return verifyEmailHandler(req, res);
  }
  if (cleanSub === 'auth/send-email-otp' || cleanSub.endsWith('/send-email-otp')) {
    return sendEmailOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-email-otp' || cleanSub.endsWith('/verify-email-otp')) {
    return verifyEmailOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-db-otp' || cleanSub.endsWith('/verify-db-otp')) {
    return verifyDbOtpHandler(req, res);
  }
  if (cleanSub === 'auth/setup-profile' || cleanSub.endsWith('/setup-profile')) {
    return setupProfileHandler(req, res);
  }
  if (cleanSub === 'auth/customer-login' || cleanSub.endsWith('/customer-login')) {
    return customerLoginHandler(req, res);
  }
  if (cleanSub === 'auth/admin-check-phone' || cleanSub.endsWith('/admin-check-phone')) {
    return adminCheckPhoneHandler(req, res);
  }
  if (cleanSub === 'auth/admin-verify-pin' || cleanSub.endsWith('/admin-verify-pin')) {
    return adminVerifyPinHandler(req, res);
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
