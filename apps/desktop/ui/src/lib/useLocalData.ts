import { useCallback, useSyncExternalStore } from 'react';
import {
  localDataStore,
  type LocalDataSnapshot,
  type MeasurementCacheEntry,
} from './localDataStore';
import type { Customer, GarmentType, MeasurementProfile, StylingCategory } from '../types';

export function useLocalData(): LocalDataSnapshot {
  return useSyncExternalStore(localDataStore.subscribe, localDataStore.getSnapshot, localDataStore.getSnapshot);
}

export function useLocalCustomers() {
  const snap = useLocalData();
  const search = useCallback((query: string, limit?: number) => localDataStore.searchCustomers(query, limit), []);
  const recent = useCallback((limit?: number) => localDataStore.getRecentCustomers(limit), []);
  const byId = useCallback((id: string) => localDataStore.getCustomerById(id), []);
  const nameExists = useCallback((name: string, excludeId?: string) => localDataStore.nameExists(name, excludeId), []);
  return {
    ready: snap.ready,
    hydrating: snap.hydrating,
    customers: snap.customers,
    search,
    recent,
    byId,
    nameExists,
    version: snap.version,
  };
}

export function useLocalReferenceData() {
  const snap = useLocalData();
  return {
    ready: snap.ready,
    garmentTypes: snap.garmentTypes as GarmentType[],
    stylingCategories: snap.stylingCategories as StylingCategory[],
    settings: snap.settings,
  };
}

export function useLocalMeasurements(customerId: string | undefined | null): {
  entry: MeasurementCacheEntry | null;
  profiles: MeasurementProfile[];
} {
  const snap = useLocalData();
  if (!customerId) return { entry: null, profiles: [] };
  const entry = snap.measurementsByCustomerId[customerId] || null;
  const profiles = Array.isArray(entry?.data?.profiles) ? entry!.data.profiles! : [];
  return { entry, profiles };
}

export function cacheCustomer(customer: Customer) {
  localDataStore.upsertCustomer(customer);
}

export function cacheMeasurements(customerId: string, entry: MeasurementCacheEntry) {
  localDataStore.upsertMeasurements(customerId, entry);
}

export function removeCachedCustomer(customerId: string) {
  localDataStore.removeCustomer(customerId);
}
