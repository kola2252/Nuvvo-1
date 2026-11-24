import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  "https://bitxmpjuetvfbhdyfvok.supabase.co";

const supabaseKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  "sb_publishable_-uXD4j7ITcsUZWT7_IDQ3A_AXLPWBCX";

const REMEMBER_ME_PREF_KEY = 'nuvvo_auth_remember_me';

export function getAuthPersistencePreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = window.localStorage.getItem(REMEMBER_ME_PREF_KEY);
    if (val === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setAuthPersistencePreference(rememberMe: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REMEMBER_ME_PREF_KEY, rememberMe ? 'true' : 'false');
    // Remove Supabase tokens from the non-selected storage so sessions never bleed across modes
    const targetToClean = rememberMe ? window.sessionStorage : window.localStorage;
    for (const k of Object.keys(targetToClean)) {
      if (k.startsWith('sb-') || k.includes('supabase.auth')) {
        targetToClean.removeItem(k);
      }
    }
  } catch {}
}

export function clearAllSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const k of Object.keys(storage)) {
        if (k.startsWith('sb-') || k.includes('supabase.auth')) {
          storage.removeItem(k);
        }
      }
    }
  } catch {}
}

const adaptiveSupabaseStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const remember = getAuthPersistencePreference();
      const primary = remember ? window.localStorage : window.sessionStorage;
      const val = primary.getItem(key);
      if (val !== null) return val;
      if (key.includes('code-verifier')) {
        const secondary = remember ? window.sessionStorage : window.localStorage;
        return secondary.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      const remember = getAuthPersistencePreference();
      if (remember) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {}
  }
};

export interface InitialAuthRedirectState {
  isRecoveryRedirect: boolean;
  authErrorDescription: string | null;
}

const capturedRedirectState: InitialAuthRedirectState = (() => {
  if (typeof window === 'undefined') {
    return { isRecoveryRedirect: false, authErrorDescription: null };
  }
  try {
    const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hashRaw);
    const searchParams = new URLSearchParams(window.location.search);

    const isRecoveryRedirect =
      hashParams.get('type') === 'recovery' ||
      searchParams.get('type') === 'recovery' ||
      window.location.hash.includes('type=recovery');

    const rawErrorDesc =
      hashParams.get('error_description') ||
      searchParams.get('error_description') ||
      hashParams.get('error') ||
      searchParams.get('error');

    return {
      isRecoveryRedirect,
      authErrorDescription: rawErrorDesc ? rawErrorDesc.trim() : null
    };
  } catch {
    return { isRecoveryRedirect: false, authErrorDescription: null };
  }
})();

let earlyRecoveryEventDetected = false;

export const createClient = () =>
  createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: typeof window !== 'undefined' ? adaptiveSupabaseStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

export const supabase = createClient();

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      earlyRecoveryEventDetected = true;
    }
  });
}

export function getInitialAuthRedirectState(): InitialAuthRedirectState {
  return {
    isRecoveryRedirect: capturedRedirectState.isRecoveryRedirect || earlyRecoveryEventDetected,
    authErrorDescription: capturedRedirectState.authErrorDescription
  };
}

/**
 * Retrieves the currently active authentication Bearer token (Supabase customer session JWT
 * or signed Admin/Partner JWT) for backend API requests.
 */
export async function getActiveAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const token =
        window.localStorage.getItem('nuvvo_auth_token') ||
        window.sessionStorage.getItem('nuvvo_auth_token');
      if (token && token.trim()) {
        return token.trim();
      }
    } catch {}
  }

  return null;
}
