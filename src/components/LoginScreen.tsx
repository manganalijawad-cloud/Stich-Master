/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Mail, Info } from 'lucide-react';
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
      // Authenticate directly using Supabase auth JS client
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      if (!data.session) {
        throw new Error('Authentication succeeded but no active session was returned.');
      }

      // Fetch the role profile from our server using the new access token
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${data.session.access_token}`
        }
      });

      if (!response.ok) {
        let errMsg = 'Failed to fetch user profile from server.';
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (e) {
          // ignore parsing error
        }
        throw new Error(errMsg);
      }

      const resData = await response.json();
      if (!resData || !resData.user) {
        throw new Error('Invalid profile response received from server.');
      }

      onLoginSuccess(resData.user, data.session.access_token);
    } catch (err: any) {
      // Handle authentication errors gracefully by displaying the actual Supabase/profile error message.
      setError(err.message || 'Something went wrong during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        {/* Banner/Header */}
        <div className="bg-[#0F172A] p-8 text-center border-b border-slate-800">
          <div className="inline-flex items-center justify-center p-3.5 bg-slate-800 rounded-2xl mb-4 border border-slate-700">
            <Shield className="w-8 h-8 text-[#38BDF8]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">StitchMaster Pro</h1>
          <p className="text-slate-400 mt-1 text-sm tracking-wide uppercase font-semibold">Secure Staff Portal</p>
        </div>

        {/* Status Indicators */}
        <div className="px-8 pt-6">
          <div className="flex items-center gap-3 bg-[#E0F2FE] border border-sky-100 rounded-xl p-4 text-[#0369A1]">
            <Info className="w-5 h-5 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wider">Secure Cloud Auth Active</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@shop.com"
                className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-slate-800 text-base placeholder-slate-400 focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 font-medium transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-slate-800 text-base placeholder-slate-400 focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 font-medium transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="signin-btn"
            type="submit"
            className="w-full py-3.5 px-6 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-base rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Safety Notice footer */}
      <p className="text-slate-400 text-xs mt-8 text-center max-w-xs uppercase tracking-wider font-semibold">
        Protected system. Unauthorized access attempts are monitored and logged.
      </p>
    </div>
  );
}
