import { useState } from 'react';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { sendPasswordResetEmail } from '../../lib/auth';
import { validateEmail } from '../../lib/validation';

interface ForgotPasswordPageProps {
  onNavigateLogin: () => void;
}

export default function ForgotPasswordPage({ onNavigateLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    setIsLoading(true);
    const result = await sendPasswordResetEmail(email);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-6">
              <CheckCircle2 className="icon-xl text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white font-display tracking-tight mb-2">
              Check your email
            </h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              We&apos;ve sent a password reset link to{' '}
              <span className="text-white font-medium">{email}</span>
            </p>
            <button
              type="button"
              onClick={onNavigateLogin}
              className="text-white hover:text-neutral-300 font-medium text-sm transition-colors cursor-pointer bg-transparent border-none"
            >
              Back to sign in
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
              Reset your password
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-sm font-medium text-white">{error}</p>
              </div>
            )}

            <div>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-colors duration-150"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full h-11 bg-white hover:bg-neutral-200 disabled:bg-neutral-700/50 text-[#0a0a0a] font-semibold text-sm rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="icon-sm animate-spin" />
              ) : null}
              {isLoading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          <button
            type="button"
            onClick={onNavigateLogin}
            className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer bg-transparent border-none"
          >
            <ArrowLeft className="icon-sm" />
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
