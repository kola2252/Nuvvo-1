import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the Supabase URL from environment variables.
 * Checks server and public variables for the URL.
 */
export const getSupabaseUrl = (): string => {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://bitxmpjuetvfbhdyfvok.supabase.co";

  return url.trim();
};

/**
 * Validates and retrieves the privileged server-side secret key.
 *
 * STRICT SECURITY CONSTRAINTS:
 * 1. ONLY reads from SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.
 * 2. NEVER falls back to SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY,
 *    or any NEXT_PUBLIC_* / VITE_* keys for privileged operations.
 * 3. Throws a clear server configuration error if the key is missing or invalid.
 */
export const getPrivilegedSupabaseKey = (): string => {
  const privilegedKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!privilegedKey || !privilegedKey.trim()) {
    throw new Error(
      "Privileged Supabase server configuration error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY " +
      "is missing from the server environment. Server-side database writes require a privileged key and " +
      "will NEVER fall back to public, anonymous, or client-side keys."
    );
  }

  // Ensure the privileged key is not mistakenly set to an anonymous or publishable key
  const trimmedKey = privilegedKey.trim();
  const publicKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (publicKey && trimmedKey === publicKey.trim()) {
    throw new Error(
      "Privileged Supabase server configuration error: The configured privileged key matches the public anon key. " +
      "A secret service_role key is required for privileged database operations to satisfy Row Level Security."
    );
  }

  return trimmedKey;
};

/**
 * Returns a privileged Supabase client for authorized server-side database writes.
 * Throws a descriptive configuration error if the privileged key is missing.
 */
export const getPrivilegedSupabaseServerClient = (): SupabaseClient => {
  const supabaseUrl = getSupabaseUrl();
  const secretKey = getPrivilegedSupabaseKey();

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
};

/**
 * Helper for admin endpoints to safely retrieve the privileged client
 * and return structured errors if unconfigured.
 */
export const getAdminSupabaseServerClient = (): {
  client: SupabaseClient | null;
  error: string | null;
} => {
  try {
    const client = getPrivilegedSupabaseServerClient();
    return { client, error: null };
  } catch (err: any) {
    return {
      client: null,
      error: err?.message || "Missing or invalid privileged Supabase server key configuration."
    };
  }
};

/**
 * Public server client strictly for public read-only (SELECT) queries obeying RLS.
 * This client MUST NEVER be used for privileged writes.
 */
export const getPublicSupabaseServerClient = (): SupabaseClient => {
  const supabaseUrl = getSupabaseUrl();
  const publicKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_-uXD4j7ITcsUZWT7_IDQ3A_AXLPWBCX";

  return createSupabaseClient(supabaseUrl, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
};

/**
 * Default server client for public read operations.
 */
export const createServerClient = (): SupabaseClient => {
  return getPublicSupabaseServerClient();
};

export const createClient = createServerClient;
