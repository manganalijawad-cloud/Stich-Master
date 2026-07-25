/**
 * Canonical status badge + payment chip styles for consistent scanning.
 * Uses semantic CSS utilities from index.css (muted professional colors).
 */

export type OrderStatusId = string;

/** Map pipeline / order status id → badge utility class. */
export function getStatusBadgeClass(status: OrderStatusId): string {
  switch (status) {
    case 'Ready':
    case 'Ready to Deliver':
      return 'badge-status-ready';
    case 'Delivered':
      return 'badge-status-delivered';
    case 'Archived':
    case 'Cancelled':
      return 'badge-status-cancelled';
    case 'Pending':
      return 'badge-status-pending';
    default:
      // Cutting, Stitching, Fitting, custom mid stages
      return 'badge-status-progress';
  }
}

/** Matching text color for status labels outside badges. */
export function getStatusTextClass(status: OrderStatusId): string {
  switch (status) {
    case 'Ready':
    case 'Ready to Deliver':
      return 'text-status-ready';
    case 'Delivered':
      return 'text-status-delivered';
    case 'Archived':
    case 'Cancelled':
      return 'text-status-cancelled';
    case 'Pending':
      return 'text-status-pending';
    default:
      return 'text-status-progress';
  }
}

export function getPaymentChipClass(remaining: number): string {
  return remaining > 0 ? 'chip-due' : 'chip-paid';
}

export function getPaymentLabel(remaining: number, currency: string): string {
  if (remaining > 0) {
    const n = Math.round(remaining);
    return `Due ${currency}${n.toLocaleString()}`;
  }
  return 'Paid';
}
