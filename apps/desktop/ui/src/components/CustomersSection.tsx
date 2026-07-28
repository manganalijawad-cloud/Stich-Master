/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Search, 
  UserPlus, 
  Phone, 
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
import { Customer, Order, GarmentType, MeasurementProfile } from '../types';
import { printPage } from '../lib/print';
import { createCustomerWithMeasurements } from '../lib/createCustomer';
import { validateGarmentMeasurementsCompleted, validateMobileNumber } from '../lib/validation';
import {
  CustomerName,
  DeliveryDateText,
  MoneyTotal,
  OrderId,
  PaymentChip,
  StatusBadge,
} from './ui/ScanValue';
import { localDataStore } from '../lib/localDataStore';
import { useLocalData } from '../lib/useLocalData';
import { cacheCustomer, cacheMeasurements, cacheOrder, removeCachedCustomer } from '../lib/useLocalData';
import { countCustomerDueOrders, getCustomerOutstanding, getOrderRemaining } from '../lib/orderPayment';
import { focusElement, isEditableTarget, isMod, matchHotkeys } from '../lib/keyboard';

interface CustomersSectionProps {
  token: string;
  currency: string;
  onBookOrder: (customer: Customer) => void;
  onOpenOrder?: (orderId: string) => void;
  selectedCustomerId?: string;
  shopName?: string;
  shopLogo?: string;
  measurementUnit?: 'Inches' | 'Centimeters' | 'Feet';
  isOwnerMode?: boolean;
}

