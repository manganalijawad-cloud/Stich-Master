export function validateEmail(email: string): string | null {
  if (!email || email.trim().length === 0) return 'Email is required';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return 'Please enter a valid email address';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length === 0) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

export function validateMobileNumber(mobile: string, required = true): string | null {
  if (!mobile || mobile.trim().length === 0) {
    return required ? 'Mobile number is required' : null;
  }
  const cleaned = mobile.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) return 'Please enter a valid mobile number';
  if (!/^\d+$/.test(cleaned)) return 'Mobile number can only contain digits';
  return null;
}

export function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) return 'Please confirm your password';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}

type MeasurableGarment = {
  name: string;
  measurement_fields: Array<{ name: string; required?: boolean }>;
};

/**
 * Blocks customer save until a garment is selected and at least one measurement
 * value is filled (plus all fields marked required).
 */
export function validateGarmentMeasurementsCompleted(
  garment: MeasurableGarment | null | undefined,
  values: Record<string, string | number> | undefined
): string | null {
  if (!garment) {
    return 'Please select a garment type and enter measurements. A customer cannot be saved without measurements.';
  }
  if (!garment.measurement_fields || garment.measurement_fields.length === 0) {
    return `No measurement fields are configured for "${garment.name}". Configure measurements before saving a customer.`;
  }

  const vals = values || {};
  const missingRequired = garment.measurement_fields
    .filter(f => f.required)
    .find(f => vals[f.name] == null || String(vals[f.name]).trim() === '');
  if (missingRequired) {
    return `Missing required measurement: "${missingRequired.name}". Please fill in all required measurements to save the customer.`;
  }

  const hasAnyCompleted = garment.measurement_fields.some(
    f => vals[f.name] != null && String(vals[f.name]).trim() !== ''
  );
  if (!hasAnyCompleted) {
    return 'Enter at least one garment measurement before saving the customer.';
  }

  return null;
}
