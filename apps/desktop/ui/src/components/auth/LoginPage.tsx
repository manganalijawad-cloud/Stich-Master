import { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, Mail, Store } from 'lucide-react';
import {
  completeShopSetup,
  signInWithPassword,
  signOut as supabaseSignOut,
  updatePassword,
} from '../../lib/auth';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { validateConfirmPassword } from '../../lib/validation';
import { useAuth } from '../../contexts/AuthContext';
import VersionInfo from '../VersionInfo';

type Mode = 'signin' | 'forgot' | 'recovery' | 'shop-setup';

const SUPPORT_WHATSAPP_URL = 'https://wa.me/923163455358?text=' + encodeURIComponent(
  'Hello Hello Darzi support — I need help resetting my account password.',
);

export default function LoginPage() {
  const {
    setSession,
    token,
    needsShopSetup,
    isPasswordRecovery,
    completeShopSetupSession,
    clearPasswordRecovery,
    clearSession,
  } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [shopName, setShopName] = useState('');
  const [shopNameError, setShopNameError] = useState<string | undefined>();
  /** Keep the access token from the sign-in that triggered shop setup (AuthContext may lag). */
  const [setupToken, setSetupToken] = useState<string | null>(null);

  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('recovery');
      setInfo('Choose a new password for your account.');
      return;
    }
    if (needsShopSetup && token) {
      setSetupToken(token);
      setMode('shop-setup');
    }
  }, [needsShopSetup, token, isPasswordRecovery]);

  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setMode('recovery');
      setInfo('Choose a new password for your account.');
    }
  }, []);

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isSupabaseConfigured()) {
      setError('Supabase Auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    // Drop any restored preview session before applying the credentials just typed.
    clearSession();
    setIsLoading(true);
    const result = await signInWithPassword(email, password);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsShopSetup && result.token) {
      setSetupToken(result.token);
      setMode('shop-setup');
      return;
    }
    if (result.user && result.token) {
      setSession(result.user, result.token);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    const confirmErr = validateConfirmPassword(newPassword, confirmPassword);
    if (confirmErr) {
      setError(confirmErr);
      return;
    }

    setIsLoading(true);
    const result = await updatePassword(newPassword);
    if (!result.error) {
      await supabaseSignOut();
      clearPasswordRecovery();
      clearSession();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setInfo('Password updated. Sign in with your new password.');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMode('signin');
  };

  const handleShopSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShopNameError(undefined);

    if (!shopName.trim()) {
      setShopNameError('Shop name is required');
      return;
    }
    const accessToken = setupToken || token;
    if (!accessToken) {
      setError('Session expired. Please sign in again.');
      setMode('signin');
      return;
    }

    setIsLoading(true);
    const result = await completeShopSetup(accessToken, shopName, {
      // Password from the sign-in that opened this dialog — enables Owner unlock.
      password: password || undefined,
    });
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.user) {
      completeShopSetupSession(result.user);
      setSession(result.user, result.token || accessToken);
      setSetupToken(null);
    }
  };

  const headline =
    mode === 'forgot'
      ? 'Need a password reset?'
      : mode === 'recovery'
        ? 'Set new password'
        : mode === 'shop-setup'
          ? 'Name your shop'
          : 'Welcome back';

  const subtext =
    mode === 'forgot'
      ? 'Password reset is handled by Hello Darzi support on WhatsApp'
      : mode === 'recovery'
        ? 'Enter a new password for your account'
        : mode === 'shop-setup'
          ? 'One-time setup for this device — data stays local'
          : 'Sign in with your Hello Darzi account';

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <img src="/favicon.svg" alt="Hello Darzi" className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white font-display tracking-tight">{headline}</h1>
            <p className="text-sm text-slate-400 mt-1.5">{subtext}</p>
          </div>

          {(error || info) && (
            <div className="rounded-lg bg-white/10 border border-white/20 px-4 py-3 mb-4">
              <p className="text-sm font-medium text-white">{error || info}</p>
            </div>
          )}

          {mode === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    autoFocus
                    className="w-full h-11 pl-10 pr-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full h-11 pl-10 pr-11 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="icon-sm" /> : <Eye className="icon-sm" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="icon-sm animate-spin" /> : null}
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                className="w-full text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed text-center">
                Accounts are invite-only. Message us on WhatsApp and we will reset your password for you.
              </p>
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="w-full h-11 bg-[#25D366] hover:bg-[#1ebe57] text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                WhatsApp +92 316 3455358
              </a>
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                className="w-full text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Back to sign in
              </button>
            </div>
          )}

          {mode === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                    autoFocus
                    className="w-full h-11 pl-10 pr-11 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="icon-sm" /> : <Eye className="icon-sm" />}
                  </button>
                </div>
              </div>

              <div>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  className="w-full h-11 px-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="icon-sm animate-spin" /> : null}
                {isLoading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}

          {mode === 'shop-setup' && (
            <form onSubmit={handleShopSetupSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => { setShopName(e.target.value); setShopNameError(undefined); }}
                    placeholder="Shop name"
                    autoComplete="organization"
                    autoFocus
                    className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-colors duration-150
                      ${shopNameError
                        ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                        : 'border-slate-700/50 focus:border-white focus:ring-2 focus:ring-white/20'
                      }`}
                    disabled={isLoading}
                  />
                </div>
                {shopNameError && (
                  <p className="mt-1.5 text-xs text-neutral-300 font-medium">{shopNameError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="icon-sm animate-spin" /> : null}
                {isLoading ? 'Setting up…' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
      <VersionInfo position="bottom-right" />
    </div>
  );
}
