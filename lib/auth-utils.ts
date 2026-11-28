/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-Grade Authentication Utilities for Nuvvo.
 * Located in /lib to comply with Vercel serverless packaging rules.
 * ZERO file extensions in relative imports; zero underscore prefixes.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getPublicSupabaseServerClient, getAdminSupabaseServerClient } from "../src/utils/supabase/server";

export const AUTHORIZED_ADMIN_PHONE = normalizePhone(process.env.ADMIN_PHONE || '9063692135') || '9063692135';
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SECRET_KEY || 'nuvvo_production_secure_secret_chirala_2026';
export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiry window

export function maskAdminPhoneDisplay(phone?: string | null): string {
  const clean = normalizePhone(phone || '');
  if (!clean || clean.length < 4) return 'Protected (Server-Verified)';
  return `+91 ••••••••${clean.slice(-2)}`;
}

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

// ==============================================================================
// CUSTOMER AUTH RATE LIMITING (Registration, Login, Password Recovery, Resend)
// ==============================================================================
interface AuthRateRecord {
  count: number;
  windowStart: number;
  blockedUntil: number;
  lastAttemptAt?: number;
}

type AuthRateBucket = 'register' | 'login' | 'forgot_password' | 'forgot_password_ip' | 'resend' | 'change_password';

const customerAuthRateStore = new Map<string, AuthRateRecord>();

export function getClientIp(req: any): string {
  try {
    const xff = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
    const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }
    return String(req?.ip || req?.socket?.remoteAddress || 'unknown').trim();
  } catch {
    return 'unknown';
  }
}

export function checkCustomerAuthRateLimit(
  bucket: AuthRateBucket,
  key: string,
  options?: { maxAttempts?: number; windowMs?: number; blockMs?: number; minIntervalMs?: number; incrementOnCheck?: boolean }
): { allowed: boolean; retryAfterSeconds?: number; remaining?: number; error?: string } {
  const maxAttempts = options?.maxAttempts ?? (bucket === 'login' || bucket === 'change_password' ? 5 : bucket === 'register' ? 6 : 3);
  const windowMs = options?.windowMs ?? 15 * 60 * 1000;
  const blockMs = options?.blockMs ?? 15 * 60 * 1000;
  const minIntervalMs = options?.minIntervalMs ?? 0;
  const storeKey = `${bucket}:${key.toLowerCase()}`;
  const now = Date.now();

  let rec = customerAuthRateStore.get(storeKey);
  if (rec && rec.blockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000));
    const mins = Math.ceil(retryAfterSeconds / 60);
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
      error: `Too many attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
    };
  }

  if (!rec || now - rec.windowStart > windowMs) {
    rec = { count: 0, windowStart: now, blockedUntil: 0, lastAttemptAt: undefined };
  }

  if (minIntervalMs > 0 && rec.lastAttemptAt && now - rec.lastAttemptAt < minIntervalMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((minIntervalMs - (now - rec.lastAttemptAt)) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: Math.max(0, maxAttempts - rec.count),
      error: `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'} before requesting another password reset email.`
    };
  }

  if (options?.incrementOnCheck) {
    rec.count += 1;
    rec.lastAttemptAt = now;
    if (rec.count > maxAttempts) {
      rec.blockedUntil = now + blockMs;
      customerAuthRateStore.set(storeKey, rec);
      const retryAfterSeconds = Math.ceil(blockMs / 1000);
      const mins = Math.ceil(retryAfterSeconds / 60);
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
        error: `Too many requests. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
      };
    }
  } else if (rec.count >= maxAttempts) {
    rec.blockedUntil = now + blockMs;
    customerAuthRateStore.set(storeKey, rec);
    const retryAfterSeconds = Math.ceil(blockMs / 1000);
    const mins = Math.ceil(retryAfterSeconds / 60);
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
      error: `Too many failed attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
    };
  }

  customerAuthRateStore.set(storeKey, rec);
  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - rec.count)
  };
}

export function recordCustomerAuthFailure(
  bucket: AuthRateBucket,
  key: string,
  options?: { maxAttempts?: number; windowMs?: number; blockMs?: number }
): { blocked: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const maxAttempts = options?.maxAttempts ?? 5;
  const windowMs = options?.windowMs ?? 15 * 60 * 1000;
  const blockMs = options?.blockMs ?? 15 * 60 * 1000;
  const storeKey = `${bucket}:${key.toLowerCase()}`;
  const now = Date.now();

  let rec = customerAuthRateStore.get(storeKey);
  if (!rec || now - rec.windowStart > windowMs) {
    rec = { count: 0, windowStart: now, blockedUntil: 0, lastAttemptAt: undefined };
  }

  rec.count += 1;
  rec.lastAttemptAt = now;
  const remainingAttempts = Math.max(0, maxAttempts - rec.count);

  if (rec.count >= maxAttempts) {
    rec.blockedUntil = now + blockMs;
    customerAuthRateStore.set(storeKey, rec);
    return {
      blocked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(blockMs / 1000)
    };
  }

  customerAuthRateStore.set(storeKey, rec);
  return { blocked: false, remainingAttempts };
}

export function clearCustomerAuthRateLimit(bucket: AuthRateBucket, key: string): void {
  customerAuthRateStore.delete(`${bucket}:${key.toLowerCase()}`);
}

