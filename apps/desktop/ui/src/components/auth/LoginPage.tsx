import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { signInWithEmail } from '../../lib/auth';
import { validateEmail } from '../../lib/validation';
import { useAuth } from '../../contexts/AuthContext';
import VersionInfo from '../VersionInfo';

interface LoginPageProps {
  onNavigateForgotPassword: () => void;
}

export default function LoginPage({ onNavigateForgotPassword }: LoginPageProps) {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errs: { email?: string; password?: string } = {};
    const emailErr = validateEmail(email);
    if (emailErr) errs.email = emailErr;
    if (!password || password.length === 0) errs.password = 'Password is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsLoading(true);
    const result = await signInWithEmail(email, password);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.user) {
      setSession(result.user, result.token || '');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <img src="/favicon.svg" alt="Stich Master" className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white font-display tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-white/10 border border-white/20 px-4 py-3">
                <p className="text-sm font-medium text-white">{error}</p>
              </div>
            )}

            <div>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                  placeholder="Email address"
                  autoComplete="email"
                  autoFocus
                  className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-colors duration-150
                    ${fieldErrors.email
                      ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                      : 'border-slate-700/50 focus:border-white focus:ring-2 focus:ring-white/20'
                    }`}
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-neutral-300 font-medium">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder="Password"
                  autoComplete="current-password"
                  className={`w-full h-11 pl-10 pr-11 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-colors duration-150
                    ${fieldErrors.password
                      ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                      : 'border-slate-700/50 focus:border-white focus:ring-2 focus:ring-white/20'
                    }`}
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
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-neutral-300 font-medium">{fieldErrors.password}</p>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onNavigateForgotPassword}
                className="text-sm text-white hover:text-neutral-300 font-medium transition-colors cursor-pointer bg-transparent border-none"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="icon-sm animate-spin" />
              ) : null}
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      <VersionInfo position="bottom-right" />
    </div>
  );
}
