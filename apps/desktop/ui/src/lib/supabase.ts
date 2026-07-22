import { createClient, SupabaseClient } from '@supabase/supabase-js';

const buildUrl = import.meta.env.VITE_SUPABASE_URL || '';
const buildKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient;

function createPlaceholderClient(): SupabaseClient {
  return createClient('https://placeholder.supabase.co', 'placeholder-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// Disable detectSessionInUrl for Electron since deep link callbacks are handled via IPC
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

if (buildUrl && buildKey) {
  _supabase = createClient(buildUrl, buildKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !isElectron,
      storageKey: 'hellodarzi-auth',
    }
  });
} else {
  _supabase = createPlaceholderClient();
}

export const supabase = _supabase;

export async function ensureSupabase(): Promise<void> {
  if (buildUrl && buildKey) return;
  try {
    const res = await fetch('/api/config-status');
    const config = await res.json();
    if (config.supabaseUrl && config.supabaseAnonKey) {
      _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isElectron, storageKey: 'hellodarzi-auth' }
      });
      Object.assign(supabase, _supabase);
    }
  } catch {}
}
