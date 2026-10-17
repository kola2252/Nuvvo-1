import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = 
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL)) ||
  "https://yhepdohcfhtabavsgklp.supabase.co";

const supabaseKey = 
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY)) ||
  "sb_publishable_BH3RBrc5-cuHFZ2ORwKI_A_KsjUY6-k";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl,
    supabaseKey,
  );

export const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
