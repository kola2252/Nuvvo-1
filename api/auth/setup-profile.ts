/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/auth/setup-profile
 * Creates customer profile, verifies username uniqueness, and securely hashes password.
 */

import {
  normalizeEmail,
  normalizePhone,
  parseRequestBody,
  sendJsonResponse,
  hashPassword,
  verifySignedSessionJwt,
  createSignedSessionJwt,
  fallbackCustomerAccounts,
  fallbackUsernamesRegistry
} from "../../lib/auth-utils";
import { getAdminSupabaseServerClient } from "../../src/utils/supabase/server";

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJsonResponse(res, 200, { ok: true });
  }

  try {
    const body = await parseRequestBody(req);
    const { 
      email, 
      fullName, 
      username, 
      password, 
      confirmPassword, 
      mobile, 
      location, 
      address, 
      landmark 
    } = body || {};

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) {
      return sendJsonResponse(res, 400, { success: false, error: "Email address is required." });
    }

    const cleanUsername = String(username || '').trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
      return sendJsonResponse(res, 400, { 
        success: false, 
        error: "Username must be between 3 and 30 characters." 
      });
    }

    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      return sendJsonResponse(res, 400, { 
        success: false, 
        error: "Username can only contain letters, numbers, underscores, and hyphens." 
      });
    }

    const cleanPassword = String(password || '');
    if (!cleanPassword || cleanPassword.length < 6) {
      return sendJsonResponse(res, 400, { 
        success: false, 
        error: "Password must be at least 6 characters in length." 
      });
    }

    if (confirmPassword !== undefined && cleanPassword !== String(confirmPassword)) {
      return sendJsonResponse(res, 400, { 
        success: false, 
        error: "Password and Confirm Password do not match." 
      });
    }

    const cleanMobile = normalizePhone(mobile);
    if (cleanMobile.length < 10) {
      return sendJsonResponse(res, 400, { 
        success: false, 
        error: "Please enter a valid 10-digit mobile number." 
      });
    }

    // Hash password with cryptographically secure PBKDF2 (never plaintext!)
    const passwordHash = hashPassword(cleanPassword);

    // Extract authenticated Supabase user ID from token or payload
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    let tokenSupabaseId = '';
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const verified = verifySignedSessionJwt(authHeader.replace('Bearer ', '').trim());
      if (verified.valid && (verified.payload as any)?.supabaseUserId) {
        tokenSupabaseId = (verified.payload as any).supabaseUserId;
      }
    }

    const userId = body.supabaseUserId || tokenSupabaseId || `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const userProfile = {
      id: userId,
      supabaseUserId: body.supabaseUserId || tokenSupabaseId || undefined,
      name: String(fullName || cleanUsername).trim(),
      username: cleanUsername,
      email: cleanEmail,
      phone: cleanMobile,
      password_hash: passwordHash,
      role: 'Customer',
      isProfileComplete: true,
      addresses: [
        {
          id: `addr_${Date.now()}`,
          type: 'Home',
          flatNo: String(address || '').trim() || 'Residence',
          area: String(location || '').trim() || 'Chirala',
          landmark: String(landmark || '').trim(),
          city: 'Chirala',
          gpsCoordinates: { lat: 15.8281, lng: 80.3544 }
        }
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Attempt to persist in Supabase
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        // 1. Check username uniqueness in app_settings registry or profiles
        const { data: existingSettings } = await adminClient
          .from('app_settings')
          .select('value')
          .eq('key', 'customer_usernames')
          .maybeSingle();

        const usernamesMap: Record<string, string> = existingSettings?.value || {};
        const registeredEmail = usernamesMap[cleanUsername];

        if (registeredEmail && registeredEmail !== cleanEmail) {
          return sendJsonResponse(res, 409, {
            success: false,
            error: `The username "${cleanUsername}" is already taken. Please choose another username.`
          });
        }

        // Register username
        usernamesMap[cleanUsername] = cleanEmail;
        await adminClient
          .from('app_settings')
          .upsert([{
            key: 'customer_usernames',
            value: usernamesMap,
            description: 'Username to email registry for protected account lookups',
            updated_at: new Date().toISOString()
          }], { onConflict: 'key' });

        // Save account record in customer_accounts app_settings
        const { data: accountsSettings } = await adminClient
          .from('app_settings')
          .select('value')
          .eq('key', `account_${cleanEmail}`)
          .maybeSingle();

        await adminClient
          .from('app_settings')
          .upsert([{
            key: `account_${cleanEmail}`,
            value: userProfile,
            description: `Customer account credentials for ${cleanEmail}`,
            updated_at: new Date().toISOString()
          }], { onConflict: 'key' });
      }
    } catch (dbErr: any) {
      console.warn("[Profile Setup Database Notice]:", dbErr?.message);
    }

    // Always maintain in warm container memory
    fallbackCustomerAccounts.set(cleanEmail, userProfile);
    fallbackUsernamesRegistry.set(cleanUsername, cleanEmail);

    // Issue signed session token
    const token = createSignedSessionJwt(userId, 'normal_user', {
      email: cleanEmail,
      phone: cleanMobile,
      username: cleanUsername
    });

    // Strip password_hash from response payload for security
    const safeUser: any = { ...userProfile };
    delete safeUser.password_hash;

    return sendJsonResponse(res, 200, {
      success: true,
      token,
      user: safeUser,
      message: "Customer profile and password created successfully."
    });
  } catch (err: any) {
    console.error("[Profile Setup Error]:", err?.message || err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: "Failed to save profile. Please try again."
    });
  }
}
