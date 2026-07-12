/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Calendar, DollarSign, Plus, Trash2, Printer, CheckCircle, Clock, ShieldAlert, ArrowRight, ChevronRight, Edit3, Search, UserPlus, ChevronLeft, Sparkles, Scissors, Palette, Layers, Info, Check } from 'lucide-react';
import { Customer, Order, OrderItem, OrderStatus, UserRole, PipelineStage, GarmentType, StylingCategory, MeasurementProfile } from '../types';
import QRCode from 'qrcode';

interface OrdersSectionProps {
  token: string;
  userRole: UserRole;
  currency: string;
  measurementFields: string[];
  pipelineStages?: PipelineStage[];
  activeCustomerId?: string; // Optional customer to auto-trigger order creation
  onClearActiveCustomer?: () => void;
  activeOrderId?: string;
  onClearActiveOrderId?: () => void;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
}

export default function OrdersSection({
  token,
  userRole,
  currency,
  measurementFields,
  pipelineStages,
  activeCustomerId,
  onClearActiveCustomer,
  activeOrderId,
  onClearActiveOrderId,
  shopName,
  shopPhone,
  shopAddress,
}: OrdersSectionProps) {
  // Dynamic Pipeline Stages
  const stagesList = pipelineStages && pipelineStages.length > 0 ? pipelineStages : [
    { id: 'Pending', name: 'Getting Ready', enabled: true },
    { id: 'Ready to Deliver', name: 'Ready to Deliver', enabled: true },
    { id: 'Delivered', name: 'Delivered', enabled: true },
    { id: 'Archived', name: 'Archived', enabled: true }
  ];

  // Active stages for the queue columns (except Archived and only enabled)
  const activeQueueStages = stagesList.filter(s => s.enabled && s.id !== 'Archived' && s.name.toLowerCase() !== 'archived');
  const activeWorkflowStages = stagesList.filter(s => s.enabled);

  const [orders, setOrders] = useState<Order[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Selected order details
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  // Dynamically generate QR code whenever selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
      // Direct deep link query parameter URL that opens this specific order
      const orderUrl = `${window.location.origin}${window.location.pathname}?orderId=${selectedOrder.id}`;
      QRCode.toDataURL(orderUrl, {
        width: 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((url) => {
          setQrCodeUrl(url);
        })
        .catch((err) => {
          console.error('Failed to generate QR Code data URL:', err);
        });
    } else {
      setQrCodeUrl('');
    }
  }, [selectedOrder]);

  // Load active order if passed from URL query param (e.g. from scanning QR code)
  useEffect(() => {
    if (activeOrderId) {
      const fetchAndSelectOrder = async () => {
        try {
          const res = await fetch(`/api/orders/${activeOrderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const fullOrder = await res.json();
            setSelectedOrder(fullOrder);
            setIsCreating(false);
            setIsEditing(false);
            if (onClearActiveOrderId) {
              onClearActiveOrderId();
            }
          } else {
            console.error('Failed to fetch scanned order. Status:', res.status);
          }
        } catch (err) {
          console.error('Error fetching scanned order:', err);
        }
      };
      fetchAndSelectOrder();
    }
  }, [activeOrderId, token]);
  
  // Create Order Form State
  const [isCreating, setIsCreating] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<OrderItem[]>([{ type: 'Suit', price: 0, notes: '', color: '' }]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // REDESIGNED BOOKING WORKFLOW STATE DEFINITIONS
  interface BookingItem {
    id: string;
    garment_type_id: string;
    type: string;
    price: number;
    delivery_date: string;
    measurement_snapshot: Record<string, string | number>;
    styling_snapshot: Record<string, string>; // categoryId -> optionId
    notes?: string;
    color?: string;
  }

  const [bookingStep, setBookingStep] = useState<'customer' | 'garments' | 'summary'>('customer');
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  // inline customer fields
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [isNameDuplicate, setIsNameDuplicate] = useState(false);
  const [newCustWhatsapp, setNewCustWhatsapp] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');

  // settings data
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [stylingCategories, setStylingCategories] = useState<StylingCategory[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<MeasurementProfile[]>([]);
  const [bookingItems, setBookingItems] = useState<BookingItem[]>([]);
  const [sharedDeliveryDate, setSharedDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });

  const updateSharedDeliveryDate = (newDate: string) => {
    setSharedDeliveryDate(newDate);
    setBookingItems(prev => prev.map(item => ({
      ...item,
      delivery_date: newDate
    })));
  };

  // Edit Order Form State (Owner Only)
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [editedTotal, setEditedTotal] = useState(0);
  const [editedPaid, setEditedPaid] = useState(0);
  const [editedDueDate, setEditedDueDate] = useState('');
  const [editedSnapshot, setEditedSnapshot] = useState<Record<string, string | number>>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Archive & View Vault States
  const [viewMode, setViewMode] = useState<'Active' | 'Archived'>('Active');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreStageId, setRestoreStageId] = useState('Pending');

  // Reopen Delivered Order back to Getting Ready (Pending)
  const reopenOrder = async (order: Order) => {
    if (!confirm('Are you sure you want to reopen this Delivered order? This will unlock it and return it to the "Getting Ready" stage.')) {
      return;
    }
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Pending' })
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedOrder(updated);
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to reopen order.');
      }
    } catch (e) {
      console.error(e);
      alert('Error reopening order.');
    }
  };

  // Restore Archived Order to a Selected Stage
  const restoreOrder = async (order: Order, stageId: string) => {
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: stageId })
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedOrder(updated);
        setRestoreDialogOpen(false);
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to restore order.');
      }
    } catch (e) {
      console.error(e);
      alert('Error restoring order.');
    }
  };

  // Duplicate an Order (Pre-fill booking form)
  const handleDuplicateOrder = async (order: Order) => {
    try {
      const res = await fetch(`/api/customers/${order.customer_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const custData = await res.json();
        const clonedItems = order.items.map(item => ({
          type: item.type,
          price: item.price,
          notes: item.notes || ''
        }));

        setCustomer(custData);
        setItems(clonedItems);
        setTotalAmount(order.total_amount);
        setPaidAmount(0); // Default to 0 advance paid for new booking

        const defaultDue = new Date();
        defaultDue.setDate(defaultDue.getDate() + 10);
        setDueDate(defaultDue.toISOString().split('T')[0]);

        setIsCreating(true);
        setIsEditing(false);
        setSelectedOrder(null);
      } else {
        alert('Could not retrieve customer details for duplication.');
      }
    } catch (err) {
      console.error('Error duplicating order:', err);
      alert('Failed to duplicate order.');
    }
  };

  // Delete Order (with explicit Owner confirmation)
  const handleDeleteOrder = async (order: Order) => {
    if (!confirm(`Are you absolutely sure you want to permanently delete order ${order.order_number}? This action is irreversible and cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedOrder(null);
        fetchOrders();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete order.');
      }
    } catch (err) {
      console.error('Error deleting order:', err);
      alert('Failed to delete order.');
    }
  };

  // Fetch Orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = `/api/orders?status=${activeFilter}&q=${encodeURIComponent(searchQuery)}&page=1&limit=50`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data);
        setPage(1);
        setHasMore(data.length === 50);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [activeFilter, searchQuery, token]);

  const loadMoreOrders = async () => {
    const nextPage = page + 1;
    setLoading(true);
    try {
      const url = `/api/orders?status=${activeFilter}&q=${encodeURIComponent(searchQuery)}&page=${nextPage}&limit=50`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setOrders((prev) => [...prev, ...data]);
        setPage(nextPage);
        setHasMore(data.length === 50);
      }
    } catch (err) {
      console.error('Error loading more orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectOrderWithDetails = async (order: Order) => {
    setSelectedOrder(order); // set immediately for instant feedback
    setIsCreating(false);
    setIsEditing(false);
    
    // Fetch full order (including measurement snapshot)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const fullOrder = await res.json();
        setSelectedOrder(fullOrder);
      }
    } catch (err) {
      console.error('Error fetching full order details:', err);
    }
  };

  // Fetch Garment Types and Styling Categories
  useEffect(() => {
    const fetchGarmentAndStyling = async () => {
      try {
        const [garmentRes, stylingRes] = await Promise.all([
          fetch('/api/garment-types', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/styling-categories', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (garmentRes.ok) {
          const gData = await garmentRes.json();
          setGarmentTypes(gData);
        }
        if (stylingRes.ok) {
          const sData = await stylingRes.json();
          setStylingCategories(sData);
        }
      } catch (err) {
        console.error('Error fetching garment types & styling categories:', err);
      }
    };
    fetchGarmentAndStyling();
  }, [token]);

  // Debounced Customer Search
  useEffect(() => {
    if (bookingStep !== 'customer' || !customerSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(customerSearch)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Error searching customers:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [customerSearch, bookingStep, token]);

  // Debounced check if inline new customer name already exists in database
  useEffect(() => {
    if (!newCustName.trim()) {
      setIsNameDuplicate(false);
      return;
    }
    const checkDuplicate = async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(newCustName.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const hasMatch = data.some((c: Customer) => c.name.toLowerCase() === newCustName.trim().toLowerCase());
          setIsNameDuplicate(hasMatch);
        }
      } catch (err) {
        console.error('Error checking duplicate name:', err);
      }
    };
    const delay = setTimeout(checkDuplicate, 450);
    return () => clearTimeout(delay);
  }, [newCustName, token]);

  // Load customer profiles and initialize booking items when customer selected
  useEffect(() => {
    if (!customer) {
      setCustomerProfiles([]);
      return;
    }
    const loadProfiles = async () => {
      try {
        const res = await fetch(`/api/customers/${customer.id}/measurements`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const mData = await res.json();
          const rawData = mData.data || {};
          let parsedProfiles: MeasurementProfile[] = [];
          if (Array.isArray(rawData.profiles)) {
            parsedProfiles = rawData.profiles;
          }
          setCustomerProfiles(parsedProfiles);

          // Only initialize bookingItems if empty
          if (bookingItems.length === 0 && garmentTypes.length > 0) {
            const firstType = garmentTypes.find(g => g.enabled) || garmentTypes[0];
            if (firstType) {
              const existingProfile = parsedProfiles.find(p => p.garment_type_id === firstType.id);
              const measurement_snapshot: Record<string, string | number> = {};
              if (existingProfile) {
                Object.assign(measurement_snapshot, existingProfile.values);
              } else {
                firstType.measurement_fields.forEach(f => {
                  measurement_snapshot[f.name] = '';
                });
              }

              const styling_snapshot: Record<string, string> = {};
              const enabledCategories = stylingCategories.filter(sc => sc.garment_type_id === firstType.id && sc.options && sc.options.some(o => o.enabled));
              enabledCategories.forEach(cat => {
                if (existingProfile?.styling_preferences?.[cat.id]) {
                  styling_snapshot[cat.id] = existingProfile.styling_preferences[cat.id];
                } else {
                  const firstEnabled = cat.options.find(o => o.enabled);
                  if (firstEnabled) {
                    styling_snapshot[cat.id] = firstEnabled.id;
                  }
                }
              });

              const d = new Date();
              d.setDate(d.getDate() + 10);

              setBookingItems([{
                id: Math.random().toString(36).substring(2, 11),
                garment_type_id: firstType.id,
                type: firstType.name,
                price: 0,
                delivery_date: sharedDeliveryDate || d.toISOString().split('T')[0],
                measurement_snapshot,
                styling_snapshot,
                notes: ''
              }]);
            }
          }
        }
      } catch (err) {
        console.error('Error loading customer profiles:', err);
      }
    };
    loadProfiles();
  }, [customer, garmentTypes, stylingCategories]);

  // Load active customer if passed for order creation
  useEffect(() => {
    if (activeCustomerId) {
      const fetchCustomerDetails = async () => {
        try {
          const res = await fetch(`/api/customers/${activeCustomerId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const matched = await res.json();
            setCustomer(matched);
            setIsCreating(true);
            setBookingStep('garments');
            setSelectedOrder(null);
            setBookingItems([]); // Reset so profiles hook can populate it
          }
        } catch (err) {
          console.error('Error fetching customer details for order:', err);
        }
      };
      fetchCustomerDetails();
    }
  }, [activeCustomerId, token]);

  // Helper to create a single booking item
  const createDefaultBookingItem = (garmentType: GarmentType): BookingItem => {
    const existingProfile = customerProfiles.find(p => p.garment_type_id === garmentType.id);
    const measurement_snapshot: Record<string, string | number> = {};
    if (existingProfile) {
      Object.assign(measurement_snapshot, existingProfile.values);
    } else {
      garmentType.measurement_fields.forEach(f => {
        measurement_snapshot[f.name] = '';
      });
    }

    const styling_snapshot: Record<string, string> = {};
    const enabledCategories = stylingCategories.filter(sc => sc.garment_type_id === garmentType.id && sc.options && sc.options.some(o => o.enabled));
    enabledCategories.forEach(cat => {
      if (existingProfile?.styling_preferences?.[cat.id]) {
        styling_snapshot[cat.id] = existingProfile.styling_preferences[cat.id];
      } else {
        const firstEnabled = cat.options.find(o => o.enabled);
        if (firstEnabled) {
          styling_snapshot[cat.id] = firstEnabled.id;
        }
      }
    });

    const d = new Date();
    d.setDate(d.getDate() + 10);

    return {
      id: Math.random().toString(36).substring(2, 11),
      garment_type_id: garmentType.id,
      type: garmentType.name,
      price: 0,
      delivery_date: sharedDeliveryDate || d.toISOString().split('T')[0],
      measurement_snapshot,
      styling_snapshot,
      notes: '',
      color: ''
    };
  };

  const startNewBooking = () => {
    setCustomer(null);
    setBookingItems([]);
    setCustomerProfiles([]);
    setBookingStep('customer');
    setPaidAmount(0);
    setCreateError(null);
    setCreateSuccess(false);
    setIsCreating(true);
    setSelectedOrder(null);
    const d = new Date();
    d.setDate(d.getDate() + 10);
    setSharedDeliveryDate(d.toISOString().split('T')[0]);
  };

  const handleSelectCustomer = async (cust: Customer) => {
    setCustomer(cust);
    setBookingStep('garments');
    setBookingItems([]);
    const d = new Date();
    d.setDate(d.getDate() + 10);
    setSharedDeliveryDate(d.toISOString().split('T')[0]);
  };

  const handleInlineCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    if (isNameDuplicate && (!newCustPhone || !newCustPhone.trim())) {
      setCreateError('A customer with this name already exists. A Phone Number is required to save a duplicate name.');
      return;
    }

    setCreateError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCustName,
          phone: newCustPhone,
          whatsapp: newCustWhatsapp,
          address: newCustAddress,
          email: newCustEmail,
          notes: newCustNotes,
          measurements: { profiles: [] }
        })
      });
      const data = await res.json();
      if (res.ok) {
        const createdCustomer = data.customer || data;
        setCustomer(createdCustomer);
        setCustomerProfiles([]);
        
        // Reset customer form
        setNewCustName('');
        setNewCustPhone('');
        setNewCustWhatsapp('');
        setNewCustAddress('');
        setNewCustEmail('');
        setNewCustNotes('');
        setShowCreateCustomer(false);

        setBookingStep('garments');
        setBookingItems([]);
      } else {
        setCreateError(data.error || 'Failed to create customer');
      }
    } catch (err) {
      console.error('Error creating customer:', err);
      setCreateError('Error creating customer record.');
    }
  };

  const handleAddBookingItem = () => {
    if (garmentTypes.length === 0) return;
    const firstType = garmentTypes.find(g => g.enabled) || garmentTypes[0];
    if (!firstType) return;
    setBookingItems(prev => [...prev, createDefaultBookingItem(firstType)]);
  };

  const handleRemoveBookingItem = (id: string) => {
    if (bookingItems.length <= 1) return;
    setBookingItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateBookingItemGarment = (itemId: string, newGarmentTypeId: string) => {
    const selectedGarmentType = garmentTypes.find(g => g.id === newGarmentTypeId);
    if (!selectedGarmentType) return;

    setBookingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const existingProfile = customerProfiles.find(p => p.garment_type_id === selectedGarmentType.id);
      const measurement_snapshot: Record<string, string | number> = {};
      if (existingProfile) {
        Object.assign(measurement_snapshot, existingProfile.values);
      } else {
        selectedGarmentType.measurement_fields.forEach(f => {
          measurement_snapshot[f.name] = '';
        });
      }

      const styling_snapshot: Record<string, string> = {};
      const enabledCategories = stylingCategories.filter(sc => sc.garment_type_id === selectedGarmentType.id && sc.options && sc.options.some(o => o.enabled));
      enabledCategories.forEach(cat => {
        if (existingProfile?.styling_preferences?.[cat.id]) {
          styling_snapshot[cat.id] = existingProfile.styling_preferences[cat.id];
        } else {
          const firstEnabled = cat.options.find(o => o.enabled);
          if (firstEnabled) {
            styling_snapshot[cat.id] = firstEnabled.id;
          }
        }
      });

      return {
        ...item,
        garment_type_id: selectedGarmentType.id,
        type: selectedGarmentType.name,
        measurement_snapshot,
        styling_snapshot
      };
    }));
  };

  const handleUpdateBookingItemField = (itemId: string, field: keyof BookingItem, value: any) => {
    setBookingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleUpdateBookingItemMeasurement = (itemId: string, fieldName: string, value: string | number) => {
    setBookingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        measurement_snapshot: {
          ...item.measurement_snapshot,
          [fieldName]: value
        }
      };
    }));
  };

  const handleUpdateBookingItemStyling = (itemId: string, categoryId: string, optionId: string) => {
    setBookingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        styling_snapshot: {
          ...item.styling_snapshot,
          [categoryId]: optionId
        }
      };
    }));
  };

  const handleFinalizeBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) {
      setCreateError('Please select a customer first.');
      return;
    }
    if (bookingItems.length === 0) {
      setCreateError('Please add at least one garment.');
      return;
    }

    setCreateError(null);
    setCreateSuccess(false);

    try {
      // 1. Update customer profile measurements & styling preferences in DB
      let updatedProfiles = [...customerProfiles];
      const nowStr = new Date().toISOString();

      bookingItems.forEach(item => {
        const existingIdx = updatedProfiles.findIndex(p => p.garment_type_id === item.garment_type_id);
        if (existingIdx !== -1) {
          updatedProfiles[existingIdx] = {
            ...updatedProfiles[existingIdx],
            values: item.measurement_snapshot,
            styling_preferences: item.styling_snapshot,
            updated_at: nowStr
          };
        } else {
          updatedProfiles.push({
            id: Math.random().toString(36).substring(2, 11),
            garment_type_id: item.garment_type_id,
            garment_name: item.type,
            values: item.measurement_snapshot,
            styling_preferences: item.styling_snapshot,
            created_at: nowStr,
            updated_at: nowStr
          });
        }
      });

      // Update customer measurements
      const profileUpdateRes = await fetch(`/api/customers/${customer.id}/measurements`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          data: {
            profiles: updatedProfiles
          }
        })
      });

      if (!profileUpdateRes.ok) {
        const pErr = await profileUpdateRes.json();
        throw new Error(pErr.error || 'Failed to update customer measurement profiles.');
      }

      // Calculate totals
      const totalAmountVal = bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const overallDueDate = bookingItems.reduce((max, item) => {
        if (!max || item.delivery_date > max) return item.delivery_date;
        return max;
      }, '');

      // 2. Insert order
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: customer.id,
          items: bookingItems.map(item => ({
            type: item.type,
            price: item.price,
            notes: item.notes,
            color: item.color,
            delivery_date: item.delivery_date,
            measurement_snapshot: item.measurement_snapshot,
            styling_snapshot: item.styling_snapshot
          })),
          total_amount: totalAmountVal,
          paid_amount: paidAmount,
          due_date: overallDueDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register new garment booking.');
      }

      setCreateSuccess(true);
      setIsCreating(false);
      setSelectedOrder(data);
      if (onClearActiveCustomer) onClearActiveCustomer();
      fetchOrders();

      // Universal Print Support: Immediately trigger receipt printing
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  // Calculate items total
  useEffect(() => {
    const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    setTotalAmount(total);
  }, [items]);

  useEffect(() => {
    const total = editedItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    setEditedTotal(total);
  }, [editedItems]);

  // Status transitions
  const advanceOrderStatus = async (order: Order) => {
    const activeWorkflowStageIds = activeWorkflowStages.map(s => s.id);
    const currentIndex = activeWorkflowStageIds.indexOf(order.status);
    if (currentIndex === -1 || currentIndex === activeWorkflowStageIds.length - 1) return;

    const nextStatus = activeWorkflowStageIds[currentIndex + 1];
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const updated = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
        setSelectedOrder(prev => prev?.id === order.id ? { ...prev, status: nextStatus } : prev);
      } else {
        alert(updated.error || 'Failed to update order status.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create Order Submission
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) {
      setCreateError('Please select a customer first.');
      return;
    }

    setCreateError(null);
    setCreateSuccess(false);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: customer.id,
          items,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          due_date: dueDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register new garment booking.');
      }

      setCreateSuccess(true);
      setIsCreating(false);
      setSelectedOrder(data);
      if (onClearActiveCustomer) onClearActiveCustomer();
      fetchOrders();

      // Universal Print Support: Immediately trigger the dual printable slips printing
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  // Edit Order Submission (Owner Only)
  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setEditError(null);

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: editedItems,
          total_amount: editedTotal,
          paid_amount: editedPaid,
          due_date: editedDueDate,
          measurement_snapshot: editedSnapshot
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save order modifications.');
      }

      setSelectedOrder(data);
      setIsEditing(false);
      fetchOrders();
    } catch (err: any) {
      setEditError(err.message);
    }
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { type: 'Suit', price: 0, notes: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, key: keyof OrderItem, val: any) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  const handleEditAddItem = () => {
    setEditedItems(prev => [...prev, { type: 'Suit', price: 0, notes: '' }]);
  };

  const handleEditRemoveItem = (index: number) => {
    if (editedItems.length <= 1) return;
    setEditedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = (index: number, key: keyof OrderItem, val: any) => {
    setEditedItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  const triggerPrintReceipt = () => {
    window.print();
  };

  // Color-coded status helpers mapping strictly to Professional Polish rules
  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case 'Ready':
      case 'Ready to Deliver':
        return 'bg-[#DCFCE7] text-[#15803D] border border-green-200';
      case 'Delivered':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      case 'Archived':
        return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'Pending':
        return 'bg-[#DBEAFE] text-[#1D4ED8] border border-blue-100';
      default: // Cutting, Stitching, Fitting
        return 'bg-[#FEF9C3] text-[#854D0E] border border-yellow-200';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT COLUMN: Queue / Filters */}
      {!isCreating && (
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight font-display uppercase">
              {viewMode === 'Active' ? 'Active Queue' : 'Archived Vault'}
            </h2>
            {!isCreating && (
              <button
                onClick={startNewBooking}
                className="px-3.5 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-xs uppercase tracking-wider transition-colors"
              >
                <ShoppingCart className="w-4 h-4 text-[#38BDF8]" />
                Book Order
              </button>
            )}
          </div>

          {/* Segmented Control for Active vs Archived */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/40">
            <button
              type="button"
              onClick={() => {
                setViewMode('Active');
                setActiveFilter('All');
              }}
              className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all text-center uppercase tracking-wider ${
                viewMode === 'Active'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-850'
              }`}
            >
              Active Pipeline
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('Archived');
                setActiveFilter('Archived');
              }}
              className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all text-center uppercase tracking-wider ${
                viewMode === 'Archived'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-850'
              }`}
            >
              Archived Vault
            </button>
          </div>

          {/* Status Filters - Styled as elegant tabs - Only shown in Active view mode */}
          {viewMode === 'Active' ? (
            <div className="flex flex-wrap gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200/50 justify-center">
              {['All', ...activeQueueStages.map(s => s.id)].map((tabId) => {
                const isSelected = activeFilter === tabId;
                const tabName = tabId === 'All' ? 'All' : (stagesList.find(s => s.id === tabId)?.name || tabId);
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveFilter(tabId)}
                    className={`py-1.5 px-2.5 rounded-lg text-2xs font-extrabold transition-all cursor-pointer text-center uppercase tracking-wider truncate border border-transparent ${
                      isSelected
                        ? 'bg-[#1E293B] text-white border-slate-700 shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                    }`}
                    title={tabName}
                  >
                    {tabName}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-2 bg-purple-50 rounded-xl border border-purple-100 text-center text-purple-700 text-xs font-bold uppercase tracking-wider">
              Displaying Archived Vault Records
            </div>
          )}

          {/* Search */}
          <div className="space-y-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order #, customer name..."
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs placeholder-slate-400 font-medium focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-sky-100 transition-all"
            />

            {/* Active List */}
            <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
              {loading && <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-wider py-3">Refreshing Queue...</p>}
              {!loading && orders.length === 0 && (
                <p className="text-center text-slate-400 py-6 text-[10px] font-bold uppercase tracking-wider">No active orders.</p>
              )}
              {orders.map((o) => {
                const isSelected = selectedOrder?.id === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => selectOrderWithDetails(o)}
                    className={`w-full p-2.5 rounded-lg text-left border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-400 text-sky-900 font-bold'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs">{o.order_number}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${getStatusBadgeStyle(o.status)}`}>
                          {stagesList.find(s => s.id === o.status)?.name || o.status}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 text-xs">{o.customer_name}</p>
                      <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Due: {new Date(o.due_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right space-y-0.5 shrink-0">
                      <span className="text-base font-black text-slate-850 block font-display">
                        {currency}{o.total_amount}
                      </span>
                      {o.total_amount - o.paid_amount > 0 ? (
                        <span className="text-3xs bg-red-50 text-red-700 font-bold px-1.5 py-0.5 rounded border border-red-100">
                          Due: {currency}{o.total_amount - o.paid_amount}
                        </span>
                      ) : (
                        <span className="text-3xs bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-100">
                          Paid
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={loadMoreOrders}
                  disabled={loading}
                  className="w-full mt-3 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 cursor-pointer text-center flex items-center justify-center gap-1.5 transition-all shadow-3xs"
                >
                  {loading ? 'Loading...' : 'Load More Orders'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Action Forms or Details */}
      <div className={`${isCreating ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 min-h-[500px]`}>
        
        {isCreating ? (
          /* REDESIGNED MULTI-STEP BOOKING WIZARD */
          <div className="space-y-5">
            {/* Wizard Headers & Breadcrumbs */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900 font-display uppercase tracking-wider">
                  Book New Order
                </h3>
                {customer && (
                  <p className="text-slate-450 text-xs mt-0.5">
                    For <strong className="text-slate-700">{customer.name}</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  if (onClearActiveCustomer) onClearActiveCustomer();
                }}
                className="text-slate-500 hover:text-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Step Progress Bar */}
            <div className="flex items-center gap-2 text-2xs font-extrabold uppercase tracking-wider text-slate-400">
              <span className={bookingStep === 'customer' ? 'text-sky-500 font-black' : customer ? 'text-emerald-500' : ''}>
                1. Customer
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className={bookingStep === 'garments' ? 'text-sky-500 font-black' : bookingItems.length > 0 ? 'text-emerald-500' : ''}>
                2. Garments & Specs
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className={bookingStep === 'summary' ? 'text-sky-500 font-black' : ''}>
                3. Summary & Lock
              </span>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                {createError}
              </div>
            )}

            {/* STEP 1: CUSTOMER SELECTION / INLINE CREATION */}
            {bookingStep === 'customer' && (
              <div className="space-y-4 animate-fade-in">
                {!showCreateCustomer ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8] focus:bg-white transition-colors"
                        placeholder="Search customer by name, phone or email..."
                      />
                    </div>

                    {/* Search Results list */}
                    {customerSearch.trim() && (
                      <div className="bg-white border-2 border-slate-100 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 shadow-sm">
                        {searching ? (
                          <div className="p-4 text-center text-slate-400 text-2xs uppercase tracking-wider font-extrabold">
                            Searching client logs...
                          </div>
                        ) : searchResults.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-2xs uppercase tracking-wider font-extrabold">
                            No matching customers found
                          </div>
                        ) : (
                          searchResults.map((cust) => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => handleSelectCustomer(cust)}
                              className="w-full text-left p-3 hover:bg-sky-50/50 flex justify-between items-center transition-colors cursor-pointer group"
                            >
                              <div>
                                <h4 className="font-bold text-slate-800 text-xs group-hover:text-sky-600">
                                  {cust.name}
                                </h4>
                                <p className="text-slate-450 text-2xs mt-0.5">
                                  {cust.phone && !cust.phone.startsWith('NO-PHONE-') ? cust.phone : 'No Phone'}
                                  {cust.email ? ` • ${cust.email}` : ''}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    <div className="text-center py-4">
                      <span className="text-slate-400 text-2xs font-extrabold uppercase tracking-widest block mb-2">
                        - OR -
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCreateCustomer(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg text-2xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4 text-[#38BDF8]" />
                        Create New Customer
                      </button>
                    </div>
                  </div>
                ) : (
                  /* INLINE CUSTOMER CREATION */
                  <form onSubmit={handleInlineCreateCustomer} className="space-y-4 p-4 bg-slate-50 border border-slate-200/60 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wider">
                        New Customer
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCreateCustomer(false)}
                        className="text-slate-500 hover:text-slate-800 text-2xs font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          placeholder="Ali Khan"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Phone Number {isNameDuplicate && <span className="text-red-500">* (Required)</span>}
                        </label>
                        <input
                          type="tel"
                          required={isNameDuplicate}
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          className={`w-full px-2.5 py-1.5 bg-white border-2 rounded-lg text-slate-800 text-xs focus:outline-none ${isNameDuplicate ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200 focus:border-[#38BDF8]'}`}
                          placeholder="0300-1234567"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          WhatsApp Link/Number
                        </label>
                        <input
                          type="text"
                          value={newCustWhatsapp}
                          onChange={(e) => setNewCustWhatsapp(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          placeholder="923001234567"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={newCustEmail}
                          onChange={(e) => setNewCustEmail(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          placeholder="ali@example.pk"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Address
                      </label>
                      <input
                        type="text"
                        value={newCustAddress}
                        onChange={(e) => setNewCustAddress(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                        placeholder="House 45, Tariq Road, Karachi"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Tailoring Notes / Directives
                      </label>
                      <textarea
                        value={newCustNotes}
                        onChange={(e) => setNewCustNotes(e.target.value)}
                        rows={2}
                        className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                        placeholder="Prefers slim fit collars, lightweight cuffs..."
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-2xs uppercase tracking-wider cursor-pointer"
                    >
                      Save & Continue
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* STEP 2: GARMENTS CONFIGURATION */}
            {bookingStep === 'garments' && customer && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">
                    Booked Garments ({bookingItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBookingItem}
                    className="px-3 py-1.5 border border-slate-200 hover:border-[#38BDF8] bg-white text-slate-800 hover:bg-sky-50 transition-all font-semibold rounded-lg text-2xs uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#38BDF8]" /> Add Garment Item
                  </button>
                </div>

                {/* Unified Order-Level Delivery Date */}
                <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-500" /> Expected Delivery Date
                    </span>
                    <p className="text-3xs text-slate-500 uppercase font-bold">This date applies to all garment items in this order.</p>
                  </div>
                  <input
                    type="date"
                    required
                    value={sharedDeliveryDate}
                    onChange={(e) => updateSharedDeliveryDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8] w-full sm:w-auto"
                  />
                </div>

                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {bookingItems.map((item, index) => {
                    const selectedTypeObj = garmentTypes.find(g => g.id === item.garment_type_id);

                    return (
                      <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                        {/* Garment Header */}
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                            Garment #{index + 1}: {item.type}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBookingItem(item.id)}
                            disabled={bookingItems.length <= 1}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Garment details grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Garment Type
                            </label>
                            <select
                              value={item.garment_type_id}
                              onChange={(e) => handleUpdateBookingItemGarment(item.id, e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                            >
                              {garmentTypes.map(g => (
                                <option key={g.id} value={g.id} disabled={!g.enabled}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Price ({currency})
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={item.price || ''}
                              onChange={(e) => handleUpdateBookingItemField(item.id, 'price', Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                              placeholder="0"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              <Palette className="w-3 h-3 text-sky-550" /> Fabric / Suit Color
                            </label>
                            <input
                              type="text"
                              value={item.color || ''}
                              onChange={(e) => handleUpdateBookingItemField(item.id, 'color', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                              placeholder="e.g. Navy Blue, Black"
                            />
                          </div>
                        </div>



                        {/* STYLING CONFIGURATION BLOCK */}
                        {stylingCategories.some(cat => cat.garment_type_id === item.garment_type_id && cat.options && cat.options.some(o => o.enabled)) && (
                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Palette className="w-3.5 h-3.5 text-sky-500" /> Styling Attributes (Ticked Select)
                            </span>
                            <div className="space-y-3.5 bg-white p-3 rounded-xl border border-slate-200/60 shadow-xs">
                              {stylingCategories
                                .filter(cat => cat.garment_type_id === item.garment_type_id && cat.options && cat.options.some(o => o.enabled))
                                .map(cat => {
                                  const selectedOptionId = item.styling_snapshot[cat.id] || '';
                                  const activeOptions = cat.options.filter(o => o.enabled);

                                  return (
                                    <div key={cat.id} className="space-y-1.5 pb-2 last:pb-0 last:border-b-0 border-b border-slate-100">
                                      <span className="text-[9px] font-extrabold text-slate-500 uppercase block tracking-wide">
                                        {cat.name}
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {activeOptions.map(opt => {
                                          const isSelected = selectedOptionId === opt.id;
                                          return (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              onClick={() => handleUpdateBookingItemStyling(item.id, cat.id, opt.id)}
                                              className={`px-2.5 py-1.5 rounded-lg text-2xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                                                isSelected
                                                  ? 'bg-sky-50 border-sky-400 text-sky-700 shadow-3xs'
                                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                                              }`}
                                            >
                                              {isSelected ? (
                                                <div className="w-3.5 h-3.5 rounded-md bg-sky-500 text-white flex items-center justify-center shrink-0">
                                                  <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                                                </div>
                                              ) : (
                                                <div className="w-3.5 h-3.5 rounded-md border border-slate-300 bg-white shrink-0" />
                                              )}
                                              <span>{opt.name}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setBookingStep('customer')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back to Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Check validation
                      const invalid = bookingItems.some(item => !item.price || item.price <= 0);
                      if (invalid) {
                        if (!confirm('Some garment items have a price of 0. Would you like to proceed anyway?')) {
                          return;
                        }
                      }
                      setBookingStep('summary');
                    }}
                    className="px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    Review Order Summary <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: BOOKING SUMMARY & FINANCIALS LOCK */}
            {bookingStep === 'summary' && customer && (
              <div className="space-y-5 animate-fade-in">
                <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block">
                  Verify Formulation Summary
                </span>

                {/* Breakdown cards */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <h4 className="font-black text-slate-800 uppercase">Customer Profile</h4>
                      <p className="text-slate-500 font-semibold mt-0.5">{customer.name} ({customer.phone})</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBookingStep('customer')}
                      className="text-sky-600 hover:text-sky-800 font-bold text-2xs uppercase tracking-wider cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                   {bookingItems.map((item, idx) => (
                    <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-2xs shadow-xs">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <span className="font-extrabold text-slate-800 uppercase flex items-center gap-1.5">
                          Item #{idx + 1}: {item.type}
                          {item.color && (
                            <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-650 text-[9px] font-bold rounded">
                              {item.color}
                            </span>
                          )}
                        </span>
                        <span className="font-black text-slate-900">{currency}{item.price}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-500">
                        <div>
                          <strong>Delivery Date:</strong> {new Date(item.delivery_date).toLocaleDateString()}
                        </div>
                        {item.notes && (
                          <div className="col-span-2 italic">
                            <strong>Cut Directives:</strong> {item.notes}
                          </div>
                        )}
                        
                        {/* Styling snapshot tiny render */}
                        {Object.keys(item.styling_snapshot).length > 0 && (
                          <div className="col-span-2">
                            <strong>Style Options:</strong>{' '}
                            {Object.entries(item.styling_snapshot)
                              .filter(([catId, optId]) => {
                                const catObj = stylingCategories.find(c => c.id === catId);
                                const gType = garmentTypes.find(g => g.name === item.type);
                                return catObj && gType && catObj.garment_type_id === gType.id;
                              })
                              .map(([catId, optId], index) => {
                                const catObj = stylingCategories.find(c => c.id === catId);
                                const optObj = catObj?.options.find(o => o.id === optId);
                                return (
                                  <span key={catId} className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-2xs mr-1 font-bold inline-block border border-slate-200">
                                    {catObj?.name}: {optObj?.name || optId}
                                  </span>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Financial parameter setups */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calculated Grand Total</span>
                    <span className="text-xl font-black text-slate-800 mt-1 font-display">
                      {currency}{bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Paid Advance ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      max={bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0)}
                      value={paidAmount || ''}
                      onChange={(e) => setPaidAmount(Number(e.target.value))}
                      className="w-full mt-0.5 px-3 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-sm focus:outline-none focus:border-[#38BDF8]"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="bg-[#E0F2FE]/50 rounded-xl border border-sky-100 p-3.5 text-2xs text-slate-600 font-semibold leading-relaxed uppercase tracking-wide flex items-center gap-2">
                  <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-[#0369A1]" />
                  <span>Zero Loss Snapshot: Customer's body measurements and style directives are locked in this ticket forever.</span>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100 gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingStep('garments')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeBooking}
                    className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-100" />
                    Lock Order & Auto-Print Receipt
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : selectedOrder ? (
          /* ORDER DETAILS & VIEW */
          <div className="space-y-6">
            
            {isEditing ? (
              /* OWNER EDITING PORTAL */
              <form onSubmit={handleEditOrder} className="space-y-5 animate-fade-in">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-extrabold text-base text-slate-900 font-display uppercase tracking-wider">Modifying Booked Order: {selectedOrder.order_number}</h3>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-slate-500 hover:text-slate-850 font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                    {editError}
                  </div>
                )}

                {/* Edit Items */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">Configure Order Items</span>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-2xs uppercase tracking-wider flex items-center gap-1 cursor-pointer border border-slate-200"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {editedItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60 items-start">
                        <div className="col-span-3 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Garment Type</label>
                          <input
                            type="text"
                            value={item.type}
                            onChange={(e) => handleEditItemChange(index, 'type', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          />
                        </div>

                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Price ({currency})</label>
                          <input
                            type="number"
                            min="0"
                            value={item.price || ''}
                            onChange={(e) => handleEditItemChange(index, 'price', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          />
                        </div>

                        <div className="col-span-3 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color</label>
                          <input
                            type="text"
                            value={item.color || ''}
                            onChange={(e) => handleEditItemChange(index, 'color', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                            placeholder="Color"
                          />
                        </div>

                        <div className="col-span-3 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Styling / Cut Details</label>
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => handleEditItemChange(index, 'notes', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                          />
                        </div>

                        <div className="col-span-1 pt-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleEditRemoveItem(index)}
                            disabled={editedItems.length <= 1}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Edit financials & delivery date */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calculated Total</span>
                    <span className="text-lg font-black text-slate-800 mt-1 font-display">{currency}{editedTotal}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Paid ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      value={editedPaid}
                      onChange={(e) => setEditedPaid(Number(e.target.value))}
                      className="w-full mt-0.5 px-3 py-1.5 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Due Date</label>
                    <input
                      type="date"
                      value={editedDueDate}
                      onChange={(e) => setEditedDueDate(e.target.value)}
                      className="w-full mt-0.5 px-3 py-1 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>

                {/* Edit Snapshot measurements */}
                <div className="pt-2">
                  <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block mb-2">Modify Measurement Snapshot for this Order</span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {measurementFields.map((field) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-500 truncate block uppercase tracking-wide">{field}</label>
                        <input
                          type="text"
                          value={editedSnapshot[field] || ''}
                          onChange={(e) => setEditedSnapshot(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-850 font-bold text-xs focus:outline-none focus:border-[#38BDF8]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-6 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  Save Modifications
                </button>
              </form>
            ) : (
              /* DETAILED VIEW MODE */
              <div className="space-y-6 animate-fade-in">
                
                {/* Header info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-2xl text-slate-900 tracking-tight font-display">{selectedOrder.order_number}</span>
                      <span className={`px-2.5 py-1 rounded-md text-3xs font-extrabold uppercase ${getStatusBadgeStyle(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </span>
                    </div>
                    <p className="font-extrabold text-lg text-slate-800 font-display">{selectedOrder.customer_name}</p>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      Contact: <span className="text-slate-800 font-bold">{selectedOrder.customer_phone && !selectedOrder.customer_phone.startsWith('NO-PHONE-') ? selectedOrder.customer_phone : 'Not Provided'}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <button
                      onClick={triggerPrintReceipt}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Printer className="w-4 h-4 text-slate-500" />
                      Print Receipt
                    </button>

                    <button
                      onClick={() => handleDuplicateOrder(selectedOrder)}
                      className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      Duplicate Order
                    </button>

                    {selectedOrder.status !== 'Delivered' && selectedOrder.status !== 'Archived' && (
                      <button
                        onClick={() => {
                          setEditedItems([...selectedOrder.items]);
                          setEditedPaid(selectedOrder.paid_amount);
                          setEditedDueDate(selectedOrder.due_date.split('T')[0]);
                          setEditedSnapshot({ ...selectedOrder.measurement_snapshot });
                          setIsEditing(true);
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-4 h-4 text-[#38BDF8]" />
                        Edit Order
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteOrder(selectedOrder)}
                      className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Progress bar state machine - styled perfectly with sky-blue pipeline */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 space-y-3.5 print:hidden">
                  {(() => {
                    if (selectedOrder.status === 'Delivered') {
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="font-extrabold text-xs text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                              Delivered and Locked
                            </span>
                            <p className="text-slate-500 text-xs font-semibold">
                              Delivered on: <span className="text-slate-800 font-bold">{selectedOrder.delivered_at ? new Date(selectedOrder.delivered_at).toLocaleString() : 'N/A'}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => reopenOrder(selectedOrder)}
                            className="px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            Reopen Order
                          </button>
                        </div>
                      );
                    }

                    if (selectedOrder.status === 'Archived') {
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="font-extrabold text-xs text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldAlert className="w-4.5 h-4.5 text-purple-500" />
                              Archived in Vault
                            </span>
                            <p className="text-slate-500 text-xs font-semibold">
                              This order is frozen. Movements and edits are locked.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRestoreStageId('Pending');
                              setRestoreDialogOpen(true);
                            }}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            Restore Order
                          </button>
                        </div>
                      );
                    }

                    const activeWorkflowStageIds = activeWorkflowStages.map(s => s.id);
                    const currentStageIndex = activeWorkflowStageIds.indexOf(selectedOrder.status);
                    const hasNextStage = currentStageIndex !== -1 && currentStageIndex < activeWorkflowStageIds.length - 1;
                    const nextStageId = hasNextStage ? activeWorkflowStageIds[currentStageIndex + 1] : null;
                    const nextStageName = nextStageId ? (stagesList.find(s => s.id === nextStageId)?.name || nextStageId) : '';
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-4.5 h-4.5 text-[#38BDF8]" />
                            Status Pipeline
                          </span>
                          {hasNextStage ? (
                            <button
                              type="button"
                              onClick={() => advanceOrderStatus(selectedOrder)}
                              className="px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all border border-slate-800"
                            >
                              <span>Advance to {nextStageName}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#38BDF8]" />
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Cycle Completed</span>
                          )}
                        </div>

                        <div className="relative pt-1.5">
                          <div className="overflow-hidden h-2 text-xs flex rounded bg-slate-200">
                            <div
                              style={{ width: `${Math.max(5, Math.min(100, ((currentStageIndex + 1) / activeWorkflowStages.length) * 100))}%` }}
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[#38BDF8] transition-all duration-300"
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400 font-extrabold mt-2 uppercase tracking-wide gap-1">
                            {activeQueueStages.map((s) => {
                              const isCurrent = selectedOrder.status === s.id;
                              return (
                                <span key={s.id} className={isCurrent ? 'text-[#0369A1] font-black underline decoration-sky-400 underline-offset-2 truncate' : 'truncate'} title={s.name}>
                                  {s.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Items & Financials List */}
                <div className="space-y-3">
                  <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block">Order Garments List</span>
                  <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200/60 overflow-hidden shadow-xs">
                    {selectedOrder.items.map((item, i) => {
                      const hasItemMeas = item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0;
                      const hasItemStyling = item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0;

                      return (
                        <div key={i} className="p-4 bg-white first:rounded-t-xl last:rounded-b-xl border-b border-slate-100 last:border-0 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-extrabold text-slate-800 text-sm font-display flex items-center gap-1.5">
                                {item.type} (Piece #{i + 1})
                                {item.color && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-3xs font-black uppercase rounded-md inline-block">
                                    {item.color}
                                  </span>
                                )}
                              </p>
                              {item.delivery_date && (
                                <p className="text-slate-400 text-[10px] font-bold mt-0.5">Due: {new Date(item.delivery_date).toLocaleDateString()}</p>
                              )}
                              {item.notes && <p className="text-slate-500 text-xs mt-1 font-medium">Notes: {item.notes}</p>}
                            </div>
                            <span className="text-base font-black text-slate-800 font-display">{currency}{item.price}</span>
                          </div>

                          {/* Render styling choices inside card */}
                          {hasItemStyling && (
                            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/50 space-y-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Style Options</span>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(item.styling_snapshot || {})
                                  .filter(([catId, optId]) => {
                                    const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                    const gType = garmentTypes.find(g => g.name === item.type);
                                    return category && gType && category.garment_type_id === gType.id;
                                  })
                                  .map(([catId, optId]) => {
                                    const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                    const option = category?.options.find(o => o.id === optId || o.name === optId);
                                    return (
                                      <span key={catId} className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded font-semibold text-slate-700 shadow-3xs">
                                        <strong>{category?.name || catId}:</strong> {option?.name || optId}
                                      </span>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Render measurement snapshot inside card */}
                          {hasItemMeas && (
                            <div className="bg-sky-50/20 p-2.5 rounded-lg border border-sky-100/50 space-y-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Measurements Snapshot</span>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                {Object.entries(item.measurement_snapshot || {}).map(([field, val]) => (
                                  <div key={field} className="bg-white p-1.5 border border-slate-200/40 rounded flex flex-col items-center">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-full text-center" title={field}>{field}</span>
                                    <span className="text-xs font-black text-slate-800 mt-0.5">{val || '--'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pricing grid styled with StitchMaster Pro colors (#0F172A slate card) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#0F172A] text-white p-5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Total</span>
                      <span className="text-xl font-black block mt-0.5">{currency}{selectedOrder.total_amount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] font-bold block uppercase tracking-wider">Paid Advance</span>
                      <span className="text-xl font-black text-emerald-400 block mt-0.5">{currency}{selectedOrder.paid_amount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] font-bold block uppercase tracking-wider">Balance Due</span>
                      <span className={`text-xl font-black block mt-0.5 ${selectedOrder.total_amount - selectedOrder.paid_amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {currency}{selectedOrder.total_amount - selectedOrder.paid_amount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] font-bold block uppercase tracking-wider">Delivery Date</span>
                      <span className="text-sm font-black block mt-1.5 text-slate-200">{new Date(selectedOrder.due_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Legacy global measurements fallback display if no items have individual snapshots */}
                {!selectedOrder.items.some(item => item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0) && (
                  <div className="space-y-3">
                    <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block">Locked Measurements Snapshot (Frozen)</span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-sky-50/30 p-4 rounded-xl border border-sky-100/60">
                      {measurementFields.map((field) => (
                        <div key={field} className="p-2.5 bg-white rounded-lg border border-slate-200/50 flex flex-col">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase truncate tracking-wide">{field}</span>
                          <span className="text-sm font-black text-slate-800 mt-0.5">
                            {selectedOrder.measurement_snapshot?.[field] !== undefined && selectedOrder.measurement_snapshot?.[field] !== '' ? (
                              selectedOrder.measurement_snapshot[field]
                            ) : (
                              <span className="text-slate-300 font-normal">--</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* The old print section is removed and unified in the universal print-slips-container below */}

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
              <ShoppingCart className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 font-display">No Order Selected</h3>
            <p className="text-slate-450 max-w-xs mt-1 text-xs font-semibold uppercase tracking-wider leading-relaxed">
              Select an order on the left active queue to verify delivery status, track work cycles, or print slips.
            </p>
          </div>
        )}
      </div>

      {/* PRINT SLIPS CONTAINER (Always Hidden on Screen, Shown on Print) */}
      {selectedOrder && (
        <div id="print-slips-container" className="hidden print:block font-sans text-black">
          
          {/* CUSTOMER SLIP */}
          <div className="w-full max-w-[80mm] mx-auto p-4 border border-slate-300 rounded-lg bg-white mb-8 page-break print:border-0 print:p-0 print:max-w-full">
            {/* Header / Brand */}
            <div className="text-center space-y-2 pb-4 border-b border-gray-300">
              <div className="inline-flex justify-center items-center w-12 h-12 rounded-full border-2 border-black mb-1">
                {/* Scissors SVG Icon */}
                <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h4m-4 0a3 3 0 110-6h4m-4 6a3 3 0 100-6h4m0 0V9M9 3h.01M15 3h.01M12 6H3m18 0h-9m1.5 6l3.5 3.5m0-3.5L13.5 15.5" />
                </svg>
              </div>
              <h2 className="text-xl font-extrabold uppercase tracking-tight">{shopName}</h2>
              <div className="text-xs space-y-0.5 text-gray-700 font-medium">
                <p>{shopAddress}</p>
                <p>Phone: {shopPhone}</p>
              </div>
            </div>

            {/* Slip Title */}
            <div className="text-center py-2 bg-gray-100 rounded my-3 border border-gray-300">
              <span className="text-xs font-black uppercase tracking-wider">Customer Booking Copy</span>
            </div>

            {/* Metadata table */}
            <div className="text-xs space-y-1.5 py-2 border-b border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Order Number:</span>
                <span className="font-extrabold text-sm">{selectedOrder.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Customer Name:</span>
                <span className="font-extrabold">{selectedOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Booking Date:</span>
                <span className="font-bold">{new Date(selectedOrder.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold text-red-600">Delivery Date:</span>
                <span className="font-extrabold text-red-600 underline">{new Date(selectedOrder.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
              </div>
            </div>

            {/* Booked Garments */}
            <div className="py-3 border-b border-gray-200 text-xs">
              <span className="font-extrabold uppercase tracking-wide block mb-1.5 text-gray-500">Booked Garments</span>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-400">
                    <th className="pb-1 font-bold">Item Description</th>
                    <th className="pb-1 text-right font-bold">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedOrder.items.map((item, idx) => (
                    <tr key={idx} className="py-1.5">
                      <td className="py-1.5">
                        <p className="font-bold">
                          {item.type}
                          {item.color && (
                            <span className="ml-1.5 text-3xs font-extrabold text-slate-700 bg-gray-100 border border-gray-300 px-1 rounded inline-block">
                              Color: {item.color}
                            </span>
                          )}
                        </p>
                        {item.notes && <p className="text-2xs text-gray-500 italic">*{item.notes}</p>}
                      </td>
                      <td className="py-1.5 text-right font-bold">{currency}{item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pricing Summary */}
            <div className="py-3 space-y-1.5 text-xs border-b border-gray-200 text-right">
              <div className="flex justify-between font-bold">
                <span className="text-gray-500 uppercase">Total Pieces:</span>
                <span>{selectedOrder.items.length}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-gray-500 uppercase">Total Amount:</span>
                <span>{currency}{selectedOrder.total_amount}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700">
                <span className="uppercase">Amount Paid:</span>
                <span>{currency}{selectedOrder.paid_amount}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-gray-300 pt-1.5 text-red-700">
                <span className="uppercase">Remaining Balance:</span>
                <span>{currency}{(selectedOrder.total_amount - selectedOrder.paid_amount)}</span>
              </div>
            </div>

            {/* QR Code Section */}
            {qrCodeUrl && (
              <div className="pt-4 flex flex-col items-center space-y-1.5 text-center">
                <img src={qrCodeUrl} alt="Order QR Code" className="w-32 h-32 border border-gray-300 p-1 bg-white" referrerPolicy="no-referrer" />
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Scan to track order history live</p>
              </div>
            )}

            <div className="text-center text-[10px] text-gray-400 pt-3 border-t border-dashed border-gray-200 mt-4">
              <p>Thank you for choosing {shopName}!</p>
            </div>
          </div>

          {/* TAILOR SLIP */}
          <div className="w-full max-w-[80mm] mx-auto p-4 border border-slate-300 rounded-lg bg-white page-break print:border-0 print:p-0 print:max-w-full">
            {/* Header / Brand */}
            <div className="text-center pb-3 border-b-2 border-black">
              <h2 className="text-lg font-black uppercase tracking-wider">WORKSHOP JOB SLIP</h2>
              <span className="text-2xs font-extrabold uppercase bg-black text-white px-2 py-0.5 rounded tracking-widest mt-1 inline-block">TAILOR COPY</span>
            </div>

            {/* Metadata table */}
            <div className="text-xs space-y-1.5 py-3 border-b border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Order Number:</span>
                <span className="font-extrabold text-base">{selectedOrder.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Customer Name:</span>
                <span className="font-black text-sm">{selectedOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 uppercase font-bold">Phone Number:</span>
                <span className="font-bold">{selectedOrder.customer_phone && !selectedOrder.customer_phone.startsWith('NO-PHONE-') ? selectedOrder.customer_phone : 'Not Provided'}</span>
              </div>
              <div className="flex justify-between bg-yellow-100 p-1.5 rounded border border-yellow-300">
                <span className="font-black text-yellow-800 uppercase text-2xs">DELIVERY DATE:</span>
                <span className="font-black text-yellow-950 text-xs underline">{new Date(selectedOrder.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
              </div>
            </div>

            {/* Style and Cut Options & Measurement Snapshot */}
            {selectedOrder.items.some(item => (item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0) || (item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0)) ? (
              <div className="py-3 border-b border-gray-200 text-xs space-y-3">
                <span className="font-extrabold uppercase tracking-wide block text-gray-500">Garment Specifications</span>
                <div className="space-y-4">
                  {selectedOrder.items.map((item, idx) => {
                    const hasItemMeas = item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0;
                    const hasItemStyling = item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0;
                    
                    return (
                      <div key={idx} className="p-2 bg-gray-50 border border-gray-200 rounded space-y-2">
                        <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                          <p className="font-black text-xs uppercase flex items-center gap-1.5">
                            {item.type} (Piece #{idx + 1})
                            {item.color && (
                              <span className="text-3xs font-extrabold bg-gray-200 text-black border border-gray-400 px-1 rounded inline-block">
                                Color: {item.color}
                              </span>
                            )}
                          </p>
                          {item.delivery_date && (
                            <span className="text-[10px] font-bold text-red-600">Due: {new Date(item.delivery_date).toLocaleDateString()}</span>
                          )}
                        </div>

                        {/* Item Styling Snapshot */}
                        {hasItemStyling && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Styling:</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(item.styling_snapshot || {})
                                .filter(([catId, optId]) => {
                                  const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                  const gType = garmentTypes.find(g => g.name === item.type);
                                  return category && gType && category.garment_type_id === gType.id;
                                })
                                .map(([catId, optId]) => {
                                  const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                  const option = category?.options.find(o => o.id === optId || o.name === optId);
                                  return (
                                    <span key={catId} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                                      <strong>{category?.name || catId}:</strong> {option?.name || optId}
                                    </span>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {item.notes && (
                          <p className="text-2xs font-bold text-slate-800 bg-white p-1 border border-gray-200 rounded">
                            <strong>Notes:</strong> {item.notes}
                          </p>
                        )}

                        {/* Item Measurements Snapshot */}
                        {hasItemMeas && (
                          <div className="space-y-1 pt-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Measurements:</p>
                            <div className="grid grid-cols-2 gap-1">
                              {Object.entries(item.measurement_snapshot || {}).map(([field, val]) => (
                                <div key={field} className="flex justify-between items-center bg-white p-1 border border-gray-100 rounded text-2xs">
                                  <span className="text-gray-500 font-medium truncate max-w-[65%]">{field}</span>
                                  <span className="font-black text-black bg-gray-100 px-1 rounded">{val || '--'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Style and Cut Options Fallback */}
                <div className="py-3 border-b border-gray-200 text-xs space-y-2">
                  <span className="font-extrabold uppercase tracking-wide block text-gray-500">Style Options & Cuts</span>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 border border-gray-200 rounded">
                        <p className="font-black text-xs uppercase">{item.type} (Piece #{idx + 1})</p>
                        {item.notes ? (
                          <p className="text-xs font-bold text-slate-800 mt-1 whitespace-pre-line bg-white p-1 border border-gray-300 rounded">
                            Style/Cuts: {item.notes}
                          </p>
                        ) : (
                          <p className="text-2xs text-gray-400 italic mt-1">No custom styling details specified.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frozen Measurement Snapshot Fallback */}
                <div className="py-3 border-b border-gray-200 text-xs">
                  <span className="font-extrabold uppercase tracking-wide block text-gray-500 mb-2">Complete Measurement Snapshot</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {measurementFields.map((field) => (
                      <div key={field} className="p-1.5 border border-gray-300 rounded flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-500 uppercase truncate max-w-[65%]">{field}</span>
                        <span className="text-sm font-black text-black bg-gray-100 px-1 rounded">
                          {selectedOrder.measurement_snapshot?.[field] !== undefined && selectedOrder.measurement_snapshot?.[field] !== '' ? (
                            selectedOrder.measurement_snapshot[field]
                          ) : (
                            '--'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* QR Code Section */}
            {qrCodeUrl && (
              <div className="pt-4 flex flex-col items-center space-y-1 text-center">
                <img src={qrCodeUrl} alt="Order QR Code" className="w-28 h-28 border border-gray-300 p-1 bg-white" referrerPolicy="no-referrer" />
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Scan inside workshop to instantly open digital ticket</p>
              </div>
            )}

            <div className="text-center text-[10px] text-gray-400 pt-3 border-t border-dashed border-gray-200 mt-4">
              <p>StitchMaster Workshop Workflow</p>
            </div>
          </div>

        </div>
      )}

      {/* RESTORE DIALOG MODAL */}
      {restoreDialogOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-fade-in">
            <div className="flex items-center gap-2.5 text-purple-600">
              <Clock className="w-5 h-5 text-[#38BDF8]" />
              <h3 className="font-extrabold text-base text-slate-900 uppercase tracking-wider">Restore Order</h3>
            </div>
            
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Where would you like to restore order <strong className="text-slate-800 font-bold">{selectedOrder.order_number}</strong>?
              It will return to the active production queue in the selected stage.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Select Active Stage</label>
              <select
                value={restoreStageId}
                onChange={(e) => setRestoreStageId(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
              >
                {activeQueueStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreDialogOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-2xs uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => restoreOrder(selectedOrder, restoreStageId)}
                className="px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-2xs uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Restore to Active Queue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
