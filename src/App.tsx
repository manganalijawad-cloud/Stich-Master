/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, ShoppingBag, Settings, LogOut, Info, ShieldCheck, Menu, X, Key, DollarSign } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import CustomersSection from './components/CustomersSection';
import OrdersSection from './components/OrdersSection';
import OwnerDashboard from './components/OwnerDashboard';
import FinancialReports from './components/FinancialReports';
import { Customer, UserProfile, UserRole, PipelineStage } from './types';
import { supabase } from './lib/supabase';

// -------------------------------------------------------------------------
// GLOBAL WINDOW.FETCH INTERCEPTOR FOR AUTH
// -------------------------------------------------------------------------
const originalFetch = window.fetch;
const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('tailor_token');

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  if (url.startsWith('/api/') || url.includes('/api/')) {
    const newInit = { ...init };
    const headers = new Headers(newInit.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
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
        const parsed = JSON.parse(savedUser) as UserProfile;
        if (parsed && parsed.role === 'Worker') {
          parsed.role = 'Owner';
          localStorage.setItem('tailor_user', JSON.stringify(parsed));
        }
        return parsed;
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const activeRole = 'Owner' as UserRole;

  const [activeTab, setActiveTab] = useState<'Customers' | 'Orders' | 'Financials' | 'Owner'>('Customers');
  const [activeCustomerIdForNewOrder, setActiveCustomerIdForNewOrder] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Shop configurations fetched from settings API
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
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

  // Verify/Restore Supabase Session on Startup & Listen to Session Updates
  useEffect(() => {
    let isMounted = true;

    const fetchWithRetry = async (url: string, options: RequestInit, retries = 5, delay = 1000): Promise<Response> => {
      try {
        const res = await fetch(url, options);
        return res;
      } catch (err) {
        if (retries > 0 && isMounted) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(url, options, retries - 1, delay * 1.5);
        }
        throw err;
      }
    };

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && isMounted) {
          const tkn = session.access_token;
          setToken(tkn);
          localStorage.setItem('tailor_token', tkn);

          const res = await fetchWithRetry('/api/auth/me', {
            headers: { Authorization: `Bearer ${tkn}` },
          });

          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            const data = await res.json();
            if (isMounted) {
              setUser(data.user);
              localStorage.setItem('tailor_user', JSON.stringify(data.user));
            }
          } else {
            await handleLogout();
          }
        } else if (isMounted) {
          setUser(null);
          setToken(null);
          localStorage.removeItem('tailor_token');
          localStorage.removeItem('tailor_user');
        }
      } catch (err) {
        console.error('Failed to initialize or restore Supabase session:', err);
      } finally {
        if (isMounted) {
          setIsVerifyingSession(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setToken(null);
        localStorage.removeItem('tailor_token');
        localStorage.removeItem('tailor_user');
        setIsVerifyingSession(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          const tkn = session.access_token;
          setToken(tkn);
          localStorage.setItem('tailor_token', tkn);

          try {
            const res = await fetchWithRetry('/api/auth/me', {
              headers: { Authorization: `Bearer ${tkn}` },
            });
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
              const data = await res.json();
              if (isMounted) {
                setUser(data.user);
                localStorage.setItem('tailor_user', JSON.stringify(data.user));
              }
            } else {
              await handleLogout();
            }
          } catch (err) {
            console.error('Error fetching profile on auth change:', err);
          } finally {
            if (isMounted) {
              setIsVerifyingSession(false);
            }
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
        setShopName(settingsData.shop_name ?? '');
        setShopPhone(settingsData.phone ?? '');
        setShopAddress(settingsData.address ?? '');
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

  const handleWorkersUpdated = (workersList: UserProfile[]) => {
    // legacy hook keeping
  };

  const handleLoginSuccess = (usr: UserProfile, tkn: string) => {
    setUser(usr);
    setToken(tkn);
    localStorage.setItem('tailor_token', tkn);
    localStorage.setItem('tailor_user', JSON.stringify(usr));
    setActiveTab('Customers');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('tailor_token');
    localStorage.removeItem('tailor_user');
    localStorage.removeItem('tailor_active_role');
    localStorage.removeItem('tailor_intentional_worker_mode');
  };

  const handleSettingsUpdated = () => {
    fetchShopMetadata();
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
      label: 'Orders',
      icon: ShoppingBag,
    },
    {
      id: 'Financials' as const,
      label: 'Financial Reports',
      icon: DollarSign,
    },
    {
      id: 'Owner' as const,
      label: 'Administration Portal',
      icon: Settings,
    },
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
              <span className="text-xl font-extrabold tracking-tight block text-[#38BDF8] font-display uppercase">{shopName || 'Unnamed Tailor Shop'}</span>
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
              {activeTab === 'Customers' 
                ? 'Customer Profiles & Measurements' 
                : activeTab === 'Orders' 
                ? 'Garment Bookings & Queue' 
                : activeTab === 'Financials' 
                ? 'Financial Reports & Insights' 
                : 'Administration Settings'}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Manage tailor operations and customer specifications</p>
          </div>

          <div className="flex items-center gap-4">
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
                shopName={shopName}
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

            {activeTab === 'Financials' && (
              <FinancialReports
                token={token}
                currency={currency}
              />
            )}

            {activeTab === 'Owner' && (
              <OwnerDashboard
                token={token}
                currency={currency}
                onSettingsUpdated={handleSettingsUpdated}
                onWorkersUpdated={handleWorkersUpdated}
              />
            )}
          </div>

        </main>

        {/* COMPACT FOOTER */}
        <footer className="mt-auto py-5 px-8 border-t border-slate-200 bg-white text-center text-slate-400 text-xs print:hidden flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="font-medium">&copy; {new Date().getFullYear()} {shopName || 'Unnamed Tailor Shop'} StitchMaster. All rights reserved.</p>
          <div className="flex gap-4 text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-3xs">Tailored Suite Pro</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold uppercase tracking-wider text-3xs">Staff Portal</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
