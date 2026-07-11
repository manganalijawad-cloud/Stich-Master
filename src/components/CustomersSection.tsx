/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  UserPlus, 
  Phone, 
  Mail, 
  FileText, 
  Check, 
  ChevronRight, 
  Edit2, 
  ShieldAlert, 
  ShoppingCart, 
  MessageCircle, 
  MapPin, 
  AlertTriangle, 
  Printer,
  Trash2,
  Plus,
  X,
  Sparkles,
  Layers
} from 'lucide-react';
import { Customer, UserRole, Order, GarmentType, MeasurementProfile } from '../types';

interface CustomersSectionProps {
  token: string;
  userRole: UserRole;
  measurementFields: string[];
  currency: string;
  onBookOrder: (customer: Customer) => void;
  selectedCustomerId?: string;
  shopName?: string;
  measurementUnit?: 'Inches' | 'Centimeters' | 'Feet';
}

export default function CustomersSection({
  token,
  userRole,
  measurementFields,
  currency,
  onBookOrder,
  selectedCustomerId,
  shopName,
  measurementUnit = 'Inches',
}: CustomersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Garment Types state
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [garmentsLoading, setGarmentsLoading] = useState(false);

  // Create customer form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  
  // Selected garment type for NEW customer
  const [selectedGarmentTypeId, setSelectedGarmentTypeId] = useState<string>('');
  const [initialMeasurements, setInitialMeasurements] = useState<Record<string, string | number>>({});

  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);

  // Selected customer measurements/profiles state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [measurementsUpdatedAt, setMeasurementsUpdatedAt] = useState<string | null>(null);

  // Adding profile state
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfileGarmentTypeId, setNewProfileGarmentTypeId] = useState('');
  const [newProfileMeasurements, setNewProfileMeasurements] = useState<Record<string, string | number>>({});

  // Editing profile state
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileMeasurements, setEditingProfileMeasurements] = useState<Record<string, string | number>>({});

  // Print single profile state
  const [printProfileId, setPrintProfileId] = useState<string | null>(null);

  // Error/Success state for measurements/profiles edits
  const [measError, setMeasError] = useState<string | null>(null);
  const [measSuccess, setMeasSuccess] = useState(false);

  // Order history
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Helper unit abbreviation
  const getUnitAbbreviation = (unit?: string) => {
    if (!unit) return '';
    if (unit === 'Inches') return 'in';
    if (unit === 'Centimeters') return 'cm';
    if (unit === 'Feet') return 'ft';
    return unit;
  };

  const getLastUpdated = () => {
    const customerDate = new Date(selectedCustomer?.updated_at || Date.now());
    if (measurementsUpdatedAt) {
      const measDate = new Date(measurementsUpdatedAt);
      return measDate > customerDate ? measDate : customerDate;
    }
    return customerDate;
  };

  // Fetch Garment Types on load
  useEffect(() => {
    const fetchGarmentTypes = async () => {
      setGarmentsLoading(true);
      try {
        const res = await fetch('/api/garment-types', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setGarmentTypes(data);
          
          // Auto-select first active garment
          const enabledGarments = data.filter((g: GarmentType) => g.enabled);
          if (enabledGarments.length > 0) {
            setSelectedGarmentTypeId(enabledGarments[0].id);
            setNewProfileGarmentTypeId(enabledGarments[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching garment types:', err);
      } finally {
        setGarmentsLoading(false);
      }
    };

    fetchGarmentTypes();
  }, [token]);

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
      setProfiles([]);
      setActiveProfileId(null);
      setMeasurementsUpdatedAt(null);
      setOrderHistory([]);
      setShowHistory(false);
      setIsAddingProfile(false);
      setEditingProfileId(null);
      setPrintProfileId(null);
      return;
    }

    const fetchMeasurements = async () => {
      try {
        const res = await fetch(`/api/customers/${selectedCustomer.id}/measurements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const rawData = data.data || {};
          
          let parsedProfiles: MeasurementProfile[] = [];
          if (Array.isArray(rawData.profiles)) {
            parsedProfiles = rawData.profiles;
          } else if (Object.keys(rawData).length > 0) {
            // Migrate legacy flat measurements to customer's first default garment type
            const activeGarments = garmentTypes.filter(g => g.enabled);
            const defaultGarment = activeGarments.length > 0 ? activeGarments[0] : garmentTypes[0];
            if (defaultGarment) {
              parsedProfiles = [
                {
                  id: 'legacy-migrated',
                  garment_type_id: defaultGarment.id,
                  garment_name: defaultGarment.name,
                  values: rawData,
                  created_at: data.created_at || new Date().toISOString(),
                  updated_at: data.updated_at || new Date().toISOString()
                }
              ];
            }
          }
          
          setProfiles(parsedProfiles);
          if (parsedProfiles.length > 0) {
            setActiveProfileId(parsedProfiles[0].id);
          } else {
            setActiveProfileId(null);
          }
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
    setMeasSuccess(false);
    setMeasError(null);
    setShowHistory(false);
    setIsAddingProfile(false);
    setEditingProfileId(null);
    setPrintProfileId(null);
  }, [selectedCustomer, token, garmentTypes]);

  // Handle Customer Creation with first Measurement Profile automatically created
  const handleCreateCustomer = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!newName || newName.trim() === '') {
      setCreateError('Customer Name is required.');
      return;
    }

    setCreateError(null);
    setCreateSuccess(false);
    setDuplicateAlert(null);

    try {
      const selectedGarment = garmentTypes.find(g => g.id === selectedGarmentTypeId);
      if (!selectedGarment) {
        throw new Error('Please select an active garment type to define measurements.');
      }

      // Validate required measurement fields
      const missingRequired = selectedGarment.measurement_fields
        .filter(f => f.required)
        .find(f => !initialMeasurements[f.name] || String(initialMeasurements[f.name]).trim() === '');
      
      if (missingRequired) {
        throw new Error(`Measurement field "${missingRequired.name}" is required.`);
      }

      // Automatically construct first Measurement Profile
      const firstProfile: MeasurementProfile = {
        id: Math.random().toString(36).substring(2, 11),
        garment_type_id: selectedGarment.id,
        garment_name: selectedGarment.name,
        values: initialMeasurements,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const payloadMeasurements = {
        profiles: [firstProfile]
      };

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
          measurements: payloadMeasurements,
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

  // Helper to persist profiles state to backend
  const handleSaveProfiles = async (updatedProfiles: MeasurementProfile[]) => {
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
        body: JSON.stringify({
          data: {
            profiles: updatedProfiles
          }
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save measurement profiles.');
      }

      setProfiles(updatedProfiles);
      setMeasurementsUpdatedAt(data.updated_at || new Date().toISOString());
      setMeasSuccess(true);
      setTimeout(() => setMeasSuccess(false), 4000);
    } catch (err: any) {
      setMeasError(err.message);
    }
  };

  // Add another garment profile
  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileGarmentTypeId) return;

    const selectedGarment = garmentTypes.find(g => g.id === newProfileGarmentTypeId);
    if (!selectedGarment) return;

    const newProfile: MeasurementProfile = {
      id: Math.random().toString(36).substring(2, 11),
      garment_type_id: selectedGarment.id,
      garment_name: selectedGarment.name,
      values: newProfileMeasurements,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const updatedProfiles = [...profiles, newProfile];
    await handleSaveProfiles(updatedProfiles);
    setActiveProfileId(newProfile.id);
    setIsAddingProfile(false);
    setNewProfileMeasurements({});
  };

  // Edit measurements
  const handleEditProfileSave = async (profileId: string) => {
    const updatedProfiles = profiles.map(p => {
      if (p.id === profileId) {
        return {
          ...p,
          values: editingProfileMeasurements,
          updated_at: new Date().toISOString()
        };
      }
      return p;
    });

    await handleSaveProfiles(updatedProfiles);
    setEditingProfileId(null);
  };

  // Delete profile
  const handleDeleteProfile = async (profileId: string, garmentName: string) => {
    if (!confirm(`Are you absolutely sure you want to delete the "${garmentName}" measurement profile? This action is irreversible.`)) {
      return;
    }

    const updatedProfiles = profiles.filter(p => p.id !== profileId);
    await handleSaveProfiles(updatedProfiles);

    if (activeProfileId === profileId) {
      if (updatedProfiles.length > 0) {
        setActiveProfileId(updatedProfiles[0].id);
      } else {
        setActiveProfileId(null);
      }
    }
  };

  // Print Profile helper
  const handlePrintSingleProfile = (profileId: string) => {
    setPrintProfileId(profileId);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handlePrintAllProfiles = () => {
    setPrintProfileId(null);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleInitMeasChange = (field: string, val: string) => {
    setInitialMeasurements((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId) || null;
  const activeGarmentType = activeProfile ? garmentTypes.find(gt => gt.id === activeProfile.garment_type_id) : null;
  const selectedGarmentTypeForNewCustomer = garmentTypes.find(g => g.id === selectedGarmentTypeId);

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
                // Pre-populate with first enabled garment type
                const enabled = garmentTypes.filter(g => g.enabled);
                if (enabled.length > 0) {
                  setSelectedGarmentTypeId(enabled[0].id);
                }
                setInitialMeasurements({});
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
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">NAME*</label>
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
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">MOBILE NUMBER</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">ADDRESS</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="e.g. 123 Fashion St, Suite 100"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">NOTE</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Preferred fits, specific styling instructions..."
                rows={2}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>


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

              {/* Attributes display */}
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Measurement Unit</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-sky-50 text-sky-800 border border-sky-200 mt-1">
                      {measurementUnit}
                    </span>
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

              {/* Actions panel */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => onBookOrder(selectedCustomer)}
                  className="px-4 py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all border border-slate-900 shadow-sm"
                >
                  <ShoppingCart className="w-4 h-4 text-[#38BDF8]" />
                  Create New Order
                </button>

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

            {/* MEASUREMENT PROFILES COMPONENT SECTION */}
            <div className="space-y-6 pt-4 border-t border-slate-100">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                    <Layers className="w-5 h-5 text-[#38BDF8]" />
                    Measurement Profiles
                  </h3>
                  <p className="text-3xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    {profiles.length} profiles listed for this customer
                  </p>
                </div>

                {!isAddingProfile && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIsAddingProfile(true);
                        const enabled = garmentTypes.filter(g => g.enabled);
                        if (enabled.length > 0) {
                          setNewProfileGarmentTypeId(enabled[0].id);
                        }
                        setNewProfileMeasurements({});
                      }}
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 text-white font-extrabold text-3xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Add Profile
                    </button>
                    {profiles.length > 0 && (
                      <button
                        onClick={handlePrintAllProfiles}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-3xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-all border border-slate-200"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        Print All
                      </button>
                    )}
                  </div>
                )}
              </div>

              {measSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold animate-fade-in">
                  Measurement Profiles synchronized successfully! Previous frozen orders remain safe.
                </div>
              )}

              {measError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">
                  {measError}
                </div>
              )}

              {/* Inline form: Add Another Garment Profile */}
              {isAddingProfile ? (
                <form onSubmit={handleAddProfile} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 shadow-3xs animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Add Garment Profile
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingProfile(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-3xs font-black text-slate-500 block uppercase tracking-wider">Garment Type *</label>
                    <select
                      value={newProfileGarmentTypeId}
                      onChange={(e) => {
                        setNewProfileGarmentTypeId(e.target.value);
                        setNewProfileMeasurements({});
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white uppercase tracking-wider"
                    >
                      {garmentTypes.filter(g => g.enabled).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const chosen = garmentTypes.find(gt => gt.id === newProfileGarmentTypeId);
                    if (!chosen) return null;
                    return (
                      <div className="space-y-3">
                        <span className="text-3xs font-black text-slate-500 block uppercase tracking-wider">
                          Measurements ({chosen.name})
                        </span>
                        {chosen.measurement_fields.length === 0 ? (
                          <p className="text-2xs text-slate-400 italic text-center py-2">
                            No parameter fields declared for this garment type.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-2 bg-white rounded-xl border border-slate-150">
                            {chosen.measurement_fields.map((field) => (
                              <div key={field.name} className="flex flex-col">
                                <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide truncate">
                                  {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                                </label>
                                <input
                                  type="text"
                                  required={field.required}
                                  placeholder={field.required ? 'Required' : '--'}
                                  value={newProfileMeasurements[field.name] || ''}
                                  onChange={(e) => {
                                    setNewProfileMeasurements(prev => ({
                                      ...prev,
                                      [field.name]: e.target.value
                                    }));
                                  }}
                                  className="mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingProfile(false)}
                      className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold text-3xs uppercase tracking-wider rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-3xs uppercase tracking-wider rounded-lg cursor-pointer transition-colors"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>
              ) : null}

              {/* Profiles Selector tabs */}
              {!isAddingProfile && profiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
                  {profiles.map((p) => {
                    const isSelected = p.id === activeProfileId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setActiveProfileId(p.id);
                          setEditingProfileId(null);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 border-[#38BDF8] text-[#0369A1] shadow-2xs'
                            : 'bg-white border-slate-150 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        {p.garment_name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Opened Profile View Area */}
              {!isAddingProfile && activeProfile && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-fade-in">
                  
                  {/* Title and specific action toolbar */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                    <div>
                      <span className="text-3xs font-extrabold text-slate-400 uppercase tracking-widest block">Active Garment Profile</span>
                      <span className="text-sm font-black text-slate-800 uppercase tracking-wider block font-display">
                        {activeProfile.garment_name} Specification
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {editingProfileId === activeProfile.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingProfileId(null)}
                            className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-extrabold text-3xs uppercase tracking-wider cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditProfileSave(activeProfile.id)}
                            className="px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-black text-3xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Check className="w-3.5 h-3.5 text-[#38BDF8]" />
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProfileId(activeProfile.id);
                              setEditingProfileMeasurements({ ...activeProfile.values });
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-250/50 rounded-lg cursor-pointer transition-colors"
                            title="Edit measurements"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintSingleProfile(activeProfile.id)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-250/50 rounded-lg cursor-pointer transition-colors"
                            title="Print profile sheet"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(activeProfile.id, activeProfile.garment_name)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete profile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Render fields inside profile */}
                  {editingProfileId === activeProfile.id ? (
                    /* EDITING MEASUREMENTS FOR THIS PROFILE */
                    activeGarmentType ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                        {activeGarmentType.measurement_fields.map((field) => (
                          <div key={field.name} className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">
                              {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                            </label>
                            <input
                              type="text"
                              required={field.required}
                              value={editingProfileMeasurements[field.name] || ''}
                              onChange={(e) => {
                                setEditingProfileMeasurements(prev => ({
                                  ...prev,
                                  [field.name]: e.target.value
                                }));
                              }}
                              placeholder={field.required ? 'Required' : '--'}
                              className="w-full px-3 py-2 bg-[#F8FAFC] border border-slate-200 rounded-lg text-slate-800 font-bold text-sm focus:outline-none focus:border-[#38BDF8]"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-2xs text-slate-400">Garment Type specification was deleted or modified.</p>
                    )
                  ) : (
                    /* READ-ONLY DISPLAY */
                    activeGarmentType ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {activeGarmentType.measurement_fields.map((field) => {
                          const val = activeProfile.values[field.name];
                          return (
                            <div key={field.name} className="p-3.5 bg-white border border-slate-150 rounded-xl flex flex-col justify-between shadow-2xs">
                              <span className="text-[10px] font-extrabold text-slate-400 truncate uppercase tracking-wider">
                                {field.name}
                              </span>
                              <span className="text-base font-black text-slate-800 mt-1 block">
                                {val !== undefined && val !== '' ? (
                                  <span className="flex items-baseline gap-0.5">
                                    {val}
                                    <span className="text-3xs font-extrabold text-slate-400 ml-0.5">
                                      {getUnitAbbreviation(measurementUnit)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-normal">--</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-2xs text-slate-400 italic">This profile uses a custom form. Edit parameters directly or view fields.</p>
                    )
                  )}

                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2 flex justify-between">
                    <span>Created: {new Date(activeProfile.created_at).toLocaleDateString()}</span>
                    <span>Updated: {new Date(activeProfile.updated_at).toLocaleDateString()}</span>
                  </div>

                </div>
              )}

              {/* No profiles placeholder */}
              {!isAddingProfile && profiles.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
                  <Layers className="w-10 h-10 text-slate-300 animate-pulse mb-3" />
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">No Measurement Profiles</h4>
                  <p className="text-slate-400 text-3xs font-bold uppercase tracking-widest max-w-xs mt-1 leading-relaxed">
                    Create the first profile to register tailored specifications.
                  </p>
                  <button
                    onClick={() => {
                      setIsAddingProfile(true);
                      const enabled = garmentTypes.filter(g => g.enabled);
                      if (enabled.length > 0) {
                        setNewProfileGarmentTypeId(enabled[0].id);
                      }
                      setNewProfileMeasurements({});
                    }}
                    className="mt-4 px-4 py-2 bg-[#0F172A] hover:bg-slate-850 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
                    Create First Profile
                  </button>
                </div>
              )}

            </div>
          </div>
        ) : isCreating ? (
          <div className="space-y-6 animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-[#38BDF8]" />
                Garment Specification & Measurements
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Define the first garment profile and corresponding measurement details for this customer.
              </p>
            </div>

            {/* Garment Type Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block uppercase tracking-wider">First Garment Profile *</label>
              <select
                id="garment-profile-selector"
                value={selectedGarmentTypeId}
                onChange={(e) => {
                  setSelectedGarmentTypeId(e.target.value);
                  setInitialMeasurements({});
                }}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 text-sm font-semibold bg-white focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all uppercase tracking-wider cursor-pointer"
              >
                {garmentTypes.filter(g => g.enabled).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">
                Showing only active garment specifications.
              </p>
            </div>

            {/* Dynamic Initial Measurements */}
            {selectedGarmentTypeForNewCustomer && (
              <div className="pt-2">
                <p className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">
                  Initial Measurements ({selectedGarmentTypeForNewCustomer.name})
                </p>
                {selectedGarmentTypeForNewCustomer.measurement_fields.length === 0 ? (
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 text-center text-xs text-slate-400 font-bold uppercase tracking-wide">
                    No custom fields defined for this garment type.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 max-h-[360px] overflow-y-auto p-4 border border-slate-200 rounded-xl bg-slate-50 shadow-3xs">
                    {selectedGarmentTypeForNewCustomer.measurement_fields.map((field) => (
                      <div key={field.name} className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide truncate">
                          {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                        </span>
                        <input
                          id={`input-meas-${field.name.toLowerCase().replace(/\s+/g, '-')}`}
                          type="text"
                          required={field.required}
                          placeholder={field.required ? 'Required' : '--'}
                          value={initialMeasurements[field.name] || ''}
                          onChange={(e) => handleInitMeasChange(field.name, e.target.value)}
                          className="mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl bg-white text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#38BDF8] focus:ring-4 focus:ring-sky-100 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              id="btn-save-customer-profile-right"
              type="button"
              onClick={(e) => handleCreateCustomer(e)}
              className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors mt-4"
            >
              <Check className="w-4 h-4" />
              Save Customer Profile
            </button>
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
              <p><strong>Measurement Unit:</strong> {measurementUnit}</p>
              <p><strong>Measurement Status:</strong> {profiles.length > 0 ? 'Active Profiles Available' : 'No Profiles'}</p>
            </div>
          </div>

          {selectedCustomer.notes && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              <p className="font-bold border-b border-slate-200 pb-1 mb-1">Customer Notes / Style Preferences:</p>
              <p className="italic text-slate-750">{selectedCustomer.notes}</p>
            </div>
          )}

          {/* Profiles printable content */}
          <div className="space-y-6">
            {profiles
              .filter(p => !printProfileId || p.id === printProfileId)
              .map((p) => {
                const gt = garmentTypes.find(g => g.id === p.garment_type_id);
                const fields = gt?.measurement_fields || [];
                return (
                  <div key={p.id} className="space-y-3 border border-slate-300 p-4 rounded-xl page-break-inside-avoid">
                    <h3 className="font-black text-base uppercase border-b border-slate-300 pb-1 text-slate-800">
                      Garment Profile: {p.garment_name}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {fields.map((field) => (
                        <div key={field.name} className="flex justify-between items-center py-2 border-b border-slate-100 text-sm">
                          <span className="font-semibold text-slate-600 uppercase tracking-wider text-xs">{field.name}</span>
                          <span className="font-black text-slate-900 border-b border-slate-300 px-4 min-w-[80px] text-center">
                            {p.values[field.name] !== undefined && p.values[field.name] !== '' 
                              ? `${p.values[field.name]} ${getUnitAbbreviation(measurementUnit)}` 
                              : '--'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
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
