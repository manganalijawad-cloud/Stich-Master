import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Users, ShoppingBag, Settings, LogOut, Menu, X, DollarSign, Lock, Unlock } from 'lucide-react';
import CustomersSection from './components/CustomersSection';
import OrdersSection from './components/OrdersSection';
import OwnerDashboard from './components/OwnerDashboard';
import FinancialReports from './components/FinancialReports';

import TitleBar from './components/TitleBar';
import VersionInfo from './components/VersionInfo';
import { Customer, PipelineStage } from './types';
import { DEFAULT_PIPELINE_STAGES } from '@hello-darzi/shared';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/auth/LoginPage';

import { parseOrderQrPayload } from './lib/orderQr';
import { localDataStore } from './lib/localDataStore';
import { useLocalData } from './lib/useLocalData';

function AuthWrapper() {
  const { user, token, isLoading, signOut, needsShopSetup, isPasswordRecovery } = useAuth();

  // Owner mode is session-only (PROJECT.md §5): require password unlock every
  // app load. Never restore Owner from localStorage — that skipped re-auth and
  // left the UI in Owner while the server had no grantOwnerMode.
  const [activeMode, setActiveMode] = useState<'Manager' | 'Owner'>('Manager');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'Customers' | 'Orders' | 'Financials' | 'Owner'>('Customers');

  /** Idle timeout before Owner mode auto-returns to Manager (PROJECT.md §5). */
  const OWNER_IDLE_MS = 15 * 60 * 1000;

  useEffect(() => {
    // Clear legacy persisted Owner flag from older builds
    localStorage.removeItem('tailor_active_role');
  }, []);

  const switchToOwner = () => {
    if (!token) return;
    setShowPasswordModal(true);
  };

  const switchToManager = useCallback(() => {
    setActiveMode('Manager');
    localStorage.removeItem('tailor_active_role');
    if (token) {
      fetch('/api/auth/exit-owner-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.warn('exit-owner-mode failed:', err));
    }
    setActiveTab((prev) => (prev === 'Owner' || prev === 'Financials' ? 'Customers' : prev));
  }, [token]);

  /** Server grant expired/missing while UI still showed unlocked — re-prompt without leaving Settings. */
  const handleOwnerModeRequired = useCallback(() => {
    setActiveMode('Manager');
    localStorage.removeItem('tailor_active_role');
    if (token) {
      fetch('/api/auth/exit-owner-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.warn('exit-owner-mode failed:', err));
    }
    setOwnerPassword('');
    setPasswordError('Owner mode expired. Enter your password to unlock settings again.');
    setShowPasswordModal(true);
  }, [token]);

  // Auto-expire Owner mode after inactivity; heartbeat keeps server grant aligned with UI.
  useEffect(() => {
    if (activeMode !== 'Owner' || !token) return;

    let idleTimer: ReturnType<typeof setTimeout>;
    const bumpActivity = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        switchToManager();
      }, OWNER_IDLE_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];
    events.forEach((evt) => window.addEventListener(evt, bumpActivity, { passive: true }));
    bumpActivity();

    // Server TTL only refreshes on API traffic; client idle resets on UI events.
    // Heartbeat bridges that gap so "Settings unlocked" matches the server grant.
    const OWNER_HEARTBEAT_MS = 4 * 60 * 1000;
    const syncOwnerGrant = async () => {
      try {
        const res = await fetch('/api/auth/owner-mode', {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.active === false) {
          handleOwnerModeRequired();
        }
      } catch {
        // ignore transient errors — next heartbeat or save will re-check
      }
    };
    syncOwnerGrant();
    const heartbeat = setInterval(syncOwnerGrant, OWNER_HEARTBEAT_MS);

    return () => {
      clearTimeout(idleTimer);
      clearInterval(heartbeat);
      events.forEach((evt) => window.removeEventListener(evt, bumpActivity));
    };
  }, [activeMode, switchToManager, handleOwnerModeRequired, token, OWNER_IDLE_MS]);

  const handlePasswordSubmit = async () => {
    if (!ownerPassword || !token) return;
    setIsVerifyingPassword(true);
    setPasswordError(null);
    try {
      const attemptVerify = async () =>
        fetch('/api/auth/verify-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: ownerPassword }),
        });

      let res = await attemptVerify();
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        const missingVerifier =
          typeof data.error === 'string' &&
          data.error.toLowerCase().includes('no password verifier');

        // Accounts created via shop-setup before verifier caching: prove password
        // online once, store the local unlock verifier, then retry.
        if (missingVerifier && user?.email) {
          try {
            const { getSupabase } = await import('./lib/supabaseClient');
            const { cacheOwnerUnlockPassword } = await import('./lib/auth');
            const { error: authError } = await getSupabase().auth.signInWithPassword({
              email: user.email,
              password: ownerPassword,
            });
            if (!authError) {
              await cacheOwnerUnlockPassword(token, ownerPassword);
              res = await attemptVerify();
              if (res.ok) {
                setActiveMode('Owner');
                setShowPasswordModal(false);
                setOwnerPassword('');
                return;
              }
            }
          } catch {
            // fall through to original error
          }
        }

        setPasswordError(data.error || 'Incorrect password.');
        return;
      }

      setActiveMode('Owner');
      setShowPasswordModal(false);
      setOwnerPassword('');
    } catch {
      setPasswordError('Connection failed. Try again.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

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
  const [activeOrderId, setActiveOrderId] = useState<string | undefined>(undefined);
  const [activeItemIdx, setActiveItemIdx] = useState<number | undefined>(undefined);

  const isElectron = !!(window as any).electronAPI?.isElectron;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let orderId = urlParams.get('orderId') || undefined;
    let itemIdx: number | undefined;
    const itemIdxParam = urlParams.get('itemIdx');
    if (itemIdxParam !== null) {
      const n = parseInt(itemIdxParam, 10);
      if (!Number.isNaN(n)) itemIdx = n;
    }

    if (!orderId) {
      const parsed = parseOrderQrPayload(window.location.href);
      if (parsed?.orderId) {
        orderId = parsed.orderId;
        if (parsed.itemIdx !== undefined) itemIdx = parsed.itemIdx;
      }
    }

    if (orderId) {
      setActiveOrderId(orderId);
      if (itemIdx !== undefined) {
        setActiveItemIdx(itemIdx);
      }
      setActiveTab('Orders');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onDeepLink) return;
    return api.onDeepLink((url: string) => {
      const parsed = parseOrderQrPayload(url);
      if (!parsed?.orderId) return;
      setActiveOrderId(parsed.orderId);
      if (parsed.itemIdx !== undefined) setActiveItemIdx(parsed.itemIdx);
      setActiveTab('Orders');
    });
  }, []);

  const applySettingsData = useCallback((settingsData: Record<string, any>) => {
    setShopName(settingsData.shop_name ?? '');
    setShopPhone(settingsData.phone ?? '');
    setShopAddress(settingsData.address ?? '');
    setShopLogo(settingsData.shop_logo ?? '');
    setTermsConditions(settingsData.terms_conditions ?? '');
    setReceiptFooterText(settingsData.receipt_footer_text ?? '');
    setCurrency(settingsData.currency || '$');
    setMeasurementFields(settingsData.measurement_fields || []);
    setMeasurementUnit(settingsData.measurement_unit || 'Inches');
    setPipelineStages(settingsData.pipeline_stages || DEFAULT_PIPELINE_STAGES);
  }, []);

  // Instant paint from last-known settings (localStorage) before bootstrap returns
  useEffect(() => {
    const cached = localDataStore.applyCachedSettings();
    if (cached) applySettingsData(cached);
  }, [applySettingsData]);

  const localData = useLocalData();

  useEffect(() => {
    if (localData.settings) {
      applySettingsData(localData.settings);
    }
  }, [localData.settings, localData.version, applySettingsData]);

  // Offline-first hydrate: one local SQLite bootstrap for customers, measurements, reference data
  useEffect(() => {
    if (!token) {
      localDataStore.clear();
      return;
    }
    void localDataStore.hydrate(token);
  }, [token]);

  const fetchShopMetadata = async () => {
    if (!token) return;
    // Prefer re-bootstrap (keeps customers/measurements/reference in sync with settings)
    const ok = await localDataStore.hydrate(token, { force: true });
    if (ok) return;
    try {
      const settingsRes = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      const settingsContentType = settingsRes.headers.get('content-type') || '';
      if (settingsRes.ok && settingsContentType.includes('application/json')) {
        const settingsData = await settingsRes.json();
        localDataStore.setSettings(settingsData);
        applySettingsData(settingsData);
      }
    } catch (err) {
      console.error('Failed to load shop configuration:', err);
    }
  };

  const handleLogout = async () => {
    await signOut();
    localDataStore.clear();
    localStorage.removeItem('tailor_active_role');
    localStorage.removeItem('tailor_intentional_worker_mode');
    localStorage.removeItem('tailor_token');
    localStorage.removeItem('tailor_user');
    localStorage.removeItem('hellodarzi-auth');
    localStorage.removeItem('hellodarzi-profile-cache');
    localStorage.removeItem('hellodarzi-settings-cache');
    localStorage.removeItem('hellodarzi-device-token');
    localStorage.removeItem('hellodarzi-supabase-auth');
    localStorage.removeItem('hellodarzi-device-pin-ready');
    localStorage.removeItem('hellodarzi-device-pin-skipped');
  };

  const handleSettingsUpdated = () => {
    fetchShopMetadata();
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        {isElectron && <TitleBar />}
        <div className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
          <p className="text-lg font-semibold text-white">Starting up...</p>
        </div>
      </div>
    );
  }

  if (!user || !token || needsShopSetup || isPasswordRecovery) {
    return (
      <div className="h-screen flex flex-col">
        {isElectron && <TitleBar />}
        <div className="flex-1 relative">
          <LoginPage />
        </div>
      </div>
    );
  }

  const displayName = shopName || user?.shop_name || user?.name || 'My Shop';
  const displayEmail = user?.email || '';

  const navItems = [
    {
      id: 'Customers' as const,
      label: 'Customers',
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
        label: 'Finances',
        icon: DollarSign,
      },
      {
        id: 'Owner' as const,
        label: 'Settings',
        icon: Settings,
      },
    ] : []),
  ];

  const pageTitle = activeTab === 'Customers'
    ? 'Customers'
    : activeTab === 'Orders'
    ? 'Orders'
    : activeTab === 'Financials'
    ? 'Finances'
    : 'Settings';

  return (
    <div className="h-screen flex flex-col">
      {isElectron && <TitleBar />}

      <div className="flex flex-1 min-h-0 flex-col md:flex-row font-sans text-slate-800 bg-brand-bg">

      <aside
        className={`hidden md:flex flex-col bg-brand-sidebar text-white shrink-0 border-r border-slate-800 print:hidden h-full min-h-0 overflow-y-auto overflow-x-hidden transition-[width,padding] duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-14 py-3 items-center' : 'w-56 p-3'
        }`}
      >

        <div className={`${isSidebarCollapsed ? 'mb-3' : 'mb-3'} w-full flex justify-center`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
            {shopLogo ? (
              <img src={shopLogo} alt={`${shopName} logo`} className="w-7 h-7 object-contain shrink-0" loading="lazy" />
            ) : (
              <img src="/favicon.svg" alt="Logo" className="w-7 h-7 object-contain shrink-0" />
            )}
            {!isSidebarCollapsed && (
              <div className="overflow-hidden animate-fade-in min-w-0">
                <span className="text-lg block text-white font-display uppercase font-bold whitespace-normal">{displayName}</span>
                <span className="text-3xs font-semibold text-slate-500 block normal-case tracking-normal mt-0.5 truncate" title={displayEmail || undefined}>
                  {displayEmail || 'Your shop'}
                </span>
              </div>
            )}
          </div>
        </div>

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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-[background-color,color] duration-150 cursor-pointer text-left relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                  isActive
                    ? 'bg-brand-active text-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-full" aria-hidden="true" />
                )}
                <Icon className={`icon-md shrink-0 ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
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

        <div className="w-full pt-2 mt-auto border-t border-slate-800/60 space-y-2">
          {activeMode === 'Manager' ? (
            <button
              onClick={switchToOwner}
              className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
            >
              <Lock className="icon-sm shrink-0 text-white" />
              {!isSidebarCollapsed && <span className="truncate">Unlock settings</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="tooltip !bg-neutral-900 !border-neutral-700 !text-white">Unlock settings</div>
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={switchToManager}
              className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
            >
              <Unlock className="icon-sm shrink-0 text-white" />
              {!isSidebarCollapsed && <span className="truncate">Back to Manager</span>}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="tooltip !bg-neutral-900 !border-neutral-700 !text-white">Back to Manager</div>
                </div>
              )}
            </button>
          )}

          <VersionInfo collapsed={isSidebarCollapsed} />

          <button
            onClick={handleLogout}
            className={`w-full ${isSidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-2.5 px-3 py-2'} rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
          >
            <LogOut className="icon-sm shrink-0 text-white" />
            {!isSidebarCollapsed && <span className="truncate">Sign Out</span>}
            {isSidebarCollapsed && (
              <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                <div className="tooltip !bg-neutral-900 !border-neutral-700 !text-white">Sign Out</div>
              </div>
            )}
          </button>
        </div>

      </aside>

      <header className="md:hidden bg-brand-sidebar text-white py-3.5 px-5 flex items-center justify-between sticky top-0 z-50 print:hidden border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          {shopLogo ? (
            <img src={shopLogo} alt={`${shopName} logo`} className="w-7 h-7 object-contain shrink-0" loading="lazy" />
          ) : (
            <img src="/favicon.svg" alt="Logo" className="w-6 h-6 object-contain shrink-0" />
          )}
          <span className="font-bold text-base tracking-tight text-white uppercase truncate">{displayName}</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-1 text-slate-400 hover:text-white cursor-pointer rounded-lg hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? <X className="icon-md" aria-hidden="true" /> : <Menu className="icon-md" aria-hidden="true" />}
        </button>
      </header>

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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                    isActive ? 'bg-brand-active text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  {isActive && <span className="w-1 h-5 bg-white rounded-full shrink-0" aria-hidden="true" />}
                  {!isActive && <span className="w-1 h-5 shrink-0" aria-hidden="true" />}
                  <Icon className={`icon-md shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-5 mt-auto border-t border-slate-800/60 space-y-2">
            {activeMode === 'Manager' ? (
              <button
                onClick={() => { setIsMobileMenuOpen(false); switchToOwner(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <Lock className="icon-sm shrink-0 text-white" />
                <span>Unlock settings</span>
              </button>
            ) : (
              <button
                onClick={() => { setIsMobileMenuOpen(false); switchToManager(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <Unlock className="icon-sm shrink-0 text-white" />
                <span>Back to Manager</span>
              </button>
            )}
            <VersionInfo collapsed={false} />
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <LogOut className="icon-sm shrink-0 text-white" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        <header className="hidden md:flex items-center justify-between bg-white h-12 px-4 border-b border-slate-200 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-warning-50 text-warning-700 hover:bg-warning-100 border border-warning-200 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-600/40"
              >
                <Lock className="icon-xs" aria-hidden="true" />
                <span>Manager</span>
              </button>
            ) : (
              <button
                onClick={switchToManager}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-success-50 text-success-700 hover:bg-success-100 border border-success-200 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-600/40"
              >
                <Unlock className="icon-xs" aria-hidden="true" />
                <span>Settings unlocked</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0 p-2 md:p-3 overflow-x-hidden overflow-y-auto content-scroll">
          <div className="animate-fade-in h-full min-h-0">
            {activeTab === 'Customers' && (
              <CustomersSection
                token={token}
                currency={currency}
                selectedCustomerId={activeCustomerIdForNewOrder}
                onBookOrder={(cust: Customer) => {
                  setActiveCustomerIdForNewOrder(cust.id);
                  setActiveTab('Orders');
                }}
                onOpenOrder={(orderId: string) => {
                  setActiveOrderId(orderId);
                  setActiveTab('Orders');
                }}
                shopName={shopName}
                shopLogo={shopLogo}
                measurementUnit={measurementUnit}
                isOwnerMode={activeMode === 'Owner'}
              />
            )}

            {activeTab === 'Orders' && (
              <OrdersSection
                token={token}
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
                isOwnerMode={activeMode === 'Owner'}
              />
            )}

            {activeTab === 'Financials' && (
              <FinancialReports
                token={token}
                currency={currency}
                shopName={displayName}
              />
            )}

            {activeTab === 'Owner' && (
              <OwnerDashboard
                token={token}
                onSettingsUpdated={handleSettingsUpdated}
                onOwnerModeRequired={handleOwnerModeRequired}
              />
            )}

          </div>
        </main>

        {showPasswordModal && (
          <div role="presentation" className="modal-overlay" onClick={() => { setShowPasswordModal(false); setPasswordError(null); setOwnerPassword(''); }}>
            <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center p-3 bg-neutral-100 rounded-xl mb-3">
                  <Shield className="icon-lg text-neutral-800" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Unlock settings</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your account password. Works offline after you have unlocked (or signed in) once while online on this device.
                </p>
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
                placeholder="Enter password..."
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
                  {isVerifyingPassword ? 'Verifying...' : 'Unlock'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  );
}
