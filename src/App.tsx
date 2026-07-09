/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, ShoppingBag, Settings, LogOut, Info, AlertTriangle, ShieldCheck, Menu, X } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import CustomersSection from './components/CustomersSection';
import OrdersSection from './components/OrdersSection';
import OwnerDashboard from './components/OwnerDashboard';
import { Customer, UserProfile, UserRole, PipelineStage } from './types';

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('tailor_token') || 'mock-owner-token';
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
    return {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'owner@tailor.com',
      name: 'Owner Account',
      role: 'Owner',
    };
  });

  const [activeTab, setActiveTab] = useState<'Customers' | 'Orders' | 'Owner'>('Customers');
  const [activeCustomerIdForNewOrder, setActiveCustomerIdForNewOrder] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Shop configurations fetched from settings API
  const [shopName, setShopName] = useState('Classic Tailors');
  const [shopPhone, setShopPhone] = useState('+1 (555) 123-4567');
  const [shopAddress, setShopAddress] = useState('123 Elegance Lane, Fashion District');
  const [currency, setCurrency] = useState('$');
  const [measurementFields, setMeasurementFields] = useState<string[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState<{ supabaseConnected: boolean; supabaseUrl: string | null }>({
    supabaseConnected: false,
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
    try {
      const configRes = await fetch('/api/config-status');
      const configContentType = configRes.headers.get('content-type') || '';
      if (configRes.ok && configContentType.includes('application/json')) {
        const configData = await configRes.json();
        setSupabaseConfig(configData);
      }

      // Fetch dynamic settings
      const settingsRes = await fetch('/api/settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  const handleLoginSuccess = (usr: UserProfile, tkn: string) => {
    setUser(usr);
    setToken(tkn);
    localStorage.setItem('tailor_token', tkn);
    localStorage.setItem('tailor_user', JSON.stringify(usr));
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
    localStorage.removeItem('tailor_token');
    localStorage.removeItem('tailor_user');
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
      <LoginScreen onLoginSuccess={handleLoginSuccess} supabaseConfig={supabaseConfig} />
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
    ...(user.role === 'Owner'
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
        <div className="pt-6 border-t border-slate-800 mt-auto space-y-4">
          <div className="flex flex-col gap-1 px-2">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Staff Member</span>
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm font-semibold text-slate-300 truncate max-w-[130px]">{user.name}</span>
              <span className="text-2xs font-extrabold px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] rounded uppercase">
                {user.role}
              </span>
            </div>
          </div>
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
            
            {/* Supabase status badge in topbar styled like StitchMaster user-tag */}
            {!supabaseConfig.supabaseConnected ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FEF9C3] border border-amber-200 text-[#854D0E] rounded-full text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Sandbox DB Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E0F2FE] border border-sky-100 text-[#0369A1] rounded-full text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Cloud Synced</span>
              </div>
            )}

            {/* Profile widget */}
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-full py-1 px-3.5 text-sm font-bold text-slate-800">
              <span>{user.name}</span>
              <span className="text-3xs font-extrabold bg-[#E0F2FE] text-[#0369A1] px-1.5 py-0.5 rounded uppercase">
                {user.role}
              </span>
            </div>

          </div>
        </header>

        {/* CORE WORKSPACE CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          
          {/* Sandbox alert matching the Professional Polish warning alerts */}
          {!supabaseConfig.supabaseConnected && (
            <div className="mb-6 p-4 bg-[#FEF9C3] border border-amber-200 text-[#854D0E] rounded-xl flex items-start gap-3 shadow-sm print:hidden">
              <AlertTriangle className="w-5.5 h-5.5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-sm uppercase tracking-wide text-slate-800">Executing inside a temporary sandbox database</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Measurements, custom fields, and customer orders are currently saved to a local sandbox database (<code>sandbox_db.json</code>).
                  To set up a production-ready database with automatic cloud syncing, configure your Supabase connection strings inside the Administration Settings panel.
                </p>
              </div>
            </div>
          )}

          {/* ACTIVE MODULE CONTAINER */}
          <div className="animate-fade-in">
            {activeTab === 'Customers' && (
              <CustomersSection
                token={token}
                userRole={user.role}
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
                userRole={user.role}
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

            {activeTab === 'Owner' && user.role === 'Owner' && (
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

    </div>
  );
}
