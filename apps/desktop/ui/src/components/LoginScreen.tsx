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
      // Try Supabase login first
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
        let errMsg = `Server error (HTTP ${response.status})`;
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            if (errData && errData.error) errMsg = errData.error;
            else errMsg = `${errMsg}: ${text.slice(0, 200)}`;
          } catch {
            errMsg = `${errMsg}: ${text.slice(0, 200)}`;
          }
        } catch {
          errMsg = `Server error (HTTP ${response.status}) — unable to read response.`;
        }
        throw new Error(errMsg);
      }

      const resData = await response.json();
      if (!resData || !resData.user) throw new Error('Invalid profile response received from server.');

      onLoginSuccess(resData.user, data.session.access_token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Offline fallback: try local auth
      if (message.includes('fetch') || message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('ERR_INTERNET_DISCONNECTED') || message.includes('AuthRetryableFetchError') || message.includes('network')) {
        try {
          const localRes = await fetch('/api/auth/local-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const localData = await localRes.json();
          if (localData.offline && localData.user && localData.token) {
            onLoginSuccess(localData.user, localData.token);
            return;
          }
          if (localData.online) {
            setError('Internet connection detected but Supabase login failed. Please try again.');
            return;
          }
          setError(localData.error || 'Local authentication failed.');
        } catch {
          setError('Unable to connect. Please check your internet connection and try again.');
        }
      } else {
        setError(message || 'Something went wrong during login.');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  return (
    <div className="h-full bg-brand-sidebar flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <img src="/favicon.svg" alt="Hello Darzi" className="w-16 h-16 object-contain mx-auto mb-2" />
          <h1 className="text-xl font-semibold text-white font-display uppercase tracking-wider">Hello Darzi</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="alert-error bg-red-950/40 border-red-900/30 text-red-400 text-xs py-2">
              {error}
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-xs text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="input-base pl-10 bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:border-brand-sky focus:ring-brand-sky/20 text-sm"
              disabled={loading}
            />
          </div>

          <div className="relative">
            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-xs text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="input-base pl-10 bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:border-brand-sky focus:ring-brand-sky/20 text-sm"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-brand-sky hover:bg-sky-300 text-brand-sidebar text-sm font-semibold rounded-lg transition-[background-color] cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
