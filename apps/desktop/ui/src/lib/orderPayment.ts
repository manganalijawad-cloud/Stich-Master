/**
 * Shared order / customer outstanding balance math for POS-style dues UX.
 */

export type OrderBalanceFields = {
  final_total?: number | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  status?: string;
};

/** Remaining balance on one order (never negative). */
export function getOrderRemaining(order: OrderBalanceFields): number {
  const total = Number(order.final_total ?? order.total_amount) || 0;
  const paid = Number(order.paid_amount) || 0;
  return Math.max(0, total - paid);
}

/** Total unpaid across a customer's orders (Archived excluded by default). */
export function getCustomerOutstanding(
  orders: OrderBalanceFields[],
  opts?: { includeArchived?: boolean },
): number {
  const includeArchived = opts?.includeArchived === true;
  return (orders || []).reduce((sum, o) => {
    if (!includeArchived && o.status === 'Archived') return sum;
    return sum + getOrderRemaining(o);
  }, 0);
}

/** Count of orders that still have a balance (Archived excluded by default). */
export function countCustomerDueOrders(
  orders: OrderBalanceFields[],
  opts?: { includeArchived?: boolean },
): number {
  const includeArchived = opts?.includeArchived === true;
  return (orders || []).filter((o) => {
    if (!includeArchived && o.status === 'Archived') return false;
    return getOrderRemaining(o) > 0;
  }).length;
}
