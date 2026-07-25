/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingCart, Calendar, Plus, Trash2, Printer, CheckCircle, Clock, ShieldAlert, ArrowRight, ChevronRight, Edit3, Search, UserPlus, ChevronLeft, Scissors, Info, Check, QrCode, Camera, Smartphone, Users, ChevronDown, MoreVertical } from 'lucide-react';
import { Customer, Order, OrderItem, OrderStatus, PipelineStage, GarmentType, StylingCategory, MeasurementProfile } from '../types';
import { printPage } from '../lib/print';
import { validateGarmentMeasurementsCompleted } from '../lib/validation';
import { createCustomerWithMeasurements } from '../lib/createCustomer';
import { buildOrderQrPayload, parseOrderQrPayload } from '../lib/orderQr';
import { formatMoney } from '../lib/format';
import {
  CustomerName,
  DeliveryDateText,
  MoneyTotal,
  OrderId,
  PaymentChip,
  StatusBadge,
} from './ui/ScanValue';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { localDataStore } from '../lib/localDataStore';
import { useLocalData, cacheCustomer, cacheMeasurements } from '../lib/useLocalData';

/** True when a customer profile has at least one non-empty measurement value. */
function profileHasSavedMeasurements(profile: MeasurementProfile): boolean {
  return Object.values(profile.values || {}).some(v => String(v ?? '').trim() !== '');
}

interface OrdersSectionProps {
  token: string;
  currency: string;
  measurementFields: string[];
  pipelineStages?: PipelineStage[];
  activeCustomerId?: string;
  onClearActiveCustomer?: () => void;
  activeOrderId?: string;
  onClearActiveOrderId?: () => void;
  activeItemIdx?: number;
  onClearActiveItemIdx?: () => void;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopLogo?: string;
  termsConditions?: string;
  receiptFooterText?: string;
  defaultPrintReceipt?: boolean;
  defaultPrintMeasure?: boolean;
  isOwnerMode?: boolean;
}

