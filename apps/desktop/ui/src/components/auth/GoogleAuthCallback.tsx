import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import SignUpPage from './SignUpPage';
import type { ExtendedUserProfile } from '../../lib/auth';

export default function GoogleAuthCallback() {
  const { setSession } = useAuth();
  const [status, setStatus] = useState<'loading' | 'needs_profile' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setError(sessionError?.message || 'Authentication failed. Please try again.');
        setStatus('error');
        return;
      }

      const user = session.user;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*, shops(shop_name, address)')
        .eq('id', user.id)
        .single();

      if (profile?.shop_id) {
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
        setStatus('needs_profile');
      }
    };

    handleCallback();
  }, [setSession]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center gap-4">
        <Loader2 className="icon-xl text-brand-sky animate-spin" />
        <p className="text-sm text-slate-400">Completing authentication...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 mb-6">
            <p className="text-sm font-medium text-red-400">{error || 'Authentication failed'}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-brand-sky hover:text-sky-300 font-medium text-sm transition-colors cursor-pointer bg-transparent border-none"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <SignUpPage onNavigateLogin={() => window.location.reload()} googleProfile />;
}
