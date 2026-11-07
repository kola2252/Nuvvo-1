/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase OTP Helper: utils/supabase/otp.ts
 * 
 * Securely persists generated OTP codes into the `user_otps` table
 * with expiration timestamps, attempt tracking, and consumption status.
 * Provides validation against database entries with automatic fallback.
 */

import { getAdminSupabaseServerClient, getPublicSupabaseServerClient } from "./server";
import crypto from "crypto";

export interface UserOtpRecord {
  id?: string;
  identifier: string; // email or phone number
  otp_hash: string;
  salt: string;
  purpose?: string; // 'registration', 'login', 'password_reset', 'admin_verification'
  expires_at: string;
  consumed: boolean;
  attempts?: number;
  max_attempts?: number;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface StoreOtpOptions {
  identifier: string; // phone or email
  otp: string;
  expiresInSeconds?: number; // defaults to 300 (5 minutes)
  purpose?: string;
  maxAttempts?: number;
  metadata?: Record<string, any>;
}

export interface ValidateOtpOptions {
  identifier: string;
  otp: string;
  purpose?: string;
}

export interface ValidateOtpResult {
  valid: boolean;
  expired: boolean;
  consumed: boolean;
  exceededAttempts: boolean;
  remainingAttempts?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// In-memory fallback cache in case Supabase table user_otps is unreachable or not yet created
const inMemoryOtpStore = new Map<string, {
  otpHash: string;
  salt: string;
  purpose: string;
  expiresAt: number;
  consumed: boolean;
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, any>;
}>();

/**
 * Hashes an OTP with a unique cryptographic salt.
 */
function hashOtp(otp: string, salt: string): string {
  return crypto.pbkdf2Sync(otp.trim(), salt, 1000, 32, "sha256").toString("hex");
}

/**
 * Normalizes identifier (email to lowercase, phone to digits).
 */
function normalizeIdentifier(raw: string): string {
  const str = String(raw || "").trim();
  if (str.includes("@")) {
    return str.toLowerCase();
  }
  const digits = str.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Stores a generated OTP code in the Supabase `user_otps` table.
 * If the table is missing or write fails, falls back gracefully to resilient memory caching.
 */
export async function storeUserOtp(options: StoreOtpOptions): Promise<{
  success: boolean;
  id?: string;
  expiresAt: string;
  error?: string;
}> {
  const {
    identifier: rawId,
    otp,
    expiresInSeconds = 300,
    purpose = "login",
    maxAttempts = 5,
    metadata = {}
  } = options;

  const identifier = normalizeIdentifier(rawId);
  if (!identifier) {
    return { success: false, expiresAt: "", error: "Valid identifier (email or phone) is required." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = hashOtp(otp, salt);
  const now = new Date();
  const expiresDate = new Date(now.getTime() + expiresInSeconds * 1000);
  const expiresAt = expiresDate.toISOString();

  // Always update in-memory cache as immediate resilient fallback
  const cacheKey = `${identifier}:${purpose}`;
  inMemoryOtpStore.set(cacheKey, {
    otpHash,
    salt,
    purpose,
    expiresAt: expiresDate.getTime(),
    consumed: false,
    attempts: 0,
    maxAttempts,
    metadata
  });

  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) {
      return { success: true, expiresAt };
    }

    // Invalidate any previous unconsumed active OTPs for this identifier & purpose
    await client
      .from("user_otps")
      .update({ consumed: true, updated_at: now.toISOString() })
      .eq("identifier", identifier)
      .eq("purpose", purpose)
      .eq("consumed", false);

    // Insert new record into user_otps
    const { data, error } = await client
      .from("user_otps")
      .insert([
        {
          identifier,
          otp_hash: otpHash,
          salt,
          purpose,
          expires_at: expiresAt,
          consumed: false,
          attempts: 0,
          max_attempts: maxAttempts,
          metadata,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        }
      ])
      .select("id")
      .single();

    if (error) {
      console.warn(`[Supabase user_otps notice] Table write deferred: ${error.message}`);
      return { success: true, expiresAt };
    }

    return {
      success: true,
      id: data?.id,
      expiresAt
    };
  } catch (err: any) {
    console.warn(`[Supabase user_otps exception]:`, err?.message || err);
    return { success: true, expiresAt };
  }
}

/**
 * Validates a user-supplied OTP against database records in `user_otps`.
 * Verifies expiration, consumes valid OTPs to prevent replay attacks,
 * and increments failed attempts up to the lockout limit.
 */
export async function validateUserOtp(options: ValidateOtpOptions): Promise<ValidateOtpResult> {
  const { identifier: rawId, otp, purpose = "login" } = options;
  const identifier = normalizeIdentifier(rawId);
  const inputCode = String(otp || "").trim();

  if (!identifier || !inputCode) {
    return {
      valid: false,
      expired: false,
      consumed: false,
      exceededAttempts: false,
      error: "Identifier and OTP code are required."
    };
  }

  const now = new Date();
  const cacheKey = `${identifier}:${purpose}`;

  // 1. Check Supabase user_otps table
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data, error } = await client
        .from("user_otps")
        .select("*")
        .eq("identifier", identifier)
        .eq("purpose", purpose)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const record = data as UserOtpRecord;
        const attempts = Number(record.attempts || 0);
        const maxAttempts = Number(record.max_attempts || 5);

        // Check if already consumed
        if (record.consumed) {
          return {
            valid: false,
            expired: false,
            consumed: true,
            exceededAttempts: false,
            error: "This verification code has already been used. Please request a new code."
          };
        }

        // Check attempt count
        if (attempts >= maxAttempts) {
          return {
            valid: false,
            expired: false,
            consumed: false,
            exceededAttempts: true,
            remainingAttempts: 0,
            error: "Maximum verification attempts exceeded. Please request a new code."
          };
        }

        // Check expiration
        const expiresAt = new Date(record.expires_at).getTime();
        if (now.getTime() > expiresAt) {
          return {
            valid: false,
            expired: true,
            consumed: false,
            exceededAttempts: false,
            error: "The verification code has expired. Please request a new code."
          };
        }

        // Check hash equality with timing-safe comparison
        const computedHash = hashOtp(inputCode, record.salt);
        const storedHash = record.otp_hash;
        const isMatch =
          computedHash.length === storedHash.length &&
          crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));

