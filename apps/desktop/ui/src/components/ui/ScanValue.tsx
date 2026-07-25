/**
 * Tiny display primitives for fast tailor scanning — semantic color on key values only.
 */

import {
  deliveryDateClass,
  formatMediumDate,
  formatMoney,
  formatShortDate,
  getDeliveryDateTone,
} from '../../lib/format';
import {
  getPaymentChipClass,
  getPaymentLabel,
  getStatusBadgeClass,
} from '../../lib/statusUi';

export function CustomerName({
  name,
  className = '',
  as: Tag = 'span',
}: {
  name: string;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
}) {
  return <Tag className={`text-customer-name ${className}`.trim()}>{name}</Tag>;
}

export function OrderId({
  value,
  className = '',
}: {
  value: string;
  className?: string;
}) {
  return <span className={`text-order-id ${className}`.trim()}>{value}</span>;
}

export function MoneyTotal({
  currency,
  amount,
  className = '',
}: {
  currency: string;
  amount: number | string | null | undefined;
  className?: string;
}) {
  return (
    <span className={`text-money-total ${className}`.trim()}>
      {formatMoney(currency, amount)}
    </span>
  );
}

export function MoneyPaid({
  currency,
  amount,
  className = '',
}: {
  currency: string;
  amount: number | string | null | undefined;
  className?: string;
}) {
  return (
    <span className={`text-money-paid ${className}`.trim()}>
      {formatMoney(currency, amount)}
    </span>
  );
}

export function MoneyDue({
  currency,
  amount,
  className = '',
}: {
  currency: string;
  amount: number | string | null | undefined;
  className?: string;
}) {
  return (
    <span className={`text-money-due ${className}`.trim()}>
      {formatMoney(currency, amount)}
    </span>
  );
}

export function StatusBadge({
  status,
  label,
  className = '',
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`${getStatusBadgeClass(status)} ${className}`.trim()}>
      {label || status}
    </span>
  );
}

export function PaymentChip({
  currency,
  remaining,
  className = '',
}: {
  currency: string;
  remaining: number;
  className?: string;
}) {
  return (
    <span className={`${getPaymentChipClass(remaining)} ${className}`.trim()}>
      {getPaymentLabel(remaining, currency)}
    </span>
  );
}

export function DeliveryDateText({
  dueDate,
  prefix = 'Due',
  short = true,
  className = '',
}: {
  dueDate: string | Date | null | undefined;
  prefix?: string;
  short?: boolean;
  className?: string;
}) {
  const tone = getDeliveryDateTone(dueDate);
  const formatted = short ? formatShortDate(dueDate) : formatMediumDate(dueDate);
  return (
    <span className={`${deliveryDateClass(tone)} ${className}`.trim()}>
      {prefix ? `${prefix}: ${formatted}` : formatted}
    </span>
  );
}
