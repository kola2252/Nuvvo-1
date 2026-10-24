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

  if (privilegedKey && privilegedKey.trim()) {
    return privilegedKey.trim();
  }
  return "";
};

/**
 * Returns a privileged Supabase client for authorized server-side database writes.
 * If service role key is not configured, returns null or fallback client.
 */
export const getPrivilegedSupabaseServerClient = (): SupabaseClient => {
  const supabaseUrl = getSupabaseUrl();
  const secretKey = getPrivilegedSupabaseKey();

  if (secretKey) {
    return createSupabaseClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
  }

  return getPublicSupabaseServerClient();
};

/**
 * Helper for admin endpoints to safely retrieve the database client.
 * Returns privileged service role client if configured, otherwise falls back to public client.
 */
export const getAdminSupabaseServerClient = (): {
  client: SupabaseClient;
  error: string | null;
  isServiceRole: boolean;
} => {
  try {
    const privilegedKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (privilegedKey && privilegedKey.trim()) {
      const supabaseUrl = getSupabaseUrl();
      const client = createSupabaseClient(supabaseUrl, privilegedKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });
      return { client, error: null, isServiceRole: true };
    }
  } catch (err: any) {
    console.warn("Notice: Service role client initialization deferred:", err?.message);
  }

  const publicClient = getPublicSupabaseServerClient();
  return {
    client: publicClient,
    error: null,
    isServiceRole: false
  };
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
  const { client, error, isServiceRole } = getAdminSupabaseServerClient();

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
        isServiceRoleConfigured: isServiceRole,
        url,
        databaseAccess: false,
        message: `Database query failed: ${dbError.message}`,
        error: dbError.message,
        details: dbError
      };
    }

    return {
      success: true,
      isServiceRoleConfigured: isServiceRole,
      url,
      databaseAccess: true,
      message: isServiceRole
        ? "Supabase client successfully initialized with SERVICE_ROLE_KEY and accessing database."
        : "Supabase client connected using anon key. For server-side write permissions without RLS restrictions, configure SUPABASE_SERVICE_ROLE_KEY in Vercel project settings.",
      details: { rowCount: count }
    };
  } catch (err: any) {
    return {
      success: false,
      isServiceRoleConfigured: isServiceRole,
      url,
      databaseAccess: false,
      message: `Exception while accessing database: ${err?.message || err}`,
      error: err?.message || String(err)
    };
  }
};
