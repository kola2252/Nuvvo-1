import app from "../server.js";
import sendOtpHandler from "./send-otp.ts";
import verifyOtpHandler from "./verify-otp.ts";
import verifyRoleHandler from "./verify-role.ts";
import debugOtpHandler from "./debug-otp.ts";

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

  const cleanSub = sub.replace(/^\/+/, '').split('?')[0];

  if (cleanSub === 'send-otp') {
    return sendOtpHandler(req, res);
  }
  if (cleanSub === 'verify-otp') {
    return verifyOtpHandler(req, res);
  }
  if (cleanSub === 'verify-role') {
    return verifyRoleHandler(req, res);
  }
  if (cleanSub === 'debug-otp') {
    return debugOtpHandler(req, res);
  }

  const queryIndex = typeof req.url === 'string' ? req.url.indexOf('?') : -1;
  const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '';

  req.url = cleanSub ? `/api/auth/${cleanSub}${queryString}` : `/api/auth${queryString}`;
  return app(req, res);
}

export { app };
