/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Calendar, Plus, Trash2, Printer, CheckCircle, Clock, ShieldAlert, ArrowRight, ChevronRight, Edit3, Search, UserPlus, ChevronLeft, Scissors, Info, Check, QrCode, Camera, Smartphone, Users, ChevronDown, MoreVertical } from 'lucide-react';
import { Customer, Order, OrderItem, OrderStatus, UserRole, PipelineStage, GarmentType, StylingCategory, MeasurementProfile } from '../types';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

interface OrdersSectionProps {
  token: string;
  userRole: UserRole;
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
  whatsappMessageTemplate?: string;
  whatsappNotifyOnReady?: boolean;
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
  whatsappMessageTemplate,
  whatsappNotifyOnReady = false,
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

  // Scanner and Compact Action Screen States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedGarmentItem, setScannedGarmentItem] = useState<{
    order: Order;
    itemIdx: number;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updateSuccessState, setUpdateSuccessState] = useState(false);

  // WhatsApp ready-to-deliver confirmation dialog
  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [pendingWhatsAppOrder, setPendingWhatsAppOrder] = useState<Order | null>(null);

  // Dynamically generate QR code whenever selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
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
  const [paidAmount, setPaidAmount] = useState(0);
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

  // settings data
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [stylingCategories, setStylingCategories] = useState<StylingCategory[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<MeasurementProfile[]>([]);
  const [bookingItems, setBookingItems] = useState<BookingItem[]>([]);
  const [manuallyEditedPriceIds, setManuallyEditedPriceIds] = useState<Set<string>>(new Set());
  const [sharedDeliveryDate, setSharedDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toLocaleDateString('en-CA');
  });

  const [printOptions, setPrintOptions] = useState({ receipt: defaultPrintReceipt, measure: defaultPrintMeasure });

  const updateSharedDeliveryDate = (newDate: string) => {
    setSharedDeliveryDate(newDate);
    setBookingItems(prev => prev.map(item => ({
      ...item,
      delivery_date: newDate
    })));
  };

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

  const DEFAULT_WHATSAPP_TEMPLATE = `{ShopName}

Assalam-o-Alaikum Sir {CustomerName},

Your order is ready.

Order:
{OrderSummary}

Remaining Amount: Rs. {RemainingBalance}

Please visit our shop to collect your order.

Note: This is an automated message. Please do not reply.`;

  const getCustomerMobile = (order: Order) => {
    const whatsapp = order.customer_whatsapp?.trim();
    if (whatsapp) return whatsapp;
    const phone = order.customer_phone;
    if (phone && !phone.startsWith('NO-PHONE-')) return phone;
    return '';
  };

  const buildWhatsAppMessage = (order: Order) => {
    const template = whatsappMessageTemplate || DEFAULT_WHATSAPP_TEMPLATE;
    const remaining = order.total_amount - order.paid_amount;
    const orderSummary = (order.items || []).map((item, i) =>
      `  ${i + 1}. ${item.type}${item.color ? ` (${item.color})` : ''} - ${currency}${item.price}`
    ).join('\n');

    let message = template
      .replace(/{ShopName}/g, shopName)
      .replace(/{CustomerName}/g, order.customer_name || 'Valued Customer')
      .replace(/{OrderSummary}/g, orderSummary);

    if (remaining > 0) {
      message = message.replace(/{RemainingBalance}/g, String(Math.round(remaining)));
    } else {
      message = message
        .split('\n')
        .filter(line => !line.includes('{RemainingBalance}'))
        .join('\n');
    }

    return message.replace(/\n{3,}/g, '\n\n').trim();
  };

  const sendWhatsApp = (order: Order) => {
    const phone = getCustomerMobile(order);
    if (!phone) {
      alert('No mobile number saved for this customer.');
      return;
    }
    const cleanedPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanedPhone) {
      alert('Invalid mobile number.');
      return;
    }
    const message = buildWhatsAppMessage(order);
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const maybeSendReadyToDeliverWhatsApp = (order: Order, newStatus: string) => {
    if (newStatus === 'Ready to Deliver' && whatsappNotifyOnReady) {
      setPendingWhatsAppOrder(order);
      setShowWhatsAppConfirm(true);
    }
  };

  const handleWhatsAppConfirmContinue = () => {
    if (pendingWhatsAppOrder) {
      sendWhatsApp(pendingWhatsAppOrder);
    }
    setShowWhatsAppConfirm(false);
    setPendingWhatsAppOrder(null);
  };

  const handleWhatsAppConfirmNotNow = () => {
    setShowWhatsAppConfirm(false);
    setPendingWhatsAppOrder(null);
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
      maybeSendReadyToDeliverWhatsApp(mergedOrder, newStatus);
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
                price: firstType.price || 0,
                delivery_date: sharedDeliveryDate || d.toLocaleDateString('en-CA'),
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
      price: garmentType.price || 0,
      quantity: 1,
      delivery_date: sharedDeliveryDate || d.toLocaleDateString('en-CA'),
      measurement_snapshot,
      styling_snapshot,
      notes: '',
      color: ''
    };
  };

  const startNewBooking = () => {
    setCustomer(null);
    setBookingItems([]);
    setManuallyEditedPriceIds(new Set());
    setCustomerProfiles([]);
    setBookingStep('customer');
    setPaidAmount(0);
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
    if (!newCustName.trim()) return;

    if (isNameDuplicate && (!newCustPhone || !newCustPhone.trim())) {
      setCreateError('A customer with this name already exists. A Phone Number is required to save a duplicate name.');
      return;
    }

    const selectedGarment = newCustGarmentTypeId
      ? garmentTypes.find(g => g.id === newCustGarmentTypeId)
      : null;
    if (!selectedGarment) {
      setCreateError('Please select a garment type and enter measurements. A customer cannot be saved without measurements.');
      return;
    }
    const missingRequired = selectedGarment.measurement_fields
      .filter(f => f.required)
      .find(f => !newCustMeasurements[f.name] || String(newCustMeasurements[f.name]).trim() === '');
    if (missingRequired) {
      setCreateError(`Missing required measurement: "${missingRequired.name}". Please fill in all required measurements to save the customer.`);
      return;
    }

    setCreateError(null);
    try {
      const firstProfile: MeasurementProfile = {
        id: Math.random().toString(36).substring(2, 11),
        garment_type_id: selectedGarment.id,
        garment_name: selectedGarment.name,
        values: newCustMeasurements,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCustName,
          phone: newCustPhone,
          address: newCustAddress,
          measurements: { profiles: [firstProfile] }
        })
      });
      const data = await res.json();
      if (res.ok) {
        const createdCustomer = data.customer || data;
        setCustomer(createdCustomer);
        setCustomerProfiles([firstProfile]);

        // Reset customer form
        setNewCustName('');
        setNewCustPhone('');
        setNewCustAddress('');
        setNewCustGarmentTypeId('');
        setNewCustMeasurements({});
        setShowCreateCustomer(false);

        setBookingStep('garments');
        setBookingItems([]);
        setManuallyEditedPriceIds(new Set());
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
      const totalAmountVal = bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0);
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
            quantity: item.quantity,
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
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

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
    await updateOrderStatus(order, nextStatus);
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
    setPrintOptions({ receipt: true, measure: false });
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Color-coded status helpers mapping strictly to Professional Polish rules
  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case 'Ready':
      case 'Ready to Deliver':
        return 'bg-emerald-100 text-emerald-700 border border-green-200';
      case 'Delivered':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      case 'Archived':
        return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'Pending':
        return 'bg-blue-100 text-blue-700 border border-blue-100';
      default: // Cutting, Stitching, Fitting
        return 'bg-amber-100 text-amber-700 border border-yellow-200';
    }
  };

  // CAMERA SCANNER & OVERLAY HELPERS
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [scannerActiveTab, setScannerActiveTab] = useState<'camera' | 'simulator'>('camera');

  // Handle scanned value (parsed from QR code URL or simulated selection)
  const handleScannedValue = async (value: string) => {
    try {
      // Parse the scanned URL
      let urlObj: URL;
      try {
        urlObj = new URL(value);
      } catch (e) {
        // Fallback in case it's just raw parameters or a relative URL
        urlObj = new URL(value, window.location.origin);
      }
      
      const orderId = urlObj.searchParams.get('orderId');
      const itemIdxStr = urlObj.searchParams.get('itemIdx');
      
      if (!orderId) {
        alert('Invalid QR code scanned. It does not contain an Order ID.');
        return;
      }

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
        const itemIdx = itemIdxStr !== null ? parseInt(itemIdxStr, 10) : 0;
        
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
          setCameraPermissionError('Could not access device camera. Please grant permissions, or use the Simulator tab.');
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

  // Update status from Scanned Garment Compact Action Screen
  const handleUpdateScannedStatus = async (nextStatus: string) => {
    if (!scannedGarmentItem) return;
    const { order } = scannedGarmentItem;
    
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      
      if (res.ok) {
        const updatedOrder = await res.json();
        const mergedOrder: Order = { ...order, ...updatedOrder, status: nextStatus as OrderStatus };
        
        setOrders((prev) => prev.map(o => o.id === order.id ? mergedOrder : o));
        
        if (selectedOrder && selectedOrder.id === order.id) {
          setSelectedOrder(mergedOrder);
        }

        maybeSendReadyToDeliverWhatsApp(mergedOrder, nextStatus);
        
        setUpdateSuccessState(true);
        setTimeout(() => {
          setUpdateSuccessState(false);
          setScannedGarmentItem(null);
          fetchOrders();
        }, 1200);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update garment stage.');
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
      window.print();
    }, 200);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      
      {/* LEFT COLUMN: Queue / Filters */}
      {!isCreating && (
        <div className="lg:col-span-5 card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900 tracking-tight font-display uppercase">
              {viewMode === 'Active' ? 'Active Queue' : 'Archived Vault'}
            </h2>
            {!isCreating && (
              <button
                onClick={startNewBooking}
                className="btn-primary"
              >
                <ShoppingCart className="icon-sm text-brand-sky" />
                Book Order
              </button>
            )}
          </div>

          {/* Segmented Control for Active vs Archived */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setViewMode('Active');
                setActiveFilter('All');
              }}
              className={`py-1.5 text-sm font-semibold rounded-md cursor-pointer transition-[background-color,color,box-shadow] text-center uppercase tracking-wider ${
                viewMode === 'Active'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
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
              className={`py-1.5 text-sm font-semibold rounded-md cursor-pointer transition-[background-color,color,box-shadow] text-center uppercase tracking-wider ${
                viewMode === 'Archived'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Archived Vault
            </button>
          </div>

          {/* Status Filters - Styled as elegant tabs - Only shown in Active view mode */}
          {viewMode === 'Active' ? (
            <div className="flex flex-wrap gap-1.5 bg-slate-50/50 p-2 rounded-lg border border-slate-200/50 justify-center">
              {['All', ...activeQueueStages.map(s => s.id)].map((tabId) => {
                const isSelected = activeFilter === tabId;
                const tabName = tabId === 'All' ? 'All' : (stagesList.find(s => s.id === tabId)?.name || tabId);
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveFilter(tabId)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer text-center uppercase tracking-wider ${
                      isSelected
                        ? 'bg-brand-active text-white shadow-sm'
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
            <div className="p-2 bg-purple-50 rounded-lg border border-purple-100 text-center text-purple-700 text-xs font-semibold uppercase tracking-wider">
              Displaying Archived Vault Records
            </div>
          )}

          {/* Search & Scanner */}
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search order #, customer name..."
                  className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 font-medium focus-visible:outline-none focus:border-brand-sky focus:ring-2 focus:ring-sky-100 transition-[border-color]"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="px-2.5 py-1.5 bg-brand-bg hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center justify-center gap-1 cursor-pointer text-3xs font-semibold uppercase tracking-wide transition-[background-color]"
                title="Scan QR Code from Device Camera"
              >
                <QrCode className="w-3 h-3 text-brand-sky" />
                <span className="hidden sm:inline">Scan QR</span>
              </button>
            </div>

            {/* Active List */}
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-0.5">
              {loading && <p className="text-center text-slate-400 text-xs font-semibold uppercase tracking-wider py-3">Refreshing Queue...</p>}
              {!loading && orders.length === 0 && (
                <p className="text-center text-slate-400 py-6 text-xs font-semibold uppercase tracking-wider">No active orders.</p>
              )}
              {orders.map((o) => {
                const isSelected = selectedOrder?.id === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => selectOrderWithDetails(o)}
                    className={`w-full p-2 rounded-lg text-left border transition-[background-color,border-color,box-shadow] flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-400 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-3xs font-semibold text-slate-400 font-mono tracking-wide">{o.order_number}</span>
                        <span className={`px-1.5 py-0.5 rounded text-3xs font-semibold uppercase leading-tight ${getStatusBadgeStyle(o.status)}`}>
                          {stagesList.find(s => s.id === o.status)?.name || o.status}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900">{o.customer_name}</p>
                      <p className="text-3xs text-slate-400 font-semibold uppercase tracking-wider">Due: {new Date(o.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <div className="text-right space-y-0.5 shrink-0">
                      <span className="text-sm font-black text-slate-900 block font-display leading-tight">
                        {currency}{o.total_amount}
                      </span>
                      {o.total_amount - o.paid_amount > 0 ? (
                        <span className="inline-block text-3xs bg-red-50 text-red-700 font-semibold px-1.5 py-0.5 rounded border border-red-100">
                          Due {currency}{o.total_amount - o.paid_amount}
                        </span>
                      ) : (
                        <span className="inline-block text-3xs bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-100">Paid</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={loadMoreOrders}
                  disabled={loading}
                  className="w-full mt-2 py-2 px-4 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider rounded-lg border border-slate-200 cursor-pointer text-center flex items-center justify-center gap-1.5 transition-[background-color,border-color] hover:border-slate-300"
                >
                  {loading ? 'Loading...' : 'Load More Orders'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Action Forms or Details */}
      <div className={`${isCreating ? 'lg:col-span-12' : 'lg:col-span-7'} card space-y-3`}>
        
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
                  <div key={step.key} className={`flex items-center ${isActive ? 'text-sky-600' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {i > 0 && <div className={`w-8 h-px mx-1.5 ${isDone || isActive ? 'bg-emerald-400' : 'bg-slate-300'}`} />}
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${
                      isActive ? 'bg-sky-50 border border-sky-200 font-black' : isDone ? 'font-semibold' : 'font-semibold'
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
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-[#38BDF8]/20 placeholder:text-slate-400"
                        placeholder="Full Name *"
                      />
                      <input
                        type="tel"
                        required={isNameDuplicate}
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-slate-800 focus-visible:outline-none placeholder:text-slate-400 ${isNameDuplicate ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200 focus:border-brand-sky focus:ring-1 focus:ring-[#38BDF8]/20'}`}
                        placeholder={`Phone${isNameDuplicate ? ' * (Required)' : ''}`}
                      />
                    </div>

                    <input
                      type="text"
                      value={newCustAddress}
                      onChange={(e) => setNewCustAddress(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-[#38BDF8]/20 placeholder:text-slate-400"
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
                      className="btn-success w-full"
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
                  <div className="flex items-center gap-2.5">
                    <Calendar className="icon-xs text-amber-500 shrink-0" />
                    <span className="text-[13px] font-semibold text-slate-600 uppercase">Delivery:</span>
                    <input
                      type="date"
                      required
                      value={sharedDeliveryDate}
                      onChange={(e) => updateSharedDeliveryDate(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-sm focus-visible:outline-none focus:border-brand-sky"
                    />
                  </div>
                </div>

                {/* Garment cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto pr-0.5">
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
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus-visible:outline-none focus:border-brand-sky focus:ring-1 focus:ring-[#38BDF8]/20 placeholder:text-slate-400"
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
                  <span className="text-sm font-semibold text-slate-400">{sharedDeliveryDate && new Date(sharedDeliveryDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
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

                {/* Financials */}
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total</span>
                    <span className="text-2xl font-black text-slate-800 font-display">
                      {currency}{bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Paid Amount ({currency})</label>
                    <input
                      type="number"
                      min="0"
                      max={bookingItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0)}
                      value={paidAmount ?? ''}
                      onChange={(e) => setPaidAmount(Number(e.target.value))}
                      className="input-base font-semibold text-base"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Print Options */}
                <div className="flex flex-wrap gap-4 pt-1 pb-2 px-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={printOptions.receipt}
                      onChange={e => setPrintOptions(prev => ({ ...prev, receipt: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                    />
                    Generate Customer Receipt
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={printOptions.measure}
                      onChange={e => setPrintOptions(prev => ({ ...prev, measure: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                    />
                    Generate Measurement Slip(s)
                  </label>
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
                  <h3 className="font-extrabold text-base text-slate-900 font-display uppercase tracking-wider">Modifying Booked Order: {selectedOrder.order_number}</h3>
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
                      <div key={index} className="grid grid-cols-12 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60 items-start">
                        <div className="col-span-3 space-y-1">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Garment Type</label>
                          <input
                            type="text"
                            value={item.type}
                            onChange={(e) => handleEditItemChange(index, 'type', e.target.value)}
                            className="input-base font-semibold text-xs"
                          />
                        </div>

                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Price ({currency})</label>
                          <input
                            type="number"
                            min="0"
                            value={item.price || ''}
                            onChange={(e) => handleEditItemChange(index, 'price', Number(e.target.value))}
                            className="input-base font-semibold text-xs"
                          />
                        </div>

                        <div className="col-span-3 space-y-1">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Color</label>
                          <input
                            type="text"
                            value={item.color || ''}
                            onChange={(e) => handleEditItemChange(index, 'color', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus-visible:outline-none focus:border-brand-sky"
                            placeholder="Color"
                          />
                        </div>

                        <div className="col-span-3 space-y-1">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Styling / Cut Details</label>
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => handleEditItemChange(index, 'notes', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs focus-visible:outline-none focus:border-brand-sky"
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

                {/* Edit Snapshot measurements */}
                <div className="pt-2">
                  <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider block mb-2">Modify Measurement Snapshot for this Order</span>
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
                      <span className="font-black text-xl text-slate-900 tracking-tight font-display">{selectedOrder.order_number}</span>
                      <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase leading-tight ${getStatusBadgeStyle(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </span>
                      {selectedOrder.items && (
                        <span className="text-xs font-semibold text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded-md">Total Items: {selectedOrder.items.length}</span>
                      )}
                    </div>
                    <p className="font-semibold text-base text-slate-800">{selectedOrder.customer_name}</p>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                      Contact: <span className="text-slate-700 font-semibold">{selectedOrder.customer_phone && !selectedOrder.customer_phone.startsWith('NO-PHONE-') ? selectedOrder.customer_phone : 'Not Provided'}</span>
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

                    {selectedOrder.status === 'Ready to Deliver' && (
                      <button
                        onClick={() => sendWhatsApp(selectedOrder)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-[background-color]"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp
                      </button>
                    )}

                    {selectedOrder.status !== 'Delivered' && selectedOrder.status !== 'Archived' && (
                      <button
                        onClick={() => {
                          setEditedItems([...(selectedOrder.items || [])]);
                          setEditedPaid(selectedOrder.paid_amount);
                          setEditedDueDate(selectedOrder.due_date.split('T')[0]);
                          setEditedSnapshot({ ...selectedOrder.measurement_snapshot });
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

                {/* Progress bar state machine - styled perfectly with sky-blue pipeline */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/60 space-y-3 print:hidden">
                  {(() => {
                    if (selectedOrder.status === 'Delivered') {
                      return (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-xs text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle className="icon-xs text-emerald-500" />
                              Delivered and Locked
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
                              Archived in Vault
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
                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Pipeline</span>
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
                                <span>Measurements Snapshot</span>
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

                  {/* Pricing grid styled with StitchMaster Pro colors (#0F172A slate card) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-brand-sidebar text-white p-4 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Total</span>
                      <span className="text-xl font-black block mt-0.5">{currency}{selectedOrder.total_amount}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Paid Amount</span>
                      <span className="text-xl font-black text-emerald-400 block mt-0.5">{currency}{selectedOrder.paid_amount}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Remaining</span>
                      <span className={`text-xl font-black block mt-0.5 ${selectedOrder.total_amount - selectedOrder.paid_amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {currency}{selectedOrder.total_amount - selectedOrder.paid_amount}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Delivery Date</span>
                      <span className="text-sm font-black block mt-1.5 text-slate-200">{new Date(selectedOrder.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
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
                      <span>Locked Measurements Snapshot (Frozen)</span>
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
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600">Paid</span>
                    <span className="font-bold text-emerald-700">{currency}{Number(selectedOrder.paid_amount).toLocaleString()}</span>
                  </div>
                  {(Number(selectedOrder.total_amount) - Number(selectedOrder.paid_amount)) > 0 && (
                    <div className="flex justify-between pt-1 border-t-2 border-gray-800 text-[11pt]">
                      <span className="font-black text-gray-800">Balance Due</span>
                      <span className="font-black text-red-700">{currency}{Math.max(0, Number(selectedOrder.total_amount) - Number(selectedOrder.paid_amount)).toLocaleString()}</span>
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
                    {receiptFooterText || 'Stitch Master'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MEASUREMENT SLIPS - A4 LAYOUT */}
          <div className={`${printOptions.measure ? '' : 'hidden'}`}>
            {(() => {
              const slips: React.ReactNode[] = [];
              const itemsWithData = selectedOrder.items.filter(item =>
                (item.measurement_snapshot && Object.keys(item.measurement_snapshot).length > 0) ||
                (item.styling_snapshot && Object.keys(item.styling_snapshot).length > 0)
              );
              if (itemsWithData.length === 0) return null;

              for (let page = 0; page < Math.ceil(itemsWithData.length / 2); page++) {
                const pageItems = itemsWithData.slice(page * 2, page * 2 + 2);
                slips.push(
                  <div key={`meas-page-${page}`} className="meas-page">
                    <div className="meas-page-inner">
                      {pageItems.map((item, idx) => (
                        <div key={idx} className="meas-slip">
                          {/* Header */}
                          <div className="meas-slip-header">
                            {shopLogo && (
                              <img src={shopLogo} alt="Logo" className="meas-logo" />
                            )}
                            <div>
                              <h2 className="meas-shop-name">{shopName}</h2>
                              <div className="meas-contact">{shopPhone} | {shopAddress}</div>
                            </div>
                          </div>

                          {/* Customer */}
                          <div className="meas-field-row">
                            <span className="meas-label">Customer:</span>
                            <span className="meas-value">{selectedOrder.customer_name}</span>
                          </div>

                          {/* Garment */}
                          <div className="meas-field-row">
                            <span className="meas-label">Garment:</span>
                            <span className="meas-value">{item.type}{item.color ? ` (${item.color})` : ''}</span>
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
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Order Created Successfully</h3>
              <p className="text-xs text-slate-500 mt-1 font-semibold">{selectedOrder.order_number}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setPrintOptions({ receipt: true, measure: false });
                  setTimeout(() => window.print(), 100);
                }}
                className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-[border-color]"
              >
                <Printer className="icon-xs text-sky-500" />
                Print Customer Copy
              </button>
              <button
                onClick={() => {
                  setPrintOptions({ receipt: false, measure: true });
                  setTimeout(() => window.print(), 100);
                }}
                className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-[border-color]"
              >
                <Printer className="icon-xs text-amber-500" />
                Print Measurement Slip(s)
              </button>
              <button
                onClick={() => {
                  setPrintOptions({ receipt: true, measure: true });
                  setTimeout(() => window.print(), 100);
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
                Restore to Active Queue
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
                Live Camera
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
                Simulate Scan
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
                        Switch to Simulator Tab
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
                      {/* Decorative scanning radar lines */}
                      <div className="absolute inset-0 border-2 border-brand-sky/40 rounded-3xl pointer-events-none">
                        <div className="absolute inset-x-0 h-0.5 bg-brand-sky" style={{
                          animation: 'scan-line 3s ease-in-out infinite',
                        }} />
                      </div>
                      <span className="absolute bottom-3 bg-black/75 px-3 py-1 rounded-full text-xs font-semibold text-slate-300 tracking-wider uppercase border border-slate-700">
                        Align QR within frame
                      </span>
                    </div>
                  )}
                  <p className="text-center text-3xs text-slate-400 font-semibold uppercase tracking-widest leading-normal">
                    Place a workshop printed QR code in front of your camera.
                  </p>
                </div>
              )}

              {/* SIMULATOR TAB */}
              {scannerActiveTab === 'simulator' && (
                <div className="space-y-4">
                  <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-start gap-2.5">
                    <Info className="icon-xs text-brand-sky shrink-0 mt-0.5" />
                    <p className="text-3xs text-sky-800 font-medium leading-relaxed">
                      This simulator bypasses physical hardware limits inside sandboxed environments. Click any garment piece below to instantly simulate a barcode scan.
                    </p>
                  </div>
                  
                  <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    {orders.filter(o => o.status !== 'Delivered' && o.status !== 'Archived').map((o) => (
                      <div key={o.id} className="border border-slate-100 rounded-2xl p-3 bg-slate-50/50 space-y-2">
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/50">
                          <div>
                            <span className="font-extrabold text-xs text-slate-800">{o.order_number}</span>
                            <span className="text-xs text-slate-400 font-semibold ml-2">({o.customer_name})</span>
                          </div>
                          <span className={`px-2 py-1 rounded text-sm font-semibold uppercase ${getStatusBadgeStyle(o.status)}`}>
                            {stagesList.find(s => s.id === o.status)?.name || o.status}
                          </span>
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
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 relative overflow-hidden flex flex-col justify-between" style={{ minHeight: '380px' }}>
            
            {/* Header / Indicator */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Live Garment Action Screen</span>
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
                <div className="w-16 h-16 bg-emerald-100 border border-emerald-300 rounded-full flex items-center justify-center text-emerald-600 shadow-md">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-base uppercase tracking-wider text-center">Status Updated!</h4>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider text-center">Activity log saved with timestamp</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 py-1">
                {/* Visual Garment Avatar Row */}
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/50">
                  <div className="w-10 h-10 bg-brand-sidebar rounded-xl flex items-center justify-center text-brand-sky shadow-inner">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black uppercase text-brand-sky tracking-widest bg-slate-900/5 px-2 py-0.5 rounded-full inline-block">
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
                    <span className="text-slate-400 uppercase font-semibold tracking-wider text-xs">Order Number:</span>
                    <span className="font-extrabold text-slate-900">{scannedGarmentItem.order.order_number}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 py-1.5">
                    <span className="text-slate-400 uppercase font-semibold tracking-wider text-xs">Customer Name:</span>
                    <span className="font-black text-slate-900">{scannedGarmentItem.order.customer_name}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 py-1.5">
                    <span className="text-slate-400 uppercase font-semibold tracking-wider text-xs">Current Status:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${getStatusBadgeStyle(scannedGarmentItem.order.status)}`}>
                      {stagesList.find(s => s.id === scannedGarmentItem.order.status)?.name || scannedGarmentItem.order.status}
                    </span>
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
                            <CheckCircle className="icon-xs text-emerald-100" />
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

      {/* WHATSAPP READY TO DELIVER CONFIRMATION DIALOG */}
      {showWhatsAppConfirm && pendingWhatsAppOrder && (
        <div className="modal-overlay">
          <div className="modal-content text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Smartphone className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Notify Customer</h3>
              <p className="text-xs text-slate-500 mt-1 font-semibold leading-relaxed">
                Order <strong className="text-slate-800">{pendingWhatsAppOrder.order_number}</strong> for <strong className="text-slate-800">{pendingWhatsAppOrder.customer_name}</strong> is ready to deliver.
              </p>
            </div>

            {(() => {
              const remaining = pendingWhatsAppOrder.total_amount - pendingWhatsAppOrder.paid_amount;
              if (remaining > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                      Remaining Amount: {currency}{Math.round(remaining)}
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Send a WhatsApp notification to the customer so they can collect their order.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleWhatsAppConfirmContinue}
                className="btn-success w-full"
              >
                <Smartphone className="icon-xs" />
                Continue to WhatsApp
              </button>
              <button
                onClick={handleWhatsAppConfirmNotNow}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-[background-color]"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