        if (isMatch) {
          // Mark as consumed
          await client
            .from("user_otps")
            .update({ consumed: true, updated_at: now.toISOString() })
            .eq("id", record.id);

          inMemoryOtpStore.delete(cacheKey);

          return {
            valid: true,
            expired: false,
            consumed: false,
            exceededAttempts: false,
            metadata: record.metadata
          };
        } else {
          // Increment attempts
          const nextAttempts = attempts + 1;
          await client
            .from("user_otps")
            .update({ attempts: nextAttempts, updated_at: now.toISOString() })
            .eq("id", record.id);

          const remaining = Math.max(0, maxAttempts - nextAttempts);
          return {
            valid: false,
            expired: false,
            consumed: false,
            exceededAttempts: remaining <= 0,
            remainingAttempts: remaining,
            error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          };
        }
      }
    }
  } catch (dbErr: any) {
    console.warn(`[Supabase validateUserOtp notice]: ${dbErr?.message}`);
  }

  // 2. Fallback to in-memory store
  const cached = inMemoryOtpStore.get(cacheKey);
  if (!cached) {
    return {
      valid: false,
      expired: false,
      consumed: false,
      exceededAttempts: false,
      error: "No active verification code found for this user. Please request an OTP."
    };
  }

  if (cached.consumed) {
    return {
      valid: false,
      expired: false,
      consumed: true,
      exceededAttempts: false,
      error: "This verification code has already been used. Please request a new code."
    };
  }

  if (cached.attempts >= cached.maxAttempts) {
    return {
      valid: false,
      expired: false,
      consumed: false,
      exceededAttempts: true,
      remainingAttempts: 0,
      error: "Maximum verification attempts exceeded. Please request a new code."
    };
  }

  if (Date.now() > cached.expiresAt) {
    return {
      valid: false,
      expired: true,
      consumed: false,
      exceededAttempts: false,
      error: "The verification code has expired. Please request a new code."
    };
  }

  const computedHash = hashOtp(inputCode, cached.salt);
  const isMatch =
    computedHash.length === cached.otpHash.length &&
    crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(cached.otpHash));

  if (isMatch) {
    cached.consumed = true;
    inMemoryOtpStore.delete(cacheKey);
    return {
      valid: true,
      expired: false,
      consumed: false,
      exceededAttempts: false,
      metadata: cached.metadata
    };
  }

  cached.attempts += 1;
  const remaining = Math.max(0, cached.maxAttempts - cached.attempts);
  return {
    valid: false,
    expired: false,
    consumed: false,
    exceededAttempts: remaining <= 0,
    remainingAttempts: remaining,
    error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
  };
}

/**
 * Cleans up expired or consumed OTP records.
 */
export async function cleanupExpiredOtps(): Promise<number> {
  const nowIso = new Date().toISOString();
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { error } = await client
        .from("user_otps")
        .delete()
        .or(`expires_at.lt.${nowIso},consumed.eq.true`);

      if (!error) return 1;
    }
  } catch {}

  // Clean memory store
  const now = Date.now();
  for (const [key, val] of inMemoryOtpStore.entries()) {
    if (val.consumed || now > val.expiresAt) {
      inMemoryOtpStore.delete(key);
    }
  }
  return 0;
}
