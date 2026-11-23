/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Catch-all Router for /api/auth/*.
 * Routes requests to dedicated zero-dependency auth micro-handlers without importing external server bundles.
 */

import sendOtpHandler from "./send-otp";
import verifyOtpHandler from "./verify-otp";
import verifyRoleHandler from "./verify-role";
import debugOtpHandler from "./debug-otp";
import sendEmailOtpHandler from "./send-email-otp";
import verifyEmailOtpHandler from "./verify-email-otp";
import setupProfileHandler from "./setup-profile";
import customerRegisterHandler from "./customer-register";
import customerLoginHandler from "./customer-login";
import customerProfileHandler from "./customer-profile";
import forgotPasswordHandler from "./forgot-password";
import resendVerificationHandler from "./resend-verification";
import resetPasswordHandler from "./reset-password";
import changePasswordHandler from "./change-password";
import deleteAccountHandler from "./delete-account";
import adminCheckPhoneHandler from "./admin-check-phone";
import adminVerifyPinHandler from "./admin-verify-pin";
import adminUpdatePinHandler from "./admin-update-pin";
import emailDiagnosticsHandler from "./email-diagnostics";
import { sendJsonResponse } from "../../lib/auth-utils";

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

  // Route matches in order of specificity
  if (cleanSub === 'customer-register' || cleanSub.endsWith('/customer-register')) {
    return customerRegisterHandler(req, res);
  }
  if (cleanSub === 'customer-profile' || cleanSub.endsWith('/customer-profile')) {
    return customerProfileHandler(req, res);
  }
  if (cleanSub === 'forgot-password' || cleanSub.endsWith('/forgot-password')) {
    return forgotPasswordHandler(req, res);
  }
  if (cleanSub === 'resend-verification' || cleanSub.endsWith('/resend-verification')) {
    return resendVerificationHandler(req, res);
  }
  if (cleanSub === 'send-email-otp' || cleanSub.endsWith('/send-email-otp')) {
    return sendEmailOtpHandler(req, res);
  }
  if (cleanSub === 'verify-email-otp' || cleanSub.endsWith('/verify-email-otp')) {
    return verifyEmailOtpHandler(req, res);
  }
  if (cleanSub === 'setup-profile' || cleanSub.endsWith('/setup-profile')) {
    return setupProfileHandler(req, res);
  }
  if (cleanSub === 'customer-login' || cleanSub.endsWith('/customer-login')) {
    return customerLoginHandler(req, res);
  }
  if (cleanSub === 'reset-password' || cleanSub.endsWith('/reset-password')) {
    return resetPasswordHandler(req, res);
  }
  if (cleanSub === 'change-password' || cleanSub.endsWith('/change-password')) {
    return changePasswordHandler(req, res);
  }
  if (cleanSub === 'delete-account' || cleanSub.endsWith('/delete-account')) {
    return deleteAccountHandler(req, res);
  }
  if (cleanSub === 'admin-check-phone' || cleanSub.endsWith('/admin-check-phone')) {
    return adminCheckPhoneHandler(req, res);
  }
  if (cleanSub === 'admin-verify-pin' || cleanSub.endsWith('/admin-verify-pin')) {
    return adminVerifyPinHandler(req, res);
  }
  if (cleanSub === 'admin-update-pin' || cleanSub.endsWith('/admin-update-pin')) {
    return adminUpdatePinHandler(req, res);
  }
  if (cleanSub === 'send-otp' || cleanSub.endsWith('/send-otp')) {
    return sendOtpHandler(req, res);
  }
  if (cleanSub === 'verify-otp' || cleanSub.endsWith('/verify-otp')) {
    return verifyOtpHandler(req, res);
  }
  if (cleanSub === 'verify-role' || cleanSub.endsWith('/verify-role')) {
    return verifyRoleHandler(req, res);
  }
  if (cleanSub === 'email-diagnostics' || cleanSub.endsWith('/email-diagnostics')) {
    return emailDiagnosticsHandler(req, res);
  }
  if (cleanSub === 'debug-otp' || cleanSub.endsWith('/debug-otp')) {
    return debugOtpHandler(req, res);
  }

  return sendJsonResponse(res, 200, {
    success: true,
    service: "nuvvo-auth-gateway",
    endpoints: [
      "/api/auth/customer-register",
      "/api/auth/customer-login",
      "/api/auth/customer-profile",
      "/api/auth/forgot-password",
      "/api/auth/resend-verification",
      "/api/auth/send-email-otp",
      "/api/auth/verify-email-otp",
      "/api/auth/setup-profile",
      "/api/auth/admin-check-phone",
      "/api/auth/admin-verify-pin",
      "/api/auth/send-otp",
      "/api/auth/verify-otp",
      "/api/auth/verify-role",
      "/api/auth/debug-otp"
    ]
  });
}
