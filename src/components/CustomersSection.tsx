/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Phone, Mail, FileText, Check, ChevronRight, Edit2, ShieldAlert, ShoppingCart, MessageCircle, MapPin, AlertTriangle, Printer } from 'lucide-react';
import { Customer, UserRole, Order } from '../types';

interface CustomersSectionProps {
  token: string;
  userRole: UserRole;
  measurementFields: string[];
  currency: string;
  onBookOrder: (customer: Customer) => void;
  selectedCustomerId?: string;
  shopName?: string;
}

export default function CustomersSection({
  token,
  userRole,
  measurementFields,
  currency,
  onBookOrder,
  selectedCustomerId,
  shopName,
}: CustomersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  
  // Create customer form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [initialMeasurements, setInitialMeasurements] = useState<Record<string, string | number>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);

  // Selected customer measurements state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, string | number>>({});
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
  const [editedMeasurements, setEditedMeasurements] = useState<Record<string, string | number>>({});
  const [measError, setMeasError] = useState<string | null>(null);
  const [measSuccess, setMeasSuccess] = useState(false);

  // Additional customer details states
  const [measurementsUpdatedAt, setMeasurementsUpdatedAt] = useState<string | null>(null);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const getLastUpdated = () => {
    const customerDate = new Date(selectedCustomer?.updated_at || Date.now());
    if (measurementsUpdatedAt) {
      const measDate = new Date(measurementsUpdatedAt);
      return measDate > customerDate ? measDate : customerDate;
    }
    return customerDate;
  };

  // Search Customers on input change
  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}&page=1&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setCustomers(data);
          setPage(1);
          setHasMore(data.length === 50);
          // Auto select if id provided
          if (selectedCustomerId && data.length > 0) {
            const matched = data.find((c: Customer) => c.id === selectedCustomerId);
            if (matched) setSelectedCustomer(matched);
          }
        }
      } catch (err) {
        console.error('Error searching customers:', err);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchCustomers();
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, token, selectedCustomerId]);

  const loadMoreCustomers = async () => {
    const nextPage = page + 1;
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}&page=${nextPage}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCustomers((prev) => [...prev, ...data]);
        setPage(nextPage);
        setHasMore(data.length === 50);
      }
    } catch (err) {
      console.error('Error loading more customers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch measurements and order history when selected customer changes
  useEffect(() => {
    if (!selectedCustomer) {
      setMeasurements({});
      setMeasurementsUpdatedAt(null);
      setOrderHistory([]);
      setShowHistory(false);
      return;
    }

    const fetchMeasurements = async () => {
      try {
        const res = await fetch(`/api/customers/${selectedCustomer.id}/measurements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setMeasurements(data.data || {});
          setEditedMeasurements(data.data || {});
          setMeasurementsUpdatedAt(data.updated_at || null);
        }
      } catch (err) {
        console.error('Error fetching measurements:', err);
      }
    };

    const fetchOrderHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/customers/${selectedCustomer.id}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrderHistory(data);
        }
      } catch (err) {
        console.error('Error fetching order history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchMeasurements();
    fetchOrderHistory();
    setIsEditingMeasurements(false);
    setMeasSuccess(false);
    setMeasError(null);
    setShowHistory(false);
  }, [selectedCustomer, token]);

  // Handle Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || newName.trim() === '') {
      setCreateError('Customer Name is required.');
      return;
    }

    setCreateError(null);
    setCreateSuccess(false);
    setDuplicateAlert(null);

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          whatsapp: newWhatsapp.trim(),
          address: newAddress.trim(),
          email: newEmail.trim(),
          notes: newNotes.trim(),
          measurements: initialMeasurements,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create customer.');
      }

      if (data.alreadyExists) {
        setDuplicateAlert(`Customer "${data.customer.name}" already exists with this mobile number. Displaying existing profile instead.`);
        setSelectedCustomer(data.customer);
        setIsCreating(false);
        // Clear form
        setNewName('');
        setNewPhone('');
        setNewWhatsapp('');
        setNewAddress('');
        setNewEmail('');
        setNewNotes('');
        setInitialMeasurements({});
        onBookOrder(data.customer);
        return;
      }

      setCreateSuccess(true);
      // Reset form
      setNewName('');
      setNewPhone('');
      setNewWhatsapp('');
      setNewAddress('');
      setNewEmail('');
      setNewNotes('');
      setInitialMeasurements({});
      
      // Auto-select newly created customer
      setSelectedCustomer(data);
      onBookOrder(data);
      setIsCreating(false);

      // Refresh customers list
      setSearchQuery('');
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  // Handle Measurements Edit (Owner Only)
  const handleSaveMeasurements = async () => {
    if (!selectedCustomer) return;
    setMeasError(null);
    setMeasSuccess(false);

    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}/measurements`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: editedMeasurements }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save measurements.');
      }

      setMeasurements(data.data || {});
      setMeasSuccess(true);
      setIsEditingMeasurements(false);
    } catch (err: any) {
      setMeasError(err.message);
    }
  };

  const handleMeasChange = (field: string, val: string) => {
    setEditedMeasurements((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleInitMeasChange = (field: string, val: string) => {
    setInitialMeasurements((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT COLUMN: Customer Search & List */}
      <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-display uppercase">Customers</h2>
          {!isCreating && (
            <button
              onClick={() => {
                setIsCreating(true);
                setSelectedCustomer(null);
              }}
              className="px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors text-xs uppercase tracking-wider"
            >
              <UserPlus className="w-4 h-4 text-[#38BDF8]" />
              Add Customer
            </button>
          )}
        </div>

        {isCreating ? (
          /* CREATE CUSTOMER FORM */
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-base text-slate-800 font-display">New Customer Details</span>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                {createError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">Customer Name *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Robert Chen"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">Mobile Number (Optional)</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">Whatsapp Number (Optional)</label>
              <input
                type="tel"
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">Address (Optional)</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="e.g. 123 Fashion St, Suite 100"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">Customer Notes (Optional)</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Stature details, preferred fittings, specific styles..."
                rows={2}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="pt-2">
              <p className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">Initial Measurements (Optional)</p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                {measurementFields.map((field) => (
                  <div key={field} className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide truncate">{field}</span>
                    <input
                      type="text"
                      placeholder="--"
                      value={initialMeasurements[field] || ''}
                      onChange={(e) => handleInitMeasChange(field, e.target.value)}
                      className="mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors mt-4"
            >
              <Check className="w-4 h-4" />
              Save Customer Profile
            </button>
          </form>
        ) : (
          /* SEARCH & CUSTOMER LIST */
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Customer (Name or Phone)..."
                className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 text-base placeholder-slate-400 focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {loading && <p className="text-center text-slate-400 py-4 text-xs font-semibold uppercase tracking-wider">Searching customers...</p>}
              {!loading && customers.length === 0 && (
                <p className="text-center text-slate-400 py-8 text-xs font-semibold uppercase tracking-wider">No matching customers found.</p>
              )}
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                  }}
                  className={`w-full p-4 rounded-xl text-left border transition-all flex items-center justify-between cursor-pointer ${
                    selectedCustomer?.id === c.id
                      ? 'bg-[#F0F9FF] border-[#38BDF8] ring-2 ring-sky-100'
                      : 'bg-[#FFFFFF] hover:bg-slate-50 border-slate-200/60'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-extrabold text-slate-900 text-base font-display">{c.name}</p>
                    {c.phone && !c.phone.startsWith('NO-PHONE-') ? (
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium italic">
                        No phone number
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`w-5 h-5 shrink-0 ${selectedCustomer?.id === c.id ? 'text-[#38BDF8]' : 'text-slate-400'}`} />
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={loadMoreCustomers}
                  disabled={loading}
                  className="w-full mt-3 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 cursor-pointer text-center flex items-center justify-center gap-1.5 transition-all shadow-3xs"
                >
                  {loading ? 'Loading...' : 'Load More Customers'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Customer Details & Measurements */}
      <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 min-h-[500px]">
        {duplicateAlert && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-start justify-between gap-2.5 animate-fade-in">
            <span>{duplicateAlert}</span>
            <button 
              onClick={() => setDuplicateAlert(null)}
              className="text-amber-500 hover:text-amber-800 font-extrabold cursor-pointer px-1 text-sm shrink-0"
            >
              ×
            </button>
          </div>
        )}

        {selectedCustomer ? (
          <div className="space-y-6 animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-5 space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Profile</span>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-display uppercase">{selectedCustomer.name}</h1>
              </div>

              {/* CORE DISPLAY ATTRIBUTES AS REQUESTED */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer Name</span>
                    <span className="text-sm font-extrabold text-slate-800 block mt-0.5">{selectedCustomer.name}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                    {selectedCustomer.phone && !selectedCustomer.phone.startsWith('NO-PHONE-') ? (
                      <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        {selectedCustomer.phone}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic block mt-0.5">No phone number provided</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Address</span>
                    {selectedCustomer.address ? (
                      <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        {selectedCustomer.address}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic block mt-0.5">No address provided</span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Last Updated</span>
                    <span className="text-sm font-extrabold text-slate-700 block mt-0.5">
                      {getLastUpdated().toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Measurement Status</span>
                    <div className="mt-1">
                      {Object.values(measurements).some(v => v !== undefined && v !== '') ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-[#DCFCE7] text-[#15803D] border border-green-200">
                          <Check className="w-3.5 h-3.5" />
                          Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-[#FEF9C3] text-[#854D0E] border border-yellow-200">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra details (optional parameters if exist) */}
              {(selectedCustomer.email || selectedCustomer.whatsapp || selectedCustomer.notes) && (
                <div className="pt-2 space-y-1.5 text-xs text-slate-600 font-medium border-t border-slate-100">
                  {selectedCustomer.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-slate-400" />
                      Email: <span className="text-slate-800 font-semibold">{selectedCustomer.email}</span>
                    </p>
                  )}
                  {selectedCustomer.whatsapp && (
                    <p className="flex items-center gap-1.5 text-emerald-600">
                      <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      WhatsApp: <span className="text-slate-800 font-semibold">{selectedCustomer.whatsapp}</span>
                    </p>
                  )}
                  {selectedCustomer.notes && (
                    <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-150/50 mt-2 text-slate-600 text-xs">
                      <FileText className="w-4.5 h-4.5 mt-0.5 shrink-0 text-slate-400" />
                      <p className="leading-relaxed">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* CORE ACTIONS BUTTON PANEL AS REQUESTED */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                {/* 1. Edit Measurements */}
                {!isEditingMeasurements ? (
                  <button
                    onClick={() => {
                      setEditedMeasurements({ ...measurements });
                      setIsEditingMeasurements(true);
                      setMeasSuccess(false);
                    }}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors border border-slate-200"
                  >
                    <Edit2 className="w-4 h-4 text-slate-500" />
                    Edit Measurements
                  </button>
                ) : (
                  <div className="px-4 py-3 bg-slate-50 text-slate-400 font-semibold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200/50 cursor-not-allowed">
                    <Edit2 className="w-4 h-4 opacity-55" />
                    Edit Measurements
                  </div>
                )}

                {/* 2. Create New Order */}
                <button
                  onClick={() => onBookOrder(selectedCustomer)}
                  className="px-4 py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all border border-slate-900 shadow-sm"
                >
                  <ShoppingCart className="w-4 h-4 text-[#38BDF8]" />
                  Create New Order
                </button>

                {/* 3. Order History */}
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`px-4 py-3 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors border ${
                    showHistory
                      ? 'bg-sky-50 border-[#38BDF8] text-[#0369A1]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4 text-sky-500" />
                  Order History ({orderHistory.length})
                </button>

                {/* 4. Print Measurement Sheet */}
                <button
                  onClick={() => window.print()}
                  className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  Print Measurement Sheet
                </button>
              </div>
            </div>

            {/* ORDER HISTORY TOGGLE AREA */}
            {showHistory && (
              <div className="border-t border-slate-150 pt-5 space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider font-display">Order History ({orderHistory.length})</h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-slate-500 hover:text-slate-800 text-2xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Hide History
                  </button>
                </div>

                {historyLoading ? (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-4 text-center">Loading orders...</p>
                ) : orderHistory.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-4 text-center">No orders booked yet for this customer.</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {orderHistory.map((order) => (
                      <div key={order.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm font-display">{order.order_number}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              order.status === 'Ready' || order.status === 'Ready to Deliver'
                                ? 'bg-[#DCFCE7] text-[#15803D]'
                                : order.status === 'Delivered'
                                ? 'bg-slate-100 text-slate-600'
                                : order.status === 'Pending'
                                ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                                : 'bg-[#FEF9C3] text-[#854D0E]'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">
                            Booked: {new Date(order.created_at).toLocaleDateString()} • Due: {new Date(order.due_date).toLocaleDateString()}
                          </p>
                          <div className="text-[11px] text-slate-600 font-medium">
                            Items: {order.items.map(it => it.type).join(', ')}
                          </div>
                        </div>
                        <div className="text-right space-y-1 shrink-0">
                          <span className="text-base font-black text-slate-800 block font-display">
                            {currency}{order.total_amount}
                          </span>
                          {order.total_amount - order.paid_amount > 0 ? (
                            <span className="text-[10px] bg-red-50 text-red-700 font-bold px-1.5 py-0.5 rounded border border-red-100">
                              Due: {currency}{order.total_amount - order.paid_amount}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-100">
                              Paid
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MEASUREMENTS GRID */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-900 uppercase tracking-wider font-display block">Spec Specification Card</span>
                {isEditingMeasurements && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingMeasurements(false)}
                      className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveMeasurements}
                      className="px-3.5 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Check className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Save
                    </button>
                  </div>
                )}
              </div>

              {measSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                  Measurements updated successfully! Previous orders remain completely unaffected.
                </div>
              )}

              {measError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">
                  {measError}
                </div>
              )}

              {isEditingMeasurements ? (
                /* EDIT VIEW */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-150">
                  {measurementFields.map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">{field}</label>
                      <input
                        type="text"
                        value={editedMeasurements[field] || ''}
                        onChange={(e) => handleMeasChange(field, e.target.value)}
                        placeholder="--"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold text-sm focus:outline-none focus:border-[#38BDF8]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* VIEW DISPLAY */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {measurementFields.map((field) => (
                    <div key={field} className="p-3 bg-[#FFFFFF] border border-slate-200/65 rounded-xl flex flex-col">
                      <span className="text-[10px] font-extrabold text-slate-400 truncate uppercase tracking-wider">{field}</span>
                      <span className="text-lg font-extrabold text-slate-800 mt-0.5">
                        {measurements[field] !== undefined && measurements[field] !== '' ? (
                          <span>{measurements[field]}</span>
                        ) : (
                          <span className="text-slate-300 font-normal">--</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center print:hidden">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 font-display">No Customer Selected</h3>
            <p className="text-slate-400 max-w-xs mt-1 text-xs font-semibold uppercase tracking-wider leading-relaxed">
              Select a customer profile on the left side to inspect measurements and file bookings.
            </p>
          </div>
        )}
      </div>

      {/* PRINT MEASUREMENT SHEET CONTAINER - HIDDEN BY DEFAULT EXCEPT IN PRINT */}
      {selectedCustomer && (
        <div className="hidden print:block bg-white text-slate-900 p-8 space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2 border-b-2 border-slate-900 pb-5">
            <h1 className="text-3xl font-black tracking-tight uppercase">{shopName || 'Unnamed Tailor Shop'}</h1>
            <h2 className="text-xl font-bold tracking-wider text-slate-500 uppercase">Customer Measurement Sheet</h2>
            <p className="text-xs">Generated on: {new Date().toLocaleDateString()} • Printed by StitchMaster</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pb-4 border-b border-slate-300">
            <div className="space-y-1">
              <p><strong>Customer Name:</strong> {selectedCustomer.name}</p>
              <p><strong>Phone Number:</strong> {selectedCustomer.phone && !selectedCustomer.phone.startsWith('NO-PHONE-') ? selectedCustomer.phone : 'Not Provided'}</p>
              {selectedCustomer.whatsapp && <p><strong>WhatsApp:</strong> {selectedCustomer.whatsapp}</p>}
            </div>
            <div className="space-y-1 text-right">
              <p><strong>Address:</strong> {selectedCustomer.address || 'Not Provided'}</p>
              <p><strong>Last Updated:</strong> {(() => {
                const customerDate = new Date(selectedCustomer.updated_at);
                if (measurementsUpdatedAt) {
                  const measDate = new Date(measurementsUpdatedAt);
                  return (measDate > customerDate ? measDate : customerDate).toLocaleString();
                }
                return customerDate.toLocaleString();
              })()}</p>
              <p><strong>Measurement Status:</strong> {Object.values(measurements).some(v => v !== undefined && v !== '') ? 'Complete' : 'Pending'}</p>
            </div>
          </div>

          {selectedCustomer.notes && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              <p className="font-bold border-b border-slate-200 pb-1 mb-1">Customer Notes / Style Preferences:</p>
              <p className="italic text-slate-750">{selectedCustomer.notes}</p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-extrabold text-base uppercase border-b border-slate-300 pb-1">Spec Specifications</h3>
            <div className="grid grid-cols-2 gap-4">
              {measurementFields.map((field) => (
                <div key={field} className="flex justify-between items-center py-2 border-b border-slate-100 text-sm">
                  <span className="font-semibold text-slate-600 uppercase tracking-wider text-xs">{field}</span>
                  <span className="font-black text-slate-900 border-b border-slate-300 px-4 min-w-[80px] text-center">
                    {measurements[field] !== undefined && measurements[field] !== '' ? measurements[field] : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-16 flex justify-between text-xs border-t border-dashed border-slate-300">
            <div className="text-center w-40">
              <div className="border-b border-slate-400 h-8 mb-1"></div>
              <p className="font-bold text-slate-500 uppercase">Master Tailor Signature</p>
            </div>
            <div className="text-center w-40">
              <div className="border-b border-slate-400 h-8 mb-1"></div>
              <p className="font-bold text-slate-500 uppercase">Customer Acknowledgment</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
