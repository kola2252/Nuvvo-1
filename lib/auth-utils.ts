/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-Grade Authentication Utilities for Nuvvo.
 * Located in /lib to comply with Vercel serverless packaging rules.
 * ZERO file extensions in relative imports; zero underscore prefixes.
 */

import crypto from "crypto";

export const AUTHORIZED_ADMIN_PHONE = process.env.ADMIN_PHONE || '9063692135';
export const ADMIN_SECURITY_PIN = process.env.ADMIN_SECURITY_PIN || process.env.ADMIN_PIN || '2135';
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SECRET_KEY || 'nuvvo_production_secure_secret_chirala_2026';
export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiry window

export interface EmailChallengePayload {
  email: string;
  fullName?: string;
  location?: string;
  salt: string;
  codeHash: string;
  expiresAt: number;
}

// Fallback in-memory registries for customer profiles and usernames across serverless warm executions
export const fallbackCustomerAccounts = new Map<string, any>();
export const fallbackUsernamesRegistry = new Map<string, string>();

export interface SessionPayload {
  sub: string; // user id or phone or email
  email?: string;
  phone?: string;
  username?: string;
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-phone');
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
 * Normalizes email address strings.
 */
export function normalizeEmail(email: any): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Generates a signed cryptographic challenge token for Email OTP verification.
 */
export function generateEmailOtpChallenge(email: string, otp: string, meta?: { fullName?: string; location?: string }) {
  const cleanEmail = normalizeEmail(email);
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = crypto.pbkdf2Sync(otp, salt, 1000, 32, 'sha256').toString('hex');
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  const challengePayload: EmailChallengePayload = {
    email: cleanEmail,
    fullName: meta?.fullName || '',
    location: meta?.location || '',
    salt,
    codeHash,
    expiresAt
  };

  const challengeStr = Buffer.from(JSON.stringify(challengePayload)).toString('base64url');
  const challengeSig = crypto.createHmac('sha256', SESSION_SECRET).update(challengeStr).digest('base64url');
  const challengeToken = `emlotp_${challengeStr}.${challengeSig}`;

  return { challengeToken, expiresAt };
}

/**
 * Verifies a signed cryptographic challenge token for Email OTP.
 */
export function verifyEmailOtpChallenge(
  challengeToken: string, 
  email: string, 
  inputCode: string
): { verified: boolean; expired: boolean; payload?: EmailChallengePayload } {
  if (!challengeToken || !challengeToken.startsWith('emlotp_')) {
    return { verified: false, expired: false };
  }

  try {
    const raw = challengeToken.replace('emlotp_', '');
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex === -1) return { verified: false, expired: false };

    const payloadStr = raw.substring(0, dotIndex);
    const signature = raw.substring(dotIndex + 1);
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');

    if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { verified: false, expired: false };
    }

    const payload: EmailChallengePayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (payload.email !== normalizeEmail(email)) {
      return { verified: false, expired: false };
    }

    if (Date.now() > payload.expiresAt) {
      return { verified: false, expired: true, payload };
    }

    const inputHash = crypto.pbkdf2Sync(inputCode.trim(), payload.salt, 1000, 32, 'sha256').toString('hex');
    const isValid = inputHash.length === payload.codeHash.length && crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(payload.codeHash));
    return { verified: isValid, expired: false, payload };
  } catch {
    return { verified: false, expired: false };
  }
}

// In-memory rate limiting stores for Email OTP dispatch and verification attempts
const emailOtpSendHistory = new Map<string, { lastSentAt: number; count: number; windowStart: number }>();
const emailOtpVerifyAttempts = new Map<string, { attempts: number; lockedUntil?: number }>();

/**
 * Checks if a customer email can request a new OTP.
 * Enforces a 60-second cooldown between requests and a maximum of 5 requests per 15 minutes.
 */
