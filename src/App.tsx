/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, ShoppingBag, Settings, LogOut, Menu, X, DollarSign, Lock, Unlock } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import CustomersSection from './components/CustomersSection';
import OrdersSection from './components/OrdersSection';
import OwnerDashboard from './components/OwnerDashboard';
import FinancialReports from './components/FinancialReports';
import SyncIndicator from './components/SyncIndicator';
import { Customer, UserProfile, UserRole, PipelineStage } from './types';
import { supabase } from './lib/supabase';

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
        return JSON.parse(savedUser) as UserProfile;
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  });

  useEffect(() => {
    if (user?.role === 'Worker') {
      setUser({ ...user, role: 'Owner' });
      localStorage.setItem('tailor_user', JSON.stringify({ ...user, role: 'Owner' }));
    }
  }, []);

  const activeRole = (user?.role ?? 'Owner') as UserRole;

  const [activeMode, setActiveMode] = useState<'Manager' | 'Owner'>(() => {
    const stored = localStorage.getItem('tailor_active_role');
    return stored === 'Owner' ? 'Owner' : 'Manager';
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  const switchToOwner = () => {
    if (!token) return;
    setShowPasswordModal(true);
  };

  const switchToManager = () => {
    setActiveMode('Manager');
    localStorage.setItem('tailor_active_role', 'Manager');
    if (token) {
      fetch('/api/auth/exit-owner-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.warn('exit-owner-mode failed:', err));
    }
    if (activeTab === 'Owner' || activeTab === 'Financials') {
      setActiveTab('Customers');
    }
  };

  const handlePasswordSubmit = async () => {
    if (!ownerPassword || !token) return;
    setIsVerifyingPassword(true);
    setPasswordError(null);
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: ownerPassword }),
      });
      if (res.ok) {
        setActiveMode('Owner');
        localStorage.setItem('tailor_active_role', 'Owner');
        setShowPasswordModal(false);
        setOwnerPassword('');
      } else {
        const data = await res.json();
        setPasswordError(data.error || 'Incorrect password.');
      }
    } catch {
      setPasswordError('Connection failed. Try again.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'Customers' | 'Orders' | 'Financials' | 'Owner'>('Customers');
  const [activeCustomerIdForNewOrder, setActiveCustomerIdForNewOrder] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopLogo, setShopLogo] = useState('');
  const [currency, setCurrency] = useState('$');
  const [measurementFields, setMeasurementFields] = useState<string[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [measurementUnit, setMeasurementUnit] = useState<'Inches' | 'Centimeters' | 'Feet'>('Inches');
  const [termsConditions, setTermsConditions] = useState('');
  const [receiptFooterText, setReceiptFooterText] = useState('');
  const [defaultPrintReceipt, setDefaultPrintReceipt] = useState(true);
  const [defaultPrintMeasure, setDefaultPrintMeasure] = useState(true);
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState('');
  const [whatsappNotifyOnReady, setWhatsappNotifyOnReady] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | undefined>(undefined);
  const [activeItemIdx, setActiveItemIdx] = useState<number | undefined>(undefined);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('orderId');
    const itemIdxParam = urlParams.get('itemIdx');
    if (orderIdParam) {
      setActiveOrderId(orderIdParam);
      if (itemIdxParam !== null) {
        setActiveItemIdx(parseInt(itemIdxParam, 10));
      }
      setActiveTab('Orders');
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

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

  const fetchShopMetadata = async () => {
    if (!token) return;
    try {
      const configRes = await fetch('/api/config-status');
      const configContentType = configRes.headers.get('content-type') || '';
      const settingsRes = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsContentType = settingsRes.headers.get('content-type') || '';
      if (settingsRes.ok && settingsContentType.includes('application/json')) {
        const settingsData = await settingsRes.json();
        setShopName(settingsData.shop_name ?? '');
        setShopPhone(settingsData.phone ?? '');
        setShopAddress(settingsData.address ?? '');
        setShopLogo(settingsData.shop_logo ?? '');
        setTermsConditions(settingsData.terms_conditions ?? '');
        setReceiptFooterText(settingsData.receipt_footer_text ?? '');
        setDefaultPrintReceipt(settingsData.default_print_receipt !== false);
        setDefaultPrintMeasure(settingsData.default_print_measure !== false);
        setWhatsappMessageTemplate(settingsData.whatsapp_message_template ?? '');
        setWhatsappNotifyOnReady(settingsData.whatsapp_notify_on_ready === true);
        setCurrency(settingsData.currency || '$');
        setMeasurementFields(settingsData.measurement_fields || []);
        setMeasurementUnit(settingsData.measurement_unit || 'Inches');
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
      <div className="min-h-screen bg-brand-sidebar flex flex-col items-center justify-center text-white">
        <p className="text-lg font-semibold animate-pulse text-brand-sky">Initializing Workspace…</p>
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
      label: 'Customer Registry',
      icon: Users,
    },
    {
      id: 'Orders' as const,
      label: 'Orders',
      icon: ShoppingBag,
    },
    ...(activeMode === 'Owner' ? [
      {
        id: 'Financials' as const,
        label: 'Financial Reports',
        icon: DollarSign,
      },
      {
        id: 'Owner' as const,
        label: 'Administration',
        icon: Settings,
      },
    ] : []),
  ];

  const pageTitle = activeTab === 'Customers'
    ? 'Customer Registry'
    : activeTab === 'Orders'
    ? 'POS Order Queue'
    : activeTab === 'Financials'
    ? 'Financial Analytics'
    : 'System Configuration';

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row font-sans text-slate-800">

      {/* ──────────────────────────────────────────────────────────── */}
      {/* DESKTOP SIDEBAR                                              */}
      {/* ──────────────────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col bg-brand-sidebar text-white shrink-0 border-r border-slate-800 print:hidden sticky top-0 h-screen overflow-y-auto transition-[width,padding] duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-14 py-3 items-center' : 'w-56 p-3'
        }`}
      >

        {/* ── Logo / Brand Area ── */}
        <div className={`${isSidebarCollapsed ? 'mb-3' : 'mb-3'} w-full flex justify-center`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
            <div className="p-2 bg-slate-800/80 rounded-xl flex items-center justify-center border border-slate-700/60 shrink-0 overflow-hidden">
              {shopLogo ? (
                <img src={shopLogo} alt={`${shopName} logo`} className="w-7 h-7 object-contain shrink-0" loading="lazy" />
              ) : (
                <Shield className="icon-md text-brand-sky shrink-0" aria-hidden="true" />
              )}
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden animate-fade-in min-w-0">
                <span className="text-lg block text-brand-sky font-display uppercase font-bold break-words truncate">{shopName || 'Unnamed Tailor Shop'}</span>
                <span className="text-3xs font-semibold text-slate-500 block uppercase tracking-wider mt-0.5">
                  Staff Workspace
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Primary Navigation ── */}
        <nav className="flex-1 w-full space-y-1">
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-[background-color,color] duration-200 cursor-pointer text-left relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/60 ${
                  isActive
                    ? 'bg-brand-active text-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-sky rounded-full" aria-hidden="true" />
                )}
                <Icon className={`icon-md shrink-0 ${isActive ? 'text-brand-sky' : 'text-slate-400 group-hover:text-slate-300'}`} />
                {!isSidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                    <div className="tooltip">{item.label}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Account / Session Section ── */}
        <div className="w-full pt-2 mt-auto border-t border-slate-800/60 space-y-2">
          {activeMode === 'Manager' ? (
            <button
              onClick={switchToOwner}
              className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-amber-900/20 hover:bg-amber-900/40 text-amber-400 border border-amber-800/20 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60`}
            >
              <Lock className="icon-sm shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Switch to Owner</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="tooltip !bg-amber-900 !border-amber-800/50 !text-amber-200">Switch to Owner</div>
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={switchToManager}
              className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800/20 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60`}
            >
              <Unlock className="icon-sm shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Switch to Manager</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="tooltip !bg-emerald-900 !border-emerald-800/50 !text-emerald-200">Switch to Manager</div>
                </div>
              )}
            </button>
          )}

          <SyncIndicator token={token} collapsed={isSidebarCollapsed} />

          <button
            onClick={handleLogout}
            className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60`}
          >
            <LogOut className="icon-sm shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Sign Out</span>}
            {isSidebarCollapsed && (
              <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                <div className="tooltip !bg-red-950 !border-red-900/40 !text-red-200">Sign Out</div>
              </div>
            )}
          </button>
        </div>

      </aside>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MOBILE HEADER                                               */}
      {/* ──────────────────────────────────────────────────────────── */}
      <header className="md:hidden bg-brand-sidebar text-white py-3.5 px-5 flex items-center justify-between sticky top-0 z-50 print:hidden border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          {shopLogo ? (
            <img src={shopLogo} alt={`${shopName} logo`} className="w-7 h-7 object-contain shrink-0" loading="lazy" />
          ) : (
            <Shield className="icon-md text-brand-sky shrink-0" aria-hidden="true" />
          )}
          <span className="font-bold text-base tracking-tight text-brand-sky uppercase truncate">{shopName || 'StitchMaster'}</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-1 text-slate-400 hover:text-white cursor-pointer rounded-lg hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/60"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? <X className="icon-md" aria-hidden="true" /> : <Menu className="icon-md" aria-hidden="true" />}
        </button>
      </header>

      {/* ── Mobile Menu Overlay ── */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[57px] bg-brand-sidebar z-40 px-5 py-6 flex flex-col overflow-y-auto animate-fade-in print:hidden">
          <nav className="space-y-1 flex-1">
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/60 ${
                    isActive ? 'bg-brand-active text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  {isActive && <span className="w-1 h-5 bg-brand-sky rounded-full shrink-0" aria-hidden="true" />}
                  {!isActive && <span className="w-1 h-5 shrink-0" aria-hidden="true" />}
                  <Icon className={`icon-md shrink-0 ${isActive ? 'text-brand-sky' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-5 mt-auto border-t border-slate-800/60 space-y-2">
            {activeMode === 'Manager' ? (
              <button
                onClick={() => { setIsMobileMenuOpen(false); switchToOwner(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-amber-900/20 hover:bg-amber-900/40 text-amber-400 border border-amber-800/20 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <Lock className="icon-sm shrink-0" />
                <span>Unlock Owner Mode</span>
              </button>
            ) : (
              <button
                onClick={() => { setIsMobileMenuOpen(false); switchToManager(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800/20 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <Unlock className="icon-sm shrink-0" />
                <span>Switch to Manager</span>
              </button>
            )}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <LogOut className="icon-sm shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MAIN WORKSPACE                                              */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* ── Desktop Top Header ── */}
        <header className="hidden md:flex items-center justify-between bg-white h-12 px-4 border-b border-slate-200 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/60"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu className="icon-md" aria-hidden="true" />
            </button>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-3">
            {activeMode === 'Manager' ? (
              <button
                onClick={switchToOwner}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <Lock className="icon-xs" aria-hidden="true" />
                <span>Manager Mode</span>
              </button>
            ) : (
              <button
                onClick={switchToManager}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <Unlock className="icon-xs" aria-hidden="true" />
                <span>Owner Mode</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 p-1.5 md:p-2 overflow-auto">
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
                shopLogo={shopLogo}
                measurementUnit={measurementUnit}
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
                activeItemIdx={activeItemIdx}
                onClearActiveItemIdx={() => setActiveItemIdx(undefined)}
                shopName={shopName}
                shopPhone={shopPhone}
                shopAddress={shopAddress}
                shopLogo={shopLogo}
                termsConditions={termsConditions}
                receiptFooterText={receiptFooterText}
                defaultPrintReceipt={defaultPrintReceipt}
                defaultPrintMeasure={defaultPrintMeasure}
                isOwnerMode={activeMode === 'Owner'}
                whatsappMessageTemplate={whatsappMessageTemplate}
                whatsappNotifyOnReady={whatsappNotifyOnReady}
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
                shopLogo={shopLogo}
                onSettingsUpdated={handleSettingsUpdated}
              />
            )}
          </div>
        </main>

        {/* ── Password Modal ── */}
        {showPasswordModal && (
          <div role="presentation" className="modal-overlay" onClick={() => { setShowPasswordModal(false); setPasswordError(null); setOwnerPassword(''); }}>
            <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center p-3 bg-amber-100 rounded-xl mb-3">
                  <Shield className="icon-lg text-amber-600" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Unlock Owner Mode</h3>
                <p className="text-xs text-slate-500 mt-1">Enter your account password to access administrative features.</p>
              </div>
              {passwordError && (
                <div className="alert-error mb-4">
                  {passwordError}
                </div>
              )}
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                placeholder="Enter password…"
                className="input-base mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowPasswordModal(false); setPasswordError(null); setOwnerPassword(''); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordSubmit}
                  disabled={isVerifyingPassword || !ownerPassword}
                  className="flex-1 py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isVerifyingPassword ? 'Verifying…' : 'Unlock'}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="footer-base flex flex-col sm:flex-row sm:justify-between items-center gap-1">
          <p className="font-medium">&copy; {new Date().getFullYear()} {shopName || 'Unnamed Tailor Shop'} StitchMaster. All rights reserved.</p>
          <div className="flex gap-4 text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-3xs">Tailored Suite Pro</span>
            <span className="text-slate-300" aria-hidden="true">|</span>
            <span className="font-semibold uppercase tracking-wider text-3xs">Staff Portal</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
