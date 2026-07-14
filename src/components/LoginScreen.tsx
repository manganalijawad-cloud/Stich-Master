import React, { useState } from 'react';
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
    } catch (err: any) {
      setError(err.message || 'Something went wrong during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-slate-800 rounded-2xl mb-4 border border-slate-700">
            <Shield className="w-8 h-8 text-[#38BDF8]" />
          </div>
          <h1 className="text-2xl font-bold text-white font-display uppercase tracking-wider">StitchMaster</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900/30 rounded-xl text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-medium transition-all"
              disabled={loading}
            />
          </div>

          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-medium transition-all"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#0F172A] text-sm font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
