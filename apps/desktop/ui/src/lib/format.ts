/**
 * Shared display formatting for tailor-shop scanning (money, dates).
 */

export function formatMoney(currency: string, amount: number | string | null | undefined): string {
  const n = Math.round(Number(amount) || 0);
  return `${currency}${n.toLocaleString()}`;
}

export type DeliveryDateTone = 'overdue' | 'today' | 'upcoming' | 'none';

/** Calendar-day comparison in local time (ignores clock time). */
export function getDeliveryDateTone(dueDate: string | Date | null | undefined): DeliveryDateTone {
  if (!dueDate) return 'none';
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) return 'none';

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((startDue.getTime() - startToday.getTime()) / 86_400_000);

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  return 'upcoming';
}

export function formatShortDate(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return '—';
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatMediumDate(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return '—';
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function deliveryDateClass(tone: DeliveryDateTone): string {
  switch (tone) {
    case 'overdue':
      return 'text-date-overdue';
    case 'today':
      return 'text-date-today';
    case 'upcoming':
      return 'text-date-upcoming';
    default:
      return 'text-secondary';
  }
}
