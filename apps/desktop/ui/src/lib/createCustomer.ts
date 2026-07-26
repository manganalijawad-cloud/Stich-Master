import { validateGarmentMeasurementsCompleted, validateMobileNumber } from './validation';
import type { MeasurementProfile } from '../types';
import { localDataStore } from './localDataStore';

export type CreateCustomerGarment = {
  id: string;
  name: string;
  measurement_fields: Array<{ name: string; required?: boolean }>;
};

export type CreateCustomerInput = {
  token: string;
  name: string;
  phone: string;
  address: string;
  isNameDuplicate: boolean;
  garment: CreateCustomerGarment | null | undefined;
  measurements: Record<string, string | number>;
};

export type CreateCustomerResult =
  | {
      ok: true;
      customer: any;
      alreadyExists?: boolean;
      /** Profile just created (new customer) or first existing profile when duplicate. */
      firstProfile: MeasurementProfile | null;
      /** Full measurement profiles for the customer (source of truth after create/lookup). */
      profiles: MeasurementProfile[];
    }
  | { ok: false; error: string };

async function loadCustomerProfiles(
  token: string,
  customerId: string
): Promise<MeasurementProfile[]> {
  const cached = localDataStore.getProfiles(customerId);
  if (cached.length > 0) return cached;

  try {
    const res = await fetch(`/api/customers/${customerId}/measurements`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const profiles = Array.isArray(data?.data?.profiles)
      ? data.data.profiles
      : Array.isArray(data?.profiles)
        ? data.profiles
        : [];
    if (customerId && profiles.length >= 0) {
      localDataStore.upsertMeasurements(customerId, {
        customer_id: customerId,
        data: { profiles },
        updated_at: data?.updated_at || new Date().toISOString(),
        created_at: data?.created_at || new Date().toISOString(),
      });
    }
    return profiles;
  } catch {
    return [];
  }
}

/** Shared create-customer path for Customers + Orders (PROJECT.md §8 measurements required). */
export async function createCustomerWithMeasurements(
  input: CreateCustomerInput
): Promise<CreateCustomerResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Customer Name is required.' };
  }

  const phoneRequired = input.isNameDuplicate;
  if (phoneRequired && !input.phone.trim()) {
    return {
      ok: false,
      error:
        'A customer with this name already exists. A Phone Number is required to save a duplicate name.',
    };
  }

  const phoneError = validateMobileNumber(input.phone, phoneRequired);
  if (phoneError) {
    return { ok: false, error: phoneError };
  }

  const measError = validateGarmentMeasurementsCompleted(input.garment, input.measurements);
  if (measError || !input.garment) {
    return {
      ok: false,
      error: measError || 'Please select a garment type and enter measurements.',
    };
  }

  const firstProfile: MeasurementProfile = {
    id: Math.random().toString(36).substring(2, 11),
    garment_type_id: input.garment.id,
    garment_name: input.garment.name,
    values: input.measurements,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        name,
        phone: input.phone.trim(),
        address: input.address.trim(),
        measurements: { profiles: [firstProfile] },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Failed to create customer.' };
    }

    if (data.alreadyExists) {
      if (data.customer) localDataStore.upsertCustomer(data.customer);
      const profiles = data.customer?.id
        ? await loadCustomerProfiles(input.token, data.customer.id)
        : [];
      return {
        ok: true,
        customer: data.customer,
        alreadyExists: true,
        firstProfile: profiles[0] || null,
        profiles,
      };
    }

    const customer = data.customer || data;
    const profiles = [firstProfile];
    if (customer?.id) {
      localDataStore.upsertCustomer(customer);
      localDataStore.upsertMeasurements(customer.id, {
        customer_id: customer.id,
        data: { profiles },
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      customer,
      firstProfile,
      profiles,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error creating customer record.';
    return { ok: false, error: message };
  }
}