export default function CustomersSection({
  token,
  currency,
  onBookOrder,
  onOpenOrder,
  selectedCustomerId,
  shopName,
  shopLogo,
  measurementUnit = 'Inches',
  isOwnerMode = false,
}: CustomersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [showAllPage, setShowAllPage] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Garment Types — from offline bootstrap cache
  const localData = useLocalData();
  const garmentTypes = localData.garmentTypes as GarmentType[];
  const garmentsLoading = localData.hydrating && !localData.ready;

  // Create customer form state
  const [isCreating, setIsCreating] = useState(false);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);
  const customerListRef = useRef<HTMLDivElement | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isNameDuplicate, setIsNameDuplicate] = useState(false);
  const [newAddress, setNewAddress] = useState('');

  
  // Selected garment type for NEW customer
  const [selectedGarmentTypeId, setSelectedGarmentTypeId] = useState<string>('');
  const [initialMeasurements, setInitialMeasurements] = useState<Record<string, string | number>>({});

  const [createError, setCreateError] = useState<string | null>(null);
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

  // Customer editing state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({
    name: '',
    phone: '',
    address: '',
  });

  // Error/Success state for measurements/profiles edits
  const [measError, setMeasError] = useState<string | null>(null);
  const [measSuccess, setMeasSuccess] = useState(false);

  // Order history
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Customer outstanding from local bootstrap cache (POS-style balance badge)
  const outstandingByCustomerId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of localData.customers || []) {
      const due = getCustomerOutstanding(localDataStore.getOrdersForCustomer(c.id));
      if (due > 0) map[c.id] = due;
    }
    return map;
  }, [localData.customers, localData.version]);

  const selectedOutstanding = useMemo(() => {
    if (!selectedCustomer) return 0;
    if (!historyLoading) return getCustomerOutstanding(orderHistory);
    return outstandingByCustomerId[selectedCustomer.id] || 0;
  }, [selectedCustomer, orderHistory, historyLoading, outstandingByCustomerId]);

  const selectedDueOrderCount = useMemo(() => {
    if (!selectedCustomer) return 0;
    if (!historyLoading) return countCustomerDueOrders(orderHistory);
    return countCustomerDueOrders(localDataStore.getOrdersForCustomer(selectedCustomer.id));
  }, [selectedCustomer, orderHistory, historyLoading, localData.version]);

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

  // Prefer first enabled garment when reference data arrives
  useEffect(() => {
    if (!garmentTypes.length) return;
    const enabledGarments = garmentTypes.filter((g) => g.enabled);
    const first = enabledGarments[0] || garmentTypes[0];
    if (first) {
      setSelectedGarmentTypeId((prev) => prev || first.id);
      setNewProfileGarmentTypeId((prev) => prev || first.id);
    }
  }, [garmentTypes]);

  // Resolve deep-linked customer by ID from local cache (fallback API)
  useEffect(() => {
    if (!selectedCustomerId || !token) return;

    const cached = localDataStore.getCustomerById(selectedCustomerId);
    if (cached) {
      setSelectedCustomer(cached);
      return;
    }

    let cancelled = false;
    const loadSelectedCustomer = async () => {
      try {
        const res = await fetch(`/api/customers/${selectedCustomerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const customer: Customer = await res.json();
        if (!cancelled) {
          cacheCustomer(customer);
          setSelectedCustomer(customer);
        }
      } catch (err) {
        console.error('Error loading selected customer:', err);
      }
    };

    loadSelectedCustomer();
    return () => { cancelled = true; };
  }, [selectedCustomerId, token, localData.version]);

  // Instant local customer search (no network)
  useEffect(() => {
    if (!localData.ready) {
      // Store not ready yet — keep previous list; avoid spinner flash on remount when empty
      if (!localData.hydrating) setLoading(false);
      else setLoading(true);
      return;
    }
    setLoading(false);
    setCustomers(localDataStore.searchCustomers(searchQuery));
  }, [searchQuery, localData.ready, localData.version, localData.hydrating]);

  // Instant duplicate-name check from local cache
  useEffect(() => {
    if (!newName.trim()) {
      setIsNameDuplicate(false);
      return;
    }
    if (!localData.ready) return;
    setIsNameDuplicate(localDataStore.nameExists(newName));
  }, [newName, localData.ready, localData.version]);

  // Recent customers from local cache
  useEffect(() => {
    if (!localData.ready) {
      setRecentLoading(localData.hydrating);
      return;
    }
    setRecentLoading(false);
    setRecentCustomers(localDataStore.getRecentCustomers(4));
  }, [localData.ready, localData.version, localData.hydrating]);

  const fetchRecentCustomers = async () => {
    if (localData.ready) {
      setRecentCustomers(localDataStore.getRecentCustomers(4));
      return;
    }
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

  const selectedCustomerIdKey = selectedCustomer?.id ?? null;

  // Reset panel chrome only when the selected customer changes (not on cache version bumps)
  useEffect(() => {
    setMeasSuccess(false);
    setMeasError(null);
    setShowHistory(false);
    setIsAddingProfile(false);
    setEditingProfileId(null);
    setEditingProfileMeasurements({});
    setEditingCustomer(false);
    setPrintProfileId(null);
  }, [selectedCustomerIdKey]);

  // Auto-load measurements + order history when customer selected
  useEffect(() => {
    if (!selectedCustomerIdKey) {
      setProfiles([]);
      setActiveProfileId(null);
      setMeasurementsUpdatedAt(null);
      setOrderHistory([]);
      return;
    }

    const customerId = selectedCustomerIdKey;
    let cancelled = false;

    const applyMeasurementPayload = (data: any) => {
      const rawData = data?.data || {};
      let parsedProfiles: MeasurementProfile[] = [];
      if (Array.isArray(rawData.profiles)) {
        parsedProfiles = rawData.profiles;
      } else if (Object.keys(rawData).length > 0) {
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
      if (cancelled) return;
      setProfiles(parsedProfiles);
      setActiveProfileId(parsedProfiles.length > 0 ? parsedProfiles[0].id : null);
      setMeasurementsUpdatedAt(data?.updated_at || null);
    };

    const cached = localDataStore.getMeasurements(customerId);
    if (cached) {
      applyMeasurementPayload(cached);
    } else {
      setProfiles([]);
      setActiveProfileId(null);
      setMeasurementsUpdatedAt(null);
      void (async () => {
        try {
          const res = await fetch(`/api/customers/${customerId}/measurements`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok || cancelled) return;
          const data = await res.json();
          cacheMeasurements(customerId, {
            id: data.id,
            customer_id: customerId,
            data: data.data || {},
            created_at: data.created_at,
            updated_at: data.updated_at,
          });
          applyMeasurementPayload(data);
        } catch (err) {
          console.error('Error fetching measurements:', err);
        }
      })();
    }

    const fetchOrderHistory = async () => {
      const cachedOrders = localDataStore.getOrdersForCustomer(customerId);
      if (cachedOrders.length > 0) {
        if (!cancelled) {
          setOrderHistory(cachedOrders);
          setHistoryLoading(false);
        }
      } else if (!cancelled) {
        setHistoryLoading(true);
      }
      try {
        const res = await fetch(`/api/customers/${customerId}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;
        if (!cancelled) setOrderHistory(data);
        for (const o of data) cacheOrder(o);
      } catch (err) {
        console.error('Error fetching order history:', err);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    void fetchOrderHistory();
    return () => { cancelled = true; };
    // Intentionally omit localData.version: caching orders/measurements bumps it and would
    // re-run this effect, reset the Orders panel, and loop network fetches.
  }, [selectedCustomerIdKey, token, garmentTypes]);

  // Handle Customer Creation with first Measurement Profile automatically created
  const handleCreateCustomer = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setCreateError(null);
    setDuplicateAlert(null);

    const selectedGarment = garmentTypes.find(g => g.id === selectedGarmentTypeId);
    const result = await createCustomerWithMeasurements({
      token,
      name: newName,
      phone: newPhone,
      address: newAddress,
      isNameDuplicate,
      garment: selectedGarment,
      measurements: initialMeasurements,
    });

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    if (result.alreadyExists) {
      setDuplicateAlert(`Customer "${result.customer.name}" already exists with this mobile number. Displaying existing profile instead.`);
      setSelectedCustomer(result.customer);
      setIsCreating(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setInitialMeasurements({});
      // Stay on Customers — Book Order is an explicit button, not forced on duplicate.
      return;
    }

    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setInitialMeasurements({});
    setSelectedCustomer(result.customer);
    setIsCreating(false);
    setSearchQuery('');
    fetchRecentCustomers();
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
      cacheMeasurements(selectedCustomer.id, {
        id: data.id,
        customer_id: selectedCustomer.id,
        data: { profiles: updatedProfiles },
        created_at: data.created_at,
        updated_at: data.updated_at || new Date().toISOString(),
      });
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
    const measError = validateGarmentMeasurementsCompleted(selectedGarment, newProfileMeasurements);
    if (measError || !selectedGarment) {
      setMeasError(measError || 'Please select a garment type and enter measurements.');
      return;
    }

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

  const handleStartEditCustomer = () => {
    if (!selectedCustomer) return;
    setEditCustomerForm({
      name: selectedCustomer.name,
      phone: selectedCustomer.phone && !selectedCustomer.phone.startsWith('NO-PHONE-')
        ? selectedCustomer.phone
        : '',
      address: selectedCustomer.address || '',
    });
    setEditingCustomer(true);
    if (activeProfileId) {
      setEditingProfileId(activeProfileId);
      setEditingProfileMeasurements({ ...profiles.find(p => p.id === activeProfileId)?.values || {} });
    }
  };

  const handleStartEditMeasurements = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    setActiveProfileId(profileId);
    setEditingProfileId(profileId);
    setEditingProfileMeasurements({ ...profile.values });
    setIsAddingProfile(false);
  };

  const handleCancelEditMeasurements = () => {
    setEditingProfileId(null);
    setEditingProfileMeasurements({});
  };

  const handleCancelEditCustomer = () => {
    setEditingCustomer(false);
    setEditingProfileId(null);
    setEditingProfileMeasurements({});
  };

  const handleSaveCurrentProfileMeasurements = async () => {
    if (!editingProfileId) return;
    const updatedProfiles = profiles.map(p => {
      if (p.id === editingProfileId) {
        return { ...p, values: editingProfileMeasurements, updated_at: new Date().toISOString() };
      }
      return p;
    });
    await handleSaveProfiles(updatedProfiles);
  };

  const handleSaveCustomer = async () => {
    if (!selectedCustomer) return;
    setMeasError(null);
    try {
      if (!editCustomerForm.name.trim()) {
        setMeasError('Customer Name is required.');
        return;
      }

      const phoneError = validateMobileNumber(editCustomerForm.phone, false);
      if (phoneError) {
        setMeasError(phoneError);
        return;
      }

      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editCustomerForm.name.trim(),
          phone: editCustomerForm.phone.trim(),
          address: editCustomerForm.address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update customer.');

      setSelectedCustomer(data);
      cacheCustomer(data);

      await handleSaveCurrentProfileMeasurements();

      setEditingCustomer(false);
      setEditingProfileId(null);
      setEditingProfileMeasurements({});
      setMeasSuccess(true);
      setTimeout(() => setMeasSuccess(false), 4000);
    } catch (err: any) {
      setMeasError(err.message);
    }
  };

  const handlePrintCustomer = () => {
    setPrintProfileId(null);
    setTimeout(() => {
      printPage();
    }, 150);
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer) return;
    if (!isOwnerMode) {
      alert('Only available in Owner mode. Unlock Owner mode with your password to delete customers.');
      return;
    }
    if (!confirm(`Are you absolutely sure you want to delete customer "${selectedCustomer.name}"? This will permanently delete the customer record and all associated measurement profiles. This action is irreversible.`)) {
      return;
    }
    fetch(`/api/customers/${selectedCustomer.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to delete customer.');
        }
        removeCachedCustomer(selectedCustomer.id);
        setSelectedCustomer(null);
        setProfiles([]);
        setActiveProfileId(null);
        setMeasurementsUpdatedAt(null);
        fetchRecentCustomers();
      })
      .catch((err: any) => {
        setMeasError(err.message);
      });
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
  const newCustomerMeasError = validateGarmentMeasurementsCompleted(
    selectedGarmentTypeForNewCustomer,
    initialMeasurements
  );
  const canSaveNewCustomer = !!newName.trim() && !newCustomerMeasError;

  // Hooks must run before any early return (Show More full list) or React crashes.
  const startCreateCustomer = useCallback(() => {
    setIsCreating(true);
    setSelectedCustomer(null);
    const enabled = garmentTypes.filter(g => g.enabled);
    if (enabled.length > 0) setSelectedGarmentTypeId(enabled[0].id);
    setInitialMeasurements({});
  }, [garmentTypes]);

  // Customers hotkeys
  useEffect(() => {
    if (showAllPage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      matchHotkeys(e, [
        (ev) => {
          if (ev.key === 'Escape' && isCreating) {
            setIsCreating(false);
            return true;
          }
        },
        (ev) => {
          if (isCreating) return;
          if (isMod(ev) && (ev.key === 'n' || ev.key === 'N')) {
            startCreateCustomer();
            return true;
          }
          if ((isMod(ev) && (ev.key === 'f' || ev.key === 'F')) || (ev.key === '/' && !isEditableTarget(ev.target))) {
            focusElement(customerSearchRef.current);
            return true;
          }
          if (!isEditableTarget(ev.target) && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
            const list = searchQuery ? customers : recentCustomers;
            if (!list.length) return;
            const current = list.findIndex(c => c.id === selectedCustomer?.id);
            const next = ev.key === 'ArrowDown'
              ? Math.min((current < 0 ? -1 : current) + 1, list.length - 1)
              : Math.max((current < 0 ? list.length : current) - 1, 0);
            const cust = list[next];
            if (cust) {
              setSelectedCustomer(cust);
              const row = customerListRef.current?.querySelector(`[data-customer-index="${next}"]`) as HTMLElement | null;
              row?.scrollIntoView({ block: 'nearest' });
            }
            return true;
          }
          if (isMod(ev) && (ev.key === 'p' || ev.key === 'P') && selectedCustomer) {
            // print measurements if handler exists via button click
            const btn = document.getElementById('customers-print-btn') as HTMLButtonElement | null;
            btn?.click();
            return true;
          }
        },
      ]);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showAllPage, isCreating, searchQuery, customers, recentCustomers, selectedCustomer, startCreateCustomer]);

  if (showAllPage) {
    return (
      <div className="card animate-fade-in stack-md">
        {/* Full Customers Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <button
              onClick={() => setShowAllPage(false)}
              className="btn-ghost text-xs !px-0 !min-h-0 mb-1"
            >
              ← Back to customers
            </button>
            <h1 className="text-h1">Customers</h1>
          </div>
          
          <button
            onClick={() => {
              setShowAllPage(false);
              startCreateCustomer();
            }}
            className="btn-primary self-start sm:self-auto"
          >
            <UserPlus className="icon-sm" />
            Add Customer
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 icon-sm text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone..."
            className="input-base pl-9"
          />
        </div>

        {/* Database List Table/Grid */}
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-th">Customer Name</th>
                <th className="table-th">Mobile Number</th>
                <th className="table-th">Address</th>
                <th className="table-th text-right">Balance</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center text-muted font-semibold">
                    Searching...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td">
                    <div className="empty-state py-8">
                      <p className="empty-state-title">No customers found</p>
                      <p className="empty-state-text">Try a different search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const due = outstandingByCustomerId[c.id] || 0;
                  return (
                  <tr key={c.id} className="table-tr">
                     <td className="table-td"><span className="text-customer-name">{c.name}</span></td>
                    <td className="table-td">
                      {c.phone && !c.phone.startsWith('NO-PHONE-') ? (
                        <span className="flex items-center gap-1.5 text-secondary font-semibold">
                          <Phone className="icon-sm text-slate-400 shrink-0" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="text-muted italic">No phone</span>
                      )}
                    </td>
                    <td className="table-td break-words min-w-0">{c.address || <span className="text-muted italic">No address</span>}</td>
                    <td className="table-td text-right">
                      {due > 0 ? (
                        <PaymentChip currency={currency} remaining={due} />
                      ) : (
                        <span className="text-3xs text-muted font-semibold uppercase tracking-wider">—</span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setShowAllPage(false);
                        }}
                        className="btn-secondary"
                      >
                        View Profile &amp; Measure
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>


      </div>
    );
  }

  return (
    <div className="desk-fill grid grid-cols-1 lg:grid-cols-12 gap-2 items-stretch min-h-0">
      
      {/* LEFT COLUMN: Customer Search & List */}
      <div className="lg:col-span-5 card-dense stack-xs flex flex-col min-h-0 overflow-hidden h-full">
        <div className="stack-sm flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h2 className="text-h2">Customers</h2>
            {!isCreating && (
              <button
                onClick={startCreateCustomer}
                className="btn-primary"
                title="New customer (Ctrl+N)"
              >
                <UserPlus className="icon-sm" />
                Add Customer
                <kbd className="hidden xl:inline text-[9px] font-mono opacity-70 ml-1">Ctrl+N</kbd>
              </button>
            )}
          </div>

          {!isCreating && (
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 icon-sm text-slate-400" />
              <input
                ref={customerSearchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers… (/ or Ctrl+F)"
                className="input-base pl-9 pr-9"
                aria-label="Search customers"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="icon-sm" />
                </button>
              )}
            </div>
          )}

          {isCreating ? (
            <form onSubmit={handleCreateCustomer} className="stack-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-h3">New Customer</span>
                <button type="button" onClick={() => setIsCreating(false)} className="btn-ghost text-xs">Cancel</button>
              </div>
              {createError && <div className="alert-error text-xs py-2">{createError}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label">Name*</label>
                  <input type="text" required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ali Khan" className="input-base" />
                </div>
                <div>
                  <label className="text-label">
                    Mobile{isNameDuplicate && <span className="text-feedback-error">*</span>}
                  </label>
                  <input type="tel" required={isNameDuplicate} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="0300-1234567" className={`input-base ${isNameDuplicate ? 'input-error' : ''}`} />
                </div>
                <div className="col-span-2">
                  <label className="text-label">Address</label>
                  <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="House 45, Tariq Road, Karachi" className="input-base" />
                </div>
              </div>
            </form>
          ) : (
            /* RECENT CUSTOMER OR SEARCH LIST */
            <div className="stack-sm flex-1 min-h-0 flex flex-col">
                <span className="text-caption-xs font-bold uppercase shrink-0">
                  {searchQuery ? `Search Results (${customers.length})` : 'Newly Added Customers'}
                </span>

              <div ref={customerListRef} className="panel-scroll space-y-1 pr-0.5">
                {loading && (
                  <p className="text-center text-muted py-3 text-caption-xs font-semibold">Searching...</p>
                )}
                {!loading && searchQuery && customers.length === 0 && (
                  <div className="empty-state py-8">
                    <p className="empty-state-title">No matches</p>
                    <p className="empty-state-text">Try another name or phone number.</p>
                  </div>
                )}
                {!searchQuery && recentLoading && recentCustomers.length === 0 && (
                  <p className="text-center text-muted py-3 text-caption-xs font-semibold">Loading...</p>
                )}
                {!searchQuery && !recentLoading && recentCustomers.length === 0 && (
                  <div className="empty-state py-8">
                    <UserPlus className="empty-state-icon" aria-hidden="true" />
                    <p className="empty-state-title">No customers yet</p>
                    <p className="empty-state-text">Add a customer to start taking measurements and orders.</p>
                  </div>
                )}
                {(searchQuery ? customers : recentCustomers).map((c, cIdx) => {
                  const due = outstandingByCustomerId[c.id] || 0;
                  return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                    }}
                    data-customer-index={cIdx}
                    className={`list-row list-row-dense ${selectedCustomer?.id === c.id ? 'list-row-selected' : ''}`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <CustomerName name={c.name} as="p" className="truncate" />
                      {c.phone && !c.phone.startsWith('NO-PHONE-') ? (
                        <div className="flex items-center gap-1 text-secondary text-caption-xs">
                          <Phone className="icon-xs text-slate-400 shrink-0" />
                          <span>{c.phone}</span>
                        </div>
                      ) : (
                        <div className="text-muted text-caption-xs italic">
                          No phone
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {due > 0 && <PaymentChip currency={currency} remaining={due} className="!text-3xs" />}
                      <ChevronRight className={`icon-md shrink-0 ${selectedCustomer?.id === c.id ? 'text-info-600' : 'text-slate-400'}`} />
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* "Show More" only when more customers exist than the recent preview list */}
        {!isCreating && localData.customers.length > recentCustomers.length && (
          <div className="pt-2 border-t border-slate-100 shrink-0">
            <button
              onClick={() => {
                setShowAllPage(true);
              }}
              className="btn-secondary w-full"
            >
              Show More
            </button>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Customer Details & Measurements */}
      <div className="lg:col-span-7 card stack-sm min-h-0 overflow-x-hidden overflow-y-auto lg:h-full">
        {duplicateAlert && (
          <div className="alert-warning text-xs flex items-start justify-between gap-2 animate-fade-in">
            <span>{duplicateAlert}</span>
            <button 
              onClick={() => setDuplicateAlert(null)}
              className="text-feedback-warning hover:opacity-80 font-bold cursor-pointer px-1 text-sm shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {selectedCustomer ? (
          <div className="space-y-2 animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-1.5 space-y-1.5">
              {editingCustomer ? (
                <input
                  type="text"
                  value={editCustomerForm.name}
                  onChange={(e) => setEditCustomerForm(f => ({ ...f, name: e.target.value }))}
                  className="text-base font-bold text-slate-900 tracking-tight uppercase w-full border-b-2 border-sky-300 pb-0.5 bg-transparent focus-visible:outline-none"
                />
              ) : (
                <CustomerName name={selectedCustomer.name} as="h1" className="!text-base tracking-tight uppercase" />
              )}

              {selectedOutstanding > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-warning-200 bg-warning-50 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="text-3xs font-bold uppercase tracking-wider text-feedback-warning">Account balance</p>
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {selectedDueOrderCount} unpaid order{selectedDueOrderCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <PaymentChip currency={currency} remaining={selectedOutstanding} />
                </div>
              )}

              {/* Attributes display - compact 2-column */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                {editingCustomer ? (
                  <>
                    <div>
                      <span className="text-3xs font-semibold text-slate-400 uppercase block">Phone Number</span>
                      <input
                        type="text"
                        value={editCustomerForm.phone}
                        onChange={(e) => setEditCustomerForm(f => ({ ...f, phone: e.target.value }))}
                        className="mt-0.5 px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 w-full"
                      />
                    </div>
                    <div>
                      <span className="text-3xs font-semibold text-slate-400 uppercase block">Last Updated</span>
                      <span className="text-xs font-bold text-slate-700 block mt-0.5">
                        {getLastUpdated().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-3xs font-semibold text-slate-400 uppercase block">Address</span>
                      <input
                        type="text"
                        value={editCustomerForm.address}
                        onChange={(e) => setEditCustomerForm(f => ({ ...f, address: e.target.value }))}
                        className="mt-0.5 px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 w-full"
                      />
                    </div>
                  </>
                ) : (
                  <>
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
                      <span className="text-3xs font-semibold text-slate-400 uppercase flex items-center justify-between">
                        <span>Last Updated</span>
                        <span className="flex items-center gap-0.5">
                          <button
                            onClick={handleStartEditCustomer}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-md cursor-pointer transition-colors"
                            title="Edit customer"
                            aria-label="Edit customer"
                          >
                            <Edit2 className="icon-xs" />
                          </button>
                          <button
                            id="customers-print-btn"
                            onClick={handlePrintCustomer}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-md cursor-pointer transition-colors"
                            title="Print customer profile (Ctrl+P)"
                            aria-label="Print customer"
                          >
                            <Printer className="icon-xs" />
                          </button>
                          {isOwnerMode && (
                          <button
                            onClick={handleDeleteCustomer}
                            className="p-1 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer transition-colors"
                            title="Delete customer"
                            aria-label="Delete customer"
                          >
                            <Trash2 className="icon-xs" />
                          </button>
                          )}
                        </span>
                      </span>
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
                  </>
                )}
              </div>

              {!editingCustomer && (
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100">
                  <button onClick={() => onBookOrder(selectedCustomer)} className="btn-primary py-2">
                    <ShoppingCart className="icon-sm text-brand-sky" />
                    Create New Order
                  </button>
                  {orderHistory.length > 0 && (
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
                  )}
                </div>
              )}
            </div>

            {/* ORDER HISTORY TOGGLE AREA */}
            {showHistory && (
              <div className="border-t border-slate-150 pt-2 space-y-2 animate-fade-in">
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
                  <p className="text-xs font-semibold text-muted py-4 text-center">Loading orders...</p>
                ) : orderHistory.length === 0 ? (
                  <div className="empty-state py-6">
                    <ShoppingCart className="empty-state-icon" aria-hidden="true" />
                    <p className="empty-state-title">No orders yet</p>
                    <p className="empty-state-text">Book an order for this customer to see history here.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[35vh] overflow-y-auto pr-1">
                    {orderHistory.map((order) => {
                      const remaining = getOrderRemaining(order);
                      return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => onOpenOrder?.(order.id)}
                        disabled={!onOpenOrder}
                        className={`list-row ${
                          onOpenOrder ? '' : 'cursor-default opacity-90'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <OrderId value={order.order_number} className="!text-xs" />
                            <StatusBadge status={order.status} />
                          </div>
                          <p className="text-secondary text-xs">
                            Booked: {new Date(order.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} ·{' '}
                            <DeliveryDateText dueDate={order.due_date} short={false} className="!inline" />
                          </p>
                          <div className="text-xs text-secondary truncate">
                            Items: {(Array.isArray(order.items) ? order.items : []).map(it => it.type).join(', ')}
                          </div>
                        </div>
                        <div className="text-right space-y-1 shrink-0">
                          <MoneyTotal
                            currency={currency}
                            amount={order.final_total ?? order.total_amount}
                            className="text-sm block"
                          />
                          <PaymentChip currency={currency} remaining={remaining} status={order.status} />
                          {onOpenOrder && (
                            <span className="text-3xs font-bold text-muted uppercase tracking-wider flex items-center justify-end gap-0.5">
                              Open <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    );})}
                  </div>
                )}
              </div>
            )}

            {/* MEASUREMENT PROFILES COMPONENT SECTION */}
            {!showHistory && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              
              {/* Header */}
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-h3 font-semibold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                  <Layers className="icon-md text-brand-sky" />
                  MEASUREMENTS
                </h3>
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
                <form onSubmit={handleAddProfile} className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 shadow-3xs animate-fade-in">
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
                      {garmentTypes.filter(g => g.enabled && !profiles.some(p => p.garment_type_id === g.id)).map((g) => (
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
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-1.5 p-2 bg-white rounded-lg border border-slate-150">
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
                <div className="flex flex-wrap gap-1.5 pb-1.5 border-b border-slate-100">
                  {profiles.map((p) => {
                    const isSelected = p.id === activeProfileId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setActiveProfileId(p.id);
                          if (editingCustomer || editingProfileId === p.id) {
                            setEditingProfileId(p.id);
                            setEditingProfileMeasurements({ ...p.values });
                          }
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
                  {garmentTypes.filter(g => g.enabled && !profiles.some(p => p.garment_type_id === g.id)).length > 0 && !isAddingProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingProfile(true);
                        setEditingProfileId(null);
                        const available = garmentTypes.filter(g => g.enabled && !profiles.some(p => p.garment_type_id === g.id));
                        if (available.length > 0) {
                          setNewProfileGarmentTypeId(available[0].id);
                        }
                        setNewProfileMeasurements({});
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border-2 border-dashed border-slate-300 text-slate-400 hover:text-sky-700 hover:border-sky-400 hover:bg-sky-50 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="icon-xs" />
                      Add
                    </button>
                  )}
                </div>
              )}

              {/* Opened Profile View Area */}
              {!isAddingProfile && activeProfile && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-fade-in">
                  {!editingCustomer && editingProfileId === activeProfile.id && (
                    <div className="flex items-center justify-end border-b border-slate-200 pb-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelEditMeasurements}
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
                    </div>
                  )}

                  {!editingCustomer && editingProfileId !== activeProfile.id && (
                    <div className="flex items-center justify-end border-b border-slate-200 pb-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditMeasurements(activeProfile.id)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-extrabold text-caption-xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit2 className="icon-sm" />
                        Edit measurements
                      </button>
                    </div>
                  )}

                  {/* Render fields inside profile */}
                  {editingProfileId === activeProfile.id ? (
                    /* EDITING MEASUREMENTS FOR THIS PROFILE */
                    activeGarmentType ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
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
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
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
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {activeGarmentType.measurement_fields.map((field) => {
                          const val = activeProfile.values[field.name];
                          return (
                            <div key={field.name} className="p-2 bg-white border border-slate-150 rounded-lg flex flex-col justify-between min-w-0">
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
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {Object.keys(activeProfile.values).map((fieldName) => {
                          const val = activeProfile.values[fieldName];
                          return (
                            <div key={fieldName} className="p-2 bg-white border border-slate-150 rounded-lg flex flex-col justify-between min-w-0">
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

                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider pt-1.5 flex justify-between">
                    <span>Created: {new Date(activeProfile.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                    <span>Updated: {new Date(activeProfile.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  </div>

                </div>
              )}

              {/* No profiles placeholder */}
              {!isAddingProfile && profiles.length === 0 && (
                <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
                  <Layers className="w-10 h-10 text-slate-300 animate-pulse mb-3" />
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">No saved measurements</h4>
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

              {editingCustomer && (
                <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
                  <button onClick={handleSaveCustomer} className="btn-primary py-2">
                    <Check className="icon-sm text-brand-sky" />
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEditCustomer}
                    className="py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <X className="icon-sm" />
                    Cancel
                  </button>
                </div>
              )}

            </div>
            )}
          </div>
        ) : isCreating ? (
          <div className="flex flex-col h-full animate-fade-in print:hidden">
            {/* Header */}
            <div className="border-b border-slate-100 pb-2 mb-2">
              <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Sparkles className="icon-sm text-brand-sky" />
                Measurements
              </h3>
            </div>

            {/* Garment Type Selector */}
            <div className="mb-2">
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
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-1.5 p-2.5 border border-slate-200 rounded-lg bg-slate-50">
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
              disabled={!canSaveNewCustomer}
              title={newCustomerMeasError || undefined}
              className="btn-success w-full mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="icon-xs" />
              Save Customer Profile
            </button>
          </div>
        ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center print:hidden">
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

      {/* PRINT MEASUREMENT SHEET — id required by @media print visibility rules in index.css */}
      {selectedCustomer && (
        <div id="print-customer-sheet" className="hidden print:block bg-white text-slate-900 p-8 space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2 border-b-2 border-slate-900 pb-5">
            {shopLogo && (
              <img src={shopLogo} alt="Logo" className="h-16 w-auto mx-auto mb-2 object-contain" />
            )}
            <h1 className="text-3xl font-black tracking-tight uppercase">{shopName || 'Unnamed Tailor Shop'}</h1>
            <h2 className="text-xl font-semibold tracking-wider text-slate-500 uppercase">Customer Measurement Sheet</h2>
            <p className="text-xs">Generated on: {new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })} • Printed by Hello Darzi</p>
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
