/**
 * In-memory offline-first data store.
 * Hydrated once from /api/bootstrap (local SQLite in Electron).
 * UI reads here for instant search, measurements, orders, and reference data.
 * Mutations update the store after successful local API writes; sync remains server-side.
 */

import type {
  Customer,
  GarmentType,
  MeasurementProfile,
  Order,
  ShopSettings,
  StylingCategory,
} from '../types';

export interface MeasurementCacheEntry {
  id?: string;
  customer_id: string;
  data: {
    profiles?: MeasurementProfile[];
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
}

export interface BootstrapPayload {
  settings: Partial<ShopSettings> & Record<string, unknown>;
  customers: Customer[];
  measurements: MeasurementCacheEntry[];
  orders?: Order[];
  garmentTypes: GarmentType[];
  stylingCategories: StylingCategory[];
  hydratedAt?: string;
  source?: 'local' | 'cloud';
}

export interface LocalDataSnapshot {
  ready: boolean;
  hydrating: boolean;
  error: string | null;
  customers: Customer[];
  orders: Order[];
  measurementsByCustomerId: Record<string, MeasurementCacheEntry>;
  garmentTypes: GarmentType[];
  stylingCategories: StylingCategory[];
  settings: (Partial<ShopSettings> & Record<string, unknown>) | null;
  hydratedAt: string | null;
  version: number;
}

const SETTINGS_CACHE_KEY = 'hellodarzi-settings-cache';

type Listener = () => void;

function emptySnapshot(): LocalDataSnapshot {
  return {
    ready: false,
    hydrating: false,
    error: null,
    customers: [],
    orders: [],
    measurementsByCustomerId: {},
    garmentTypes: [],
    stylingCategories: [],
    settings: null,
    hydratedAt: null,
    version: 0,
  };
}

class LocalDataStore {
  private snapshot: LocalDataSnapshot = emptySnapshot();
  private listeners = new Set<Listener>();
  private hydratePromise: Promise<boolean> | null = null;
  private hydrateGeneration = 0;
  private lastToken: string | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LocalDataSnapshot => this.snapshot;

  private emit() {
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1 };
    for (const listener of this.listeners) listener();
  }

  private setPartial(partial: Partial<LocalDataSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  /** Apply cached shop settings synchronously for instant shell paint. */
  applyCachedSettings(): Partial<ShopSettings> & Record<string, unknown> | null {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (!raw) return null;
      const settings = JSON.parse(raw) as Partial<ShopSettings> & Record<string, unknown>;
      this.snapshot = { ...this.snapshot, settings };
      return settings;
    } catch {
      return null;
    }
  }

