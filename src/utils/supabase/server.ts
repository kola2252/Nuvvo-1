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

/**
 * Diagnostic utility function to verify if the server-side Supabase client is correctly
 * initialized using the SERVICE_ROLE_KEY and can successfully access the database.
 */
export const checkServerSupabaseDiagnostics = async (): Promise<{
  success: boolean;
  isServiceRoleConfigured: boolean;
  url: string;
  databaseAccess: boolean;
  message: string;
  error?: string;
  details?: any;
}> => {
  const url = getSupabaseUrl();
  const { client, error } = getAdminSupabaseServerClient();

  if (!client || error) {
    return {
      success: false,
      isServiceRoleConfigured: false,
      url,
      databaseAccess: false,
      message: "Server SERVICE_ROLE_KEY is not configured.",
      error: error || "Missing privileged key"
    };
  }

  try {
    const { data, error: dbError, count } = await client
      .from('food_items')
      .select('id', { count: 'exact', head: true });

    if (dbError) {
      return {
        success: false,
        isServiceRoleConfigured: true,
        url,
        databaseAccess: false,
        message: `Database query failed: ${dbError.message}`,
        error: dbError.message,
        details: dbError
      };
    }

    return {
      success: true,
      isServiceRoleConfigured: true,
      url,
      databaseAccess: true,
      message: "Supabase client successfully initialized with SERVICE_ROLE_KEY and accessing database.",
      details: { rowCount: count }
    };
  } catch (err: any) {
    return {
      success: false,
      isServiceRoleConfigured: true,
      url,
      databaseAccess: false,
      message: `Exception while accessing database: ${err?.message || err}`,
      error: err?.message || String(err)
    };
  }
};