export default function OrdersSection({
  token,
  currency,
  measurementFields,
  pipelineStages,
  activeCustomerId,
  onClearActiveCustomer,
  activeOrderId,
  onClearActiveOrderId,
  activeItemIdx,
  onClearActiveItemIdx,
  shopName,
  shopPhone,
  shopAddress,
  shopLogo,
  termsConditions,
  receiptFooterText,
  defaultPrintReceipt = true,
  defaultPrintMeasure = true,
  isOwnerMode = false,
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
  // Progression stages — never auto-advance into Archived from QR/main "next" actions
  const activeWorkflowStages = stagesList.filter(s => s.enabled && s.id !== 'Archived' && s.name.toLowerCase() !== 'archived');

  const [orders, setOrders] = useState<Order[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Customer order history
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingCustomerHistory, setLoadingCustomerHistory] = useState(false);

  // Selected order details
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [qrCodeByKey, setQrCodeByKey] = useState<Record<string, string>>({});
  const qrCodeUrl = qrCodeByKey.order || '';

  // Scanner and Compact Action Screen States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedGarmentItem, setScannedGarmentItem] = useState<{
    order: Order;
    itemIdx: number;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updateSuccessState, setUpdateSuccessState] = useState(false);

  // Payment collection dialog when advancing to Delivered
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [pendingDeliverOrder, setPendingDeliverOrder] = useState<Order | null>(null);
  const [pendingOtherDueOrders, setPendingOtherDueOrders] = useState<Order[]>([]);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [oldDues, setOldDues] = useState<number>(0);
  const [collectingPayment, setCollectingPayment] = useState(false);

  const getOrderRemaining = (order: Order): number => {
    const total = (order.final_total ?? order.total_amount) || 0;
    return Math.max(0, total - (order.paid_amount || 0));
  };

  const resetPaymentDialog = () => {
    setShowPaymentDialog(false);
    setPendingDeliverOrder(null);
    setPendingOtherDueOrders([]);
    setCollectAmount(0);
    setOldDues(0);
    setCollectingPayment(false);
  };

  // Generate stable QR payloads for invoice + each garment item slip
  useEffect(() => {
    let cancelled = false;

    if (!selectedOrder) {
      setQrCodeByKey({});
      return;
    }

    const qrOpts = {
      width: 150,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    };

    (async () => {
      const next: Record<string, string> = {};
      try {
        next.order = await QRCode.toDataURL(
          buildOrderQrPayload(selectedOrder.id),
          qrOpts
        );
        const items = selectedOrder.items || [];
        for (let i = 0; i < items.length; i++) {
          next[`item-${i}`] = await QRCode.toDataURL(
            buildOrderQrPayload(selectedOrder.id, i),
            qrOpts
          );
        }
        if (!cancelled) setQrCodeByKey(next);
      } catch (err) {
        console.error('Failed to generate QR Code data URL:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
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
            
            // If activeItemIdx is specified, trigger the scanned garment action modal!
            if (activeItemIdx !== undefined && fullOrder.items && fullOrder.items[activeItemIdx]) {
              setScannedGarmentItem({
                order: fullOrder,
                itemIdx: activeItemIdx,
              });
              if (onClearActiveItemIdx) {
                onClearActiveItemIdx();
              }
            } else {
              setSelectedOrder(fullOrder);
            }
            
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
  }, [activeOrderId, activeItemIdx, token]);
  
  // Create Order Form State
  const [isCreating, setIsCreating] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // REDESIGNED BOOKING WORKFLOW STATE DEFINITIONS
  interface BookingItem {
    id: string;
    garment_type_id: string;
    type: string;
    price: number;
    quantity: number;
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
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustGarmentTypeId, setNewCustGarmentTypeId] = useState('');
  const [newCustMeasurements, setNewCustMeasurements] = useState<Record<string, string | number>>({});

  // settings data — offline bootstrap cache
  const localData = useLocalData();
  const garmentTypes = localData.garmentTypes as GarmentType[];
  const stylingCategories = localData.stylingCategories as StylingCategory[];
  const [customerProfiles, setCustomerProfiles] = useState<MeasurementProfile[]>([]);
  const [bookingItems, setBookingItems] = useState<BookingItem[]>([]);
  const [manuallyEditedPriceIds, setManuallyEditedPriceIds] = useState<Set<string>>(new Set());
  const [sharedDeliveryDate, setSharedDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toLocaleDateString('en-CA');
  });

  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState('');

  const [printOptions, setPrintOptions] = useState({ receipt: defaultPrintReceipt, measure: defaultPrintMeasure });

  const updateSharedDeliveryDate = (newDate: string) => {
    setSharedDeliveryDate(newDate);
    setBookingItems(prev => prev.map(item => ({
      ...item,
      delivery_date: newDate
    })));
  };

  const rawTotal = useMemo(() =>
    bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0),
  [bookingItems]);

  const calculateDiscount = useCallback(() => {
    if (!applyDiscount || !discountValue) return { discountAmount: 0, finalTotal: rawTotal };
    const val = Number(discountValue);
    if (val <= 0) return { discountAmount: 0, finalTotal: rawTotal };
    let amount = discountType === 'percentage' ? (rawTotal * val) / 100 : val;
    amount = Math.max(0, Math.min(amount, rawTotal));
    return { discountAmount: amount, finalTotal: Math.max(0, rawTotal - amount) };
  }, [applyDiscount, discountType, discountValue, rawTotal]);

  const { discountAmount, finalTotal } = useMemo(() => calculateDiscount(), [calculateDiscount]);
  const maxPaid = finalTotal;

  // Collapse states for secondary sections
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showStyling, setShowStyling] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Edit Order Form State (Owner Only)
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [editedTotal, setEditedTotal] = useState(0);
  const [editedPaid, setEditedPaid] = useState(0);
  const [editedDueDate, setEditedDueDate] = useState('');
  const [editedSnapshot, setEditedSnapshot] = useState<Record<string, string | number>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editedDiscount, setEditedDiscount] = useState<{ apply: boolean; type: 'fixed' | 'percentage'; value: string }>({ apply: false, type: 'fixed', value: '' });

  // Archive & View Vault States
  const [viewMode, setViewMode] = useState<'Active' | 'Archived'>('Active');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreStageId, setRestoreStageId] = useState('Pending');

  // Reopen Delivered Order back to Getting Ready (Pending)
  const reopenOrder = async (order: Order) => {
    if (!confirm('Are you sure you want to reopen this Delivered order? This will unlock it and return it to the "Getting Ready" stage.')) {
      return;
    }
    const updated = await updateOrderStatus(order, 'Pending');
    if (updated) {
      fetchOrders();
    }
  };

  // Restore Archived Order to a Selected Stage
  const restoreOrder = async (order: Order, stageId: string) => {
    const updated = await updateOrderStatus(order, stageId);
    if (updated) {
      setRestoreDialogOpen(false);
      fetchOrders();
    }
  };

  // Delete Order (Owner mode only, with explicit confirmation)
  const handleDeleteOrder = async (order: Order) => {
    if (!isOwnerMode) {
      alert('Only the shop owner can delete orders. Switch to Owner mode first.');
      return;
    }
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

  const updateOrderStatus = async (order: Order, newStatus: string): Promise<Order | null> => {
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update order status.');
        return null;
      }
      const mergedOrder: Order = { ...order, ...data, status: newStatus as OrderStatus };
      setOrders(prev => prev.map(o => o.id === order.id ? mergedOrder : o));
      setSelectedOrder(prev => prev?.id === order.id ? mergedOrder : prev);
      return mergedOrder;
    } catch (err) {
      console.error(err);
      alert('Error updating order status.');
      return null;
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

  // Fetch customer order history
  const fetchCustomerOrders = async (customerId: string) => {
    setLoadingCustomerHistory(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerOrders(data);
      }
    } catch (err) {
      console.error('Error fetching customer orders:', err);
    } finally {
      setLoadingCustomerHistory(false);
    }
  };

  // Reload customer history when selected order changes and history is open
  useEffect(() => {
    if (showCustomerHistory && selectedOrder?.customer_id) {
      fetchCustomerOrders(selectedOrder.customer_id);
    }
  }, [selectedOrder?.id, showCustomerHistory]);

  // Reference data comes from localDataStore bootstrap — no per-tab network fetch

  // Instant local customer search for booking
  useEffect(() => {
    if (bookingStep !== 'customer' || !customerSearch.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (!localData.ready) {
      setSearching(localData.hydrating);
      return;
    }
    setSearching(false);
    setSearchResults(localDataStore.searchCustomers(customerSearch, 30));
  }, [customerSearch, bookingStep, localData.ready, localData.version, localData.hydrating]);

  // Instant duplicate-name check from local cache
  useEffect(() => {
    if (!newCustName.trim()) {
      setIsNameDuplicate(false);
      return;
    }
    if (!localData.ready) return;
    setIsNameDuplicate(localDataStore.nameExists(newCustName));
  }, [newCustName, localData.ready, localData.version]);

  // Helper to create a single booking item (optional profiles override for init-before-state-settles)
  const createDefaultBookingItem = (
    garmentType: GarmentType,
    profiles: MeasurementProfile[] = customerProfiles
  ): BookingItem => {
    const existingProfile = profiles.find(p => p.garment_type_id === garmentType.id);
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
      price: garmentType.price || 0,
      quantity: 1,
      delivery_date: sharedDeliveryDate || d.toLocaleDateString('en-CA'),
      measurement_snapshot,
      styling_snapshot,
      notes: '',
      color: ''
    };
  };

  const applyProfilesToBooking = (parsedProfiles: MeasurementProfile[]) => {
    setCustomerProfiles(parsedProfiles);
    setBookingItems(prev => {
      if (prev.length > 0 || garmentTypes.length === 0) return prev;
      const typesWithMeasurements = garmentTypes
        .filter(g => g.enabled !== false)
        .filter(g => {
          const profile = parsedProfiles.find(p => p.garment_type_id === g.id);
          return !!profile && profileHasSavedMeasurements(profile);
        })
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

      const fallbackType = garmentTypes.find(g => g.enabled) || garmentTypes[0];
      const typesToPreselect = typesWithMeasurements.length > 0
        ? typesWithMeasurements
        : (fallbackType ? [fallbackType] : []);

      return typesToPreselect.map(gt => createDefaultBookingItem(gt, parsedProfiles));
    });
  };

  // Auto-load measurements from local cache when customer selected
  useEffect(() => {
    if (!customer) {
      setCustomerProfiles([]);
      return;
    }

    const cachedProfiles = localDataStore.getProfiles(customer.id);
    const cachedEntry = localDataStore.getMeasurements(customer.id);
    if (cachedEntry || cachedProfiles.length > 0) {
      applyProfilesToBooking(cachedProfiles);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/customers/${customer.id}/measurements`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const mData = await res.json();
          cacheMeasurements(customer.id, {
            id: mData.id,
            customer_id: customer.id,
            data: mData.data || {},
            created_at: mData.created_at,
            updated_at: mData.updated_at,
          });
          const rawData = mData.data || {};
          const parsedProfiles: MeasurementProfile[] = Array.isArray(rawData.profiles) ? rawData.profiles : [];
          applyProfilesToBooking(parsedProfiles);
        }
      } catch (err) {
        console.error('Error loading customer profiles:', err);
      }
    })();
  }, [customer, garmentTypes, stylingCategories, localData.version, token]);

  // Load active customer if passed for order creation
  useEffect(() => {
    if (!activeCustomerId) return;
    const cached = localDataStore.getCustomerById(activeCustomerId);
    if (cached) {
      setCustomer(cached);
      setIsCreating(true);
      setBookingStep('garments');
      setSelectedOrder(null);
      setBookingItems([]);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/customers/${activeCustomerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const matched = await res.json();
          cacheCustomer(matched);
          setCustomer(matched);
          setIsCreating(true);
          setBookingStep('garments');
          setSelectedOrder(null);
          setBookingItems([]);
        }
      } catch (err) {
        console.error('Error fetching customer details for order:', err);
      }
    })();
  }, [activeCustomerId, token, localData.version]);

  const startNewBooking = () => {
    setCustomer(null);
    setBookingItems([]);
    setManuallyEditedPriceIds(new Set());
    setCustomerProfiles([]);
    setBookingStep('customer');
    setPaidAmount('');
    setCreateError(null);
    setCreateSuccess(false);
    setIsCreating(true);
    setSelectedOrder(null);
    const d = new Date();
    d.setDate(d.getDate() + 10);
    setSharedDeliveryDate(d.toLocaleDateString('en-CA'));
  };

  const handleSelectCustomer = async (cust: Customer) => {
    setCustomer(cust);
    setBookingStep('garments');
    setBookingItems([]);
    setManuallyEditedPriceIds(new Set());
    const d = new Date();
    d.setDate(d.getDate() + 10);
    setSharedDeliveryDate(d.toLocaleDateString('en-CA'));
  };

  const handleInlineCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const selectedGarment = newCustGarmentTypeId
      ? garmentTypes.find(g => g.id === newCustGarmentTypeId)
      : null;

    const result = await createCustomerWithMeasurements({
      token,
      name: newCustName,
      phone: newCustPhone,
      address: newCustAddress,
      isNameDuplicate,
      garment: selectedGarment,
      measurements: newCustMeasurements,
    });

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    setCustomer(result.customer);
    setCustomerProfiles(
      result.alreadyExists
        ? result.firstProfile
          ? [result.firstProfile]
          : []
        : [result.firstProfile]
    );

    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustGarmentTypeId('');
    setNewCustMeasurements({});
    setShowCreateCustomer(false);

    setBookingStep('garments');
    setBookingItems([]);
    setManuallyEditedPriceIds(new Set());
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
        price: manuallyEditedPriceIds.has(item.id) ? item.price : (selectedGarmentType.price || 0),
        measurement_snapshot,
        styling_snapshot
      };
    }));
  };

  const handleManualPriceEdit = (itemId: string, value: any) => {
    setManuallyEditedPriceIds(prev => new Set(prev).add(itemId));
    handleUpdateBookingItemField(itemId, 'price', value);
  };

  const handleUpdateBookingItemField = (itemId: string, field: keyof BookingItem, value: any) => {
    setBookingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, [field]: value };
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

  /** One shared measurement profile per garment type — never let last order item win. */
  const mergeProfilesFromBookingItems = (
    existingProfiles: MeasurementProfile[],
    items: typeof bookingItems
  ): MeasurementProfile[] => {
    const updatedProfiles = [...existingProfiles];
    const nowStr = new Date().toISOString();
    const seenGarmentTypes = new Set<string>();

    for (const item of items) {
      if (seenGarmentTypes.has(item.garment_type_id)) continue;
      seenGarmentTypes.add(item.garment_type_id);

      const existingIdx = updatedProfiles.findIndex(p => p.garment_type_id === item.garment_type_id);
      if (existingIdx !== -1) {
        // Update shared measurement values once. Do not overwrite styling_preferences —
        // styling is per order item (PROJECT.md §8), not a shared profile field to clobber.
        updatedProfiles[existingIdx] = {
          ...updatedProfiles[existingIdx],
          values: { ...item.measurement_snapshot },
          updated_at: nowStr,
        };
      } else {
        updatedProfiles.push({
          id: Math.random().toString(36).substring(2, 11),
          garment_type_id: item.garment_type_id,
          garment_name: item.type,
          values: { ...item.measurement_snapshot },
          // Seed defaults only when creating a new garment profile
          styling_preferences: { ...item.styling_snapshot },
          created_at: nowStr,
          updated_at: nowStr,
        });
      }
    }

    return updatedProfiles;
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
      // 1. Persist shared customer measurement profiles (one per garment type)
      const updatedProfiles = mergeProfilesFromBookingItems(customerProfiles, bookingItems);

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

      setCustomerProfiles(updatedProfiles);
      cacheMeasurements(customer.id, {
        customer_id: customer.id,
        data: { profiles: updatedProfiles },
        updated_at: new Date().toISOString(),
      });

      // Calculate totals
      const totalAmountVal = bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0);
      const overallDueDate = bookingItems.reduce((max, item) => {
        if (!max || item.delivery_date > max) return item.delivery_date;
        return max;
      }, '');

      const discountTypeVal = applyDiscount ? discountType : undefined;
      const discountValueVal = applyDiscount && discountValue ? Number(discountValue) : 0;
      const discountAmountVal = applyDiscount ? discountAmount : 0;
      const finalTotalVal = applyDiscount ? finalTotal : totalAmountVal;

      // 2. Insert order — item snapshots are a freeze for print/history; profile remains source of truth
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
            quantity: item.quantity,
            notes: item.notes,
            color: item.color,
            delivery_date: item.delivery_date,
            measurement_snapshot: item.measurement_snapshot,
            styling_snapshot: item.styling_snapshot
          })),
          total_amount: totalAmountVal,
          discount_type: discountTypeVal,
          discount_value: discountValueVal,
          discount_amount: discountAmountVal,
          final_total: finalTotalVal,
          paid_amount: paidAmount === '' ? 0 : Number(paidAmount),
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
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  useEffect(() => {
    const total = editedItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    setEditedTotal(total);
  }, [editedItems]);

  // Shared deliver gate: opens payment dialog when dues exist. Used by main pipeline + QR.
  // Returns true if the payment dialog was opened (caller must not advance status yet).
  const openDeliverPaymentIfNeeded = async (order: Order): Promise<boolean> => {
    const remaining = getOrderRemaining(order);

    let otherDueOrders: Order[] = [];
    let otherDues = 0;
    try {
      const otherRes = await fetch(`/api/customers/${order.customer_id}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (otherRes.ok) {
        const otherOrders: Order[] = await otherRes.json();
        otherDueOrders = (otherOrders || [])
          .filter((o) => o.id !== order.id && o.status !== 'Archived' && getOrderRemaining(o) > 0)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        otherDues = otherDueOrders.reduce((sum, o) => sum + getOrderRemaining(o), 0);
      }
    } catch {}

    if (remaining > 0 || otherDues > 0) {
      setPendingDeliverOrder(order);
      setPendingOtherDueOrders(otherDueOrders);
      setCollectAmount(remaining + otherDues);
      setOldDues(otherDues);
      setShowPaymentDialog(true);
      return true;
    }
    return false;
  };

  // Status transitions (main order detail / queue actions)
  const advanceOrderStatus = async (order: Order) => {
    const activeWorkflowStageIds = activeWorkflowStages.map(s => s.id);
    const currentIndex = activeWorkflowStageIds.indexOf(order.status);
    if (currentIndex === -1 || currentIndex === activeWorkflowStageIds.length - 1) return;

    const nextStatus = activeWorkflowStageIds[currentIndex + 1];

    if (nextStatus === 'Delivered') {
      const needsPayment = await openDeliverPaymentIfNeeded(order);
      if (needsPayment) return;
    }

    await updateOrderStatus(order, nextStatus);
  };

  // Manager-allowed: collect/adjust paid amount only (does not require Owner mode)
  const applyPaidAmountUpdate = async (order: Order, newPaidAmount: number): Promise<Order | null> => {
    const res = await fetch(`/api/orders/${order.id}/payment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paid_amount: newPaidAmount }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update payment for order ${order.order_number}.`);
    }
    const updatedOrder = await res.json();
    const merged = { ...order, ...updatedOrder, paid_amount: newPaidAmount };
    setOrders(prev => prev.map(o => o.id === merged.id ? merged : o));
    setSelectedOrder(prev => prev?.id === merged.id ? merged : prev);
    return merged;
  };

  const handleDeliverCollectPayment = async () => {
    if (!pendingDeliverOrder || collectingPayment) return;

    const amountToCollect = Math.max(0, Number(collectAmount) || 0);
    if (amountToCollect <= 0) {
      await handleDeliverSkipPayment();
      return;
    }

    setCollectingPayment(true);
    try {
      let remainingPool = amountToCollect;
      const paymentUpdates: { order: Order; newPaid: number }[] = [];

      // 1) Apply to the order being delivered first
      const currentDue = getOrderRemaining(pendingDeliverOrder);
      const toCurrent = Math.min(remainingPool, currentDue);
      remainingPool -= toCurrent;
      let currentNewPaid = (pendingDeliverOrder.paid_amount || 0) + toCurrent;

      // 2) Apply leftover to other unpaid orders (oldest first)
      for (const other of pendingOtherDueOrders) {
        if (remainingPool <= 0) break;
        const due = getOrderRemaining(other);
        if (due <= 0) continue;
        const apply = Math.min(remainingPool, due);
        paymentUpdates.push({ order: other, newPaid: (other.paid_amount || 0) + apply });
        remainingPool -= apply;
      }

      // 3) Any amount beyond total outstanding stays on the current order
      if (remainingPool > 0) {
        currentNewPaid += remainingPool;
      }

      if (currentNewPaid !== (pendingDeliverOrder.paid_amount || 0)) {
        await applyPaidAmountUpdate(pendingDeliverOrder, currentNewPaid);
      }
      for (const update of paymentUpdates) {
        await applyPaidAmountUpdate(update.order, update.newPaid);
      }

      const delivered = await updateOrderStatus(pendingDeliverOrder, 'Delivered');
      if (delivered) {
        resetPaymentDialog();
      } else {
        setCollectingPayment(false);
      }
    } catch (err: any) {
      console.error('Failed to collect payment:', err);
      alert(err?.message || 'Failed to collect payment. Order was not marked as delivered.');
      setCollectingPayment(false);
    }
  };

  const handleDeliverSkipPayment = async () => {
    if (!pendingDeliverOrder || collectingPayment) return;
    setCollectingPayment(true);
    const delivered = await updateOrderStatus(pendingDeliverOrder, 'Delivered');
    if (delivered) {
      resetPaymentDialog();
    } else {
      setCollectingPayment(false);
    }
  };

  // Exit edit form if Owner mode expires while editing
  useEffect(() => {
    if (!isOwnerMode && isEditing) {
      setIsEditing(false);
      setEditError(null);
    }
  }, [isOwnerMode, isEditing]);

  // Edit Order Submission (Owner mode required — server also enforces)
  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!isOwnerMode) {
      setEditError('Owner mode required to edit order details. Unlock Owner mode with your password.');
      return;
    }

    setEditError(null);

    try {
      const editDiscVal = editedDiscount.apply && editedDiscount.value ? Number(editedDiscount.value) : 0;
      const editDiscAmount = editedDiscount.apply && editDiscVal > 0
        ? (editedDiscount.type === 'percentage' ? Math.min((editedTotal * editDiscVal) / 100, editedTotal) : Math.min(editDiscVal, editedTotal))
        : 0;
      const editFinalTotal = editedDiscount.apply ? Math.max(0, editedTotal - editDiscAmount) : editedTotal;

      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: editedItems,
          total_amount: editedTotal,
          discount_type: editedDiscount.apply ? editedDiscount.type : undefined,
          discount_value: editDiscVal,
          discount_amount: editDiscAmount,
          final_total: editFinalTotal,
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

  const handleEditAddItem = () => {
    const fallbackType = garmentTypes.find(g => g.enabled) || garmentTypes[0];
    if (!fallbackType) return;

    const measurement_snapshot: Record<string, string | number> = {};
    fallbackType.measurement_fields.forEach(f => {
      measurement_snapshot[f.name] = '';
    });

    const styling_snapshot: Record<string, string> = {};
    const enabledCategories = stylingCategories.filter(
      sc => sc.garment_type_id === fallbackType.id && sc.options && sc.options.some(o => o.enabled)
    );
    enabledCategories.forEach(cat => {
      const firstEnabled = cat.options.find(o => o.enabled);
      if (firstEnabled) {
        styling_snapshot[cat.id] = firstEnabled.id;
      }
    });

    setEditedItems(prev => [...prev, {
      type: fallbackType.name,
      price: fallbackType.price || 0,
      notes: '',
      color: '',
      measurement_snapshot,
      styling_snapshot,
    }]);
  };

  const handleEditRemoveItem = (index: number) => {
    if (editedItems.length <= 1) return;
    setEditedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = (index: number, key: keyof OrderItem, val: any) => {
    setEditedItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  const handleEditStylingChange = (index: number, categoryId: string, optionId: string) => {
    setEditedItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        styling_snapshot: {
          ...(item.styling_snapshot || {}),
          [categoryId]: optionId
        }
      };
    }));
  };

  const handleEditGarmentChange = (index: number, newGarmentTypeId: string) => {
    const selectedGarmentType = garmentTypes.find(g => g.id === newGarmentTypeId);
    if (!selectedGarmentType) return;

    setEditedItems(prev => prev.map((item, i) => {
      if (i !== index) return item;

      const measurement_snapshot: Record<string, string | number> = {};
      selectedGarmentType.measurement_fields.forEach(f => {
        measurement_snapshot[f.name] = '';
      });

      const styling_snapshot: Record<string, string> = {};
      const enabledCategories = stylingCategories.filter(sc => sc.garment_type_id === selectedGarmentType.id && sc.options && sc.options.some(o => o.enabled));
      enabledCategories.forEach(cat => {
        const firstEnabled = cat.options.find(o => o.enabled);
        if (firstEnabled) {
          styling_snapshot[cat.id] = firstEnabled.id;
        }
      });

      return {
        ...item,
        type: selectedGarmentType.name,
        price: selectedGarmentType.price || 0,
        measurement_snapshot,
        styling_snapshot
      };
    }));
  };

  const triggerPrintReceipt = () => {
    setPrintOptions({ receipt: true, measure: false });
    setTimeout(() => {
      printPage();
    }, 100);
  };

  // Status badge styles live in lib/statusUi + ScanValue StatusBadge


  // CAMERA SCANNER & OVERLAY HELPERS
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [scannerActiveTab, setScannerActiveTab] = useState<'camera' | 'simulator'>('camera');

  // Handle scanned value (stable hellodarzi:// payload or legacy ?orderId= URL)
  const handleScannedValue = async (value: string) => {
    try {
      const parsed = parseOrderQrPayload(value);
      if (!parsed?.orderId) {
        alert('Invalid QR code scanned. It does not contain an Order ID.');
        return;
      }

      const { orderId, itemIdx: parsedItemIdx } = parsed;

      // Close scanner modal
      setIsScannerOpen(false);

      // Trigger a gentle vibration for haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(100);
      }

      // Fetch order details
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const fullOrder = await res.json();
        const itemIdx = parsedItemIdx !== undefined ? parsedItemIdx : 0;

        setScannedGarmentItem({
          order: fullOrder,
          itemIdx: itemIdx,
        });
      } else {
        alert('Could not locate the scanned order record.');
      }
    } catch (err) {
      console.error('Error handling scanned QR code:', err);
      alert('Error parsing scanned QR Code.');
    }
  };

  // Camera stream and scanning loop effect
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    if (isScannerOpen && scannerActiveTab === 'camera') {
      setCameraPermissionError(null);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.play().catch(e => console.error("Error playing video:", e));
            
            // Start frame scan loop
            const scan = () => {
              if (!videoRef.current || !canvasRef.current || !isScannerOpen || scannerActiveTab !== 'camera') {
                return;
              }

              const video = videoRef.current;
              const canvas = canvasRef.current;
              const context = canvas.getContext('2d');

              if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                if (code) {
                  handleScannedValue(code.data);
                  return; // Exit loop on success
                }
              }
              animationFrameId = requestAnimationFrame(scan);
            };
            animationFrameId = requestAnimationFrame(scan);
          }
        })
        .catch((err) => {
          console.error('Error accessing camera:', err);
          setCameraPermissionError('Could not use the camera. Check permissions, or try Test mode.');
          setScannerActiveTab('simulator');
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScannerOpen, scannerActiveTab]);

  // Update status from Scanned Garment Compact Action Screen (same deliver/payment gate as main pipeline)
  const handleUpdateScannedStatus = async (nextStatus: string) => {
    if (!scannedGarmentItem) return;
    const { order } = scannedGarmentItem;

    setUpdatingStatus(true);
    try {
      if (nextStatus === 'Delivered') {
        const needsPayment = await openDeliverPaymentIfNeeded(order);
        if (needsPayment) {
          // Payment dialog takes over; close scanned modal to avoid stacked overlays
          setScannedGarmentItem(null);
          return;
        }
      }

      const mergedOrder = await updateOrderStatus(order, nextStatus);
      if (mergedOrder) {
        setScannedGarmentItem((prev) => (prev ? { ...prev, order: mergedOrder } : null));
        setUpdateSuccessState(true);
        setTimeout(() => {
          setUpdateSuccessState(false);
          setScannedGarmentItem(null);
          fetchOrders();
        }, 1200);
      }
    } catch (err) {
      console.error('Error updating garment stage:', err);
      alert('Error communicating with server.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePrintAgainScanned = (order: Order) => {
    setSelectedOrder(order);
    setPrintOptions({ receipt: true, measure: true });
    setTimeout(() => {
      printPage();
    }, 200);
  };

  return (
    <div className={`grid grid-cols-1 gap-3 items-stretch min-h-0 ${isCreating ? '' : 'lg:grid-cols-12 lg:h-full'}`}>
      
      {/* LEFT COLUMN: Queue / Filters */}
      {!isCreating && (
        <div className="lg:col-span-5 card stack-sm flex flex-col min-h-0 overflow-hidden lg:h-full">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h2 className="text-h2">
              {viewMode === 'Active' ? 'Open orders' : 'Finished orders'}
            </h2>
            {!isCreating && (
              <button
                onClick={startNewBooking}
                className="btn-primary"
              >
                <ShoppingCart className="icon-sm" />
                Book Order
              </button>
            )}
          </div>

          {/* Segmented Control for Active vs Archived */}
          <div className="grid grid-cols-2 filter-group shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('Active');
                setActiveFilter('All');
              }}
              className={`filter-tab ${viewMode === 'Active' ? 'filter-tab-active' : ''}`}
            >
              Open orders
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('Archived');
                setActiveFilter('Archived');
              }}
              className={`filter-tab ${viewMode === 'Archived' ? 'filter-tab-active' : ''}`}
            >
              Finished orders
            </button>
          </div>

          {/* Status Filters - Only shown in Active view mode */}
          {viewMode === 'Active' ? (
            <div className="filter-group justify-center shrink-0">
              {['All', ...activeQueueStages.map(s => s.id)].map((tabId) => {
                const isSelected = activeFilter === tabId;
                const tabName = tabId === 'All' ? 'All' : (stagesList.find(s => s.id === tabId)?.name || tabId);
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveFilter(tabId)}
                    className={`filter-tab ${isSelected ? 'filter-tab-solid' : ''}`}
                    title={tabName}
                  >
                    {tabName}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-center text-secondary text-xs font-semibold uppercase tracking-wider shrink-0">
              Showing finished orders
            </div>
          )}

          {/* Search & Scanner */}
          <div className="stack-sm flex-1 min-h-0 flex flex-col">
            <div className="flex gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 icon-xs text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search order #, customer name..."
                  className="input-base pl-8"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="btn-secondary"
                title="Scan QR Code from Device Camera"
              >
                <QrCode className="icon-sm" />
                <span className="hidden sm:inline">Scan QR</span>
              </button>
            </div>

            {/* Active List — only scroll owner in this column */}
            <div className="panel-scroll space-y-1.5 pr-0.5">
              {loading && (
                <p className="text-center text-muted text-xs font-semibold uppercase tracking-wider py-3">
                  Refreshing Queue...
                </p>
              )}
              {!loading && orders.length === 0 && (
                <div className="empty-state py-8">
                  <ShoppingCart className="empty-state-icon" aria-hidden="true" />
                  <p className="empty-state-title">No orders here</p>
                  <p className="empty-state-text">
                    {viewMode === 'Active'
                      ? 'Book a new order or clear filters to see the queue.'
                      : 'Finished orders will appear in this list.'}
                  </p>
                </div>
              )}
              {orders.map((o) => {
                const isSelected = selectedOrder?.id === o.id;
                const remaining = (o.final_total ?? o.total_amount) - o.paid_amount;
                return (
                  <button
                    key={o.id}
                    onClick={() => selectOrderWithDetails(o)}
                    className={`list-row ${isSelected ? 'list-row-selected' : ''}`}
                  >
                    <div className="space-y-1 min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <OrderId value={o.order_number} />
                        <StatusBadge
                          status={o.status}
                          label={stagesList.find(s => s.id === o.status)?.name || o.status}
                        />
                      </div>
                      <CustomerName name={o.customer_name} as="p" className="truncate" />
                      <DeliveryDateText dueDate={o.due_date} className="text-3xs uppercase tracking-wider" />
                    </div>
                    <div className="text-right space-y-1 shrink-0">
                      <MoneyTotal
                        currency={currency}
                        amount={o.total_amount}
                        className="text-sm block leading-tight"
                      />
                      <PaymentChip currency={currency} remaining={remaining} />
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={loadMoreOrders}
                  disabled={loading}
                  className="btn-secondary w-full mt-1"
                >
                  {loading ? 'Loading...' : 'Load More Orders'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Action Forms or Details */}
      <div className={`${isCreating ? 'lg:col-span-12' : 'lg:col-span-7 lg:h-full'} card stack-md min-h-0 overflow-x-hidden overflow-y-auto`}>
        
        {isCreating ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 font-display uppercase tracking-wider">
                  New Order
                </h3>
                {customer && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    For <span className="font-semibold text-slate-700">{customer.name}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  if (onClearActiveCustomer) onClearActiveCustomer();
                }}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-0 text-xs font-semibold uppercase tracking-wider">
              {[
                { key: 'customer', label: 'Customer', done: !!customer },
                { key: 'garments', label: 'Garments', done: bookingItems.length > 0 },
                { key: 'summary', label: 'Review & Lock', done: false },
              ].map((step, i) => {
                const isActive = bookingStep === step.key;
                const isDone = step.done && !isActive;
                return (
                  <div key={step.key} className={`flex items-center ${isActive ? 'text-feedback-info' : isDone ? 'text-feedback-success' : 'text-muted'}`}>
                    {i > 0 && <div className={`w-8 h-px mx-1.5 ${isDone || isActive ? 'bg-success-200' : 'bg-slate-300'}`} />}
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${
                      isActive ? 'bg-info-50 border border-info-200 font-bold' : 'font-semibold'
                    }`}>
                      {isDone ? <Check className="icon-xs" /> : <>{i + 1}. </>}
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {createError && (
              <div className="alert-error">
                {createError}
              </div>
            )}

            {/* STEP 1: CUSTOMER */}
            {bookingStep === 'customer' && (
              <div className="animate-fade-in space-y-3">
                {!showCreateCustomer ? (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3.5 top-3.5 icon-xs text-slate-400" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="input-base pl-10 font-semibold"
                        placeholder="Search customer by name, phone or email..."
                      />
                    </div>

                    {customerSearch.trim() && (
                      <div className="bg-white border border-slate-200 rounded-xl max-h-[45vh] overflow-y-auto divide-y divide-slate-100 shadow-sm">
                        {searching ? (
                          <div className="p-4 text-center text-slate-400 text-sm uppercase font-semibold">Searching...</div>
                        ) : searchResults.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm uppercase font-semibold">No matching customers</div>
                        ) : (
                          searchResults.map((cust) => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => handleSelectCustomer(cust)}
                              className="w-full text-left px-4 py-3 hover:bg-sky-50 flex items-center justify-between cursor-pointer group transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-slate-800 text-sm break-words block group-hover:text-sky-600">{cust.name}</span>
                                <span className="text-xs text-slate-500 break-words block">
                                  {cust.phone && !cust.phone.startsWith('NO-PHONE-') ? cust.phone : 'No Phone'}
                                  {cust.email ? ` \u2022 ${cust.email}` : ''}
                                </span>
                              </div>
                              <ChevronRight className="icon-xs shrink-0 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">or</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateCustomer(true)}
                      className="btn-primary w-full"
                    >
                      <UserPlus className="icon-xs text-brand-sky" />
                      Create New Customer
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleInlineCreateCustomer} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-700 uppercase tracking-wider">New Customer</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateCustomer(false);
                          setNewCustGarmentTypeId('');
                          setNewCustMeasurements({});
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-semibold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        autoFocus
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-black/10 placeholder:text-slate-400"
                        placeholder="Full Name *"
                      />
                      <input
                        type="tel"
                        required={isNameDuplicate}
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-slate-800 focus-visible:outline-none placeholder:text-slate-400 ${isNameDuplicate ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200 focus:border-brand-sky focus:ring-1 focus:ring-black/10'}`}
                        placeholder={`Phone${isNameDuplicate ? ' * (Required)' : ''}`}
                      />
                    </div>

                    <input
                      type="text"
                      value={newCustAddress}
                      onChange={(e) => setNewCustAddress(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-black/10 placeholder:text-slate-400"
                      placeholder="Address"
                    />

                    <div className="pt-1.5 border-t border-slate-200">
                      <p className="text-3xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Garment Type &amp; Measurements *</p>
                      <select
                        value={newCustGarmentTypeId}
                        onChange={(e) => {
                          setNewCustGarmentTypeId(e.target.value);
                          setNewCustMeasurements({});
                        }}
                        className="input-base text-sm font-semibold mb-2"
                      >
                        <option value="">-- Select Garment Type --</option>
                        {garmentTypes.filter(g => g.enabled).map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>

                      {newCustGarmentTypeId && (() => {
                        const selG = garmentTypes.find(g => g.id === newCustGarmentTypeId);
                        if (!selG) return null;
                        const mFields = selG.measurement_fields || [];
                        if (mFields.length === 0) return (
                          <p className="text-xs text-amber-600 font-semibold">No measurement fields defined for this garment type.</p>
                        );
                        return (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 bg-white border border-slate-200 rounded-lg">
                            {mFields.map((field) => (
                              <div key={field.name} className="flex flex-col min-w-0">
                                <label className="text-3xs font-bold text-slate-500 uppercase tracking-wide">
                                  {field.name} {field.required ? '*' : ''}
                                </label>
                                <input
                                  type="text"
                                  required={field.required}
                                  placeholder={field.required ? 'Required' : '--'}
                                  value={newCustMeasurements[field.name] ?? ''}
                                  onChange={(e) => setNewCustMeasurements(prev => ({ ...prev, [field.name]: e.target.value }))}
                                  className="mt-0.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs font-semibold focus-visible:outline-none focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20"
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    <button
                      type="submit"
                      disabled={!!validateGarmentMeasurementsCompleted(
                        garmentTypes.find(g => g.id === newCustGarmentTypeId),
                        newCustMeasurements
                      )}
                      className="btn-success w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save & Continue
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* STEP 2: GARMENTS */}
            {bookingStep === 'garments' && customer && (
              <div className="animate-fade-in space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">
                      Garments <span className="text-slate-400 font-semibold">({bookingItems.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAddBookingItem}
                      className="btn-primary"
                    >
                      <Plus className="icon-xs" /> Add
                    </button>
                  </div>

                </div>

                {/* Garment cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {bookingItems.map((item, index) => (
                    <div key={item.id} className="card card-hover">
                      {/* Header: badge + type + price + delete */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <span className="text-xs font-black text-slate-500 bg-slate-100 rounded-md px-2 py-1 leading-tight">
                          {(index + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="text-sm font-black text-slate-800 uppercase tracking-wide flex-1 break-words">
                          {item.type}
                        </span>
                        <span className="text-sm font-black text-slate-900 shrink-0">{currency}{item.price || 0}</span>
                        <button
                          type="button"
                          aria-label="Remove item"
                          onClick={() => handleRemoveBookingItem(item.id)}
                          disabled={bookingItems.length <= 1}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer p-1 shrink-0"
                        >
                          <Trash2 className="icon-xs" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="p-3 space-y-2">
                        {/* Type */}
                        <select
                          value={item.garment_type_id}
                          onChange={(e) => handleUpdateBookingItemGarment(item.id, e.target.value)}
                          className="input-base font-semibold"
                        >
                          {garmentTypes.map(g => (
                            <option key={g.id} value={g.id} disabled={!g.enabled}>{g.name}</option>
                          ))}
                        </select>

                        {/* Price + Color */}
                        <div className="grid grid-cols-5 gap-2">
                          <div className="col-span-3">
                            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">Price ({currency})</span>
                            <input
                              type="number"
                              min="0"
                              value={item.price !== undefined ? item.price : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleManualPriceEdit(item.id, val === '' ? '' : Number(val));
                              }}
                              className="input-base font-semibold text-base"
                              placeholder="0"
                            />
                          </div>
                          <div className="col-span-2">
                            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">Color</span>
                            <input
                              type="text"
                              value={item.color || ''}
                              onChange={(e) => handleUpdateBookingItemField(item.id, 'color', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-black/10 placeholder:text-slate-400"
                              placeholder="e.g. Navy"
                            />
                          </div>
                        </div>

                        {/* Styling chips */}
                        {stylingCategories.some(cat => cat.garment_type_id === item.garment_type_id && cat.options && cat.options.some(o => o.enabled)) && (
                          <div className="pt-1.5 border-t border-slate-100">
                            {stylingCategories
                              .filter(cat => cat.garment_type_id === item.garment_type_id && cat.options && cat.options.some(o => o.enabled))
                              .map(cat => {
                                const selectedOptionId = item.styling_snapshot[cat.id] || '';
                                const activeOptions = cat.options.filter(o => o.enabled);
                                return (
                                  <div key={cat.id} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                                    <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider shrink-0 min-w-[40px]">{cat.name}</span>
                                    <div className="flex gap-1 flex-wrap">
                                      {activeOptions.map(opt => {
                                        const isSelected = selectedOptionId === opt.id;
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => handleUpdateBookingItemStyling(item.id, cat.id, opt.id)}
                                            className={`text-xs font-semibold px-2 py-1 rounded-md border transition-[background-color,border-color,color] cursor-pointer leading-tight ${
                                              isSelected
                                                ? 'bg-brand-sky/10 border-brand-sky text-sky-600'
                                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'
                                            }`}
                                          >
                                            {opt.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBookingStep('customer')}
                    className="btn-secondary"
                  >
                    <ChevronLeft className="icon-xs" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const invalid = bookingItems.some(item => !item.price || item.price <= 0);
                      if (invalid) {
                        if (!confirm('Some items have a price of 0. Proceed anyway?')) return;
                      }
                      setBookingStep('summary');
                    }}
                    className="btn-primary"
                  >
                    Review <ChevronRight className="icon-xs" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: REVIEW & LOCK */}
            {bookingStep === 'summary' && customer && (
              <div className="animate-fade-in space-y-3">
                {/* Customer badge */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-white border border-slate-200 rounded-lg shrink-0">
                      <Users className="icon-xs text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-slate-800 block break-words">{customer.name}</span>
                      <span className="text-xs text-slate-500">{customer.phone}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBookingStep('customer')}
                    className="text-xs text-sky-600 hover:text-sky-800 font-semibold uppercase tracking-wider shrink-0 cursor-pointer ml-2"
                  >
                    Change
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
                    Garments ({bookingItems.length})
                  </span>
                </div>

                {/* Garment cards */}
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-0.5">
                  {bookingItems.map((item, idx) => (
                    <div key={item.id} className="p-3 card">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-black text-slate-800 uppercase tracking-wide">
                          #{(idx + 1).toString().padStart(2, '0')} {item.type}
                          {item.quantity > 1 && (
                            <span className="ml-2 text-xs font-semibold text-slate-400">x{item.quantity}</span>
                          )}
                        </span>
                        <span className="text-base font-black text-slate-900">
                          {currency}{item.price}{item.quantity > 1 ? <span className="text-xs font-semibold text-slate-400 ml-1">({currency}{item.price * item.quantity})</span> : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {item.color && (
                          <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold text-slate-600">
                            {item.color}
                          </span>
                        )}
                        {Object.keys(item.styling_snapshot).length > 0 && Object.entries(item.styling_snapshot)
                          .filter(([catId]) => {
                            const catObj = stylingCategories.find(c => c.id === catId);
                            const gType = garmentTypes.find(g => g.id === item.garment_type_id);
                            return catObj && gType && catObj.garment_type_id === gType.id;
                          })
                          .map(([catId, optId]) => {
                            const catObj = stylingCategories.find(c => c.id === catId);
                            const optObj = catObj?.options.find(o => o.id === optId);
                            return (
                              <span key={catId} className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200">
                                {catObj?.name}: {optObj?.name || optId}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery Date - prominent card */}
                <div className="p-4 bg-white border-2 border-brand-sky/30 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2.5 bg-sky-50 rounded-lg shrink-0">
                      <Calendar className="w-5 h-5 text-brand-sky" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block leading-tight">Delivery Date</span>
                      <input
                        type="date"
                        required
                        value={sharedDeliveryDate}
                        onChange={(e) => updateSharedDeliveryDate(e.target.value)}
                        className="mt-0.5 block w-full bg-transparent border-0 p-0 font-display text-xl font-black text-slate-800 focus-visible:outline-none focus-visible:ring-0"
                        style={{ colorScheme: 'light' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Financials */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-label mb-0">Total</span>
                      <MoneyTotal currency={currency} amount={rawTotal} className="text-2xl block mt-1" />
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="text-label">Paid Amount ({currency})</label>
                      <input
                        type="number"
                        min="0"
                        max={maxPaid}
                        value={paidAmount}
                        onFocus={() => {
                          if (paidAmount === '' || paidAmount === '0') {
                            setPaidAmount('');
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '-' || val === '0') {
                            setPaidAmount('0');
                          }
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setPaidAmount('');
                            return;
                          }
                          if (raw === '-') {
                            setPaidAmount(raw);
                            return;
                          }
                          const num = Number(raw);
                          if (!isNaN(num) && num >= 0) {
                            if (num <= maxPaid) {
                              setPaidAmount(raw);
                            }
                          }
                        }}
                        className="input-base font-semibold text-base"
                        placeholder="0"
                      />
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-label mb-0">Remaining</span>
                      {(() => {
                        const rem = Math.max(0, finalTotal - (paidAmount === '' ? 0 : Number(paidAmount)));
                        return rem > 0 ? (
                          <span className="text-2xl text-money-due font-display block mt-1">
                            {formatMoney(currency, rem)}
                          </span>
                        ) : (
                          <span className="text-2xl text-money-paid font-display block mt-1">
                            {formatMoney(currency, 0)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Discount Toggle */}
                  <div className="p-2 flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyDiscount}
                        onChange={(e) => {
                          setApplyDiscount(e.target.checked);
                          if (!e.target.checked) {
                            setDiscountValue('');
                            setDiscountType('fixed');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500" />
                    </label>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">Apply Discount</span>
                  </div>

                  {/* Discount Fields (visible when toggled) */}
                  {applyDiscount && (
                    <div className="animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-sky-50/40 border border-sky-200 rounded-xl">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Discount Type</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDiscountType('fixed')}
                            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                              discountType === 'fixed'
                                ? 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'
                            }`}
                          >
                            Fixed ({currency})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountType('percentage')}
                            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                              discountType === 'percentage'
                                ? 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'
                            }`}
                          >
                            Percentage (%)
                          </button>
                        </div>
                      </div>
                      <div className="p-3 bg-sky-50/40 border border-sky-200 rounded-xl">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                          Discount Value {discountType === 'percentage' ? '(%)' : `(${currency})`}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={discountType === 'percentage' ? 100 : rawTotal}
                          value={discountValue}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') { setDiscountValue(''); return; }
                            if (raw === '-') return;
                            const num = Number(raw);
                            if (!isNaN(num) && num >= 0) {
                              if (discountType === 'percentage' && num > 100) return;
                              setDiscountValue(raw);
                            }
                          }}
                          className="input-base font-semibold text-base"
                          placeholder={discountType === 'percentage' ? '0%' : `0`}
                        />
                        {discountValue && Number(discountValue) > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-medium">Original Total:</span>
                              <span className="font-semibold text-slate-700">{currency}{rawTotal}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-red-500 font-medium">Discount:</span>
                              <span className="font-semibold text-red-600">-{currency}{Math.round(discountAmount)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold border-t border-sky-200 pt-0.5">
                              <span className="text-slate-700">Final Total:</span>
                              <span className="text-sky-700">{currency}{Math.round(finalTotal)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBookingStep('garments')}
                    className="btn-secondary shrink-0"
                  >
                    <ChevronLeft className="icon-xs" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeBooking}
                    className="btn-success flex-1"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Lock Order & Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : selectedOrder ? (
          /* ORDER DETAILS & VIEW */
          <div className="space-y-4">
            
            {isEditing ? (
              /* OWNER EDITING PORTAL */
              <form onSubmit={handleEditOrder} className="space-y-3 animate-fade-in">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-extrabold text-base text-slate-900 font-display uppercase tracking-wider">Edit order: {selectedOrder.order_number}</h3>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-slate-500 hover:text-slate-800 font-semibold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {editError && (
                  <div className="alert-error">
                    {editError}
                  </div>
                )}

                {/* Edit Items */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider">Configure Order Items</span>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer border border-slate-200"
                    >
                      ADD ITEM
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {editedItems.map((item, index) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                        <div className="grid grid-cols-12 gap-3 items-start">
                          <div className="col-span-4 space-y-1">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Garment Type</label>
                            <select
                              value={(() => {
                                const gt = garmentTypes.find(g => g.name === item.type);
                                return gt ? gt.id : '';
                              })()}
                              onChange={(e) => handleEditGarmentChange(index, e.target.value)}
                              className="input-base font-semibold text-xs"
                            >
                              {garmentTypes.map(g => (
                                <option key={g.id} value={g.id} disabled={!g.enabled}>{g.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-3 space-y-1">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Price ({currency})</label>
                            <input
                              type="number"
                              min="0"
                              value={item.price || ''}
                              onChange={(e) => handleEditItemChange(index, 'price', Number(e.target.value))}
                              className="input-base font-semibold text-xs"
                            />
                          </div>

                          <div className="col-span-4 space-y-1">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Color</label>
                            <input
                              type="text"
                              value={item.color || ''}
                              onChange={(e) => handleEditItemChange(index, 'color', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus-visible:outline-none focus:border-brand-sky"
                              placeholder="Color"
                            />
                          </div>

                          <div className="col-span-1 pt-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(index)}
                              disabled={editedItems.length <= 1}
                              className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="icon-xs" />
                            </button>
                          </div>
                        </div>

                        {(() => {
                          const gt = garmentTypes.find(g => g.name === item.type);
                          if (!gt) return null;
                          const hasStyling = stylingCategories.some(cat => cat.garment_type_id === gt.id && cat.options && cat.options.some(o => o.enabled));
                          if (!hasStyling) return null;
                          return (
                            <div className="pt-1.5 border-t border-slate-100">
                              {stylingCategories
                                .filter(cat => cat.garment_type_id === gt.id && cat.options && cat.options.some(o => o.enabled))
                                .map(cat => {
                                  const selectedOptionId = (item.styling_snapshot && item.styling_snapshot[cat.id]) || '';
                                  const activeOptions = cat.options.filter(o => o.enabled);
                                  return (
                                    <div key={cat.id} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                                      <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider shrink-0 min-w-[40px]">{cat.name}</span>
                                      <div className="flex gap-1 flex-wrap">
                                        {activeOptions.map(opt => {
                                          const isSelected = selectedOptionId === opt.id;
                                          return (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              onClick={() => handleEditStylingChange(index, cat.id, opt.id)}
                                              className={`text-xs font-semibold px-2 py-1 rounded-md border transition-[background-color,border-color,color] cursor-pointer leading-tight ${
                                                isSelected
                                                  ? 'bg-brand-sky/10 border-brand-sky text-sky-600'
                                                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'
                                              }`}
                                            >
                                              {opt.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Edit financials & delivery date */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Calculated Total</span>
                    <span className="text-lg font-black text-slate-800 mt-1 font-display">{currency}{editedTotal}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">Paid ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      value={editedPaid}
                      onChange={(e) => setEditedPaid(Number(e.target.value))}
                      className="input-base font-semibold text-xs"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">Due Date</label>
                    <input
                      type="date"
                      value={editedDueDate}
                      onChange={(e) => setEditedDueDate(e.target.value)}
                      className="input-base font-semibold text-xs"
                    />
                  </div>
                </div>

                {/* Edit Discount */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedDiscount.apply}
                      onChange={(e) => setEditedDiscount(prev => ({ ...prev, apply: e.target.checked, value: e.target.checked ? prev.value : '' }))}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500" />
                    <span className="ml-2 text-xs font-semibold text-slate-600 uppercase tracking-wider select-none">Apply Discount</span>
                  </label>
                  {editedDiscount.apply && (
                    <div className="grid grid-cols-2 gap-2 animate-fade-in">
                      <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Type</label>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditedDiscount(prev => ({ ...prev, type: 'fixed', value: '' }))}
                            className={`flex-1 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border cursor-pointer transition-all ${
                              editedDiscount.type === 'fixed'
                                ? 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Fixed ({currency})
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditedDiscount(prev => ({ ...prev, type: 'percentage', value: '' }))}
                            className={`flex-1 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border cursor-pointer transition-all ${
                              editedDiscount.type === 'percentage'
                                ? 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            %
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Value</label>
                        <input
                          type="number"
                          min="0"
                          max={editedDiscount.type === 'percentage' ? 100 : editedTotal}
                          value={editedDiscount.value}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') { setEditedDiscount(prev => ({ ...prev, value: '' })); return; }
                            if (raw === '-') return;
                            const num = Number(raw);
                            if (!isNaN(num) && num >= 0) {
                              if (editedDiscount.type === 'percentage' && num > 100) return;
                              setEditedDiscount(prev => ({ ...prev, value: raw }));
                            }
                          }}
                          className="input-base font-semibold text-xs"
                          placeholder={editedDiscount.type === 'percentage' ? '0%' : '0'}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit Snapshot measurements */}
                <div className="pt-2">
                  <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider block mb-2">Edit measurements for this order</span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {measurementFields.map((field) => (
                      <div key={field} className="space-y-1">
                        <label className="text-xs font-extrabold text-slate-500 block uppercase tracking-wide break-words leading-tight">{field}</label>
                        <input
                          type="text"
                          value={editedSnapshot[field] || ''}
                          onChange={(e) => setEditedSnapshot(prev => ({ ...prev, [field]: e.target.value }))}
                          className="input-base font-semibold text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full"
                >
                  Save Modifications
                </button>
              </form>
            ) : (
              /* DETAILED VIEW MODE */
              <div className="space-y-4 animate-fade-in">
                
                {/* Header info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <OrderId value={selectedOrder.order_number} className="!text-xl !font-bold font-display tracking-tight" />
                      <StatusBadge
                        status={selectedOrder.status}
                        label={stagesList.find(s => s.id === selectedOrder.status)?.name || selectedOrder.status}
                      />
                      {selectedOrder.items && (
                        <span className="text-xs font-semibold text-secondary font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                          {selectedOrder.items.length} item{selectedOrder.items.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <CustomerName name={selectedOrder.customer_name} as="p" className="!text-base" />
                    <p className="text-xs text-secondary">
                      Contact: <span className="text-primary">{selectedOrder.customer_phone && !selectedOrder.customer_phone.startsWith('NO-PHONE-') ? selectedOrder.customer_phone : 'Not Provided'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!showCustomerHistory && selectedOrder.customer_id) {
                            fetchCustomerOrders(selectedOrder.customer_id);
                          }
                          setShowCustomerHistory(!showCustomerHistory);
                        }}
                        className={`ml-2 px-1.5 py-0.5 rounded text-3xs font-semibold uppercase tracking-wider border cursor-pointer transition-colors ${
                          showCustomerHistory
                            ? 'bg-brand-sidebar text-white border-brand-sidebar'
                            : 'bg-slate-50 text-secondary border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {showCustomerHistory ? 'Hide History' : 'Order History'}
                      </button>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                    <button
                      onClick={triggerPrintReceipt}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-[background-color,border-color] hover:border-slate-300"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      Print
                    </button>

                    {isOwnerMode && selectedOrder.status !== 'Delivered' && selectedOrder.status !== 'Archived' && (
                      <button
                        onClick={() => {
                          setEditedItems([...(selectedOrder.items || [])]);
                          setEditedPaid(selectedOrder.paid_amount);
                          setEditedDueDate(selectedOrder.due_date.split('T')[0]);
                          setEditedSnapshot({ ...selectedOrder.measurement_snapshot });
                          setEditedDiscount({
                            apply: !!selectedOrder.discount_type && Number(selectedOrder.discount_amount) > 0,
                            type: selectedOrder.discount_type || 'fixed',
                            value: selectedOrder.discount_value ? String(selectedOrder.discount_value) : '',
                          });
                          setIsEditing(true);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-[background-color]"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-brand-sky" />
                        Edit
                      </button>
                    )}

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        className="px-2 py-1.5 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-[background-color,border-color] hover:border-slate-300"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {showMoreMenu && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                          {isOwnerMode && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowMoreMenu(false);
                                handleDeleteOrder(selectedOrder);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer border-none"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer Order History Panel */}
                {showCustomerHistory && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden print:hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-3xs font-extrabold text-slate-600 uppercase tracking-wider">Customer Order History</span>
                      {loadingCustomerHistory && (
                        <span className="text-3xs text-slate-400 font-semibold">Loading...</span>
                      )}
                      {!loadingCustomerHistory && (
                        <span className="text-3xs text-slate-400 font-semibold">{customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="max-h-[40vh] overflow-y-auto divide-y divide-slate-100 bg-white">
                      {loadingCustomerHistory && customerOrders.length === 0 && (
                        <div className="empty-state py-6">
                          <p className="empty-state-text">Loading history...</p>
                        </div>
                      )}
                      {!loadingCustomerHistory && customerOrders.length === 0 && (
                        <div className="empty-state py-6">
                          <p className="empty-state-title">No previous orders</p>
                          <p className="empty-state-text">This customer has no other orders yet.</p>
                        </div>
                      )}
                      {customerOrders.map((o) => {
                        const isCurrentOrder = selectedOrder?.id === o.id;
                        const remaining = (o.final_total ?? o.total_amount) - o.paid_amount;
                        return (
                          <button
                            key={o.id}
                            onClick={() => selectOrderWithDetails(o)}
                            className={`w-full p-2.5 text-left border-0 transition-colors flex items-center justify-between cursor-pointer ${
                              isCurrentOrder
                                ? 'bg-info-50'
                                : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1 mr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <OrderId value={o.order_number} />
                                <StatusBadge
                                  status={o.status}
                                  label={stagesList.find(s => s.id === o.status)?.name || o.status}
                                />
                              </div>
                              <DeliveryDateText dueDate={o.due_date} className="text-3xs uppercase tracking-wider" />
                            </div>
                            <div className="text-right space-y-1 shrink-0">
                              <MoneyTotal currency={currency} amount={o.total_amount} className="text-xs block" />
                              <PaymentChip currency={currency} remaining={remaining} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Progress bar state machine - styled perfectly with sky-blue pipeline */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/60 space-y-3 print:hidden">
                  {(() => {
                    if (selectedOrder.status === 'Delivered') {
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-xs text-status-ready uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle className="icon-xs text-success-600" />
                              Delivered
                            </span>
                            <p className="text-xs text-slate-500 font-semibold">
                              Delivered on: <span className="text-slate-700 font-semibold">{selectedOrder.delivered_at ? new Date(selectedOrder.delivered_at).toLocaleString() : 'N/A'}</span>
                            </p>
                          </div>
                        </div>
                      );
                    }

                    if (selectedOrder.status === 'Archived') {
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-xs text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldAlert className="icon-xs text-purple-500" />
                              Finished (archived)
                            </span>
                            <p className="text-xs text-slate-500 font-semibold">
                              This order is frozen. Movements and edits are locked.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRestoreStageId('Pending');
                              setRestoreDialogOpen(true);
                            }}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Progress</span>
                            <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">— {activeQueueStages.map((s, i) => {
                              const isCurrent = selectedOrder.status === s.id;
                              return (
                                <span key={s.id} className={isCurrent ? 'text-brand-sky font-semibold' : ''}>
                                  {i > 0 && ' → '}{isCurrent ? s.name : s.name}
                                </span>
                              );
                            })}</span>
                          </div>
                          {hasNextStage ? (
                            <button
                              type="button"
                              onClick={() => advanceOrderStatus(selectedOrder)}
                              className="px-3 py-1.5 bg-brand-sidebar hover:bg-brand-active text-white font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-[background-color]"
                            >
                              <span>{nextStageName}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-brand-sky" />
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Items & Financials List */}
                <div className="space-y-3">
                  <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider block">Order Garments List</span>
                  <div className="divide-y divide-slate-100 bg-slate-50/50 rounded-lg border border-slate-200/60 overflow-hidden">
                    {(selectedOrder.items || []).map((item, i) => {
                      const hasItemMeas = item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0;
                      const hasItemStyling = item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0;

                      return (
                        <div key={i} className="p-3 bg-white first:rounded-t-lg last:rounded-b-lg border-b border-slate-100 last:border-0 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                                {item.type} <span className="text-slate-400 font-semibold text-xs">(Piece #{i + 1})</span>
                                {item.color && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-3xs font-semibold uppercase rounded inline-block leading-tight">
                                    {item.color}
                                  </span>
                                )}
                              </p>
                              {item.delivery_date && (
                                <p className="text-slate-400 text-xs font-semibold mt-0.5">Delivery: {new Date(item.delivery_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                              )}
                              {item.notes && <p className="text-slate-500 text-xs mt-1 font-medium">Notes: {item.notes}</p>}
                            </div>
                            <span className="text-base font-black text-slate-900 font-display">{currency}{item.price}</span>
                          </div>

                          {/* Render styling choices inside card */}
                          {hasItemStyling && (
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/50">
                              <button
                                type="button"
                                onClick={() => setShowStyling(!showStyling)}
                                className="w-full flex items-center justify-between cursor-pointer text-3xs font-semibold text-slate-400 uppercase tracking-wider"
                              >
                                <span>Style Options</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStyling ? 'rotate-180' : ''}`} />
                              </button>
                              {showStyling && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
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
                                        <span key={catId} className="text-3xs bg-white border border-slate-200 px-2 py-0.5 rounded font-semibold text-slate-700">
                                          <strong>{category?.name || catId}:</strong> {option?.name || optId}
                                        </span>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Render measurement snapshot inside card */}
                          {hasItemMeas && (
                            <div className="bg-sky-50/20 p-2 rounded-lg border border-sky-100/50">
                              <button
                                type="button"
                                onClick={() => setShowMeasurements(!showMeasurements)}
                                className="w-full flex items-center justify-between cursor-pointer text-3xs font-semibold text-slate-400 uppercase tracking-wider"
                              >
                                <span>Measurements</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMeasurements ? 'rotate-180' : ''}`} />
                              </button>
                              {showMeasurements && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-2">
                                  {Object.entries(item.measurement_snapshot || {}).map(([field, val]) => (
                                    <div key={field} className="bg-white p-1.5 border border-slate-200/40 rounded flex flex-col items-center">
                                      <span className="text-3xs font-semibold text-slate-400 uppercase break-words text-center leading-tight" title={field}>{field}</span>
                                      <span className="text-xs font-black text-slate-800 mt-0.5">{val || '--'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pricing grid styled with Hello Darzi colors (#0F172A slate card) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-brand-sidebar text-white p-4 rounded-xl border border-neutral-800">
                    <div>
                      <span className="text-xs text-neutral-400 font-semibold block uppercase tracking-wider">Total</span>
                      <span className="text-xl font-bold block mt-0.5 text-info-200 font-display font-variant-numeric tabular-nums">
                        {formatMoney(currency, selectedOrder.total_amount)}
                      </span>
                      {selectedOrder.discount_type && Number(selectedOrder.discount_amount) > 0 && (
                        <div className="mt-1 text-[10px] text-neutral-300 font-semibold leading-tight">
                          <span>Discount: -{formatMoney(currency, selectedOrder.discount_amount)}</span>
                          <span className="block text-neutral-200">
                            Final: {formatMoney(currency, selectedOrder.final_total ?? selectedOrder.total_amount)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 font-semibold block uppercase tracking-wider">Paid Amount</span>
                      <span className="text-xl font-bold text-success-200 block mt-0.5 font-display font-variant-numeric tabular-nums">
                        {formatMoney(currency, selectedOrder.paid_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 font-semibold block uppercase tracking-wider">Remaining</span>
                      <span className={`text-xl font-bold block mt-0.5 font-display font-variant-numeric tabular-nums ${
                        ((selectedOrder.final_total ?? selectedOrder.total_amount) - selectedOrder.paid_amount) > 0
                          ? 'text-danger-200'
                          : 'text-success-200'
                      }`}>
                        {formatMoney(currency, (selectedOrder.final_total ?? selectedOrder.total_amount) - selectedOrder.paid_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 font-semibold block uppercase tracking-wider">Delivery Date</span>
                      <DeliveryDateText
                        dueDate={selectedOrder.due_date}
                        prefix=""
                        short={false}
                        className="text-sm font-bold block mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Legacy global measurements fallback display if no items have individual snapshots */}
                {!selectedOrder.items?.some(item => item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowMeasurements(!showMeasurements)}
                      className="w-full flex items-center justify-between cursor-pointer font-semibold text-xs text-slate-700 uppercase tracking-wider"
                    >
                      <span>Saved measurements</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMeasurements ? 'rotate-180' : ''}`} />
                    </button>
                    {showMeasurements && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-sky-50/30 p-3 rounded-lg border border-sky-100/60 mt-2">
                        {measurementFields.map((field) => (
                          <div key={field} className="p-2 bg-white rounded-lg border border-slate-200/50 flex flex-col">
                            <span className="text-3xs font-semibold text-slate-400 uppercase break-words tracking-wide leading-tight">{field}</span>
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
                    )}
                  </div>
                )}

              </div>
            )}

            {/* The old print section is removed and unified in the universal print-slips-container below */}

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-200">
              <ShoppingCart className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-base font-black text-slate-800 font-display uppercase tracking-wider">No Order Selected</h3>
            <p className="text-slate-400 max-w-xs mt-1.5 text-xs font-semibold uppercase tracking-wider leading-relaxed">
              Select an order on the left queue to view or manage its details.
            </p>
          </div>
        )}
      </div>

      {/* PRINT SLIPS CONTAINER (Always Hidden on Screen, Shown on Print) */}
      {selectedOrder && (
        <div id="print-slips-container" className="hidden print:block font-sans text-black">

          {/* ─── CUSTOMER INVOICE (single-page A4/thermal) ─── */}
          <div className={`w-full max-w-[190mm] mx-auto bg-white ${printOptions.receipt ? '' : 'hidden'}`}>
            <div className="px-5 py-3" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
              {/* ═══ SHOP HEADER ═══ */}
              <div className="flex items-start justify-between pb-2 border-b-2 border-gray-900 mb-2">
                <div className="flex items-center gap-2.5">
                  {shopLogo && (
                    <img src={shopLogo} alt="Logo" className="h-10 w-auto object-contain" />
                  )}
                  <div>
                    <h1 className="text-lg font-black uppercase tracking-tight text-gray-900 leading-tight">{shopName}</h1>
                    <div className="text-[7.5pt] text-gray-500 font-medium leading-snug">
                      <span>{shopPhone}</span>
                      {shopAddress && <span className="ml-1.5">{shopAddress}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9pt] font-black uppercase tracking-[0.15em] text-gray-500 border border-gray-200 px-3 py-1">Invoice</div>
                  <div className="text-[7pt] text-gray-400 mt-0.5 font-medium">#{selectedOrder.order_number}</div>
                </div>
              </div>

              {/* ═══ CUSTOMER INFO (prominent — never blank) ═══ */}
              <div className="mb-2 pb-2 border-b border-gray-200">
                <div className="flex items-baseline justify-between">
                  <p className="text-[12pt] font-bold text-gray-900 leading-tight">
                    {selectedOrder.customer_name || 'Walk-in Customer'}
                    {selectedOrder.customer_phone && !selectedOrder.customer_phone.startsWith('NO-PHONE-') && (
                      <span className="text-[9pt] font-normal text-gray-500 ml-2">{selectedOrder.customer_phone}</span>
                    )}
                  </p>
                  <div className="text-[7.5pt] text-gray-400 shrink-0">
                    <span className="font-semibold">Booked:</span> {new Date(selectedOrder.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>

              {/* ═══ DELIVERY DATE (most prominent date) ═══ */}
              <div className="text-center mb-2">
                <span className="text-[7pt] font-bold uppercase tracking-[0.1em] text-gray-400">Delivery Date</span>
                <p className="text-[16pt] font-black text-gray-900 leading-tight mt-0.5">
                  {new Date(selectedOrder.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>

              {/* ═══ ITEMS TABLE ═══ */}
              <div className="mb-2">
                <table className="w-full text-[8pt] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-400 text-gray-500">
                      <th className="text-left py-1 font-bold uppercase tracking-wider text-[6.5pt] w-auto">Item</th>
                      <th className="text-center py-1 font-bold uppercase tracking-wider text-[6.5pt] w-[35px]">Qty</th>
                      <th className="text-right py-1 font-bold uppercase tracking-wider text-[6.5pt] w-[65px]">Rate</th>
                      <th className="text-right py-1 font-bold uppercase tracking-wider text-[6.5pt] w-[80px]">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, idx) => {
                      const qty = item.quantity || 1;
                      return (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-1 pr-2">
                            <span className="font-semibold text-gray-900">{item.type}</span>
                            {item.color && <span className="text-gray-400 ml-1 text-[6.5pt]">— {item.color}</span>}
                          </td>
                          <td className="py-1 text-center font-semibold text-gray-800">{qty}</td>
                          <td className="py-1 text-right font-semibold text-gray-800">{currency}{Number(item.price).toLocaleString()}</td>
                          <td className="py-1 text-right font-bold text-gray-900">{currency}{(Number(item.price) * qty).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ═══ PAYMENT SUMMARY ═══ */}
              <div className="flex justify-end mb-2">
                <div className="w-[220px] space-y-0.5 text-[9pt]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600">Total</span>
                    <span className="font-bold text-gray-900">{currency}{Number(selectedOrder.total_amount).toLocaleString()}</span>
                  </div>
                  {selectedOrder.discount_type && Number(selectedOrder.discount_amount) > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-500 text-[8pt]">Discount {selectedOrder.discount_type === 'percentage' ? `(${selectedOrder.discount_value}%)` : ''}</span>
                        <span className="font-bold text-red-600">-{currency}{Number(selectedOrder.discount_amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-300 pt-0.5">
                        <span className="font-bold text-gray-800">Final Total</span>
                        <span className="font-bold text-gray-900">{currency}{Number(selectedOrder.final_total ?? selectedOrder.total_amount).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600">Paid</span>
                    <span className="font-bold text-emerald-700">{currency}{Number(selectedOrder.paid_amount).toLocaleString()}</span>
                  </div>
                  {(Number(selectedOrder.final_total ?? selectedOrder.total_amount) - Number(selectedOrder.paid_amount)) > 0 && (
                    <div className="flex justify-between pt-1 border-t-2 border-gray-800 text-[11pt]">
                      <span className="font-black text-gray-800">Balance Due</span>
                      <span className="font-black text-red-700">{currency}{Math.max(0, Number(selectedOrder.final_total ?? selectedOrder.total_amount) - Number(selectedOrder.paid_amount)).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ QR CODE & FOOTER ═══ */}
              <div className="flex items-end justify-between pt-2 border-t border-gray-200">
                {qrCodeUrl && (
                  <div className="shrink-0">
                    <img src={qrCodeUrl} alt="" className="w-16 h-16 border border-gray-300 p-0.5 bg-white" referrerPolicy="no-referrer" />
                  </div>
                )}
                {!qrCodeUrl && <div />}
                <div className="text-right">
                  {termsConditions && (
                    <div className="text-[6.5pt] text-gray-500 leading-relaxed whitespace-pre-line max-w-[260px]">
                      {termsConditions}
                    </div>
                  )}
                  <div className="text-[6.5pt] text-gray-400 font-medium mt-0.5">
                    {receiptFooterText || 'Hello Darzi'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MEASUREMENT SLIPS - A4 LAYOUT */}
          <div className={`${printOptions.measure ? '' : 'hidden'}`}>
            {(() => {
              const slips: React.ReactNode[] = [];
              const itemsWithData = (selectedOrder.items || [])
                .map((item, originalIdx) => ({ item, originalIdx }))
                .filter(({ item }) =>
                  (item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0) ||
                  (item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0)
                );
              if (itemsWithData.length === 0) return null;

              for (let page = 0; page < Math.ceil(itemsWithData.length / 2); page++) {
                const pageItems = itemsWithData.slice(page * 2, page * 2 + 2);
                slips.push(
                  <div key={`meas-page-${page}`} className="meas-page">
                    <div className="meas-page-inner">
                      {pageItems.map(({ item, originalIdx }) => (
                        <div key={originalIdx} className="meas-slip">
                          {/* Header */}
                          <div className="meas-slip-header">
                            <div className="meas-slip-header-main">
                              {shopLogo && (
                                <img src={shopLogo} alt="Logo" className="meas-logo" />
                              )}
                              <div>
                                <h2 className="meas-shop-name">{shopName}</h2>
                                <div className="meas-contact">{shopPhone} | {shopAddress}</div>
                              </div>
                            </div>
                            {qrCodeByKey[`item-${originalIdx}`] && (
                              <div className="meas-slip-qr">
                                <img
                                  src={qrCodeByKey[`item-${originalIdx}`]}
                                  alt=""
                                  className="meas-qr-img"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="meas-qr-caption">Scan to open</span>
                              </div>
                            )}
                          </div>

                          {/* Order */}
                          <div className="meas-field-row">
                            <span className="meas-label">Order:</span>
                            <span className="meas-value">{selectedOrder.order_number}</span>
                          </div>

                          {/* Customer */}
                          <div className="meas-field-row">
                            <span className="meas-label">Customer:</span>
                            <span className="meas-value">{selectedOrder.customer_name}</span>
                          </div>

                          {/* Garment */}
                          <div className="meas-field-row">
                            <span className="meas-label">Garment:</span>
                            <span className="meas-value">
                              {item.type}{item.color ? ` (${item.color})` : ''} · Piece #{originalIdx + 1}
                            </span>
                          </div>

                          {/* Measurements */}
                          {item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0 && (
                            <div className="meas-section">
                              <h3 className="meas-section-title">Measurements</h3>
                              <div className="meas-grid">
                                {Object.entries(item.measurement_snapshot).map(([field, val]) => (
                                  <div key={field} className="meas-grid-row">
                                    <span className="meas-grid-label">{field}</span>
                                    <span className="meas-grid-value">{val || '--'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Styling */}
                          {item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0 && (
                            <div className="meas-section">
                              <h3 className="meas-section-title">Styling</h3>
                              <div className="meas-styling-list">
                                {Object.entries(item.styling_snapshot)
                                  .filter(([catId]) => {
                                    const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                    const gType = garmentTypes.find(g => g.name === item.type);
                                    return category && gType && category.garment_type_id === gType.id;
                                  })
                                  .map(([catId, optId]) => {
                                    const category = stylingCategories.find(c => c.id === catId || c.name === catId);
                                    const option = category?.options.find(o => o.id === optId || o.name === optId);
                                    return (
                                      <span key={catId} className="meas-styling-chip">
                                        <strong>{category?.name || catId}:</strong> {option?.name || optId}
                                      </span>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return slips;
            })()}
          </div>

        </div>
      )}

      {/* ORDER CREATED SUCCESS DIALOG */}
      {createSuccess && selectedOrder && (
        <div className="modal-overlay">
          <div className="modal-content text-center">
            <div className="w-14 h-14 bg-success-50 border border-success-200 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-success-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Order Created Successfully</h3>
              <p className="text-xs text-slate-500 mt-1 font-semibold">{selectedOrder.order_number}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setPrintOptions({ receipt: true, measure: false });
                  setTimeout(() => printPage(), 100);
                }}
                className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-[border-color]"
              >
                <Printer className="icon-xs text-sky-500" />
                Print Customer Copy
              </button>
              <button
                onClick={() => {
                  setPrintOptions({ receipt: false, measure: true });
                  setTimeout(() => printPage(), 100);
                }}
                className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-[border-color]"
              >
                <Printer className="icon-xs text-amber-500" />
                Print Measurement Slip(s)
              </button>
              <button
                onClick={() => {
                  setPrintOptions({ receipt: true, measure: true });
                  setTimeout(() => printPage(), 100);
                }}
                className="w-full py-3 px-4 bg-brand-sidebar hover:bg-brand-active text-white font-semibold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-[background-color]"
              >
                <Printer className="icon-xs text-brand-sky" />
                Print Both
              </button>
            </div>

            <button
              onClick={() => {
                setCreateSuccess(false);
                setSelectedOrder(null);
              }}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-[background-color]"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}

      {/* RESTORE DIALOG MODAL */}
      {restoreDialogOpen && selectedOrder && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="flex items-center gap-2.5 text-purple-600">
              <Clock className="w-5 h-5 text-brand-sky" />
              <h3 className="font-extrabold text-base text-slate-900 uppercase tracking-wider">Restore Order</h3>
            </div>
            
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Where would you like to restore order <strong className="text-slate-800 font-semibold">{selectedOrder.order_number}</strong>?
              It will return to the active production queue in the selected stage.
            </p>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Select Active Stage</label>
              <select
                value={restoreStageId}
                onChange={(e) => setRestoreStageId(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg font-semibold text-slate-800 text-xs focus-visible:outline-none focus:border-brand-sky"
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => restoreOrder(selectedOrder, restoreStageId)}
                className="px-4 py-2 bg-brand-sidebar hover:bg-brand-active text-white font-semibold text-xs uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Restore to open orders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA SCANNER MODAL */}
      {isScannerOpen && (
        <div className="modal-overlay">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-5 h-5 text-brand-sky" />
                <h3 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">Garment Scanner</h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsScannerOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center cursor-pointer transition-[background-color,color] border-none font-semibold text-sm"
              >
                &times;
              </button>
            </div>

            {/* Tab Selectors */}
            <div className="grid grid-cols-2 border-b border-slate-100 bg-slate-50/50 p-1">
              <button
                type="button"
                onClick={() => setScannerActiveTab('camera')}
                className={`py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 rounded-xl transition-[background-color,color,box-shadow] cursor-pointer ${
                  scannerActiveTab === 'camera'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Camera className="icon-xs" />
                Camera
              </button>
              <button
                type="button"
                onClick={() => setScannerActiveTab('simulator')}
                className={`py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 rounded-xl transition-[background-color,color,box-shadow] cursor-pointer ${
                  scannerActiveTab === 'simulator'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Smartphone className="icon-xs" />
                Test mode
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* CAMERA TAB */}
              {scannerActiveTab === 'camera' && (
                <div className="space-y-4">
                  {cameraPermissionError ? (
                    <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center space-y-3">
                      <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
                      <p className="text-xs text-red-700 font-semibold leading-relaxed">
                        {cameraPermissionError}
                      </p>
                      <button
                        type="button"
                        onClick={() => setScannerActiveTab('simulator')}
                        className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer transition-[background-color] border-none"
                      >
                        Switch to Test mode
                      </button>
                    </div>
                  ) : (
                    <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex items-center justify-center">
                      {/* Hidden canvas used for scanning frames */}
                      <canvas ref={canvasRef} className="hidden" />
                      <video
                        ref={videoRef}
                        className="absolute inset-0 w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      {/* Scan frame guide */}
                      <div className="absolute inset-0 border-2 border-white/40 rounded-3xl pointer-events-none" />
                      <span className="absolute bottom-3 bg-black/75 px-3 py-1 rounded-full text-xs font-semibold text-slate-300 tracking-wider uppercase border border-slate-700">
                        Align QR within frame
                      </span>
                    </div>
                  )}
                  <p className="text-center text-3xs text-slate-400 font-semibold uppercase tracking-widest leading-normal">
                    Place a printed QR code in front of the camera.
                  </p>
                </div>
              )}

              {/* SIMULATOR TAB */}
              {scannerActiveTab === 'simulator' && (
                <div className="space-y-4">
                  <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-start gap-2.5">
                    <Info className="icon-xs text-brand-sky shrink-0 mt-0.5" />
                    <p className="text-3xs text-sky-800 font-medium leading-relaxed">
                      No camera needed. Tap a garment below to open that order — same as scanning its QR code.
                    </p>
                  </div>
                  
                  <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    {orders.filter(o => o.status !== 'Delivered' && o.status !== 'Archived').map((o) => (
                      <div key={o.id} className="border border-slate-100 rounded-2xl p-3 bg-slate-50/50 space-y-2">
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/50">
                          <div className="min-w-0">
                            <OrderId value={o.order_number} className="!text-xs" />
                            <CustomerName name={o.customer_name} className="ml-2 !text-xs text-secondary !font-medium" />
                          </div>
                          <StatusBadge
                            status={o.status}
                            label={stagesList.find(s => s.id === o.status)?.name || o.status}
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {o.items?.map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setIsScannerOpen(false);
                                setScannedGarmentItem({
                                  order: o,
                                  itemIdx: idx,
                                });
                              }}
                              className="p-2.5 bg-white hover:bg-sky-50 hover:border-sky-300 border border-slate-200 rounded-xl text-left cursor-pointer flex items-center justify-between group transition-[background-color,border-color]"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-slate-800 group-hover:text-sky-950 uppercase break-words">
                                  {item.type}
                                </p>
                                <p className="text-xs font-semibold text-slate-400">
                                  Piece #{idx + 1} {item.color ? `(${item.color})` : ''}
                                </p>
                              </div>
                              <ArrowRight className="icon-xs text-slate-300 group-hover:text-brand-sky group-hover:translate-x-0.5 transition-[color,transform]" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {orders.filter(o => o.status !== 'Delivered' && o.status !== 'Archived').length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs uppercase tracking-wider font-extrabold">
                        No active pipeline orders found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs uppercase tracking-wider rounded-xl cursor-pointer border-none"
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCANNED GARMENT COMPACT ACTION MODAL */}
      {scannedGarmentItem && (
        <div className="modal-overlay">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 relative overflow-y-auto flex flex-col justify-between max-h-[90vh]">
            
            {/* Header / Indicator */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-neutral-800 rounded-full" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Order actions</span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setScannedGarmentItem(null)}
                className="text-slate-400 hover:text-slate-600 font-semibold text-lg cursor-pointer border-none bg-transparent"
              >
                &times;
              </button>
            </div>

            {/* Main Details Panel */}
            {updateSuccessState ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-8 animate-scale-up">
                <div className="w-16 h-16 bg-success-50 border border-success-200 rounded-full flex items-center justify-center text-success-700 shadow-md">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-base uppercase tracking-wider text-center">Status Updated!</h4>
              </div>
            ) : (
              <div className="space-y-4 flex-1 py-1">
                {/* Visual Garment Avatar Row */}
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/50">
                  <div className="w-10 h-10 bg-brand-sidebar rounded-xl flex items-center justify-center text-white shadow-inner">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black uppercase text-slate-700 tracking-widest bg-slate-900/5 px-2 py-0.5 rounded-full inline-block">
                      Piece #{scannedGarmentItem.itemIdx + 1}
                    </span>
                    <h4 className="font-black text-slate-900 text-sm uppercase break-words mt-1">
                      {scannedGarmentItem.order.items?.[scannedGarmentItem.itemIdx]?.type || 'Garment Item'}
                    </h4>
                  </div>
                </div>

                {/* Grid Details */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center border-b border-slate-100 py-1.5">
                    <span className="text-secondary uppercase font-semibold tracking-wider text-xs">Order Number</span>
                    <OrderId value={scannedGarmentItem.order.order_number} className="!text-xs !font-bold" />
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 py-1.5">
                    <span className="text-secondary uppercase font-semibold tracking-wider text-xs">Customer Name</span>
                    <CustomerName name={scannedGarmentItem.order.customer_name} />
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 py-1.5">
                    <span className="text-secondary uppercase font-semibold tracking-wider text-xs">Current Status</span>
                    <StatusBadge
                      status={scannedGarmentItem.order.status}
                      label={stagesList.find(s => s.id === scannedGarmentItem.order.status)?.name || scannedGarmentItem.order.status}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Large Thumb Actions - Sticky to Bottom */}
            {!updateSuccessState && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                {/* Dynamically calculated valid next action */}
                {(() => {
                  const order = scannedGarmentItem.order;
                  const currentIdx = activeWorkflowStages.findIndex(s => s.id === order.status);
                  const nextStage = currentIdx !== -1 && currentIdx < activeWorkflowStages.length - 1
                    ? activeWorkflowStages[currentIdx + 1]
                    : null;

                  if (nextStage) {
                    return (
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateScannedStatus(nextStage.id)}
                        className="btn-success w-full h-[52px]"
                      >
                        {updatingStatus ? (
                          <span>Updating...</span>
                        ) : (
                          <>
                            <CheckCircle className="icon-xs text-white" />
                            <span>Move to {nextStage.name}</span>
                          </>
                        )}
                      </button>
                    );
                  } else {
                    return (
                      <div className="p-3 bg-slate-50 text-slate-500 rounded-2xl text-center border border-slate-200/60 text-xs font-semibold uppercase tracking-wider">
                        All production stages completed
                      </div>
                    );
                  }
                })()}

                {/* Secondary Actions Row */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrder(scannedGarmentItem.order);
                      setScannedGarmentItem(null);
                    }}
                    className="py-3 bg-brand-sidebar hover:bg-brand-active text-white rounded-xl font-extrabold text-xs uppercase tracking-wider text-center cursor-pointer flex items-center justify-center gap-1 bg-slate-900 h-11 border-none"
                  >
                    <Info className="icon-xs text-brand-sky" />
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintAgainScanned(scannedGarmentItem.order)}
                    className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold text-xs uppercase tracking-wider text-center cursor-pointer flex items-center justify-center gap-1 border border-slate-200 h-11"
                  >
                    <Printer className="icon-xs" />
                    Print Again
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* PAYMENT COLLECTION DIALOG BEFORE DELIVERED */}
      {showPaymentDialog && pendingDeliverOrder && (
        <div className="modal-overlay">
          <div className="modal-content text-center">
            <div className="w-14 h-14 bg-warning-50 rounded-full flex items-center justify-center mx-auto border border-warning-200">
              <svg className="w-7 h-7 text-warning-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-h2">Payment Due</h3>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                Order <OrderId value={pendingDeliverOrder.order_number} className="!inline !text-xs" /> for{' '}
                <CustomerName name={pendingDeliverOrder.customer_name} className="!inline" /> has an outstanding balance.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-left">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-secondary">Original Total</span>
                <MoneyTotal currency={currency} amount={pendingDeliverOrder.total_amount} className="!text-xs" />
              </div>
              {pendingDeliverOrder.discount_type && Number(pendingDeliverOrder.discount_amount) > 0 && (
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-secondary">Discount</span>
                  <span className="text-money-due">-{formatMoney(currency, pendingDeliverOrder.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-secondary">Final Total</span>
                <MoneyTotal currency={currency} amount={pendingDeliverOrder.final_total ?? pendingDeliverOrder.total_amount} className="!text-xs" />
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-secondary">Already Paid</span>
                <MoneyPaid currency={currency} amount={pendingDeliverOrder.paid_amount} className="!text-xs" />
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-secondary">This Order Remaining</span>
                <MoneyDue currency={currency} amount={getOrderRemaining(pendingDeliverOrder)} className="!text-xs !font-bold" />
              </div>
              {oldDues > 0 && (
                <div className="flex justify-between text-xs font-semibold border-t border-warning-200 pt-2">
                  <span className="text-feedback-warning">Old Dues ({pendingOtherDueOrders.length} Other Order{pendingOtherDueOrders.length === 1 ? '' : 's'})</span>
                  <span className="text-feedback-warning font-bold">{formatMoney(currency, oldDues)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold border-t border-slate-200 pt-2">
                <span className="text-primary">Total Outstanding</span>
                <MoneyDue currency={currency} amount={getOrderRemaining(pendingDeliverOrder) + oldDues} className="!text-xs !font-bold" />
              </div>
            </div>

            <div className="text-left space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collect Payment ({currency})</label>
              <input
                type="number"
                min="0"
                disabled={collectingPayment}
                value={collectAmount || ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { setCollectAmount(0); return; }
                  const num = Number(raw);
                  if (!isNaN(num) && num >= 0) setCollectAmount(num);
                }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 text-sm focus-visible:outline-none focus:border-brand-sky disabled:opacity-60"
              />
              {oldDues > 0 && (
                <p className="text-3xs text-slate-400 font-medium pt-1">
                  Payment is applied to this order first, then to older unpaid orders.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={collectingPayment}
                onClick={handleDeliverCollectPayment}
                className="btn-success w-full disabled:opacity-60"
              >
                {collectingPayment ? 'Collecting...' : `Collect ${currency}${collectAmount} & Deliver`}
              </button>
              <button
                type="button"
                disabled={collectingPayment}
                onClick={handleDeliverSkipPayment}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-[background-color] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Deliver Without Collecting
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
