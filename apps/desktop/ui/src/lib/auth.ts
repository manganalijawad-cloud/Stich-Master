import { supabase } from './supabase';

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

    await cacheOwnerUnlockPassword(data.session.access_token, password);

    return { user: profile, token: data.session.access_token, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { user: null, token: null, error: message };
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await cacheOwnerUnlockPassword(token, newPassword);
    }
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update password';
    return { error: message };
  }
}

/** Best-effort: store salted verifier on the desktop for offline Owner unlock. */
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
    // Ignore — online unlock still works; offline unlock needs a successful cache later
  }
}

/** Set to true to re-enable subscription gating in the desktop app. */
const SUBSCRIPTIONS_ENABLED = false;

export async function checkSubscription(userId: string): Promise<'active' | 'inactive' | 'expired'> {
  // Subscriptions are temporarily disabled — treat every user as active.
  if (!SUBSCRIPTIONS_ENABLED) return 'active';

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
