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
  ShoppingCart, 
  MapPin, 
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
  shopLogo?: string;
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
  shopLogo,
  measurementUnit = 'Inches',
}: CustomersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [showAllPage, setShowAllPage] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Garment Types state
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [garmentsLoading, setGarmentsLoading] = useState(false);

  // Create customer form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isNameDuplicate, setIsNameDuplicate] = useState(false);
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');

  
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
        const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setCustomers(data);
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

  // Debounced check if name already exists in database
  useEffect(() => {
    if (!newName.trim()) {
      setIsNameDuplicate(false);
      return;
    }
    const checkDuplicate = async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(newName.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const hasMatch = data.some((c: Customer) => c.name.toLowerCase() === newName.trim().toLowerCase());
          setIsNameDuplicate(hasMatch);
        }
      } catch (err) {
        console.error('Error checking duplicate name:', err);
      }
    };
    const delay = setTimeout(checkDuplicate, 450);
    return () => clearTimeout(delay);
  }, [newName, token]);

  // Fetch 6 newly added customers
  const fetchRecentCustomers = async () => {
    if (!token) return;
    setRecentLoading(true);
    try {
      const res = await fetch('/api/customers?page=1&limit=4&sort=created_at&order=desc', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecentCustomers(data);
      }
    } catch (err) {
      console.error('Error fetching recent customers:', err);
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentCustomers();
  }, [token]);

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

    if (isNameDuplicate && (!newPhone || newPhone.trim() === '')) {
      setCreateError('A customer with this name already exists. A Phone Number is required to save a duplicate name.');
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
      setInitialMeasurements({});
      
      // Auto-select newly created customer
      setSelectedCustomer(data);
      setIsCreating(false);

      // Refresh customers list
      setSearchQuery('');
      fetchRecentCustomers();
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

  if (showAllPage) {
    return (
      <div className="card animate-fade-in space-y-3">
        {/* Full Customers Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <button
              onClick={() => setShowAllPage(false)}
              className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 transition-colors uppercase tracking-wider mb-1 cursor-pointer bg-transparent border-none p-0"
            >
              ← Back to Dashboard / Profiles
            </button>
            <h1 className="text-xl font-bold text-brand-sidebar font-display">Customer Database</h1>
          </div>
          
          <button
            onClick={() => {
              setShowAllPage(false);
              setIsCreating(true);
              setSelectedCustomer(null);
              const enabled = garmentTypes.filter(g => g.enabled);
              if (enabled.length > 0) {
                setSelectedGarmentTypeId(enabled[0].id);
              }
              setInitialMeasurements({});
            }}
            className="btn-primary self-start sm:self-auto"
          >
            <UserPlus className="icon-sm text-brand-sky" />
            Add Customer
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 icon-md text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone..."
            className="input-base pl-10"
          />
        </div>

        {/* Database List Table/Grid */}
        <div className="overflow-x-auto border border-slate-150 rounded-xl">
          <table className="w-full text-left border-collapse text-table-cell">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-400 font-semibold text-table-header">
                <th className="p-4">Customer Name</th>
                <th className="p-4">Mobile Number</th>
                <th className="p-4">Address</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-wider">
                    Searching Database...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-wider">
                    No customers found. Try a different search.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                     <td className="p-4 font-semibold text-slate-900">{c.name}</td>
                    <td className="p-4">
                      {c.phone && !c.phone.startsWith('NO-PHONE-') ? (
                        <span className="flex items-center gap-1.5 text-slate-600 font-semibold">
                          <Phone className="icon-sm text-slate-400 shrink-0" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No phone</span>
                      )}
                    </td>
                    <td className="p-4 break-words min-w-0 max-w-[250px]">{c.address || <span className="text-slate-400 italic">No address</span>}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setShowAllPage(false);
                        }}
                        className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold uppercase tracking-wider rounded-lg text-btn-md transition-[background-color] cursor-pointer border border-sky-100"
                      >
                        View Profile &amp; Measure
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>


      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      
      {/* LEFT COLUMN: Customer Search & List */}
      <div className="lg:col-span-5 card space-y-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-h2 font-semibold text-slate-900 tracking-tight font-display">Customers</h2>
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
                className="btn-primary"
              >
                <UserPlus className="icon-sm text-brand-sky" />
                Add Customer
              </button>
            )}
          </div>

          {!isCreating && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 icon-md text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by name, phone..."
                className="input-base pl-10 pr-10 bg-slate-50 border-slate-150 focus:bg-white focus:ring-sky-50"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="icon-md" />
                </button>
              )}
            </div>
          )}

          {isCreating ? (
            <form onSubmit={handleCreateCustomer} className="space-y-2">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-semibold text-sm text-slate-800 font-display">New Customer</span>
                <button type="button" onClick={() => setIsCreating(false)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold uppercase tracking-wider cursor-pointer bg-transparent border-none">Cancel</button>
              </div>
              {createError && <div className="alert-error text-xs py-2">{createError}</div>}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-3xs font-bold uppercase tracking-wider text-slate-600 mb-0.5">NAME*</label>
                  <input type="text" required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ali Khan" className="input-base" />
                </div>
                <div>
                  <label className="block text-3xs font-bold uppercase tracking-wider text-slate-600 mb-0.5">
                    MOBILE{isNameDuplicate && <span className="text-red-500">*</span>}
                  </label>
                  <input type="tel" required={isNameDuplicate} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="0300-1234567" className={`input-base ${isNameDuplicate ? 'border-amber-300' : ''}`} />
                </div>
                <div className="col-span-2">
                  <label className="block text-3xs font-bold uppercase tracking-wider text-slate-600 mb-0.5">ADDRESS</label>
                  <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="House 45, Tariq Road, Karachi" className="input-base" />
                </div>
              </div>
            </form>
          ) : (
            /* RECENT CUSTOMER OR SEARCH LIST */
            <div className="space-y-3">
              <span className="text-caption-xs font-extrabold text-slate-400 uppercase block">
                {searchQuery ? `Search Results (${customers.length})` : 'Newly Added Customers'}
              </span>

              <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                {loading && (
                  <p className="text-center text-slate-400 py-3 text-caption-xs font-semibold uppercase tracking-wider animate-pulse">Searching...</p>
                )}
                {!loading && searchQuery && customers.length === 0 && (
                  <p className="text-center text-slate-400 py-6 text-caption-xs font-semibold uppercase tracking-wider">No matching customers found.</p>
                )}
                {!searchQuery && recentLoading && recentCustomers.length === 0 && (
                  <p className="text-center text-slate-400 py-3 text-caption-xs font-semibold uppercase tracking-wider animate-pulse">Loading...</p>
                )}
                {!searchQuery && !recentLoading && recentCustomers.length === 0 && (
                  <p className="text-center text-slate-400 py-6 text-caption-xs font-semibold uppercase tracking-wider">No customers found.</p>
                )}
                {(searchQuery ? customers : recentCustomers).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                    }}
                    className={`w-full p-2.5 rounded-lg text-left border transition-[background-color,border-color,color] flex items-center justify-between cursor-pointer ${
                      selectedCustomer?.id === c.id
                        ? 'bg-sky-50/70 border-sky-400 text-sky-900 font-semibold'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                      {c.phone && !c.phone.startsWith('NO-PHONE-') ? (
                        <div className="flex items-center gap-1 text-slate-500 text-caption-xs font-semibold">
                          <Phone className="icon-sm text-slate-400 shrink-0" />
                          <span>{c.phone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-400 text-caption-xs font-medium italic">
                          No phone
                        </div>
                      )}
                    </div>
                    <ChevronRight className={`icon-md shrink-0 ${selectedCustomer?.id === c.id ? 'text-sky-500' : 'text-slate-400'}`} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* "Show More" Button - Always visible at the bottom of the Left Column except when creating customer */}
        {!isCreating && (
          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={() => {
                setShowAllPage(true);
              }}
              className="w-full py-3 px-4 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-xs uppercase tracking-wider rounded-xl border border-sky-200 cursor-pointer text-center flex items-center justify-center gap-1.5 transition-[background-color] shadow-3xs"
            >
              Show More
            </button>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Customer Details & Measurements */}
      <div className="lg:col-span-7 card space-y-3">
        {duplicateAlert && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-start justify-between gap-2.5 animate-fade-in">
            <span>{duplicateAlert}</span>
            <button 
              onClick={() => setDuplicateAlert(null)}
              className="text-amber-500 hover:text-amber-800 font-extrabold cursor-pointer px-1 text-sm shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {selectedCustomer ? (
          <div className="space-y-3 animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-2 space-y-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight uppercase">{selectedCustomer.name}</h1>

              {/* Attributes display - compact 2-column */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-3xs font-semibold text-slate-400 uppercase block">Phone Number</span>
                  {selectedCustomer.phone && !selectedCustomer.phone.startsWith('NO-PHONE-') ? (
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
                      <Phone className="icon-xs text-slate-400 shrink-0" />
                      {selectedCustomer.phone}
                    </span>
                  ) : (
                    <span className="text-caption-xs text-slate-400 italic block mt-0.5">No phone</span>
                  )}
                </div>
                <div>
                  <span className="text-3xs font-semibold text-slate-400 uppercase block">Last Updated</span>
                  <span className="text-xs font-bold text-slate-700 block mt-0.5">
                    {getLastUpdated().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-3xs font-semibold text-slate-400 uppercase block">Address</span>
                  {selectedCustomer.address ? (
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
                      <MapPin className="icon-xs text-slate-400 shrink-0" />
                      {selectedCustomer.address}
                    </span>
                  ) : (
                    <span className="text-caption-xs text-slate-400 italic block mt-0.5">No address</span>
                  )}
                </div>
              </div>

              {/* Extra details inline */}
              {(selectedCustomer.email || selectedCustomer.notes) && (
                <div className="text-caption-xs text-slate-600 font-medium">
                  {selectedCustomer.email && (
                    <p className="flex items-center gap-1">
                      <Mail className="icon-xs text-slate-400" />
                      <span className="font-semibold text-slate-800">{selectedCustomer.email}</span>
                    </p>
                  )}
                  {selectedCustomer.notes && (
                    <div className="flex items-start gap-1.5 mt-1 text-xs">
                      <FileText className="icon-xs mt-0.5 shrink-0 text-slate-400" />
                      <p>{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions panel - compact */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => onBookOrder(selectedCustomer)} className="btn-primary py-2">
                  <ShoppingCart className="icon-sm text-brand-sky" />
                  Create New Order
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer rounded-lg border transition-colors ${
                    showHistory
                      ? 'bg-sky-50 border-brand-sky text-sky-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="icon-sm text-sky-500" />
                  Orders ({orderHistory.length})
                </button>
              </div>
            </div>

            {/* ORDER HISTORY TOGGLE AREA */}
            {showHistory && (
              <div className="border-t border-slate-150 pt-3 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider font-display">Order History ({orderHistory.length})</h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-slate-500 hover:text-slate-800 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                  >
                    Hide History
                  </button>
                </div>

                {historyLoading ? (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-4 text-center">Loading orders...</p>
                ) : orderHistory.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-4 text-center">No orders booked yet for this customer.</p>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {orderHistory.map((order) => (
                      <div key={order.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm font-display">{order.order_number}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-extrabold uppercase ${
                              order.status === 'Ready' || order.status === 'Ready to Deliver'
                                ? 'bg-emerald-100 text-emerald-700'
                                : order.status === 'Delivered'
                                ? 'bg-slate-100 text-slate-600'
                                : order.status === 'Pending'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
                            Booked: {new Date(order.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} • Due: {new Date(order.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </p>
                          <div className="text-sm text-slate-600 font-medium">
                            Items: {(order.items || []).map(it => it.type).join(', ')}
                          </div>
                        </div>
                        <div className="text-right space-y-1 shrink-0">
                          <span className="text-base font-black text-slate-800 block font-display">
                            {currency}{order.total_amount}
                          </span>
                          {order.total_amount - order.paid_amount > 0 ? (
                            <span className="text-xs bg-red-50 text-red-700 font-semibold px-2 py-1 rounded border border-red-100">
                              Due: {currency}{order.total_amount - order.paid_amount}
                            </span>
                          ) : (
                            <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-1 rounded border border-emerald-100">
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
            <div className="space-y-4 pt-3 border-t border-slate-100">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-h3 font-semibold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                    <Layers className="icon-md text-brand-sky" />
                    MEASUREMENTS
                  </h3>
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
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-caption-xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-[background-color]"
                    >
                      <Plus className="icon-xs text-brand-sky" />
                      Add Profile
                    </button>
                    {profiles.length > 0 && (
                      <button
                        onClick={handlePrintAllProfiles}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-caption-xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-[background-color] border border-slate-200"
                      >
                        <Printer className="icon-sm text-slate-500" />
                        Print All
                      </button>
                    )}
                  </div>
                )}
              </div>

              {measSuccess && (
                <div className="alert-success animate-fade-in">
                  Measurements saved successfully!
                </div>
              )}

              {measError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">
                  {measError}
                </div>
              )}

              {/* Inline form: Add Another Garment Profile */}
              {isAddingProfile ? (
                <form onSubmit={handleAddProfile} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 shadow-3xs animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="icon-xs text-amber-500" />
                      Add Garment Profile
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingProfile(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="icon-xs" />
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
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white uppercase tracking-wider"
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
                          <p className="text-xs text-slate-400 italic text-center py-2">
                            No parameter fields declared for this garment type.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2 p-2 bg-white rounded-lg border border-slate-150">
                            {chosen.measurement_fields.map((field) => (
                              <div key={field.name} className="flex flex-col min-w-0">
                                <label className="text-3xs font-bold text-slate-500 uppercase tracking-wide break-words leading-snug">
                                  {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                                </label>
                                <input
                                  type="text"
                                  required={field.required}
                                  placeholder={field.required ? 'Required' : '--'}
                                  value={newProfileMeasurements[field.name] ?? ''}
                                  onChange={(e) => {
                                    setNewProfileMeasurements(prev => ({
                                      ...prev,
                                      [field.name]: e.target.value
                                    }));
                                  }}
                                  className="mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 text-xs focus-visible:outline-none focus:border-brand-sky"
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
                      className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold text-3xs uppercase tracking-wider rounded-lg cursor-pointer transition-colors"
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
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border-2 transition-[background-color,border-color,color] cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 border-brand-sky text-sky-700 shadow-2xs'
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
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                    <div />

                    <div className="flex items-center gap-1.5">
                      {editingProfileId === activeProfile.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingProfileId(null)}
                            className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-extrabold text-caption-xs uppercase tracking-wider cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditProfileSave(activeProfile.id)}
                            className="px-3 py-1.5 bg-brand-sidebar hover:bg-brand-active text-white font-black text-caption-xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Check className="icon-sm text-brand-sky" />
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
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors"
                            title="Edit measurements"
                            aria-label="Edit profile"
                          >
                            <Edit2 className="icon-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintSingleProfile(activeProfile.id)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors"
                            title="Print profile sheet"
                            aria-label="Print measurements"
                          >
                            <Printer className="icon-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(activeProfile.id, activeProfile.garment_name)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete profile"
                            aria-label="Delete profile"
                          >
                            <Trash2 className="icon-sm" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Render fields inside profile */}
                  {editingProfileId === activeProfile.id ? (
                    /* EDITING MEASUREMENTS FOR THIS PROFILE */
                    activeGarmentType ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2 bg-white p-3 rounded-lg border border-slate-200">
                        {activeGarmentType.measurement_fields.map((field) => (
                          <div key={field.name} className="flex flex-col min-w-0">
                            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wide break-words leading-snug">
                              {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                            </label>
                            <input
                              type="text"
                              required={field.required}
                              value={editingProfileMeasurements[field.name] ?? ''}
                              onChange={(e) => {
                                setEditingProfileMeasurements(prev => ({
                                  ...prev,
                                  [field.name]: e.target.value
                                }));
                              }}
                              placeholder={field.required ? 'Required' : '--'}
                              className="mt-0.5 px-2.5 py-1.5 bg-brand-bg border border-slate-200 rounded-lg text-slate-800 font-semibold text-xs focus-visible:outline-none focus:border-brand-sky"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2 bg-white p-3 rounded-lg border border-slate-200">
                        {Object.keys(activeProfile.values).map((fieldName) => (
                          <div key={fieldName} className="flex flex-col min-w-0">
                            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wide break-words leading-snug">
                              {fieldName} ({getUnitAbbreviation(measurementUnit)})
                            </label>
                            <input
                              type="text"
                              value={editingProfileMeasurements[fieldName] ?? ''}
                              onChange={(e) => {
                                setEditingProfileMeasurements(prev => ({
                                  ...prev,
                                  [fieldName]: e.target.value
                                }));
                              }}
                              placeholder="--"
                              className="mt-0.5 px-2.5 py-1.5 bg-brand-bg border border-slate-200 rounded-lg text-slate-800 font-semibold text-xs focus-visible:outline-none focus:border-brand-sky"
                            />
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    /* READ-ONLY DISPLAY */
                    activeGarmentType ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {activeGarmentType.measurement_fields.map((field) => {
                          const val = activeProfile.values[field.name];
                          return (
                            <div key={field.name} className="p-2.5 bg-white border border-slate-150 rounded-lg flex flex-col justify-between min-w-0">
                              <span className="text-3xs font-bold text-slate-400 uppercase break-words leading-tight">
                                {field.name}
                              </span>
                              <span className="text-sm font-black text-slate-800 mt-0.5 block">
                                {val !== undefined && val !== '' ? (
                                  <span className="flex items-baseline gap-0.5">
                                    {val}
                                    <span className="text-3xs font-semibold text-slate-400 ml-0.5">
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
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {Object.keys(activeProfile.values).map((fieldName) => {
                          const val = activeProfile.values[fieldName];
                          return (
                            <div key={fieldName} className="p-2.5 bg-white border border-slate-150 rounded-lg flex flex-col justify-between min-w-0">
                              <span className="text-3xs font-bold text-slate-400 uppercase break-words leading-tight">
                                {fieldName}
                              </span>
                              <span className="text-sm font-black text-slate-800 mt-0.5 block">
                                {val !== undefined && val !== '' ? (
                                  <span className="flex items-baseline gap-0.5">
                                    {val}
                                    <span className="text-3xs font-semibold text-slate-400 ml-0.5">
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
                    )
                  )}

                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider pt-2 flex justify-between">
                    <span>Created: {new Date(activeProfile.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                    <span>Updated: {new Date(activeProfile.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  </div>

                </div>
              )}

              {/* No profiles placeholder */}
              {!isAddingProfile && profiles.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
                  <Layers className="w-10 h-10 text-slate-300 animate-pulse mb-3" />
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">No Measurement Profiles</h4>
                  <p className="text-slate-400 text-3xs font-semibold uppercase tracking-widest max-w-xs mt-1 leading-relaxed">
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
                    className="mt-4 px-4 py-2 bg-brand-sidebar hover:bg-slate-800 text-white font-extrabold text-3xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="icon-xs text-brand-sky" />
                    Create First Profile
                  </button>
                </div>
              )}

            </div>
          </div>
        ) : isCreating ? (
          <div className="flex flex-col h-full animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3 mb-3">
              <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Sparkles className="icon-sm text-brand-sky" />
                Measurements
              </h3>
            </div>

            {/* Garment Type Selector */}
            <div className="mb-3">
              <select
                id="garment-profile-selector"
                value={selectedGarmentTypeId}
                onChange={(e) => {
                  setSelectedGarmentTypeId(e.target.value);
                  setInitialMeasurements({});
                }}
                className="select-base text-xs"
              >
                {garmentTypes.filter(g => g.enabled).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Initial Measurements */}
            {selectedGarmentTypeForNewCustomer && (
              <div className="flex-1 min-h-0">
                {selectedGarmentTypeForNewCustomer.measurement_fields.length === 0 ? (
                  <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-center text-xs text-slate-400 font-semibold uppercase tracking-wide">
                    No custom fields defined for this garment type.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5 p-3 border border-slate-200 rounded-lg bg-slate-50">
                    {selectedGarmentTypeForNewCustomer.measurement_fields.map((field) => (
                      <div key={field.name} className="flex flex-col min-w-0">
                        <label className="text-3xs font-bold text-slate-500 uppercase tracking-wide break-words leading-snug">
                          {field.name} {field.required ? '*' : ''} ({getUnitAbbreviation(measurementUnit)})
                        </label>
                        <input
                          id={`input-meas-${field.name.toLowerCase().replace(/\s+/g, '-')}`}
                          type="text"
                          required={field.required}
                          placeholder={field.required ? 'Required' : '--'}
                          value={initialMeasurements[field.name] ?? ''}
                          onChange={(e) => handleInitMeasChange(field.name, e.target.value)}
                          className="mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs font-semibold focus-visible:outline-none focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20"
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
              className="btn-success w-full mt-3"
            >
              <Check className="icon-xs" />
              Save Customer Profile
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center print:hidden">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 font-display">No Customer Selected</h3>
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
            {shopLogo && (
              <img src={shopLogo} alt="Logo" className="h-16 w-auto mx-auto mb-2 object-contain" />
            )}
            <h1 className="text-3xl font-black tracking-tight uppercase">{shopName || 'Unnamed Tailor Shop'}</h1>
            <h2 className="text-xl font-semibold tracking-wider text-slate-500 uppercase">Customer Measurement Sheet</h2>
            <p className="text-xs">Generated on: {new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })} • Printed by StitchMaster</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pb-4 border-b border-slate-300">
            <div className="space-y-1">
              <p><strong>Customer Name:</strong> {selectedCustomer.name}</p>
              <p><strong>Phone Number:</strong> {selectedCustomer.phone && !selectedCustomer.phone.startsWith('NO-PHONE-') ? selectedCustomer.phone : 'Not Provided'}</p>
            </div>
            <div className="space-y-1 text-right">
              <p><strong>Address:</strong> {selectedCustomer.address || 'Not Provided'}</p>
              <p><strong>Measurement Unit:</strong> {measurementUnit}</p>
              <p><strong>Measurement Status:</strong> {profiles.length > 0 ? 'Active Profiles Available' : 'No Profiles'}</p>
            </div>
          </div>

          {selectedCustomer.notes && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              <p className="font-semibold border-b border-slate-200 pb-1 mb-1">Customer Notes / Style Preferences:</p>
              <p className="italic text-slate-700">{selectedCustomer.notes}</p>
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
              <p className="font-semibold text-slate-500 uppercase">Master Tailor Signature</p>
            </div>
            <div className="text-center w-40">
              <div className="border-b border-slate-400 h-8 mb-1"></div>
              <p className="font-semibold text-slate-500 uppercase">Customer Acknowledgment</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
