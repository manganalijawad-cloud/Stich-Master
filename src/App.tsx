/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, ShoppingBag, Settings, LogOut, Info, ShieldCheck, Menu, X, Key } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import CustomersSection from './components/CustomersSection';
import OrdersSection from './components/OrdersSection';
import OwnerDashboard from './components/OwnerDashboard';
import { Customer, UserProfile, UserRole, PipelineStage } from './types';

// -------------------------------------------------------------------------
// GLOBAL WINDOW.FETCH INTERCEPTOR FOR AUTH & PASSING ACTIVE ROLE HEADER
// -------------------------------------------------------------------------
const originalFetch = window.fetch;
const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('tailor_token');
  const activeRole = localStorage.getItem('tailor_active_role') || 'Worker';

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  if (url.startsWith('/api/') || url.includes('/api/')) {
    const newInit = { ...init };
    const headers = new Headers(newInit.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('X-Active-Role', activeRole);
    newInit.headers = headers;
    return originalFetch(input, newInit);
  }
  return originalFetch(input, init);
};

try {
  window.fetch = customFetch;
} catch (e) {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
  });
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('tailor_token') || null;
  });
  const [user, setUser] = useState<UserProfile | null>(() => {
    const savedUser = localStorage.getItem('tailor_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    return (localStorage.getItem('tailor_active_role') as UserRole) || 'Worker';
  });

  const [activeTab, setActiveTab] = useState<'Customers' | 'Orders' | 'Owner'>('Customers');
  const [activeCustomerIdForNewOrder, setActiveCustomerIdForNewOrder] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Password verification modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordVerificationError, setPasswordVerificationError] = useState<string | null>(null);
  const [verifyPasswordLoading, setVerifyPasswordLoading] = useState(false);

  // Shop configurations fetched from settings API
  const [shopName, setShopName] = useState('Classic Tailors');
  const [shopPhone, setShopPhone] = useState('+1 (555) 123-4567');
  const [shopAddress, setShopAddress] = useState('123 Elegance Lane, Fashion District');
  const [currency, setCurrency] = useState('$');
  const [measurementFields, setMeasurementFields] = useState<string[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState<{ supabaseConnected: boolean; supabaseUrl: string | null }>({
    supabaseConnected: true,
    supabaseUrl: null,
  });

  const [activeOrderId, setActiveOrderId] = useState<string | undefined>(undefined);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);

  // Check URL query parameters for live order navigation (from QR Code scanning)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('orderId');
    if (orderIdParam) {
      setActiveOrderId(orderIdParam);
      setActiveTab('Orders');
      // Gracefully clean up the URL search parameters to keep links neat
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Verify stored session on startup
  useEffect(() => {
    const verifySession = async () => {
      if (!token) {
        setIsVerifyingSession(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          setUser(data.user);
          localStorage.setItem('tailor_user', JSON.stringify(data.user));

          // If they are a Worker in the database, force Worker role in case activeRole is somehow Owner
          if (data.user.role === 'Worker' && activeRole === 'Owner') {
            setActiveRole('Worker');
            localStorage.setItem('tailor_active_role', 'Worker');
          }
        } else {
          handleLogout();
        }
      } catch (err) {
        console.error('Session verification failed:', err);
      } finally {
        setIsVerifyingSession(false);
      }
    };

    verifySession();
  }, [token]);

  // Fetch shop metadata
  const fetchShopMetadata = async () => {
    if (!token) return;
    try {
      const configRes = await fetch('/api/config-status');
      const configContentType = configRes.headers.get('content-type') || '';
      if (configRes.ok && configContentType.includes('application/json')) {
        const configData = await configRes.json();
        setSupabaseConfig(configData);
      }

      // Fetch dynamic settings
      const settingsRes = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsContentType = settingsRes.headers.get('content-type') || '';
      if (settingsRes.ok && settingsContentType.includes('application/json')) {
        const settingsData = await settingsRes.json();
        setShopName(settingsData.shop_name || 'Classic Tailors');
        setShopPhone(settingsData.phone || '+1 (555) 123-4567');
        setShopAddress(settingsData.address || '123 Elegance Lane, Fashion District');
        setCurrency(settingsData.currency || '$');
        setMeasurementFields(settingsData.measurement_fields || []);
        setPipelineStages(settingsData.pipeline_stages || [
          { id: 'Pending', name: 'Getting Ready', enabled: true },
          { id: 'Ready to Deliver', name: 'Ready to Deliver', enabled: true },
          { id: 'Delivered', name: 'Delivered', enabled: true },
          { id: 'Archived', name: 'Archived', enabled: true }
        ]);
      }
    } catch (err) {
      console.error('Failed to load shop configuration:', err);
    }
  };

  useEffect(() => {
    fetchShopMetadata();
  }, [token]);

  // Handle active role tab reset if activeRole becomes Worker while viewing Owner tab
  useEffect(() => {
    if (activeRole === 'Worker' && activeTab === 'Owner') {
      setActiveTab('Customers');
    }
  }, [activeRole, activeTab]);

  const handleLoginSuccess = (usr: UserProfile, tkn: string) => {
    setUser(usr);
    setToken(tkn);
    setActiveRole(usr.role);
    localStorage.setItem('tailor_token', tkn);
    localStorage.setItem('tailor_user', JSON.stringify(usr));
    localStorage.setItem('tailor_active_role', usr.role);
    setActiveTab('Customers');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setToken(null);
    setActiveRole('Worker');
    localStorage.removeItem('tailor_token');
    localStorage.removeItem('tailor_user');
    localStorage.removeItem('tailor_active_role');
  };

  const handleSettingsUpdated = () => {
    fetchShopMetadata();
  };

  // Secure Password Verification and Role Switch
  const handleVerifyPasswordAndSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) {
      setPasswordVerificationError('Password is required.');
      return;
    }

    setVerifyPasswordLoading(true);
    setPasswordVerificationError(null);

    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: passwordInput }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActiveRole('Owner');
        localStorage.setItem('tailor_active_role', 'Owner');
        setIsPasswordModalOpen(false);
        setPasswordInput('');
      } else {
        // Generic failure message protecting security details
        setPasswordVerificationError(data.error || 'Password verification failed. Stayed in Worker mode.');
      }
    } catch (err: any) {
      console.error('Password verification error:', err);
      setPasswordVerificationError('An error occurred during verification. Stayed in Worker mode.');
    } finally {
      setVerifyPasswordLoading(false);
    }
  };

  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white">
        <p className="text-lg font-semibold animate-pulse text-[#38BDF8]">Initializing Workspace...</p>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <LoginScreen onLoginSuccess={handleLoginSuccess} />
    );
  }

  const navItems = [
    {
      id: 'Customers' as const,
      label: 'Customers Profile',
      icon: Users,
    },
    {
      id: 'Orders' as const,
      label: 'Garment Orders',
      icon: ShoppingBag,
    },
    ...(activeRole === 'Owner'
      ? [
          {
            id: 'Owner' as const,
            label: 'Administration Portal',
            icon: Settings,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row font-sans text-slate-800">
      
      {/* SIDEBAR FOR DESKTOP */}
      <aside className="hidden md:flex flex-col w-72 bg-[#0F172A] text-white p-6 shrink-0 border-r border-slate-800 print:hidden sticky top-0 h-screen overflow-y-auto">
        
        {/* Brand Header */}
        <div className="mb-10 mt-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700">
              <Shield className="w-6 h-6 text-[#38BDF8] shrink-0" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight block text-[#38BDF8] font-display uppercase">{shopName}</span>
              <span className="text-2xs font-bold text-slate-400 block uppercase tracking-wider">
                Staff Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Navigation items aligned with StitchMaster style */}
        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'Orders') {
                    setActiveCustomerIdForNewOrder(undefined);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all cursor-pointer text-left border-l-4 ${
                  isActive
                    ? 'bg-[#1E293B] text-[#F1F5F9] border-[#38BDF8]'
                    : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-slate-800/30'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#38BDF8]' : 'text-[#94A3B8]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer/Logout Area */}
        <div className="pt-6 border-t border-slate-800 mt-auto space-y-3.5">
          <div className="flex flex-col gap-1 px-2">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Staff Member</span>
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm font-semibold text-slate-300 truncate max-w-[130px]">{user.name}</span>
              <span className="text-2xs font-extrabold px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] rounded uppercase">
                {user.role}
              </span>
            </div>
          </div>

          {/* Role switcher for accounts with Owner permissions */}
          {user.role === 'Owner' && (
            <button
              onClick={() => {
                if (activeRole === 'Owner') {
                  // Instant switch to worker mode, no password needed
                  setActiveRole('Worker');
                  localStorage.setItem('tailor_active_role', 'Worker');
                } else {
                  // Password verification required to switch back to Owner
                  setPasswordInput('');
                  setPasswordVerificationError(null);
                  setIsPasswordModalOpen(true);
                }
              }}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-[#38BDF8] border border-[#38BDF8]/20 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[#38BDF8]" />
              <span>Switch to {activeRole === 'Owner' ? 'Worker' : 'Owner'}</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 bg-red-950/40 hover:bg-red-950/60 text-red-400 border border-red-900/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>

      </aside>

      {/* MOBILE HEADER BAR */}
      <header className="md:hidden bg-[#0F172A] text-white py-4 px-6 flex items-center justify-between sticky top-0 z-50 print:hidden border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#38BDF8]" />
          <span className="font-extrabold text-lg tracking-tight text-[#38BDF8] uppercase">{shopName}</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1 text-slate-400 hover:text-white cursor-pointer"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[60px] bg-[#0F172A] z-40 p-6 flex flex-col space-y-6 animate-fade-in print:hidden">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                    if (item.id === 'Orders') {
                      setActiveCustomerIdForNewOrder(undefined);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl font-bold text-base transition-all ${
                    isActive ? 'bg-[#1E293B] text-white border-l-4 border-[#38BDF8]' : 'text-[#94A3B8] border-l-4 border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-6 border-t border-slate-800 mt-auto space-y-4">
            <div className="flex items-center justify-between px-2 text-slate-300">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Staff</p>
                <p className="font-bold text-sm mt-0.5">{user.name}</p>
              </div>
              <span className="text-2xs font-extrabold px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] rounded uppercase">
                {user.role}
              </span>
            </div>

            {user.role === 'Owner' && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (activeRole === 'Owner') {
                    setActiveRole('Worker');
                    localStorage.setItem('tailor_active_role', 'Worker');
                  } else {
                    setPasswordInput('');
                    setPasswordVerificationError(null);
                    setIsPasswordModalOpen(true);
                  }
                }}
                className="w-full py-2.5 px-3 bg-[#1E293B] hover:bg-slate-800 text-[#38BDF8] border border-[#38BDF8]/25 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Switch to {activeRole === 'Owner' ? 'Worker' : 'Owner'}</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
              className="w-full py-2.5 px-3 bg-red-950/40 hover:bg-red-950/60 text-red-400 border border-red-900/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* DESKTOP TOP-BAR PANEL */}
        <header className="hidden md:flex items-center justify-between bg-white h-20 px-8 border-b border-slate-200 shrink-0 print:hidden">
          <div>
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight font-display">
              {activeTab === 'Customers' ? 'Customer Profiles & Measurements' : activeTab === 'Orders' ? 'Garment Bookings & Queue' : 'Administration Settings'}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Manage tailor operations and customer specifications</p>
          </div>

          <div className="flex items-center gap-4">
            
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E0F2FE] border border-sky-100 text-[#0369A1] rounded-full text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Supabase Cloud Synced</span>
            </div>

            {/* Profile widget */}
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-full py-1 px-3.5 text-sm font-bold text-slate-800">
              <span>{user.name}</span>
              <span className="text-3xs font-extrabold bg-[#E0F2FE] text-[#0369A1] px-1.5 py-0.5 rounded uppercase">
                Active: {activeRole}
              </span>
            </div>

          </div>
        </header>

        {/* CORE WORKSPACE CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          
          {/* ACTIVE MODULE CONTAINER */}
          <div className="animate-fade-in">
            {activeTab === 'Customers' && (
              <CustomersSection
                token={token}
                userRole={activeRole}
                measurementFields={measurementFields}
                currency={currency}
                selectedCustomerId={activeCustomerIdForNewOrder}
                onBookOrder={(cust: Customer) => {
                  setActiveCustomerIdForNewOrder(cust.id);
                  setActiveTab('Orders');
                }}
              />
            )}

            {activeTab === 'Orders' && (
              <OrdersSection
                token={token}
                userRole={activeRole}
                currency={currency}
                measurementFields={measurementFields}
                pipelineStages={pipelineStages}
                activeCustomerId={activeCustomerIdForNewOrder}
                onClearActiveCustomer={() => setActiveCustomerIdForNewOrder(undefined)}
                activeOrderId={activeOrderId}
                onClearActiveOrderId={() => setActiveOrderId(undefined)}
                shopName={shopName}
                shopPhone={shopPhone}
                shopAddress={shopAddress}
              />
            )}

            {activeTab === 'Owner' && activeRole === 'Owner' && (
              <OwnerDashboard
                token={token}
                currency={currency}
                onSettingsUpdated={handleSettingsUpdated}
              />
            )}
          </div>

        </main>

        {/* COMPACT FOOTER */}
        <footer className="mt-auto py-5 px-8 border-t border-slate-200 bg-white text-center text-slate-400 text-xs print:hidden flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="font-medium">&copy; {new Date().getFullYear()} {shopName} StitchMaster. All rights reserved.</p>
          <div className="flex gap-4 text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-3xs">Tailored Suite Pro</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold uppercase tracking-wider text-3xs">Staff Portal</span>
          </div>
        </footer>

      </div>

      {/* PASSWORD VERIFICATION DIALOG MODAL */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#0F172A] p-6 text-center border-b border-slate-800 text-white">
              <div className="inline-flex items-center justify-center p-3 bg-slate-800 rounded-xl mb-3 border border-slate-700">
                <Key className="w-6 h-6 text-[#38BDF8]" />
              </div>
              <h3 className="text-lg font-bold tracking-tight">Switch to Owner Mode</h3>
              <p className="text-slate-400 text-xs font-semibold uppercase mt-0.5 tracking-wider">Password Verification Required</p>
            </div>

            <form onSubmit={handleVerifyPasswordAndSwitch} className="p-6 space-y-4">
              {passwordVerificationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold leading-relaxed">
                  {passwordVerificationError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider">Account Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter your account password"
                  required
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
                  disabled={verifyPasswordLoading}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setPasswordVerificationError(null);
                    setPasswordInput('');
                  }}
                  className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                  disabled={verifyPasswordLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                  disabled={verifyPasswordLoading}
                >
                  {verifyPasswordLoading ? 'Verifying...' : 'Verify & Switch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
