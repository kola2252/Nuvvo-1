/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone, zero-dependency cryptographic authentication utilities for Vercel Serverless Functions.
 * Eliminates ERR_MODULE_NOT_FOUND and body-parsing stream errors in serverless environments.
 */

import crypto from "crypto";

export const AUTHORIZED_ADMIN_PHONE = process.env.ADMIN_PHONE || '9063692135';
export const ADMIN_SECURITY_PIN = process.env.ADMIN_SECURITY_PIN || process.env.ADMIN_PIN || '2135';
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || 'nuvvo_production_secure_secret_chirala_2026';
export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface ChallengePayload {
  phone: string;
  salt: string;
  codeHash: string;
  expiresAt: number;
  isDevOtp: boolean;
}

export interface SessionPayload {
  phone: string;
  role: 'normal_user' | 'admin' | 'super_admin';
  createdAt: number;
  exp: number;
}

/**
 * Universal request body parser that supports pre-parsed bodies, string bodies, and raw streams.
 */
export async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {}
  }
  if (typeof req.on === 'function') {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });
  }
  return {};
}

/**
 * Universal JSON response sender supporting both Express and raw Node/Vercel serverless responses.
 */
export function sendJsonResponse(res: any, status: number, data: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  } catch {}

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  res.statusCode = status;
  if (typeof res.end === 'function') {
    return res.end(JSON.stringify(data));
  }
}

/**
 * Normalizes phone numbers to standard 10-digit format.
 */
export function normalizePhone(phone: any): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * Generates a signed cryptographic challenge token for stateless verification across lambdas.
 */
export function generateOtpChallenge(cleanPhone: string, generatedOtp: string, isSmsConfigured: boolean) {
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = crypto.pbkdf2Sync(generatedOtp, salt, 1000, 32, 'sha256').toString('hex');
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  const challengePayload: ChallengePayload = {
    phone: cleanPhone,
    salt,
    codeHash,
    expiresAt,
    isDevOtp: !isSmsConfigured
  };

  const challengeStr = Buffer.from(JSON.stringify(challengePayload)).toString('base64url');
  const challengeSig = crypto.createHmac('sha256', SESSION_SECRET).update(challengeStr).digest('base64url');
  const challengeToken = `otp_${challengeStr}.${challengeSig}`;

  return { challengeToken, salt, codeHash, expiresAt };
}

/**
 * Verifies a signed cryptographic challenge token.
 */
export function verifyOtpChallenge(challengeToken: string, cleanPhone: string, inputCode: string): { verified: boolean; expired: boolean } {
  if (!challengeToken || !challengeToken.startsWith('otp_')) {
    return { verified: false, expired: false };
  }

  try {
    const raw = challengeToken.replace('otp_', '');
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex === -1) return { verified: false, expired: false };

    const payloadStr = raw.substring(0, dotIndex);
    const signature = raw.substring(dotIndex + 1);
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');

    if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { verified: false, expired: false };
    }

    const payload: ChallengePayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (payload.phone !== cleanPhone) {
      return { verified: false, expired: false };
    }

    if (Date.now() > payload.expiresAt) {
      return { verified: false, expired: true };
    }

    const inputHash = crypto.pbkdf2Sync(inputCode, payload.salt, 1000, 32, 'sha256').toString('hex');
    const isValid = inputHash.length === payload.codeHash.length && crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(payload.codeHash));
    return { verified: isValid, expired: false };
  } catch {
    return { verified: false, expired: false };
  }
}

/**
 * Generates an HMAC-signed session JWT.
 */
export function createSignedSessionJwt(phone: string, role: 'normal_user' | 'admin' | 'super_admin'): string {
  const payload: SessionPayload = {
    phone,
    role,
    createdAt: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `nuvvo_jwt_${payloadStr}.${signature}`;
}

/**
 * Verifies an HMAC-signed session JWT.
 */
export function verifySignedSessionJwt(token: string): { valid: boolean; phone?: string; role?: 'normal_user' | 'admin' | 'super_admin' } {
  if (!token || !token.startsWith('nuvvo_jwt_')) return { valid: false };

  try {
    const raw = token.replace('nuvvo_jwt_', '');
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex === -1) return { valid: false };

    const payloadStr = raw.substring(0, dotIndex);
    const signature = raw.substring(dotIndex + 1);
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');

    if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false };
    }

    const payload: SessionPayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) {
      return { valid: false };
    }

    return { valid: true, phone: payload.phone, role: payload.role };
  } catch {
    return { valid: false };
  }
}

/**
 * Real SMS transmission via Twilio or Fast2SMS.
 */
export async function sendRealSms(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const disableTwilio = process.env.DISABLE_TWILIO === 'true' || process.env.BLOCK_TWILIO === 'true';
  const twilioSid = !disableTwilio ? process.env.TWILIO_ACCOUNT_SID : undefined;
  const twilioToken = !disableTwilio ? process.env.TWILIO_AUTH_TOKEN : undefined;
  const twilioFrom = !disableTwilio ? process.env.TWILIO_PHONE_NUMBER : undefined;
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const formattedPhone = phone.startsWith('+') ? phone : (phone.length === 10 ? `+91${phone}` : `+${phone}`);
      const body = new URLSearchParams({
        To: formattedPhone,
        From: twilioFrom,
        Body: `Your Nuvvo verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`
      });

      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (resp.ok) {
        return { success: true };
      }
      const json: any = await resp.json().catch(() => ({}));
      return { success: false, error: json.message || `Twilio error status ${resp.status}` };
    } catch (e: any) {
      return { success: false, error: e?.message || "Twilio request failed" };
    }
  }

  if (fast2SmsKey) {
    try {
      const resp = await fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${fast2SmsKey}&route=otp&variables_values=${otp}&numbers=${phone}`);
      const json: any = await resp.json().catch(() => ({}));
      if (resp.ok && json.return) {
        return { success: true };
      }
      return { success: false, error: json.message || "Fast2SMS error" };
    } catch (e: any) {
      return { success: false, error: e?.message || "Fast2SMS request failed" };
    }
  }

  return { success: false, error: "No SMS gateway configured." };
}