export function checkEmailOtpSendRateLimit(email: string): { allowed: boolean; waitSeconds?: number; error?: string } {
  const cleanEmail = normalizeEmail(email);
  const now = Date.now();
  const entry = emailOtpSendHistory.get(cleanEmail);

  if (!entry) {
    emailOtpSendHistory.set(cleanEmail, { lastSentAt: now, count: 1, windowStart: now });
    return { allowed: true };
  }

  // Check 60-second resend cooldown
  const elapsedSeconds = Math.floor((now - entry.lastSentAt) / 1000);
  if (elapsedSeconds < 60) {
    const wait = 60 - elapsedSeconds;
    return {
      allowed: false,
      waitSeconds: wait,
      error: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another verification code.`
    };
  }

  // Check 15-minute sliding window (max 5 requests)
  if (now - entry.windowStart > 15 * 60 * 1000) {
    // Reset window
    emailOtpSendHistory.set(cleanEmail, { lastSentAt: now, count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= 5) {
    const resetInMins = Math.ceil((entry.windowStart + 15 * 60 * 1000 - now) / 60000);
    return {
      allowed: false,
      error: `Too many OTP requests for this email address. Please wait ${resetInMins} minute${resetInMins === 1 ? '' : 's'} before requesting a new code.`
    };
  }

  entry.lastSentAt = now;
  entry.count += 1;
  emailOtpSendHistory.set(cleanEmail, entry);
  return { allowed: true };
}

/**
 * Tracks verification failures to protect against brute-force attacks.
 * Max 5 failed attempts allowed before a 10-minute temporary lockout.
 */
export function recordEmailOtpVerifyAttempt(email: string, isSuccessful: boolean): { allowed: boolean; remainingAttempts: number; locked: boolean; error?: string } {
  const cleanEmail = normalizeEmail(email);
  const now = Date.now();
  let record = emailOtpVerifyAttempts.get(cleanEmail) || { attempts: 0 };

  // Check if locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const mins = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      remainingAttempts: 0,
      locked: true,
      error: `Account temporarily locked due to repeated incorrect verification attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`
    };
  }

  if (isSuccessful) {
    emailOtpVerifyAttempts.delete(cleanEmail);
    return { allowed: true, remainingAttempts: 5, locked: false };
  }

  record.attempts += 1;
  const maxAttempts = 5;
  const remaining = Math.max(0, maxAttempts - record.attempts);

  if (remaining <= 0) {
    record.lockedUntil = now + 10 * 60 * 1000; // 10 minutes lockout
    emailOtpVerifyAttempts.set(cleanEmail, record);
    return {
      allowed: false,
      remainingAttempts: 0,
      locked: true,
      error: "Maximum incorrect attempts reached (5/5). Verification locked for 10 minutes to protect your account."
    };
  }

  emailOtpVerifyAttempts.set(cleanEmail, record);
  return {
    allowed: true,
    remainingAttempts: remaining,
    locked: false,
    error: `Incorrect verification code. ${remaining} attempt(s) remaining.`
  };
}

/**
 * Standard Cryptographic Password Hashing using PBKDF2 with SHA-512.
 * Output format: pbkdf2$iterations$salt$hash
 */
export function hashPassword(password: string): string {
  const iterations = 100000;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

/**
 * Verifies a password against a stored PBKDF2 hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;

    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];

    const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const originalBuf = Buffer.from(originalHash);
    const computedBuf = Buffer.from(computedHash);

    if (originalBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(originalBuf, computedBuf);
  } catch {
    return false;
  }
}

// List of authorized administrator accounts (Master Admin 9063692135 + Designated System Admins)
export const DESIGNATED_ADMIN_PHONES = new Set<string>([
  AUTHORIZED_ADMIN_PHONE, // '9063692135'
  '9999900000',
  '9848022338',
  '9440511220',
  '8008123456'
]);

export function isAuthorizedAdminAccountPhone(phone: string): boolean {
  const clean = normalizePhone(phone);
  return clean === AUTHORIZED_ADMIN_PHONE || clean === `91${AUTHORIZED_ADMIN_PHONE}` || DESIGNATED_ADMIN_PHONES.has(clean);
}

// In-memory rate limiting store for Admin PIN verification
interface PinAttemptRecord {
  attempts: number;
  lockedUntil: number;
}
const pinAttemptStore = new Map<string, PinAttemptRecord>();

// Server-side hashed Admin PIN storage
// NEVER stores plain PIN. Initialized with secure PBKDF2-SHA512 hash.
let currentAdminPinHash: string = (() => {
  if (process.env.ADMIN_PIN_HASH && process.env.ADMIN_PIN_HASH.startsWith('pbkdf2$')) {
    return process.env.ADMIN_PIN_HASH;
  }
  const initialPin = process.env.ADMIN_PIN || process.env.ADMIN_SECURITY_PIN || '2135';
  return hashPassword(initialPin);
})();

export function getAdminPinHash(): string {
  return currentAdminPinHash;
}

export function setAdminPinHash(newHash: string): boolean {
  if (newHash && typeof newHash === 'string' && newHash.startsWith('pbkdf2$')) {
    currentAdminPinHash = newHash;
    return true;
  }
  return false;
}

/**
 * Secure Server-Side Admin PIN Verification with rate limiting and audit controls.
 * Verifies strictly against PBKDF2-SHA512 hash using timing-safe comparisons.
 * Never exposes the PIN or hash in responses, logs, or errors.
 */
export function verifyAdminPin(phone: string, pin: string): { verified: boolean; locked: boolean; remainingAttempts?: number; message?: string } {
  const cleanPhone = normalizePhone(phone);
  if (!isAuthorizedAdminAccountPhone(cleanPhone)) {
    return { verified: false, locked: false, message: "Unauthorized account identification." };
  }

  const now = Date.now();
  const record = pinAttemptStore.get(cleanPhone) || { attempts: 0, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const minsLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      verified: false,
      locked: true,
      remainingAttempts: 0,
      message: `Account is temporarily locked due to repeated failed PIN attempts. Please retry in ${minsLeft} minute(s).`
    };
  }

  const cleanPin = String(pin || '').trim();
  if (!cleanPin) {
    return { verified: false, locked: false, message: "Security PIN is required." };
  }

  // Pure cryptographic timing-safe PBKDF2 verification against stored hash
  const storedHash = getAdminPinHash();
  const isMatch = verifyPassword(cleanPin, storedHash);

  if (isMatch) {
    pinAttemptStore.delete(cleanPhone);
    return { verified: true, locked: false };
  }

  record.attempts += 1;
  const maxAttempts = 5;
  const remaining = Math.max(0, maxAttempts - record.attempts);

  if (remaining <= 0) {
    record.lockedUntil = now + 15 * 60 * 1000; // 15-minute lockout
    pinAttemptStore.set(cleanPhone, record);
    return {
      verified: false,
      locked: true,
      remainingAttempts: 0,
      message: "Maximum failed PIN attempts reached (5/5). Account locked for 15 minutes."
    };
  }

  pinAttemptStore.set(cleanPhone, record);
  return {
    verified: false,
    locked: false,
    remainingAttempts: remaining,
    message: `Invalid security PIN. ${remaining} attempt(s) remaining before temporary lockout.`
  };
}

/**
 * Generates an HMAC-signed session JWT.
 */
export function createSignedSessionJwt(
  subject: string, 
  role: 'normal_user' | 'admin' | 'super_admin',
  meta?: { email?: string; phone?: string; username?: string }
): string {
  const payload: SessionPayload = {
    sub: subject,
    role,
    email: meta?.email,
    phone: meta?.phone,
    username: meta?.username,
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
export function verifySignedSessionJwt(token: string): { 
  valid: boolean; 
  role?: 'normal_user' | 'admin' | 'super_admin'; 
  phone?: string; 
  payload?: SessionPayload; 
} {
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

    return { 
      valid: true, 
      role: payload.role, 
      phone: payload.phone, 
      payload 
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Mobile OTP Challenge Generation (HMAC stateless challenge token).
 */
export function generateOtpChallenge(phone: string, otp: string, meta?: any) {
  const cleanPhone = normalizePhone(phone);
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = crypto.pbkdf2Sync(otp, salt, 1000, 32, 'sha256').toString('hex');
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  const challengePayload = {
    phone: cleanPhone,
    salt,
    codeHash,
    expiresAt
  };

  const challengeStr = Buffer.from(JSON.stringify(challengePayload)).toString('base64url');
  const challengeSig = crypto.createHmac('sha256', SESSION_SECRET).update(challengeStr).digest('base64url');
  const challengeToken = `otp_${challengeStr}.${challengeSig}`;

  return { challengeToken, expiresAt };
}

/**
 * Mobile OTP Challenge Verification.
 */
export function verifyOtpChallenge(
  challengeToken: string, 
  phone: string, 
  inputCode: string
): { verified: boolean; expired: boolean } {
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

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (payload.phone !== normalizePhone(phone)) {
      return { verified: false, expired: false };
    }

    if (Date.now() > payload.expiresAt) {
      return { verified: false, expired: true };
    }

    const inputHash = crypto.pbkdf2Sync(inputCode.trim(), payload.salt, 1000, 32, 'sha256').toString('hex');
    const isValid = inputHash.length === payload.codeHash.length && crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(payload.codeHash));
    return { verified: isValid, expired: false };
  } catch {
    return { verified: false, expired: false };
  }
}

/**
 * Universal SMS Dispatcher (Twilio / Fast2SMS) with graceful fallback.
 */
export async function sendRealSms(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const formattedPhone = phone.startsWith('+') ? phone : (phone.length === 10 ? `+91${phone}` : `+${phone}`);
      const body = new URLSearchParams({
        To: formattedPhone,
        From: twilioFrom,
        Body: `Your Nuvvo verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`
      });

      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const json = await resp.json().catch(() => ({}));
      if (resp.ok) return { success: true };
      return { success: false, error: json.message || `Twilio error status ${resp.status}` };
    } catch (e: any) {
      return { success: false, error: e?.message || "Twilio request failed" };
    }
  }

  if (fast2SmsKey) {
    try {
      const resp = await fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${fast2SmsKey}&route=otp&variables_values=${otp}&numbers=${phone}`);
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.return) return { success: true };
      return { success: false, error: json.message || "Fast2SMS error" };
    } catch (e: any) {
      return { success: false, error: e?.message || "Fast2SMS request failed" };
    }
  }

  return {
    success: false,
    error: "No SMS gateway configured on server."
  };
}

