/**
 * Supabase client for cloud sync (DB + Storage).
 * Uses the caller's access token so RLS scopes data to that user.
 * Never uses a service-role key in the desktop app.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function resolveUrl(): string {
  return (
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim()
  );
}

function resolveAnonKey(): string {
  return (
    (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim()
  );
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(resolveUrl() && resolveAnonKey());
}

/** Authenticated client — RLS applies as the signed-in user. */
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  const url = resolveUrl();
  const anonKey = resolveAnonKey();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  if (!accessToken || accessToken.startsWith("hddev_")) {
    throw new Error(
      "Cloud sync requires an online Supabase session. Reconnect and sign in again."
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
