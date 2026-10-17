import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://yhepdohcfhtabavsgklp.supabase.co";

const supabaseKey = 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_BH3RBrc5-cuHFZ2ORwKI_A_KsjUY6-k";

export const createServerClient = () => {
  return createSupabaseClient(supabaseUrl, supabaseKey);
};

export const createClient = (_cookieStore?: any) => {
  return createSupabaseClient(supabaseUrl, supabaseKey);
};
