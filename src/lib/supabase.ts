import { createClient, SupabaseClient } from '@supabase/supabase-js';

const buildUrl = import.meta.env.VITE_SUPABASE_URL || '';
const buildKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient = createClient(buildUrl, buildKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

export const supabase = _supabase;

export async function ensureSupabase(): Promise<void> {
  if (buildUrl && buildKey) return;
  try {
    const res = await fetch('/api/config-status');
    const config = await res.json();
    if (config.supabaseUrl && config.supabaseAnonKey) {
      _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      Object.assign(supabase, _supabase);
    }
  } catch {}
}
