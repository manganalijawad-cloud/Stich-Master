/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Mail, AlertTriangle, Info } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: { id: string; email: string; name: string; role: 'Owner' | 'Worker' }, token: string) => void;
  supabaseConfig: { supabaseConnected: boolean; supabaseUrl: string | null };
}

export default function LoginScreen({ onLoginSuccess, supabaseConfig }: LoginScreenProps) {
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      let isJson = false;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
          isJson = true;
        } catch (parseErr) {
          console.error('Failed to parse response as JSON even though content-type matched:', parseErr);
        }
      }

      if (!response.ok) {
        if (isJson && data && data.error) {
          throw new Error(data.error);
        } else {
          const textExcerpt = !isJson ? ' (received non-JSON/HTML response)' : '';
          if (response.status === 403 || !isJson) {
            throw new Error(`Auth403Error: Authentication failed with status ${response.status}${textExcerpt}. This usually occurs because third-party cookies are blocked or tracking protection/shields are enabled in your browser within the AI Studio iframe preview. Please open the app in a new tab using the 'Open in New Tab' button at the top-right of the preview pane to sign in successfully.`);
          }
          throw new Error(`Authentication failed with status ${response.status}${textExcerpt}. Please try again.`);
        }
      }

      if (!isJson || !data) {
        throw new Error('Server returned an unexpected response format (not JSON). Please try again or contact support.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const isAuth403Error = error && error.startsWith('Auth403Error:');
  const displayError = isAuth403Error ? error.replace('Auth403Error: ', '') : error;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        {/* Banner/Header styled like StitchMaster Pro Sidebar */}
        <div className="bg-[#0F172A] p-8 text-center border-b border-slate-800">
          <div className="inline-flex items-center justify-center p-3.5 bg-slate-800 rounded-2xl mb-4 border border-slate-700">
            <Shield className="w-8 h-8 text-[#38BDF8]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">StitchMaster Pro</h1>
          <p className="text-slate-400 mt-1 text-sm tracking-wide uppercase font-semibold">Secure Staff Portal</p>
        </div>

        {/* Status Indicators matching theme styles */}
        <div className="px-8 pt-6">
          {isAuth403Error && (
            <div className="mb-4 flex flex-col gap-2.5 bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 shadow-sm animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="font-bold text-sm uppercase tracking-wider">Iframe Sandbox Blocked</p>
              </div>
              <p className="text-xs font-medium text-slate-700 leading-relaxed">
                Google AI Studio previews run inside a sandboxed iframe. Your browser is blocking the authentication cookies required to complete this request.
              </p>
              <div className="text-xs bg-white p-2.5 border border-amber-200 rounded-lg text-slate-800 font-semibold space-y-1">
                <p className="text-amber-700 font-bold">Recommended Solutions:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Click the <span className="font-bold text-[#0369A1]">"Open in New Tab"</span> button in the top-right corner of the preview pane.</li>
                  <li>Alternatively, disable shields/tracking protection or allow third-party cookies for this site.</li>
                </ul>
              </div>
            </div>
          )}

          {!supabaseConfig.supabaseConnected ? (
            <div className="flex items-start gap-3 bg-[#FEF9C3] border border-amber-200 rounded-xl p-4 text-[#854D0E]">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#854D0E]" />
              <div>
                <p className="font-bold text-sm uppercase tracking-wider">Sandbox Mode Active</p>
                <div className="text-xs font-medium text-slate-700 mt-1 space-y-1">
                  <div>Default credentials:</div>
                  <div className="flex gap-2 items-center">
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">owner@tailor.com</span>
                    <span>/</span>
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">password123</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">worker@tailor.com</span>
                    <span>/</span>
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">password123</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-[#E0F2FE] border border-sky-100 rounded-xl p-4 text-[#0369A1]">
              <Info className="w-5 h-5 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wider">Cloud Connected (Supabase)</p>
            </div>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
              {displayError}
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
