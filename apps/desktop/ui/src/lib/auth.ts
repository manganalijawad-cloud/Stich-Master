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

export interface AuthResult {
  user: ExtendedUserProfile | null;
  token: string | null;
  error: string | null;
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
  subscription_status?: 'active' | 'inactive' | 'expired';
}

export async function signUp(
  stepOne: SignUpStepOne,
  stepTwo: SignUpStepTwo
): Promise<AuthResult> {
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

    if (authError) return { user: null, token: null, error: authError.message };
    if (!authData.user) return { user: null, token: null, error: 'Sign up failed. Please try again.' };

    const user = authData.user;
    const sessionToken = authData.session?.access_token || null;

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

    if (shopError) return { user: null, token: null, error: shopError.message };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        shop_id: shop.id,
        owner_name: stepOne.ownerName.trim(),
        mobile_number: stepOne.mobileNumber.trim(),
        name: stepOne.ownerName.trim(),
      })
      .eq('id', user.id);

    if (profileError) return { user: null, token: null, error: profileError.message };

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

    return { user: profile, token: sessionToken, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, token: null, error: message };
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) return { user: null, token: null, error: error.message };
    if (!data.session) return { user: null, token: null, error: 'No session returned. Please try again.' };

    const profile = await fetchProfile(data.session.access_token);
    if (!profile) {
      return { user: null, token: null, error: 'Failed to load your profile. Please contact support.' };
    }

    return { user: profile, token: data.session.access_token, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, token: null, error: message };
  }
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
    const isElectron = !!(window as any).electronAPI?.isElectron;

    if (isElectron) {
      return signInWithGoogleDesktop();
    }

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

  const redirectTo = 'http://localhost/oauth/callback';
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

  try {
    const result = await api.oauthStart(authUrl);

    if (result.error) {
      return { error: result.error };
    }

    if (result.url) {
      const parsed = await api.oauthParseCallback(result.url);

      if (parsed.access_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token || '',
        });
        if (setSessionError) {
          return { error: setSessionError.message };
        }
        await new Promise(r => setTimeout(r, 500));
        return { error: null };
      } else if (parsed.code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
        if (exchangeError) {
          return { error: exchangeError.message };
        }
        if (data.session) {
          await new Promise(r => setTimeout(r, 500));
          return { error: null };
        }
        return { error: 'Failed to exchange authorization code for session' };
      } else {
        return { error: parsed.error || 'No access token or authorization code in callback' };
      }
    }

    return { error: 'No callback URL received' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
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
): Promise<AuthResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { user: null, token: null, error: 'No active session found' };

    const user = session.user;
    const token = session.access_token;

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

    if (shopError) return { user: null, token: null, error: shopError.message };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        shop_id: shop.id,
        owner_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
        mobile_number: mobileNumber.trim(),
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
      })
      .eq('id', user.id);

    if (profileError) return { user: null, token: null, error: profileError.message };

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

    return { user: profile, token, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete profile';
    return { user: null, token: null, error: message };
  }
}

export async function checkSubscription(userId: string): Promise<'active' | 'inactive' | 'expired'> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return 'inactive';

    if (data.status === 'active' || data.status === 'trialing') return 'active';
    if (data.status === 'past_due') return 'expired';

    return 'inactive';
  } catch {
    return 'active';
  }
}

async function createShopAndProfile(userId: string, email: string, userName: string): Promise<{ shopId: string; shopName: string } | null> {
  try {
    const shopName = `${userName}'s Tailor Shop`;
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        shop_name: shopName,
        address: '',
        owner_name: userName,
        mobile_number: '',
        created_by: userId,
      })
      .select()
      .single();

    if (shopError) return null;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ shop_id: shop.id, name: userName })
      .eq('id', userId);

    if (profileError) return null;

    return { shopId: shop.id, shopName };
  } catch {
    return null;
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
      const fallbackName = user.user_metadata?.name || user.email?.split('@')[0] || 'Owner';
      const shopResult = await createShopAndProfile(user.id, user.email || '', fallbackName);
      return {
        id: user.id,
        email: user.email || '',
        name: fallbackName,
        role: 'Owner',
        shop_id: shopResult?.shopId,
        shop_name: shopResult?.shopName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    if (!profile.shop_id) {
      const fallbackName = profile.name || user.email?.split('@')[0] || 'Owner';
      const shopResult = await createShopAndProfile(user.id, profile.email, fallbackName);
      if (shopResult) {
        profile.shop_id = shopResult.shopId;
      }
    }

    const subscription_status = await checkSubscription(user.id);

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
      subscription_status,
    };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
