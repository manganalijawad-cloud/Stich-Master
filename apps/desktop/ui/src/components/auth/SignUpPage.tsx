import { useState } from 'react';
import { ArrowLeft, ArrowRight, Store, User, Phone, MapPin, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { signUp, completeGoogleProfile } from '../../lib/auth';
import {
  validateEmail,
  validatePassword,
  validateMobileNumber,
  validateRequired,
  validateConfirmPassword,
} from '../../lib/validation';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface SignUpPageProps {
  onNavigateLogin: () => void;
  googleProfile?: boolean;
}

export default function SignUpPage({ onNavigateLogin, googleProfile = false }: SignUpPageProps) {
  const { setSession } = useAuth();
  const [step, setStep] = useState(googleProfile ? 2 : 1);

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    const nErr = validateRequired(shopName, 'Shop Name');
    const oErr = validateRequired(ownerName, 'Owner Name');
    const mErr = validateMobileNumber(mobileNumber);
    const aErr = validateRequired(shopAddress, 'Shop Address');
    if (nErr) errs.shopName = nErr;
    if (oErr) errs.ownerName = oErr;
    if (mErr) errs.mobileNumber = mErr;
    if (aErr) errs.shopAddress = aErr;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!googleProfile) {
      const eErr = validateEmail(email);
      const pErr = validatePassword(password);
      const cErr = validateConfirmPassword(password, confirmPassword);
      if (eErr) errs.email = eErr;
      if (pErr) errs.password = pErr;
      if (cErr) errs.confirmPassword = cErr;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    setError(null);
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateStep2()) return;

    setIsLoading(true);

    if (googleProfile) {
      const result = await completeGoogleProfile(shopName, mobileNumber, shopAddress);
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(result.user, session?.access_token || '');
      }
    } else {
      const result = await signUp(
        { shopName, ownerName, mobileNumber, shopAddress },
        { email, password, confirmPassword }
      );
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(result.user, session?.access_token || '');
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <img src="/favicon.svg" alt="Stich Master" className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white font-display tracking-tight">
              {googleProfile ? 'Complete your profile' : 'Create your account'}
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              {googleProfile
                ? 'Just a few more details to get started'
                : step === 1
                ? 'Tell us about your shop'
                : 'Set up your login credentials'}
            </p>
          </div>

          {!googleProfile && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${step === 1 ? 'bg-brand-sky' : 'bg-slate-600'}`} />
              <div className={`w-12 h-0.5 rounded transition-colors duration-300 ${step === 2 ? 'bg-brand-sky' : 'bg-slate-700'}`} />
              <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${step === 2 ? 'bg-brand-sky' : 'bg-slate-600'}`} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-sm font-medium text-red-400">{error}</p>
              </div>
            )}

            {step === 1 && (
              <>
                <div>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => { setShopName(e.target.value); setFieldErrors((p) => ({ ...p, shopName: undefined })); }}
                      placeholder="Shop Name"
                      autoComplete="organization"
                      autoFocus
                      className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                        ${fieldErrors.shopName ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {fieldErrors.shopName && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.shopName}</p>}
                </div>

                <div>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => { setOwnerName(e.target.value); setFieldErrors((p) => ({ ...p, ownerName: undefined })); }}
                      placeholder="Owner Name"
                      autoComplete="name"
                      className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                        ${fieldErrors.ownerName ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {fieldErrors.ownerName && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.ownerName}</p>}
                </div>

                <div>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                    <input
                      type="tel"
                      value={mobileNumber}
                      onChange={(e) => { setMobileNumber(e.target.value); setFieldErrors((p) => ({ ...p, mobileNumber: undefined })); }}
                      placeholder="Mobile Number"
                      autoComplete="tel"
                      className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                        ${fieldErrors.mobileNumber ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {fieldErrors.mobileNumber && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.mobileNumber}</p>}
                </div>

                <div>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                    <textarea
                      value={shopAddress}
                      onChange={(e) => { setShopAddress(e.target.value); setFieldErrors((p) => ({ ...p, shopAddress: undefined })); }}
                      placeholder="Shop Address"
                      rows={2}
                      className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200 resize-none
                        ${fieldErrors.shopAddress ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                      disabled={isLoading}
                    />
                  </div>
                  {fieldErrors.shopAddress && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.shopAddress}</p>}
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full h-11 bg-brand-sky hover:bg-sky-400 text-[#0F172A] font-semibold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Continue
                  <ArrowRight className="icon-sm" />
                </button>
              </>
            )}

            {(step === 2 || googleProfile) && (
              <>
                {!googleProfile && (
                  <>
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
                          className={`w-full h-11 pl-10 pr-4 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                            ${fieldErrors.email ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                          disabled={isLoading}
                        />
                      </div>
                      {fieldErrors.email && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.email}</p>}
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                          placeholder="Password"
                          autoComplete="new-password"
                          className={`w-full h-11 pl-10 pr-11 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                            ${fieldErrors.password ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
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
                      {fieldErrors.password && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.password}</p>}
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-slate-500 pointer-events-none" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: undefined })); }}
                          placeholder="Confirm Password"
                          autoComplete="new-password"
                          className={`w-full h-11 pl-10 pr-11 bg-slate-800/50 border rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200
                            ${fieldErrors.confirmPassword ? 'border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-700/50 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20'}`}
                          disabled={isLoading}
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
                      {fieldErrors.confirmPassword && <p className="mt-1.5 text-xs text-red-400 font-medium">{fieldErrors.confirmPassword}</p>}
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-brand-sky hover:bg-sky-400 disabled:bg-sky-800/50 text-[#0F172A] font-semibold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="icon-sm animate-spin" />
                  ) : null}
                  {isLoading
                    ? 'Creating account...'
                    : googleProfile
                    ? 'Complete Setup'
                    : 'Create account'}
                </button>

                {!googleProfile && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors py-2 cursor-pointer bg-transparent border-none"
                    disabled={isLoading}
                  >
                    <ArrowLeft className="icon-sm" />
                    Back to shop details
                  </button>
                )}
              </>
            )}

            {!googleProfile && (
              <p className="text-center text-sm text-slate-500 pt-2">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onNavigateLogin}
                  className="text-brand-sky hover:text-sky-300 font-medium transition-colors cursor-pointer bg-transparent border-none"
                >
                  Sign in
                </button>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
