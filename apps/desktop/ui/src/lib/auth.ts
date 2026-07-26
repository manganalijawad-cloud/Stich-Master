/**
 * Authentication API — Supabase Auth only.
 * Business data stays in the local SQLite database via /api/*.
 */

import { getAuthRedirectUrl, getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface AuthResult {
  user: ExtendedUserProfile | null;
  token: string | null;
  error: string | null;
  needsShopSetup?: boolean;
}

export interface ExtendedUserProfile {
  id: string;
  email: string;
  name: string;
  mobile_number?: string;
  role: 'Owner' | 'Worker';
  shop_id?: string;
  shop_name?: string;
  address?: string;
  created_at: string;
  updated_at: string;
  subscription_status?: 'active' | 'inactive' | 'expired';
}

function mapEnsureResponse(data: {
  user?: ExtendedUserProfile;
  needsShopSetup?: boolean;
  error?: string;
}, token: string): AuthResult {
  if (data.needsShopSetup) {
    return { user: null, token, error: null, needsShopSetup: true };
  }
  if (data.user) {
    return { user: data.user, token, error: null };
  }
  return { user: null, token: null, error: data.error || 'Could not load local profile.' };
}

/** Link / create the local shop profile for the authenticated Supabase user. */
export async function ensureLocalProfile(
  accessToken: string,
  opts?: { shopName?: string }
): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth/ensure-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ shopName: opts?.shopName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { user: null, token: null, error: data.error || 'Failed to set up local profile.' };
    }
    return mapEnsureResponse(data, accessToken);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, token: null, error: message };
  }
}

/** Invite-only email/password sign-in via Supabase Auth (requires internet). */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { user: null, token: null, error: 'Supabase Auth is not configured.' };
  }

  try {
    const supabase = getSupabase();
    // Always drop prior session + cached profile before a fresh password login.
    // Otherwise preview/Electron restores the previous Auth user and it looks
    // like "the old account" even when new credentials were submitted.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore — sign-in below still replaces the session
    }
    try {
      localStorage.removeItem('hellodarzi-profile-cache');
      localStorage.removeItem('hellodarzi-supabase-auth');
    } catch {
      // ignore
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { user: null, token: null, error: error.message || 'Sign in failed.' };
    }

    const accessToken = data.session?.access_token;
    if (!accessToken) {
      return { user: null, token: null, error: 'No session returned. Please try again.' };
    }

    const profileResult = await ensureLocalProfile(accessToken);

    // Best-effort: cache password for offline Owner-mode unlock (local verifier only).
    if (profileResult.user && !profileResult.needsShopSetup) {
      void cacheOwnerUnlockPassword(accessToken, password);
    }

    return profileResult;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    const offline =
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? ' Internet connection is required to sign in.'
        : '';
    return { user: null, token: null, error: `${message}${offline}` };
  }
}

/** Complete first-run local shop naming after Supabase sign-in. */
export async function completeShopSetup(
  accessToken: string,
  shopName: string,
  opts?: { password?: string }
): Promise<AuthResult> {
  const result = await ensureLocalProfile(accessToken, { shopName: shopName.trim() });
  // Shop-setup path skipped verifier cache during sign-in — store it now.
  if (result.user && opts?.password) {
    void cacheOwnerUnlockPassword(accessToken, opts.password);
  }
  return result;
}

/** Send a password-reset magic link (requires internet). */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase Auth is not configured.' };
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl(),
    });
    if (error) return { error: error.message || 'Could not send reset email.' };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

/** Set a new password after opening the recovery magic link. */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase Auth is not configured.' };
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message || 'Could not update password.' };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

/** Best-effort: (re)store the salted verifier used for offline Owner unlock. */
export async function cacheOwnerUnlockPassword(token: string, password: string): Promise<void> {
  try {
    await fetch('/api/auth/store-unlock-verifier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    // Ignore — best-effort cache only
  }
}

/** Sign out of Supabase Auth (prefers network; falls back to local clear). */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  } catch {
    try {
      await getSupabase().auth.signOut({ scope: 'local' });
    } catch {
      // ignore
    }
  }
}

/** Load the currently persisted Supabase session (works offline). */
export async function getPersistedAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
