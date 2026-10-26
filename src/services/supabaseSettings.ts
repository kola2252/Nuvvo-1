/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Client & Server-side synchronized service for Supabase `app_settings` table.
 */

import { supabase } from '../utils/supabase/client';

export interface AppSettingRecord<T = any> {
  key: string;
  value: T;
  description?: string;
  updated_at?: string;
  updated_by?: string;
}

/**
 * Fetches an application setting by key from Supabase `app_settings` table.
 * Falls back to server API endpoint `/api/settings/:key`.
 */
export async function getAppSettingFromSupabase<T = any>(key: string, defaultValue?: T): Promise<T | null> {
  try {
    // 1. Direct Supabase query
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, description, updated_at')
      .eq('key', key)
      .maybeSingle();

    if (!error && data && data.value !== undefined) {
      return data.value as T;
    }

    // 2. Fallback to server proxy endpoint
    const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('nuvvo_auth_token') || '') : '';
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.value !== undefined) {
        return json.value as T;
      }
    }
  } catch (err: any) {
    console.warn(`[AppSettings] Notice fetching setting "${key}":`, err?.message);
  }

  return defaultValue !== undefined ? defaultValue : null;
}

/**
 * Persists an application setting into Supabase `app_settings` table.
 * Uses upsert and falls back to server admin endpoint `/api/settings`.
 */
export async function saveAppSettingToSupabase<T = any>(
  key: string,
  value: T,
  description?: string,
  updatedBy?: string
): Promise<{ success: boolean; error?: string }> {
  const payload = {
    key,
    value,
    description: description || `Configuration for ${key}`,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || 'admin'
  };

  try {
    // 1. Attempt direct Supabase upsert
    const { error } = await supabase
      .from('app_settings')
      .upsert([payload], { onConflict: 'key' });

    if (!error) {
      // Also notify backend server to synchronize its state
      try {
        const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('nuvvo_auth_token') || '') : '';
        await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            'x-admin-phone': '9063692135'
          },
          body: JSON.stringify(payload)
        });
      } catch {}

      return { success: true };
    }

    console.warn(`[AppSettings] Direct Supabase upsert notice:`, error.message);
  } catch (err: any) {
    console.warn(`[AppSettings] Supabase direct write exception:`, err?.message);
  }

  // 2. Fallback via server API (uses elevated service role if client lacks direct table permission)
  try {
    const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('nuvvo_auth_token') || '') : '';
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'x-admin-phone': '9063692135'
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true };
    }
    return { success: false, error: json.error || 'Server rejected setting update' };
  } catch (serverErr: any) {
    return { success: false, error: serverErr?.message || 'Network exception saving setting' };
  }
}
