import app from "../server";
import dishesHandler from "../lib/handlers/dishes";
import streamHandler from "../lib/handlers/catalog-stream";
import sendOtpHandler from "../lib/handlers/auth/send-otp";
import verifyOtpHandler from "../lib/handlers/auth/verify-otp";
import verifyRoleHandler from "../lib/handlers/auth/verify-role";
import debugOtpHandler from "../lib/handlers/auth/debug-otp";
import sendEmailOtpHandler from "../lib/handlers/auth/send-email-otp";
import verifyEmailOtpHandler from "../lib/handlers/auth/verify-email-otp";
import verifyDbOtpHandler from "../lib/handlers/auth/verify-db-otp";
import setupProfileHandler from "../lib/handlers/auth/setup-profile";
import customerRegisterHandler from "../lib/handlers/auth/customer-register";
import customerLoginHandler from "../lib/handlers/auth/customer-login";
import customerProfileHandler from "../lib/handlers/auth/customer-profile";
import forgotPasswordHandler from "../lib/handlers/auth/forgot-password";
import resendVerificationHandler from "../lib/handlers/auth/resend-verification";
import resetPasswordHandler from "../lib/handlers/auth/reset-password";
import changePasswordHandler from "../lib/handlers/auth/change-password";
import deleteAccountHandler from "../lib/handlers/auth/delete-account";
import adminCheckPhoneHandler from "../lib/handlers/auth/admin-check-phone";
import adminVerifyPinHandler from "../lib/handlers/auth/admin-verify-pin";
import adminUpdatePinHandler from "../lib/handlers/auth/admin-update-pin";
import emailDiagnosticsHandler from "../lib/handlers/auth/email-diagnostics";
import adminVerifyHandler from "../lib/handlers/admin/verify";
import verifyEmailHandler from "../lib/handlers/verify-email";
import verifySmtpHandler from "../lib/handlers/verify-smtp";

/**
 * Resolves the true request path and preserves real query params while removing
 * synthetic Vercel rewrite ?path=... forwarding parameters.
 */
function resolveRequestTarget(req: any): { pathname: string; queryString: string } {
  let pathname = '/api';

  // 1. If Vercel rewrite forwarded query.path (e.g. ?path=auth/send-otp or ?path=dishes)
  if (req.query?.path) {
    const sub = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path);
    if (sub && sub !== 'index' && !sub.includes('[...path]')) {
      pathname = `/api/${sub.replace(/^\/+/, '')}`;
    }
  } else if (typeof req.url === 'string' && req.url.includes('path=')) {
    try {
      const qIndex = req.url.indexOf('?');
      if (qIndex !== -1) {
        const params = new URLSearchParams(req.url.substring(qIndex + 1));
        const p = params.get('path');
        if (p && p !== 'index' && !p.includes('[...path]')) {
          pathname = `/api/${p.replace(/^\/+/, '')}`;
        }
      }
    } catch {}
  } else if (typeof req.headers?.['x-now-route-matches'] === 'string') {
    const match = req.headers['x-now-route-matches'].match(/(?:^|&)1=([^&]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).replace(/^\/+/, '');
      if (decoded && decoded !== 'index' && !decoded.includes('[...path]')) {
        pathname = `/api/${decoded}`;
      }
    }
  } else {
    const rawHeader =
      req.headers?.['x-original-url'] ||
      req.headers?.['x-forwarded-uri'] ||
      req.headers?.['x-matched-path'] ||
      req.headers?.['x-vercel-matched-path'];

    if (
      typeof rawHeader === 'string' &&
      rawHeader.startsWith('/api/') &&
      rawHeader !== '/api/' &&
      rawHeader !== '/api/index' &&
      !rawHeader.includes('[...path]')
    ) {
      pathname = rawHeader.split('?')[0];
    } else if (typeof req.url === 'string' && req.url) {
      const pathOnly = req.url.split('?')[0];
      if (pathOnly.startsWith('/api/') && pathOnly !== '/api/' && pathOnly !== '/api/index' && !pathOnly.includes('[...path]')) {
        pathname = pathOnly;
      } else if (pathOnly && pathOnly !== '/' && pathOnly !== '/api' && pathOnly !== '/index' && !pathOnly.includes('[...path]')) {
        pathname = `/api/${pathOnly.replace(/^\/+/, '')}`;
      }
    }
  }

  let queryString = '';
  if (typeof req.url === 'string') {
    const queryIndex = req.url.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(req.url.substring(queryIndex + 1));
      params.delete('path');
      const cleaned = params.toString();
      if (cleaned) {
        queryString = `?${cleaned}`;
      }
    }
  }

  return { pathname, queryString };
}

/**
 * Single Consolidated Vercel Serverless Function handling all /api and /api/* endpoints.
 */
export default function handler(req: any, res: any) {
  const { pathname, queryString } = resolveRequestTarget(req);
  const cleanSub = pathname.replace(/^\/api\/?/, '').replace(/^\/+/, '').toLowerCase();

  req.url = pathname + queryString;

  // Fast-path micro-handlers (preserve exact routes & security controls)
  if (cleanSub === 'dishes' && (!req.method || req.method === 'GET' || req.method === 'OPTIONS')) {
    return dishesHandler(req, res);
  }
  if (cleanSub === 'catalog/stream') {
    return streamHandler(req, res);
  }
  if (cleanSub === 'verify-email') {
    return verifyEmailHandler(req, res);
  }
  if (cleanSub === 'verify-smtp') {
    return verifySmtpHandler(req, res);
  }
  if (cleanSub === 'admin/check-phone') {
    return adminCheckPhoneHandler(req, res);
  }
  if (cleanSub === 'admin/verify') {
    return adminVerifyHandler(req, res);
  }
  if (cleanSub === 'auth/send-email-otp') {
    return sendEmailOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-email-otp') {
    return verifyEmailOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-db-otp') {
    return verifyDbOtpHandler(req, res);
  }
  if (cleanSub === 'auth/setup-profile') {
    return setupProfileHandler(req, res);
  }
  if (cleanSub === 'auth/customer-register') {
    return customerRegisterHandler(req, res);
  }
  if (cleanSub === 'auth/customer-login') {
    return customerLoginHandler(req, res);
  }
  if (cleanSub === 'auth/customer-profile') {
    return customerProfileHandler(req, res);
  }
  if (cleanSub === 'auth/forgot-password') {
    return forgotPasswordHandler(req, res);
  }
  if (cleanSub === 'auth/resend-verification') {
    return resendVerificationHandler(req, res);
  }
  if (cleanSub === 'auth/reset-password') {
    return resetPasswordHandler(req, res);
  }
  if (cleanSub === 'auth/change-password') {
    return changePasswordHandler(req, res);
  }
  if (cleanSub === 'auth/delete-account') {
    return deleteAccountHandler(req, res);
  }
  if (cleanSub === 'auth/admin-check-phone') {
    return adminCheckPhoneHandler(req, res);
  }
  if (cleanSub === 'auth/admin-verify-pin') {
    return adminVerifyPinHandler(req, res);
  }
  if (cleanSub === 'auth/admin-update-pin') {
    return adminUpdatePinHandler(req, res);
  }
  if (cleanSub === 'auth/email-diagnostics') {
    return emailDiagnosticsHandler(req, res);
  }
  if (cleanSub === 'auth/debug-otp') {
    return debugOtpHandler(req, res);
  }
  if (cleanSub === 'auth/send-otp') {
    return sendOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-otp') {
    return verifyOtpHandler(req, res);
  }
  if (cleanSub === 'auth/verify-role') {
    return verifyRoleHandler(req, res);
  }

  return app(req, res);
}

export { app };
