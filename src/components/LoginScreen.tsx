import React, { useState, useRef, useEffect } from 'react';
import { Shield, Key, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  onLoginSuccess: (user: { id: string; email: string; name: string; role: 'Owner' | 'Worker' }, token: string) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      if (!data.session) throw new Error('Authentication succeeded but no active session was returned.');

      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${data.session.access_token}` }
      });

      if (!response.ok) {
        let errMsg = 'Failed to fetch user profile from server.';
        try {
          const errData = await response.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (e) { /* ignore */ }
        throw new Error(errMsg);
      }

      const resData = await response.json();
      if (!resData || !resData.user) throw new Error('Invalid profile response received from server.');

      onLoginSuccess(resData.user, data.session.access_token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMounted.current) setError(message || 'Something went wrong during login.');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-sidebar flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-slate-800 rounded-2xl mb-4 border border-slate-700">
            <Shield className="w-8 h-8 text-brand-sky" />
          </div>
          <h1 className="text-2xl font-semibold text-white font-display uppercase tracking-wider">StitchMaster</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="alert-error bg-red-950/40 border-red-900/30 text-red-400">
              {error}
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 icon-xs text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="input-base pl-11 bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:border-brand-sky focus:ring-brand-sky/20"
              disabled={loading}
            />
          </div>

          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 icon-xs text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="input-base pl-11 bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:border-brand-sky focus:ring-brand-sky/20"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-brand-sky hover:bg-sky-300 text-brand-sidebar text-sm font-semibold rounded-lg transition-[background-color] cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