  private writeSettingsCache(settings: Partial<ShopSettings> & Record<string, unknown>) {
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
    } catch {
      // ignore quota
    }
  }

  clear() {
    this.snapshot = emptySnapshot();
    this.hydratePromise = null;
    this.hydrateGeneration += 1;
    this.lastToken = null;
    try {
      localStorage.removeItem(SETTINGS_CACHE_KEY);
    } catch {
      // ignore
    }
    this.emit();
  }

  hydrateFromPayload(payload: BootstrapPayload) {
    const measurementsByCustomerId: Record<string, MeasurementCacheEntry> = {};
    for (const row of payload.measurements || []) {
      if (!row?.customer_id) continue;
      measurementsByCustomerId[row.customer_id] = {
        ...row,
        data: row.data && typeof row.data === 'object' ? row.data : { profiles: [] },
      };
    }

    this.setPartial({
      ready: true,
      hydrating: false,
      error: null,
      customers: Array.isArray(payload.customers) ? payload.customers : [],
      orders: Array.isArray(payload.orders) ? payload.orders : [],
      measurementsByCustomerId,
      garmentTypes: Array.isArray(payload.garmentTypes) ? payload.garmentTypes : [],
      stylingCategories: Array.isArray(payload.stylingCategories) ? payload.stylingCategories : [],
      settings: payload.settings || null,
      hydratedAt: payload.hydratedAt || new Date().toISOString(),
    });

    if (payload.settings) {
      this.writeSettingsCache(payload.settings);
    }
  }

  async hydrate(token: string, options?: { force?: boolean }): Promise<boolean> {
    if (!token) return false;
    if (
      !options?.force &&
      this.snapshot.ready &&
      this.lastToken === token &&
      !this.snapshot.hydrating
    ) {
      return true;
    }

    // Serialize hydrates: reuse in-flight for same token; if force/token change, wait then run fresh.
    if (this.hydratePromise) {
      if (!options?.force && this.lastToken === token) {
        return this.hydratePromise;
      }
      try {
        await this.hydratePromise;
      } catch {
        // ignore prior failure — we may still retry below
      }
      if (
        !options?.force &&
        this.snapshot.ready &&
        this.lastToken === token &&
        !this.snapshot.hydrating
      ) {
        return true;
      }
    }

    this.lastToken = token;
    this.setPartial({ hydrating: true, error: null });

    const generation = ++this.hydrateGeneration;
    this.hydratePromise = (async () => {
      try {
        const res = await fetch('/api/bootstrap', {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Bootstrap failed (${res.status})`);
        }
        const payload = (await res.json()) as BootstrapPayload;
        // Ignore stale responses if a newer hydrate was scheduled after this one.
        if (generation !== this.hydrateGeneration) {
          return this.snapshot.ready;
        }
        this.hydrateFromPayload(payload);
        return true;
      } catch (err) {
        if (generation !== this.hydrateGeneration) {
          return this.snapshot.ready;
        }
        const message = err instanceof Error ? err.message : 'Bootstrap failed';
        this.setPartial({
          hydrating: false,
          error: this.snapshot.ready ? null : message,
          ready: this.snapshot.ready,
        });
        console.error('Local data hydrate failed:', err);
        return this.snapshot.ready;
      } finally {
        if (generation === this.hydrateGeneration) {
          this.hydratePromise = null;
        }
      }
    })();

    return this.hydratePromise;
  }

  searchCustomers(query: string, limit = 50): Customer[] {
    const q = query.trim().toLowerCase();
    let list = this.snapshot.customers;
    if (q) {
      list = list.filter((c) => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q);
      });
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return list.slice(0, limit);
  }

  getRecentCustomers(limit = 4): Customer[] {
    return [...this.snapshot.customers]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  getCustomerById(id: string): Customer | undefined {
    return this.snapshot.customers.find((c) => c.id === id);
  }

  nameExists(name: string, excludeId?: string): boolean {
    const target = name.trim().toLowerCase();
    if (!target) return false;
    return this.snapshot.customers.some(
      (c) => c.name.toLowerCase() === target && c.id !== excludeId
    );
  }

  filterOrders(opts: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): { orders: Order[]; hasMore: boolean } {
    const status = opts.status || 'All';
    const q = (opts.search || '').trim().toLowerCase();
    const page = opts.page || 1;
    const limit = opts.limit || 50;

    let list = [...this.snapshot.orders];
    if (status && status !== 'All') {
      if (status === 'active') {
        list = list.filter((o) => o.status !== 'Archived' && o.status !== 'Delivered');
      } else if (status === 'finished') {
        list = list.filter((o) => o.status === 'Delivered' || o.status === 'Archived');
      } else {
        list = list.filter((o) => o.status === status);
      }
    } else {
      // Default list matches API: active (not Delivered/Archived)
      list = list.filter((o) => o.status !== 'Archived' && o.status !== 'Delivered');
    }

    if (q) {
      list = list.filter((o) => {
        const num = (o.order_number || '').toLowerCase();
        const name = (o.customer_name || '').toLowerCase();
        const phone = (o.customer_phone || '').toLowerCase();
        return num.includes(q) || name.includes(q) || phone.includes(q);
      });
    }

    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const offset = (page - 1) * limit;
    const sliced = list.slice(offset, offset + limit);
    return { orders: sliced, hasMore: offset + sliced.length < list.length };
  }

  getOrderById(id: string): Order | undefined {
    return this.snapshot.orders.find((o) => o.id === id);
  }

  getOrdersForCustomer(customerId: string): Order[] {
    return this.snapshot.orders
      .filter((o) => o.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getMeasurements(customerId: string): MeasurementCacheEntry | null {
    return this.snapshot.measurementsByCustomerId[customerId] || null;
  }

  getProfiles(customerId: string): MeasurementProfile[] {
    const entry = this.getMeasurements(customerId);
    const data = entry?.data;
    if (!data) return [];
    if (Array.isArray(data.profiles)) return data.profiles;
    return [];
  }

  upsertCustomer(customer: Customer) {
    const idx = this.snapshot.customers.findIndex((c) => c.id === customer.id);
    const customers =
      idx >= 0
        ? this.snapshot.customers.map((c, i) => (i === idx ? customer : c))
        : [customer, ...this.snapshot.customers];
    this.setPartial({ customers });
  }

  removeCustomer(customerId: string) {
    const { [customerId]: _removed, ...rest } = this.snapshot.measurementsByCustomerId;
    this.setPartial({
      customers: this.snapshot.customers.filter((c) => c.id !== customerId),
      measurementsByCustomerId: rest,
      orders: this.snapshot.orders.filter((o) => o.customer_id !== customerId),
    });
  }

  upsertOrder(order: Order) {
    const safe: Order = {
      ...order,
      items: Array.isArray(order.items)
        ? order.items
        : (() => {
            if (typeof (order as any).items === 'string') {
              try {
                const parsed = JSON.parse((order as any).items);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            }
            return [];
          })(),
    };
    const idx = this.snapshot.orders.findIndex((o) => o.id === safe.id);
    const orders =
      idx >= 0
        ? this.snapshot.orders.map((o, i) => (i === idx ? { ...o, ...safe } : o))
        : [safe, ...this.snapshot.orders];
    this.setPartial({ orders });
  }

  removeOrder(orderId: string) {
    this.setPartial({
      orders: this.snapshot.orders.filter((o) => o.id !== orderId),
    });
  }

  setOrders(orders: Order[]) {
    this.setPartial({ orders });
  }

  upsertMeasurements(customerId: string, entry: MeasurementCacheEntry) {
    this.setPartial({
      measurementsByCustomerId: {
        ...this.snapshot.measurementsByCustomerId,
        [customerId]: { ...entry, customer_id: customerId },
      },
    });
  }

  setGarmentTypes(garmentTypes: GarmentType[]) {
    this.setPartial({ garmentTypes });
  }

  setStylingCategories(stylingCategories: StylingCategory[]) {
    this.setPartial({ stylingCategories });
  }

  setSettings(settings: Partial<ShopSettings> & Record<string, unknown>) {
    this.writeSettingsCache(settings);
    this.setPartial({ settings });
  }
}

export const localDataStore = new LocalDataStore();
