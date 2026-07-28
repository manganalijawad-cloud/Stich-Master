import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ExtendedUserProfile } from '../lib/auth';
import {
  ensureLocalProfile,
  mintDeviceSession,
  pickApiToken,
  readDeviceToken,
  clearDeviceToken,
  revokeDeviceSession,
  isAccessTokenExpired,
  isDeviceSessionToken,
  signOut as supabaseSignOut,
} from '../lib/auth';
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

/** Any cached profile on this device — used for instant paint before network/API. */
function readAnyCachedProfile(): ExtendedUserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as ExtendedUserProfile;
    if (!cached?.id) return null;
    return cached;
  } catch {
    return null;
  }
}

function readStoredAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('hellodarzi-supabase-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    return parsed.access_token || parsed.currentSession?.access_token || null;
  } catch {
    return null;
  }
}

async function waitForServer(timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  let delay = 120;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('/api/config-status', { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // server still booting
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 800);
  }
  return false;
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
  /** True once a local profile is attached — blocks stale needsShopSetup hydrates. */
  const hasProfileRef = useRef(false);
  /** Prevents SIGNED_OUT from wiping a device session during intentional logout. */
  const signingOutRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const clearSession = useCallback(() => {
    hasProfileRef.current = false;
    setUser(null);
    setToken(null);
    setNeedsShopSetup(false);
    setIsPasswordRecovery(false);
    setSubscriptionStatus(null);
    clearCachedProfile();
    clearDeviceToken();
    localDataStore.clear();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const applySession = useCallback((newUser: ExtendedUserProfile, apiToken: string) => {
    hasProfileRef.current = true;
    setUser((prev) => {
      if (prev && prev.id !== newUser.id) {
        localDataStore.clear();
      }
      return newUser;
    });
    setToken(apiToken);
    setNeedsShopSetup(false);
    setIsPasswordRecovery(false);
    writeCachedProfile(newUser);
    setSubscriptionStatus(newUser.subscription_status || 'active');
  }, []);

  const setSession = useCallback((newUser: ExtendedUserProfile, newToken: string) => {
    const apiToken = pickApiToken(newToken, readDeviceToken()) || newToken;
    applySession(newUser, apiToken);

    // Rotate / mint local device session while we still have a live JWT.
    if (!isDeviceSessionToken(newToken) && !isAccessTokenExpired(newToken)) {
      void mintDeviceSession(newToken).then((device) => {
        if (!mountedRef.current || !device) return;
        setToken(pickApiToken(newToken, device) || device);
      });
    }
  }, [applySession]);

  const completeShopSetupSession = useCallback((newUser: ExtendedUserProfile) => {
    hasProfileRef.current = true;
    setUser(newUser);
    setNeedsShopSetup(false);
    writeCachedProfile(newUser);
    setSubscriptionStatus(newUser.subscription_status || 'active');
    const jwtOrDevice = tokenRef.current;
    if (jwtOrDevice && !isDeviceSessionToken(jwtOrDevice) && !isAccessTokenExpired(jwtOrDevice)) {
      void mintDeviceSession(jwtOrDevice).then((device) => {
        if (!mountedRef.current) return;
        const next = pickApiToken(jwtOrDevice, device);
        if (next) setToken(next);
      });
    }
  }, []);

  const restoreFromDeviceToken = useCallback(async (deviceToken: string): Promise<boolean> => {
    const attempt = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${deviceToken}` },
        });
        if (!res.ok) return false;
        const data = await res.json().catch(() => ({}));
        const uid = data?.user?.id as string | undefined;
        if (!uid) return false;
        const cached = readCachedProfile(uid);
        const profile: ExtendedUserProfile = cached || {
          id: data.user.id,
          email: data.user.email || '',
          name: data.user.name || data.user.email || 'User',
          role: data.user.role || 'Owner',
          shop_id: data.user.shop_id,
          shop_name: data.user.name,
          created_at: '',
          updated_at: '',
          subscription_status: 'active',
        };
        if (mountedRef.current) {
          applySession(profile, deviceToken);
        }
        return true;
      } catch {
        return false;
      }
    };

    if (await attempt()) return true;
    // Local API may still be warming after splash → app navigation.
    await waitForServer(5000);
    for (let i = 0; i < 3; i++) {
      if (await attempt()) return true;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
    return false;
  }, [applySession]);

  const handleSignOut = useCallback(async () => {
    signingOutRef.current = true;
    try {
      await revokeDeviceSession(tokenRef.current);
      await supabaseSignOut();
    } catch {
      // local clear still proceeds
    }
    clearSession();
    signingOutRef.current = false;
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
        // Ignore stale in-flight hydrates that finish after shop setup completed.
        if (hasProfileRef.current) return;
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
      const device = readDeviceToken();
      if (device && (await restoreFromDeviceToken(device))) {
        return;
      }

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
            const apiToken = pickApiToken(accessToken, device) || accessToken;
            applySession(cached, apiToken);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    if (mountedRef.current) {
      setToken(pickApiToken(accessToken, readDeviceToken()) || accessToken);
    }
  }, [setSession, applySession, restoreFromDeviceToken]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    let settled = false;

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabase();
    let subscription: { unsubscribe: () => void } | null = null;

    const finishLoading = () => {
      if (!mounted || settled) return;
      settled = true;
      setIsLoading(false);
    };

    // Instant paint for returning users — never flash the login form while session restores.
    const cachedProfile = readAnyCachedProfile();
    const deviceToken = readDeviceToken();
    const storedJwt = readStoredAccessToken();
    const optimisticToken = pickApiToken(storedJwt, deviceToken);
    if (cachedProfile && optimisticToken) {
      applySession(cachedProfile, optimisticToken);
    }

    const restoreSession = async (session: { access_token?: string } | null | undefined) => {
      const device = readDeviceToken();
      const jwt = session?.access_token;

      if (jwt) {
        if (!isAccessTokenExpired(jwt)) {
          await hydrateFromAccessToken(jwt, { allowOfflineCache: true });
        } else if (device) {
          const ok = await restoreFromDeviceToken(device);
          if (!ok) {
            await hydrateFromAccessToken(jwt, { allowOfflineCache: true });
          }
        } else {
          await hydrateFromAccessToken(jwt, { allowOfflineCache: true });
        }
        return;
      }

      if (device) {
        await restoreFromDeviceToken(device);
      }
    };

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      if (event === 'INITIAL_SESSION') {
        try {
          await restoreSession(session);
        } finally {
          finishLoading();
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (signingOutRef.current) return;
        const device = readDeviceToken();
        if (device) {
          const ok = await restoreFromDeviceToken(device);
          if (ok) return;
        }
        clearSession();
        return;
      }

      if (!session?.access_token) {
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
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          await hydrateFromAccessToken(session.access_token, {
            allowOfflineCache: false,
            force: true,
          });
        } else if (event === 'TOKEN_REFRESHED') {
          const device = readDeviceToken();
          setToken(pickApiToken(session.access_token, device) || session.access_token);
          void mintDeviceSession(session.access_token);
        }
      }
    });
    subscription = data.subscription;

    // Fallback if INITIAL_SESSION is delayed/missing (older clients / storage races).
    const fallbackTimer = window.setTimeout(() => {
      void (async () => {
        if (settled || !mounted) return;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          await restoreSession(sessionData.session);
        } finally {
          finishLoading();
        }
      })();
    }, 1500);

    return () => {
      mounted = false;
      mountedRef.current = false;
      window.clearTimeout(fallbackTimer);
      subscription?.unsubscribe();
    };
  }, [applySession, clearSession, hydrateFromAccessToken, restoreFromDeviceToken]);

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
