import { supabase } from './supabase';

export interface SignUpStepOne {
  shopName: string;
  ownerName: string;
  mobileNumber: string;
  shopAddress: string;
}

export interface SignUpStepTwo {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ExtendedUserProfile {
  id: string;
  email: string;
  name: string;
  owner_name?: string;
  mobile_number?: string;
  role: 'Owner' | 'Worker';
  shop_id?: string;
  shop_name?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export async function signUp(
  stepOne: SignUpStepOne,
  stepTwo: SignUpStepTwo
): Promise<{ user: ExtendedUserProfile | null; error: string | null }> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: stepTwo.email.trim().toLowerCase(),
      password: stepTwo.password,
      options: {
        data: {
          name: stepOne.ownerName.trim(),
          shop_name: stepOne.shopName.trim(),
        },
      },
    });

    if (authError) return { user: null, error: authError.message };
    if (!authData.user) return { user: null, error: 'Sign up failed. Please try again.' };

    const user = authData.user;

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        shop_name: stepOne.shopName.trim(),
        address: stepOne.shopAddress.trim(),
        owner_name: stepOne.ownerName.trim(),
        mobile_number: stepOne.mobileNumber.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (shopError) return { user: null, error: shopError.message };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        shop_id: shop.id,
        owner_name: stepOne.ownerName.trim(),
        mobile_number: stepOne.mobileNumber.trim(),
        name: stepOne.ownerName.trim(),
      })
      .eq('id', user.id);

    if (profileError) return { user: null, error: profileError.message };

    const profile: ExtendedUserProfile = {
      id: user.id,
      email: user.email || '',
      name: stepOne.ownerName.trim(),
      owner_name: stepOne.ownerName.trim(),
      mobile_number: stepOne.mobileNumber.trim(),
      role: 'Owner',
      shop_id: shop.id,
      shop_name: stepOne.shopName.trim(),
      address: stepOne.shopAddress.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return { user: profile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, error: message };
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: ExtendedUserProfile | null; error: string | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) return { user: null, error: error.message };
    if (!data.session) return { user: null, error: 'No session returned. Please try again.' };

    const profile = await fetchProfile(data.session.access_token);
    return { user: profile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, error: message };
  }
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
    const isElectron = !!(window as any).electronAPI?.isElectron;

    if (isElectron) {
      return signInWithGoogleDesktop();
    }

    // Web flow: use popup or redirect via Supabase
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

async function signInWithGoogleDesktop(): Promise<{ error: string | null }> {
  const api = (window as any).electronAPI;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  const redirectTo = 'hellodarzi://auth/callback';
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

  let resolved = false;
  let removeListener: (() => void) | null = null;

  const handleDeepLinkCallback = async (callbackUrl: string) => {
    if (resolved) return;
    resolved = true;
    if (removeListener) removeListener();

    try {
      const session = await api.oauthParseCallback(callbackUrl);
      if (session.access_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token || '',
        });
        if (setSessionError) {
          return { error: setSessionError.message };
        }
        return { error: null };
      } else {
        return { error: session.error || 'No access token in callback' };
      }
    } catch (err) {
      return { error: 'Failed to process authentication callback' };
    }
  };

  // Listen for deep link events from main process (fired when OS delivers the URL)
  removeListener = api.onOAuthCallback((callbackUrl: string) => {
    handleDeepLinkCallback(callbackUrl);
  });

  try {
    // Open system browser and wait for deep link
    const result = await api.oauthStart(authUrl);

    if (result.error) {
      resolved = true;
      if (removeListener) removeListener();
      return { error: result.error };
    }

    if (result.url) {
      const callbackResult = await handleDeepLinkCallback(result.url);
      if (callbackResult?.error) {
        return { error: callbackResult.error };
      }
    }
  } catch (err: unknown) {
    resolved = true;
    if (removeListener) removeListener();
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }

  // Wait briefly for the session to propagate via auth state listener
  await new Promise(r => setTimeout(r, 1000));
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return { error: null };
  }

  // The auth state listener in AuthContext should catch the session
  // If we got here without error, assume success (session will populate async)
  return { error: null };
}

export async function sendPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: window.location.origin + '/auth/reset-password',
      }
    );

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send reset email';
    return { error: message };
  }
}

export async function updatePassword(
  newPassword: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update password';
    return { error: message };
  }
}

export async function completeGoogleProfile(
  shopName: string,
  mobileNumber: string,
  address: string
): Promise<{ user: ExtendedUserProfile | null; error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { user: null, error: 'No active session found' };

    const user = session.user;

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        shop_name: shopName.trim(),
        address: address.trim(),
        owner_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
        mobile_number: mobileNumber.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (shopError) return { user: null, error: shopError.message };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        shop_id: shop.id,
        owner_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
        mobile_number: mobileNumber.trim(),
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
      })
      .eq('id', user.id);

    if (profileError) return { user: null, error: profileError.message };

    const profile: ExtendedUserProfile = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
      owner_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
      mobile_number: mobileNumber.trim(),
      role: 'Owner',
      shop_id: shop.id,
      shop_name: shopName.trim(),
      address: address.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return { user: profile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete profile';
    return { user: null, error: message };
  }
}

async function fetchProfile(accessToken: string): Promise<ExtendedUserProfile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, shops(shop_name, address)')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
        role: 'Owner',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return {
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
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  localStorage.removeItem('tailor_token');
  localStorage.removeItem('tailor_user');
  localStorage.removeItem('hellodarzi-auth');
}
