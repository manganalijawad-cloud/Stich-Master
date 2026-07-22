import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ExtendedUserProfile } from '../lib/auth';
import { signOut as authSignOut } from '../lib/auth';
import { useOnlineStatus } from '../lib/useOnlineStatus';

interface AuthContextValue {
  user: ExtendedUserProfile | null;
  token: string | null;
  isLoading: boolean;
  isOnline: boolean;
  signOut: () => Promise<void>;
  setSession: (user: ExtendedUserProfile, token: string) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ExtendedUserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('tailor_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('tailor_token'));
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const mountedRef = useRef(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('tailor_token');
    localStorage.removeItem('tailor_user');
    localStorage.removeItem('hellodarzi-auth');
  }, []);

  const setSession = useCallback((newUser: ExtendedUserProfile, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('tailor_token', newToken);
    localStorage.setItem('tailor_user', JSON.stringify(newUser));
  }, []);

  const handleSignOut = useCallback(async () => {
    await authSignOut();
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session && mounted) {
          setToken(session.access_token);
          localStorage.setItem('tailor_token', session.access_token);

          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser && mounted) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*, shops(shop_name, address)')
              .eq('id', authUser.id)
              .single();

            if (profile) {
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
              };
              setSession(extProfile, session.access_token);
            } else {
              const fallback: ExtendedUserProfile = {
                id: authUser.id,
                email: authUser.email || '',
                name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Owner',
                role: 'Owner',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              setSession(fallback, session.access_token);
            }
          }
        } else if (mounted) {
          const cachedToken = localStorage.getItem('tailor_token');
          const cachedUser = localStorage.getItem('tailor_user');
          if (cachedToken && cachedUser) {
            try {
              const parsed = JSON.parse(cachedUser) as ExtendedUserProfile;
              setToken(cachedToken);
              setUser(parsed);
            } catch {
              clearSession();
            }
          }
        }
      } catch {
        const cachedToken = localStorage.getItem('tailor_token');
        const cachedUser = localStorage.getItem('tailor_user');
        if (cachedToken && cachedUser && mounted) {
          try {
            setToken(cachedToken);
            setUser(JSON.parse(cachedUser));
          } catch {
            clearSession();
          }
        }
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
            localStorage.setItem('tailor_token', session.access_token);

            // Fetch the user profile for SIGNED_IN events (e.g., from Google OAuth)
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
                    };
                    setSession(extProfile, session.access_token);
                  } else {
                    // No shop yet — user needs to complete profile
                    const fallback: ExtendedUserProfile = {
                      id: authUser.id,
                      email: authUser.email || '',
                      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Owner',
                      role: 'Owner',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    setSession(fallback, session.access_token);
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
  }, [clearSession, setSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOnline,
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
