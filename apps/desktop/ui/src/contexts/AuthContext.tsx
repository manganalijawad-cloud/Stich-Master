import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ExtendedUserProfile } from '../lib/auth';
import { signOut as authSignOut, checkSubscription } from '../lib/auth';
import { useOnlineStatus } from '../lib/useOnlineStatus';

interface AuthContextValue {
  user: ExtendedUserProfile | null;
  token: string | null;
  isLoading: boolean;
  isOnline: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'expired' | null;
  signOut: () => Promise<void>;
  setSession: (user: ExtendedUserProfile, token: string) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ExtendedUserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'inactive' | 'expired' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const mountedRef = useRef(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setSubscriptionStatus(null);
  }, []);

  const setSession = useCallback((newUser: ExtendedUserProfile, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    if (newUser.subscription_status) {
      setSubscriptionStatus(newUser.subscription_status);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await authSignOut();
    clearSession();
  }, [clearSession]);

  const wasOffline = useRef(false);
  useEffect(() => {
    if (!isOnline && user && token) {
      wasOffline.current = true;
    }
    if (isOnline && wasOffline.current && user && token) {
      wasOffline.current = false;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session && session.access_token !== token) {
          setToken(session.access_token);
        }
      }).catch(() => {});
    }
  });

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    const loadProfile = async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
      let profile: any = null;
      try {
        const joined = await withTimeout(
          supabase.from('profiles').select('*, shops(shop_name, address)').eq('id', authUser.id).single(),
          8000
        );
        if (!joined.error) profile = joined.data;
      } catch {
        // join may fail if shops columns are missing — fall back to profile-only
      }

      if (!profile) {
        try {
          const plain = await withTimeout(
            supabase.from('profiles').select('*').eq('id', authUser.id).single(),
            5000
          );
          if (!plain.error) profile = plain.data;
        } catch {
          // ignore
        }
      }

      if (profile) {
        let subStatus: 'active' | 'inactive' | 'expired' = 'active';
        try {
          subStatus = await withTimeout(checkSubscription(authUser.id), 5000);
        } catch {
          subStatus = 'active';
        }
        const extProfile: ExtendedUserProfile = {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          owner_name: profile.owner_name || '',
          mobile_number: profile.mobile_number || '',
          role: profile.role,
          shop_id: profile.shop_id,
          shop_name: profile.shops?.shop_name || '',
          address: profile.shops?.address || '',
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          subscription_status: subStatus,
        };
        setSubscriptionStatus(subStatus);
        setUser(extProfile);
      } else {
        const fallback: ExtendedUserProfile = {
          id: authUser.id,
          email: authUser.email || '',
          name: (authUser.user_metadata?.name as string) || authUser.email?.split('@')[0] || 'Owner',
          role: 'Owner',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setUser(fallback);
      }
    };

    const restoreSession = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 8000);

        if (session && mounted) {
          setToken(session.access_token);

          const { data: { user: authUser } } = await withTimeout(supabase.auth.getUser(), 8000);
          if (authUser && mounted) {
            await loadProfile(authUser);
          }
        }
      } catch {
        // Session restore failed or timed out — show login rather than hang
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;

        if (event === 'SIGNED_OUT') {
          clearSession();
          setIsLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            setToken(session.access_token);

            if (event === 'SIGNED_IN') {
              try {
                const { data: { user: authUser } } = await withTimeout(supabase.auth.getUser(), 8000);
                if (authUser && mountedRef.current) {
                  await loadProfile(authUser);
                }
              } catch (err) {
                console.error('Failed to fetch profile after sign in:', err);
              } finally {
                if (mountedRef.current) setIsLoading(false);
              }
            }
          }
        }
      }
    );

    return () => {
      mounted = false;
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOnline,
        subscriptionStatus,
        signOut: handleSignOut,
        setSession,
        clearSession,
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
