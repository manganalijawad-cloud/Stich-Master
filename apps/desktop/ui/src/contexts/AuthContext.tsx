import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ExtendedUserProfile } from '../lib/auth';
import { ensureLocalProfile, signOut as supabaseSignOut } from '../lib/auth';
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { localDataStore } from '../lib/localDataStore';

const PROFILE_CACHE_KEY = 'hellodarzi-profile-cache';

interface AuthContextValue {
  user: ExtendedUserProfile | null;
  token: string | null;
  isLoading: boolean;
  needsShopSetup: boolean;
  isPasswordRecovery: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'expired' | null;
  signOut: () => Promise<void>;
  setSession: (user: ExtendedUserProfile, token: string) => void;
  clearSession: () => void;
  clearPasswordRecovery: () => void;
  /** After first-run shop naming, attach the local profile to the live session. */
  completeShopSetupSession: (user: ExtendedUserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedProfile(userId: string): ExtendedUserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as ExtendedUserProfile;
    if (cached?.id !== userId) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: ExtendedUserProfile): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota / private mode
  }
}

function clearCachedProfile(): void {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

function clearLegacyDeviceToken(): void {
  try {
    localStorage.removeItem('hellodarzi-device-token');
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ExtendedUserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsShopSetup, setNeedsShopSetup] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'inactive' | 'expired' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const hydratingRef = useRef(false);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setNeedsShopSetup(false);
    setIsPasswordRecovery(false);
    setSubscriptionStatus(null);
    clearCachedProfile();
    clearLegacyDeviceToken();
    localDataStore.clear();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const setSession = useCallback((newUser: ExtendedUserProfile, newToken: string) => {
    setUser((prev) => {
      if (prev && prev.id !== newUser.id) {
        localDataStore.clear();
      }
      return newUser;
    });
    setToken(newToken);
    setNeedsShopSetup(false);
    setIsPasswordRecovery(false);
    writeCachedProfile(newUser);
    clearLegacyDeviceToken();
    setSubscriptionStatus(newUser.subscription_status || 'active');
  }, []);

  const completeShopSetupSession = useCallback((newUser: ExtendedUserProfile) => {
    setUser(newUser);
    setNeedsShopSetup(false);
    writeCachedProfile(newUser);
    setSubscriptionStatus(newUser.subscription_status || 'active');
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await supabaseSignOut();
    } catch {
      // local clear still proceeds
    }
    clearSession();
  }, [clearSession]);

  const hydrateFromAccessToken = useCallback(async (
    accessToken: string,
    opts?: { allowOfflineCache?: boolean; force?: boolean }
  ) => {
    if (hydratingRef.current && !opts?.force) return;
    hydratingRef.current = true;
    try {
      const result = await ensureLocalProfile(accessToken);
      if (!mountedRef.current) return;

      if (result.needsShopSetup) {
        setToken(accessToken);
        setNeedsShopSetup(true);
        setUser(null);
        return;
      }

      if (result.user) {
        setSession(result.user, accessToken);
        return;
      }
    } catch {
      // fall through to offline cache
    } finally {
      hydratingRef.current = false;
    }

    if (opts?.allowOfflineCache) {
      try {
        const { data } = await getSupabase().auth.getSession();
        const sessionUser = data.session?.user;
        const uid = sessionUser?.id;
        const sessionEmail = (sessionUser?.email || '').trim().toLowerCase();
        if (uid) {
          const cached = readCachedProfile(uid);
          const cachedEmail = (cached?.email || '').trim().toLowerCase();
          // Ignore a cached profile that belongs to a different Auth email.
          if (
            cached &&
            mountedRef.current &&
            (!sessionEmail || !cachedEmail || cachedEmail === sessionEmail)
          ) {
            setSession(cached, accessToken);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    if (mountedRef.current) {
      setToken(accessToken);
    }
  }, [setSession]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    clearLegacyDeviceToken();

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabase();
    let subscription: { unsubscribe: () => void } | null = null;

    const restore = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await supabase.auth.getSession();
          const session = data.session;
          if (session?.access_token && mounted) {
            await hydrateFromAccessToken(session.access_token, { allowOfflineCache: true });
          }
          break;
        } catch {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
        }
      }

      if (mounted) setIsLoading(false);
    };

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT' || !session?.access_token) {
        if (event === 'SIGNED_OUT') clearSession();
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setToken(session.access_token);
        setIsPasswordRecovery(true);
        setUser(null);
        setNeedsShopSetup(false);
        return;
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        if (event !== 'TOKEN_REFRESHED') {
          setIsPasswordRecovery(false);
        }
        // Avoid double-hydrate on cold start (getSession + INITIAL_SESSION)
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          await hydrateFromAccessToken(session.access_token, {
            allowOfflineCache: false,
            force: true,
          });
        } else if (event === 'TOKEN_REFRESHED') {
          setToken(session.access_token);
        }
      }
    });
    subscription = data.subscription;

    void restore();

    return () => {
      mounted = false;
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, [clearSession, hydrateFromAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        needsShopSetup,
        isPasswordRecovery,
        subscriptionStatus,
        signOut: handleSignOut,
        setSession,
        clearSession,
        clearPasswordRecovery,
        completeShopSetupSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
