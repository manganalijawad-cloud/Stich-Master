import { validateGarmentMeasurementsCompleted, validateMobileNumber } from './validation';
import type { MeasurementProfile } from '../types';

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
      firstProfile: MeasurementProfile;
    }
  | { ok: false; error: string };

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
      return {
        ok: true,
        customer: data.customer,
        alreadyExists: true,
        firstProfile,
      };
    }

    return {
      ok: true,
      customer: data.customer || data,
      firstProfile,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error creating customer record.';
    return { ok: false, error: message };
  }
}