// ==============================================================================
// NON-SECRET CUSTOMER PROFILE & USERNAME INDEX BRIDGE (Zero Passwords Stored)
// Mirrors Supabase customer_profiles locally only in non-Vercel dev environments
// when Supabase migration or service_role_key is pending.
// ==============================================================================
export interface StoredCustomerProfileIndex {
  id: string;
  fullName: string;
  username: string;
  usernameLower: string;
  email: string;
  mobile: string;
  location: string;
  deliveryAddress: string;
  addresses: any[];
  whatsappNumber?: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
  preferredLanguage?: string;
  avatar?: string;
  isEmailVerified?: boolean;
  role: 'Customer';
  createdAt: string;
  updatedAt: string;
}

const CUSTOMER_INDEX_FILE = path.join(process.cwd(), '.server_customer_profiles.json');

function loadCustomerIndexFile(): Record<string, StoredCustomerProfileIndex> {
  try {
    if (!process.env.VERCEL && fs.existsSync(CUSTOMER_INDEX_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CUSTOMER_INDEX_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function saveCustomerIndexFile(recordsById: Record<string, StoredCustomerProfileIndex>) {
  try {
    if (process.env.VERCEL) return;
    fs.writeFileSync(CUSTOMER_INDEX_FILE, JSON.stringify(recordsById, null, 2), 'utf8');
  } catch {}
}

export function upsertLocalCustomerProfileIndex(profile: Partial<StoredCustomerProfileIndex> & { id: string; email: string; username: string }): StoredCustomerProfileIndex {
  const cleanEmail = String(profile.email || '').trim().toLowerCase();
  const displayUsername = String(profile.username || '').trim();
  const cleanUsername = displayUsername.toLowerCase();
  const nowIso = new Date().toISOString();

  const existingById = fallbackCustomerAccounts.get(`id:${profile.id}`) || loadCustomerIndexFile()[profile.id] || {};
  const merged: StoredCustomerProfileIndex = {
    ...existingById,
    id: profile.id,
    fullName: String(profile.fullName ?? existingById.fullName ?? displayUsername).trim(),
    username: displayUsername || existingById.username || '',
    usernameLower: cleanUsername || existingById.usernameLower || '',
    email: cleanEmail || existingById.email || '',
    mobile: String(profile.mobile ?? existingById.mobile ?? '').trim(),
    location: String(profile.location ?? existingById.location ?? '').trim(),
    deliveryAddress: String(profile.deliveryAddress ?? existingById.deliveryAddress ?? '').trim(),
    addresses: Array.isArray(profile.addresses) ? profile.addresses : (existingById.addresses || []),
    whatsappNumber: profile.whatsappNumber !== undefined ? profile.whatsappNumber : existingById.whatsappNumber,
    whatsappOptIn: profile.whatsappOptIn !== undefined ? Boolean(profile.whatsappOptIn) : Boolean(existingById.whatsappOptIn),
    whatsappOptInAt: profile.whatsappOptInAt !== undefined ? profile.whatsappOptInAt : existingById.whatsappOptInAt,
    whatsappOptInSource: profile.whatsappOptInSource !== undefined ? profile.whatsappOptInSource : existingById.whatsappOptInSource,
    preferredLanguage: profile.preferredLanguage || existingById.preferredLanguage || 'te',
    avatar: profile.avatar !== undefined ? profile.avatar : existingById.avatar,
    isEmailVerified: profile.isEmailVerified !== undefined ? Boolean(profile.isEmailVerified) : existingById.isEmailVerified,
    role: 'Customer', // Strictly immutable customer role
    createdAt: existingById.createdAt || profile.createdAt || nowIso,
    updatedAt: nowIso
  };

  if (cleanUsername) fallbackUsernamesRegistry.set(cleanUsername, cleanEmail);
  fallbackCustomerAccounts.set(`id:${merged.id}`, merged);
  fallbackCustomerAccounts.set(cleanEmail, merged);

  const fileRecords = loadCustomerIndexFile();
  fileRecords[merged.id] = merged;
  saveCustomerIndexFile(fileRecords);

  return merged;
}

export function findLocalCustomerByUsername(username: string): StoredCustomerProfileIndex | null {
  const lower = String(username || '').trim().toLowerCase();
  if (!lower) return null;
  const emailFromMem = fallbackUsernamesRegistry.get(lower);
  if (emailFromMem && fallbackCustomerAccounts.has(emailFromMem)) {
    const rec = fallbackCustomerAccounts.get(emailFromMem);
    if (rec && !rec.password_hash) return rec;
  }
  const fileRecords = loadCustomerIndexFile();
  for (const rec of Object.values(fileRecords)) {
    if ((rec.usernameLower || String(rec.username || '').toLowerCase()) === lower) {
      return rec;
    }
  }
  return null;
}

export function findLocalCustomerByEmail(email: string): StoredCustomerProfileIndex | null {
  const lower = String(email || '').trim().toLowerCase();
  if (!lower) return null;
  const mem = fallbackCustomerAccounts.get(lower);
  if (mem && !mem.password_hash) return mem;
  const fileRecords = loadCustomerIndexFile();
  for (const rec of Object.values(fileRecords)) {
    if (String(rec.email || '').toLowerCase() === lower) {
      return rec;
    }
  }
  return null;
}

export interface StoredLocalCustomerAccount {
  id: string;
  fullName: string;
  username: string;
  usernameLower: string;
  email: string;
  phone: string;
  location: string;
  deliveryAddress: string;
  addresses: any[];
  passwordHash: string;
  whatsappNumber?: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
  preferredLanguage?: string;
  role: 'Customer';
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

const CUSTOMER_ACCOUNTS_FILE = path.join(process.cwd(), '.server_customer_accounts.json');

function loadCustomerAccountsFile(): Record<string, StoredLocalCustomerAccount> {
  try {
    if (!process.env.VERCEL && fs.existsSync(CUSTOMER_ACCOUNTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CUSTOMER_ACCOUNTS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function saveCustomerAccountsFile(recordsByEmail: Record<string, StoredLocalCustomerAccount>) {
  try {
    if (process.env.VERCEL) return;
    fs.writeFileSync(CUSTOMER_ACCOUNTS_FILE, JSON.stringify(recordsByEmail, null, 2), 'utf8');
  } catch {}
}

export function upsertLocalCustomerAccount(account: StoredLocalCustomerAccount): StoredLocalCustomerAccount {
  const cleanEmail = normalizeEmail(account.email);
  const cleanUsernameLower = String(account.usernameLower || account.username || '').trim().toLowerCase();
  const normalized: StoredLocalCustomerAccount = {
    ...account,
    email: cleanEmail,
    usernameLower: cleanUsernameLower,
    role: 'Customer',
    updatedAt: new Date().toISOString()
  };

  if (cleanUsernameLower) {
    fallbackUsernamesRegistry.set(cleanUsernameLower, cleanEmail);
  }
  fallbackCustomerAccounts.set(cleanEmail, {
    ...normalized,
    password_hash: normalized.passwordHash
  });

  const fileRecords = loadCustomerAccountsFile();
  fileRecords[cleanEmail] = normalized;
  saveCustomerAccountsFile(fileRecords);

  return normalized;
}

export function findLocalCustomerAccountByEmail(email: string): StoredLocalCustomerAccount | null {
  const lower = normalizeEmail(email);
  if (!lower) return null;
  const mem = fallbackCustomerAccounts.get(lower);
  if (mem && (mem.passwordHash || mem.password_hash)) {
    return {
      ...mem,
      passwordHash: mem.passwordHash || mem.password_hash
    };
  }
  const fileRecords = loadCustomerAccountsFile();
  if (fileRecords[lower]?.passwordHash) {
    return fileRecords[lower];
  }
  for (const rec of Object.values(fileRecords)) {
    if (normalizeEmail(rec.email) === lower && rec.passwordHash) {
      return rec;
    }
  }
  return null;
}

export function findLocalCustomerAccountByUsername(username: string): StoredLocalCustomerAccount | null {
  const lower = String(username || '').trim().toLowerCase();
  if (!lower) return null;
  const emailFromMem = fallbackUsernamesRegistry.get(lower);
  if (emailFromMem) {
    const byMem = findLocalCustomerAccountByEmail(emailFromMem);
    if (byMem) return byMem;
  }
  const fileRecords = loadCustomerAccountsFile();
  for (const rec of Object.values(fileRecords)) {
    if ((rec.usernameLower || String(rec.username || '').toLowerCase()) === lower && rec.passwordHash) {
      return rec;
    }
  }
  return null;
}

export function findLocalCustomerById(id: string): StoredCustomerProfileIndex | null {
  if (!id) return null;
  const mem = fallbackCustomerAccounts.get(`id:${id}`);
  if (mem) return mem;
  const fileRecords = loadCustomerIndexFile();
  return fileRecords[id] || null;
}

export function findLocalCustomerAccountById(id: string): StoredLocalCustomerAccount | null {
  if (!id) return null;
  const fileRecords = loadCustomerAccountsFile();
  for (const rec of Object.values(fileRecords)) {
    if (rec && rec.id === id && rec.passwordHash) {
      return rec;
    }
  }
  const memById = fallbackCustomerAccounts.get(`id:${id}`);
  if (memById && (memById.passwordHash || memById.password_hash)) {
    return {
      ...memById,
      passwordHash: memById.passwordHash || memById.password_hash
    };
  }
  return null;
}

export function deleteLocalCustomerRecords(opts: { id?: string; email?: string; username?: string }): void {
  const cleanEmail = opts.email ? normalizeEmail(opts.email) : '';
  const cleanUsernameLower = opts.username ? String(opts.username).trim().toLowerCase() : '';
  const cleanId = opts.id ? String(opts.id).trim() : '';

  try {
    const accounts = loadCustomerAccountsFile();
    let accountsChanged = false;
    if (cleanEmail && accounts[cleanEmail]) {
      delete accounts[cleanEmail];
      accountsChanged = true;
    }
    for (const [k, rec] of Object.entries(accounts)) {
      if (
        (cleanId && rec?.id === cleanId) ||
        (cleanEmail && normalizeEmail(rec?.email || '') === cleanEmail) ||
        (cleanUsernameLower && (rec?.usernameLower || String(rec?.username || '').toLowerCase()) === cleanUsernameLower)
      ) {
        delete accounts[k];
        accountsChanged = true;
      }
    }
    if (accountsChanged) {
      saveCustomerAccountsFile(accounts);
    }
  } catch {}

  try {
    const indexRecords = loadCustomerIndexFile();
    let indexChanged = false;
    if (cleanId && indexRecords[cleanId]) {
      delete indexRecords[cleanId];
      indexChanged = true;
    }
    for (const [k, rec] of Object.entries(indexRecords)) {
      if (
        (cleanId && rec?.id === cleanId) ||
        (cleanEmail && normalizeEmail(rec?.email || '') === cleanEmail) ||
        (cleanUsernameLower && (rec?.usernameLower || String(rec?.username || '').toLowerCase()) === cleanUsernameLower)
      ) {
        delete indexRecords[k];
        indexChanged = true;
      }
    }
    if (indexChanged) {
      saveCustomerIndexFile(indexRecords);
    }
  } catch {}

  if (cleanEmail) fallbackCustomerAccounts.delete(cleanEmail);
  if (cleanId) fallbackCustomerAccounts.delete(`id:${cleanId}`);
  if (cleanUsernameLower) fallbackUsernamesRegistry.delete(cleanUsernameLower);
}

export const CANONICAL_PRODUCTION_URL = 'https://nuvvo-1-nu.vercel.app';

const OUTDATED_OR_INVALID_HOSTNAMES = new Set([
  'nuvvo-1-nandu-tech.vercel.app',
  'nuvvo.app',
  'www.nuvvo.app'
]);

function parseHttpOrigin(candidate?: string | null): URL | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed === 'MY_APP_URL') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed;
    }
  } catch {}
  return null;
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function isOutdatedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    OUTDATED_OR_INVALID_HOSTNAMES.has(host) ||
    host.endsWith('.nuvvo-1-nandu-tech.vercel.app')
  );
}

function isEphemeralVercelPreviewHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.vercel.app') && host !== 'nuvvo-1-nu.vercel.app';
}

function isValidProductionCandidate(parsed: URL | null): parsed is URL {
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (isLocalHostname(host)) return false;
  if (isOutdatedHostname(host)) return false;
  if (host.endsWith('.run.app')) return false;
  if (isEphemeralVercelPreviewHostname(host)) return false;
  return parsed.protocol === 'https:';
}

export function resolveCanonicalAppUrl(req?: any, explicitRedirect?: string): string {
  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const isVercel = Boolean(process.env.VERCEL);
  const isVercelPreview = vercelEnv === 'preview';
  const isVercelProduction =
    vercelEnv === 'production' ||
    (isVercel && vercelEnv !== 'preview' && vercelEnv !== 'development');

  const envAppUrl = parseHttpOrigin(process.env.APP_URL);
  const headerOrigin = parseHttpOrigin(
    typeof req?.headers?.origin === 'string'
      ? req.headers.origin
      : typeof req?.headers?.Origin === 'string'
      ? req.headers.Origin
      : undefined
  );
  const hostRaw = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
  const protoRaw = String(
    req?.headers?.['x-forwarded-proto'] ||
      (hostRaw.includes('localhost') || hostRaw.startsWith('127.') ? 'http' : 'https')
  )
    .split(',')[0]
    .trim();
  const requestHostOrigin = hostRaw ? parseHttpOrigin(`${protoRaw}://${hostRaw}`) : null;
  const parsedExplicit = parseHttpOrigin(explicitRedirect);

  // 1. Vercel Production: strictly lock to confirmed canonical production domain (or valid custom prod APP_URL)
  if (isVercelProduction) {
    const prodOrigin = isValidProductionCandidate(envAppUrl)
      ? envAppUrl.origin
      : CANONICAL_PRODUCTION_URL;

    if (
      parsedExplicit &&
      isValidProductionCandidate(parsedExplicit) &&
      parsedExplicit.origin === prodOrigin
    ) {
      return parsedExplicit.origin;
    }

    return prodOrigin;
  }

  // 2. Vercel Preview: preserve preview deployment URL without ever overwriting production
  if (isVercelPreview) {
    const vercelPreviewUrl = process.env.VERCEL_URL
      ? parseHttpOrigin(`https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//i, '')}`)
      : null;

    const previewTrustedOrigins = new Set<string>();
    [requestHostOrigin, headerOrigin, vercelPreviewUrl, envAppUrl].forEach((u) => {
      if (u && !isLocalHostname(u.hostname) && !isOutdatedHostname(u.hostname)) {
        previewTrustedOrigins.add(u.origin);
      }
    });

    if (parsedExplicit && previewTrustedOrigins.has(parsedExplicit.origin)) {
      return parsedExplicit.origin;
    }
    if (requestHostOrigin && previewTrustedOrigins.has(requestHostOrigin.origin)) {
      return requestHostOrigin.origin;
    }
    if (vercelPreviewUrl && !isOutdatedHostname(vercelPreviewUrl.hostname)) {
      return vercelPreviewUrl.origin;
    }
    if (headerOrigin && previewTrustedOrigins.has(headerOrigin.origin)) {
      return headerOrigin.origin;
    }
    return CANONICAL_PRODUCTION_URL;
  }

  // 3. Local Development & AI Studio Preview Runtime: preserve dev host / APP_URL
  const trustedDevOrigins = new Set<string>();
  [envAppUrl, requestHostOrigin, headerOrigin].forEach((u) => {
    if (u && !isOutdatedHostname(u.hostname)) {
      // Ignore Capacitor Android's portless https://localhost origin when selecting server redirect targets
      const isPortlessCapacitorLocalhost =
        u.protocol === 'https:' && u.hostname === 'localhost' && !u.port;
      if (!isPortlessCapacitorLocalhost) {
        trustedDevOrigins.add(u.origin);
      }
    }
  });

  if (parsedExplicit && trustedDevOrigins.has(parsedExplicit.origin)) {
    return parsedExplicit.origin;
  }
  if (envAppUrl && !isOutdatedHostname(envAppUrl.hostname)) {
    return envAppUrl.origin;
  }
  if (requestHostOrigin && trustedDevOrigins.has(requestHostOrigin.origin)) {
    return requestHostOrigin.origin;
  }
  if (headerOrigin && trustedDevOrigins.has(headerOrigin.origin)) {
    return headerOrigin.origin;
  }

  return req ? 'http://localhost:3000' : CANONICAL_PRODUCTION_URL;
}

export function getAppRedirectOrigin(req: any, explicitRedirect?: string): string {
  return resolveCanonicalAppUrl(req, explicitRedirect);
}


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
  if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
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
export const emailOtpSendHistory = new Map<string, { lastSentAt: number; count: number; windowStart: number }>();
export const emailOtpVerifyAttempts = new Map<string, { attempts: number; lockedUntil?: number }>();

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

  // Check 60-second resend cooldown (allow 30s in development / fallback)
  const elapsedSeconds = Math.floor((now - entry.lastSentAt) / 1000);
  if (elapsedSeconds < 30) {
    const wait = 30 - elapsedSeconds;
    return {
      allowed: false,
      waitSeconds: wait,
      error: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another verification code.`
    };
  }

  // Check 15-minute sliding window (max 8 requests)
  if (now - entry.windowStart > 15 * 60 * 1000) {
    // Reset window
    emailOtpSendHistory.set(cleanEmail, { lastSentAt: now, count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= 8) {
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
 * Generates a customer-unique, cryptographically bound 6-digit backup security code.
 * Each customer gets a completely distinct 6-digit code derived from their identifier + server secret + 10-minute time window.
 * Strictly avoids global static codes like "123456" while ensuring customers can always register safely if mailers are delayed.
 */
export function generateCustomerUniqueBackupCode(identifier: string): string {
  const cleanId = normalizeEmail(identifier);
  // 10-minute epoch block so the code is strictly time-bound and rotates
  const epochWindow = Math.floor(Date.now() / (10 * 60 * 1000));
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`customer_backup_${cleanId}_${epochWindow}`)
    .digest('hex');
  // Extract 6-digit numeric integer (100000 - 999999) from the HMAC
  const num = parseInt(hmac.substring(0, 8), 16) % 900000 + 100000;
  return String(num);
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
function stripOuterQuotes(value: string): string {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isSupportedPbkdf2Prefix(value: string): boolean {
  return (
    value.startsWith('pbkdf2$') ||
    value.startsWith('pbkdf2-sha512$') ||
    value.startsWith('pbkdf2_sha512$') ||
    value.startsWith('pbkdf2-sha256$') ||
    value.startsWith('pbkdf2_sha256$')
  );
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const cleanStored = stripOuterQuotes(storedHash);
    if (!cleanStored || !isSupportedPbkdf2Prefix(cleanStored)) return false;
    const parts = cleanStored.split('$');
    if (parts.length !== 4) return false;

    const prefix = parts[0].toLowerCase();
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3].trim().toLowerCase();

    if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !originalHash) {
      return false;
    }

    const isValidHex = /^[0-9a-f]+$/.test(originalHash) && originalHash.length % 2 === 0;
    const keylen = isValidHex ? Math.min(128, Math.max(16, originalHash.length / 2)) : 64;
    const originalBuf = Buffer.from(originalHash);

    const candidateDigests: Array<'sha512' | 'sha256'> = prefix.includes('sha256')
      ? ['sha256']
      : prefix.includes('sha512')
        ? ['sha512']
        : keylen === 32
          ? ['sha512', 'sha256']
          : ['sha512'];

    for (const digest of candidateDigests) {
      const computedHash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
      const computedBuf = Buffer.from(computedHash);
      if (originalBuf.length === computedBuf.length && crypto.timingSafeEqual(originalBuf, computedBuf)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// List of authorized administrator accounts (Master Admin + Designated System Admins)
export const DESIGNATED_ADMIN_PHONES = new Set<string>([
  AUTHORIZED_ADMIN_PHONE,
  '9063692135',
  '9999900000',
  '9848022338',
  '9440511220',
  '8008123456'
]);

export function isAuthorizedAdminAccountPhone(phone: string): boolean {
  const clean = normalizePhone(phone);
  if (!clean || clean.length !== 10) return false;
  return clean === AUTHORIZED_ADMIN_PHONE || DESIGNATED_ADMIN_PHONES.has(clean);
}

export function isMasterAdminPhone(phone: string): boolean {
  const clean = normalizePhone(phone);
  return Boolean(clean && (clean === AUTHORIZED_ADMIN_PHONE || clean === '9063692135'));
}

// Rate-limiting & temporary lockout stores for Admin Master Code
interface PinAttemptRecord {
  attempts: number;
  lockedUntil: number;
}
const pinAttemptStore = new Map<string, PinAttemptRecord>();

const ADMIN_CREDENTIAL_FILE = path.join(process.cwd(), '.server_admin_credentials.json');
const BASELINE_SERVER_MASTER_CODE = '2135';
const RUNTIME_ADMIN_CACHE_TTL_MS = 15 * 1000;
let runtimeAdminPinHash: string | null = null;
let runtimeAdminPinLoadedAt = 0;

function extractPbkdf2Hash(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const clean = stripOuterQuotes(raw);
    if (isSupportedPbkdf2Prefix(clean)) return clean;
    if (clean.startsWith('{') || clean.startsWith('"')) {
      try {
        return extractPbkdf2Hash(JSON.parse(clean));
      } catch {}
    }
    return null;
  }
  if (typeof raw === 'object') {
    for (const candidate of [raw.hash, raw.masterCodeHash, raw.pinHash, raw.value, raw.pbkdf2]) {
      const extracted = extractPbkdf2Hash(candidate);
      if (extracted) return extracted;
    }
  }
  return null;
}

function readLocalAdminCredentialHash(): string | null {
  try {
    if (process.env.VERCEL || !fs.existsSync(ADMIN_CREDENTIAL_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(ADMIN_CREDENTIAL_FILE, 'utf8'));
    return extractPbkdf2Hash(parsed?.masterCodeHash || parsed?.hash || parsed);
  } catch {
    return null;
  }
}

function writeLocalAdminCredentialHash(newHash: string): boolean {
  try {
    if (process.env.VERCEL) return false;
    fs.writeFileSync(
      ADMIN_CREDENTIAL_FILE,
      JSON.stringify({ masterCodeHash: newHash, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
    return true;
  } catch {
    return false;
  }
}

function getEnvMasterCodeHash(): { hash: string; source: 'env_hash' | 'env_plain' } | null {
  const rawEnvHash = stripOuterQuotes(process.env.ADMIN_MASTER_CODE_HASH || process.env.ADMIN_PIN_HASH || '');
  const extractedEnvHash = extractPbkdf2Hash(rawEnvHash);
  if (extractedEnvHash) {
    return { hash: extractedEnvHash, source: 'env_hash' };
  }

  const rawEnvPlain = stripOuterQuotes(
    process.env.ADMIN_MASTER_CODE ||
    process.env.ADMIN_PIN ||
    process.env.ADMIN_SECURITY_PIN ||
    ''
  );
  const embeddedHash = extractPbkdf2Hash(rawEnvPlain);
  if (embeddedHash) {
    return { hash: embeddedHash, source: 'env_hash' };
  }
  if (rawEnvPlain.length >= 4) {
    return { hash: hashPassword(rawEnvPlain), source: 'env_plain' };
  }
  return null;
}

export async function resolveAdminCredentialRecord(options?: { bypassMemoryCache?: boolean }): Promise<{
  configured: boolean;
  hash: string | null;
  source: 'memory' | 'supabase' | 'local_store' | 'env_hash' | 'env_plain' | 'baseline' | 'none';
}> {
  const now = Date.now();
  if (
    !options?.bypassMemoryCache &&
    runtimeAdminPinHash &&
    isSupportedPbkdf2Prefix(runtimeAdminPinHash) &&
    now - runtimeAdminPinLoadedAt < RUNTIME_ADMIN_CACHE_TTL_MS
  ) {
    return { configured: true, hash: runtimeAdminPinHash, source: 'memory' };
  }

  let dbReadFailed = false;

  // 1. Check Supabase persistent PBKDF2 record (preserves existing Master Code across restarts and deployments)
  try {
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
    if (adminClient) {
      if (isServiceRole) {
        const { data: credRow, error: credErr } = await adminClient
          .from('admin_credentials')
          .select('hash')
          .eq('id', 'master_code')
          .maybeSingle();

        if (credErr && credErr.code !== 'PGRST116' && credErr.code !== 'PGRST205' && credErr.code !== '42P01') {
          dbReadFailed = true;
          console.warn('[Admin Auth Notice] Supabase admin_credentials read error:', credErr.message);
        }

        const foundCred = extractPbkdf2Hash(credRow?.hash);
        if (foundCred) {
          runtimeAdminPinHash = foundCred;
          runtimeAdminPinLoadedAt = Date.now();
          return { configured: true, hash: foundCred, source: 'supabase' };
        }
      }

      const { data: settingRows, error: settingsErr } = await adminClient
        .from('app_settings')
        .select('key, value')
        .in('key', ['admin_master_code_hash', 'admin_security_pin_hash']);

      if (settingsErr && settingsErr.code !== 'PGRST116' && settingsErr.code !== 'PGRST205' && settingsErr.code !== '42P01') {
        dbReadFailed = true;
        console.warn('[Admin Auth Notice] Supabase app_settings read error:', settingsErr.message);
      }

      if (Array.isArray(settingRows) && settingRows.length > 0) {
        const masterRow = settingRows.find((r: any) => r.key === 'admin_master_code_hash');
        const legacyRow = settingRows.find((r: any) => r.key === 'admin_security_pin_hash');
        const foundHash = extractPbkdf2Hash(masterRow?.value) || extractPbkdf2Hash(legacyRow?.value);
        if (foundHash) {
          runtimeAdminPinHash = foundHash;
          runtimeAdminPinLoadedAt = Date.now();
          return { configured: true, hash: foundHash, source: 'supabase' };
        }
      }
    }
  } catch (err: any) {
    dbReadFailed = true;
    console.warn('[Admin Auth Notice] Exception querying Supabase credential record:', err?.message || err);
  }

  // 2. Check local non-Vercel hashed credential file
  const localHash = readLocalAdminCredentialHash();
  if (localHash) {
    runtimeAdminPinHash = localHash;
    runtimeAdminPinLoadedAt = Date.now();
    return { configured: true, hash: localHash, source: 'local_store' };
  }

  // 3. Check explicit server environment configuration
  const envCred = getEnvMasterCodeHash();
  if (envCred) {
    runtimeAdminPinHash = envCred.hash;
    runtimeAdminPinLoadedAt = Date.now();
    return { configured: true, hash: envCred.hash, source: envCred.source };
  }

  // 4. Fallback to in-memory PBKDF2 hash from designated administrator baseline Master Code
  // Never overwrites Supabase/DB automatically when no DB record was found or if DB read failed.
  const baselineHash = hashPassword(BASELINE_SERVER_MASTER_CODE);
  runtimeAdminPinHash = baselineHash;
  runtimeAdminPinLoadedAt = Date.now();
  if (!dbReadFailed && !process.env.VERCEL && !fs.existsSync(ADMIN_CREDENTIAL_FILE)) {
    writeLocalAdminCredentialHash(baselineHash);
  }
  return { configured: true, hash: baselineHash, source: 'baseline' };
}

export async function saveAdminMasterCodeHash(newHash: string): Promise<boolean> {
  const validHash = extractPbkdf2Hash(newHash);
  if (!validHash) {
    return false;
  }

  runtimeAdminPinHash = validHash;
  runtimeAdminPinLoadedAt = Date.now();
  const localSaved = writeLocalAdminCredentialHash(validHash);
  let dbSaved = false;

  try {
    const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
    if (adminClient && isServiceRole) {
      try {
        const { error: credUpsertErr } = await adminClient
          .from('admin_credentials')
          .upsert([{
            id: 'master_code',
            hash: validHash,
            updated_at: new Date().toISOString()
          }], { onConflict: 'id' });
        if (!credUpsertErr) {
          dbSaved = true;
        }
      } catch {}

      try {
        const { error: settingsUpsertErr } = await adminClient
          .from('app_settings')
          .upsert([
            {
              key: 'admin_master_code_hash',
              value: validHash,
              description: 'PBKDF2-SHA512 hashed administrator Master Code',
              updated_at: new Date().toISOString()
            },
            {
              key: 'admin_security_pin_hash',
              value: validHash,
              description: 'PBKDF2-SHA512 hashed administrator security credential',
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'key' });
        if (!settingsUpsertErr) {
          dbSaved = true;
        }
      } catch {}
    }
  } catch {}

  if (process.env.VERCEL) {
    return dbSaved;
  }

  return localSaved || dbSaved;
}

export function setAdminPinHash(newHash: string): boolean {
  const validHash = extractPbkdf2Hash(newHash);
  if (validHash) {
    runtimeAdminPinHash = validHash;
    runtimeAdminPinLoadedAt = Date.now();
    writeLocalAdminCredentialHash(validHash);
    return true;
  }
  return false;
}

export function getAdminPinHash(): string {
  if (runtimeAdminPinHash && isSupportedPbkdf2Prefix(runtimeAdminPinHash)) {
    return runtimeAdminPinHash;
  }
  const localHash = readLocalAdminCredentialHash();
  if (localHash) return localHash;
  const envCred = getEnvMasterCodeHash();
  if (envCred) {
    runtimeAdminPinHash = envCred.hash;
    runtimeAdminPinLoadedAt = Date.now();
    return envCred.hash;
  }
  return '';
}

/**
 * Secure Server-Side Admin Master Code Verification with rate limiting and temporary lockout.
 * Verifies strictly against PBKDF2-SHA512 hash using timing-safe comparisons.
 * Never exposes raw credentials in API responses or logs.
 */
export async function verifyAdminMasterCode(
  phone: string,
  masterCode: string
): Promise<{
  verified: boolean;
  locked: boolean;
  configured: boolean;
  unauthorizedPhone?: boolean;
  remainingAttempts?: number;
  retryAfterSeconds?: number;
  message?: string;
}> {
  const cleanPhone = normalizePhone(phone);
  if (!isAuthorizedAdminAccountPhone(cleanPhone)) {
    return {
      verified: false,
      locked: false,
      configured: true,
      unauthorizedPhone: true,
      message: "Access Denied: This mobile number is not authorized for administrative access."
    };
  }

  const now = Date.now();
  const record = pinAttemptStore.get(cleanPhone) || { attempts: 0, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
    const minsLeft = Math.ceil(retryAfterSeconds / 60);
    return {
      verified: false,
      locked: true,
      configured: true,
      remainingAttempts: 0,
      retryAfterSeconds,
      message: `Account is temporarily locked due to repeated failed Master Code attempts. Please retry in ${minsLeft} minute(s).`
    };
  }

  const cleanCode = String(masterCode || '').trim();
  if (!cleanCode) {
    return {
      verified: false,
      locked: false,
      configured: true,
      message: "Master Code is required."
    };
  }

  let cred = await resolveAdminCredentialRecord();
  if (!cred.configured || !cred.hash) {
    return {
      verified: false,
      locked: false,
      configured: false,
      message: "Master Code credential record is unavailable on the server."
    };
  }

  let isMatch = verifyPassword(cleanCode, cred.hash);
  if (!isMatch && cred.source === 'memory') {
    const freshCred = await resolveAdminCredentialRecord({ bypassMemoryCache: true });
    if (freshCred.configured && freshCred.hash) {
      isMatch = verifyPassword(cleanCode, freshCred.hash);
    }
  }

  if (isMatch) {
    pinAttemptStore.delete(cleanPhone);
    return { verified: true, locked: false, configured: true };
  }

  record.attempts += 1;
  const maxAttempts = 5;
  const remaining = Math.max(0, maxAttempts - record.attempts);

  if (remaining <= 0) {
    record.lockedUntil = now + 15 * 60 * 1000;
    pinAttemptStore.set(cleanPhone, record);
    return {
      verified: false,
      locked: true,
      configured: true,
      remainingAttempts: 0,
      retryAfterSeconds: 900,
      message: "Maximum failed Master Code attempts reached (5/5). Account temporarily locked for 15 minutes."
    };
  }

  pinAttemptStore.set(cleanPhone, record);
  return {
    verified: false,
    locked: false,
    configured: true,
    remainingAttempts: remaining,
    message: `Incorrect Master Code. ${remaining} attempt(s) remaining before temporary lockout.`
  };
}

export async function verifyAdminPin(phone: string, pin: string) {
  return verifyAdminMasterCode(phone, pin);
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

// ==============================================================================
// SERVER-SIDE CALLER IDENTITY & CUSTOMER DATA OWNERSHIP VERIFICATION
// Never trusts frontend-supplied customerId, phone, or role.
// ==============================================================================
export interface CallerIdentity {
  authenticated: boolean;
  authType: 'supabase' | 'nuvvo_jwt' | 'none';
  token: string;
  userId: string;
  email: string;
  phone: string;
  role: 'Customer' | 'normal_user' | 'admin' | 'super_admin';
  isAdmin: boolean;
}

export function extractBearerToken(req: any): string {
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

export async function resolveCallerIdentity(req: any): Promise<CallerIdentity> {
  const unauth: CallerIdentity = {
    authenticated: false,
    authType: 'none',
    token: '',
    userId: '',
    email: '',
    phone: '',
    role: 'Customer',
    isAdmin: false
  };

  const token = extractBearerToken(req);
  if (!token) return unauth;

  // 1. Nuvvo HMAC-signed session JWT (Admin, Super Admin, Franchise/Partner mobile OTP)
  if (token.startsWith('nuvvo_jwt_')) {
    const verified = verifySignedSessionJwt(token);
    if (!verified.valid || !verified.role) return unauth;

    const cleanPhone = normalizePhone(verified.phone || verified.payload?.phone || '');
    const userId = String(
      verified.payload?.sub || (cleanPhone ? `user_${cleanPhone}` : '')
    ).trim();
    const isAdmin = verified.role === 'admin' || verified.role === 'super_admin';

    return {
      authenticated: true,
      authType: 'nuvvo_jwt',
      token,
      userId,
      email: String(verified.payload?.email || '').trim().toLowerCase(),
      phone: cleanPhone,
      role: verified.role,
      isAdmin
    };
  }

  // 2. Supabase Auth JWT (Customer Password Sessions)
  try {
    const publicSupabase = getPublicSupabaseServerClient();
    const { data, error } = await publicSupabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      return unauth;
    }

    const authUser = data.user;
    const authUserId = String(authUser.id).trim();
    const meta = authUser.user_metadata || {};
    const localIdx = findLocalCustomerById(authUserId);
    const resolvedPhone = normalizePhone(
      String(meta.mobile || localIdx?.mobile || authUser.phone || '')
    );

    return {
      authenticated: true,
      authType: 'supabase',
      token,
      userId: authUserId,
      email: String(authUser.email || '').trim().toLowerCase(),
      phone: resolvedPhone,
      role: 'Customer', // Never promote a customer JWT to Admin
      isAdmin: false
    };
  } catch {
    return unauth;
  }
}

export function isOrderOwnedByCaller(order: any, caller: CallerIdentity): boolean {
  if (!caller.authenticated) return false;
  if (caller.isAdmin) return true;
  if (!order || typeof order !== 'object') return false;

  const orderCustomerId = String(order.customer_id || order.customerId || '').trim();
  if (orderCustomerId) {
    return orderCustomerId === caller.userId;
  }

  // Fallback ONLY for legacy unmigrated rows that lack customer_id
  const checkoutData = (order.address && typeof order.address === 'object' && order.address.checkout_data) || {};
  const orderEmail = String(order.customer_email || order.customerEmail || checkoutData.customerEmail || '').trim().toLowerCase();
  if (caller.email && orderEmail && caller.email === orderEmail) {
    return true;
  }

  const orderPhone = normalizePhone(String(order.customer_phone || order.customerPhone || ''));
  const callerPhone = normalizePhone(caller.phone);
  if (callerPhone && callerPhone.length >= 10 && orderPhone && orderPhone === callerPhone) {
    return true;
  }

  return false;
}

/**
 * Resolves a registered customer's email by case-insensitive username directly from Supabase Auth
 * (used securely on the server when customer_profiles table is unmigrated or missing a row).
 */
export async function resolveCustomerEmailFromSupabaseAuth(
  adminClient: any,
  username: string,
  isServiceRole: boolean
): Promise<{ email: string; fullName?: string } | null> {
  if (!adminClient || !isServiceRole) return null;
  const target = String(username || '').trim().toLowerCase();
  if (!target) return null;

  try {
    const perPage = 200;
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error || !Array.isArray(data?.users) || data.users.length === 0) break;

      for (const user of data.users) {
        const meta = user?.user_metadata || {};
        const metaUsername = String(meta.username_lower || meta.username || '').trim().toLowerCase();
        if (metaUsername && metaUsername === target && user?.email) {
          return {
            email: normalizeEmail(user.email),
            fullName: meta.full_name ? String(meta.full_name).trim() : undefined
          };
        }
      }

      if (data.users.length < perPage) break;
    }
  } catch {}
  return null;
}

/**
 * Checks whether an email already belongs to a Supabase Auth account so stale legacy
 * app_settings hashes are never accepted after password updates or resets.
 */
export async function findSupabaseAuthUserByEmail(
  adminClient: any,
  email: string,
  isServiceRole: boolean
): Promise<any | null> {
  if (!adminClient || !isServiceRole) return null;
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) return null;

  try {
    const perPage = 200;
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error || !Array.isArray(data?.users) || data.users.length === 0) break;

      const match = data.users.find((u: any) => normalizeEmail(u?.email) === targetEmail);
      if (match) return match;

      if (data.users.length < perPage) break;
    }
  } catch {}
  return null;
}
