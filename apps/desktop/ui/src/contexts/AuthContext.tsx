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

    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session && mounted) {
          setToken(session.access_token);

          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser && mounted) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*, shops(shop_name, address)')
              .eq('id', authUser.id)
              .single();

            if (profile) {
              const subStatus = await checkSubscription(authUser.id);
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
                name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Owner',
                role: 'Owner',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              setUser(fallback);
            }
          }
        }
      } catch {
        // Session restore failed silently
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
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser && mountedRef.current) {
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, shops(shop_name, address)')
                    .eq('id', authUser.id)
                    .single();

                  if (profile) {
                    const subStatus = await checkSubscription(authUser.id);
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
                      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Owner',
                      role: 'Owner',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    setUser(fallback);
                  }
                }
              } catch (err) {
                console.error('Failed to fetch profile after sign in:', err);
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
