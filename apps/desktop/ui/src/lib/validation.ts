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

export function validateMobileNumber(mobile: string): string | null {
  if (!mobile || mobile.trim().length === 0) return 'Mobile number is required';
  const cleaned = mobile.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) return 'Please enter a valid mobile number';
  if (!/^\d+$/.test(cleaned)) return 'Mobile number can only contain digits';
  return null;
}

export function validateRequired(value: string, fieldName: string): string | null {
  if (!value || value.trim().length === 0) return `${fieldName} is required`;
  return null;
}

export function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) return 'Please confirm your password';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}
