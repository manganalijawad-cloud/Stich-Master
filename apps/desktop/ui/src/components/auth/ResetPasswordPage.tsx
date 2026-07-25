import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { updatePassword } from '../../lib/auth';
import { validatePassword, validateConfirmPassword } from '../../lib/validation';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setError('Invalid or expired reset link. Please request a new one.');
      } else {
        setIsValidSession(true);
      }
      setIsVerifying(false);
    };
    verifySession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pErr = validatePassword(password);
    if (pErr) { setError(pErr); return; }

    const cErr = validateConfirmPassword(password, confirmPassword);
    if (cErr) { setError(cErr); return; }

    setIsLoading(true);
    const result = await updatePassword(password);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="icon-xl text-white animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-6">
              <CheckCircle2 className="icon-xl text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white font-display tracking-tight mb-2">
              Password updated
            </h1>
            <p className="text-sm text-slate-400 mb-6">
              Your password has been successfully reset.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-11 bg-white hover:bg-neutral-200 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 cursor-pointer"
            >
              Sign in with new password
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <img src="/favicon.svg" alt="Stich Master" className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white font-display tracking-tight">
              Set new password
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-sm font-medium text-white">{error}</p>
              </div>
            )}

            {!isValidSession && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                <p className="text-sm font-medium text-neutral-300">
                  This reset link is invalid or expired. Please request a new one.
                </p>
              </div>
            )}

            <div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  autoFocus
                  className="w-full h-11 pl-10 pr-11 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                  disabled={isLoading || !isValidSession}
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

            <div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full h-11 pl-10 pr-11 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                  disabled={isLoading || !isValidSession}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="icon-sm" /> : <Eye className="icon-sm" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isValidSession || !password || !confirmPassword}
              className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="icon-sm animate-spin" />
              ) : null}
              {isLoading ? 'Updating...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
