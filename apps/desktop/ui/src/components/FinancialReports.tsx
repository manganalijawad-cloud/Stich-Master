import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DollarSign,
  ArrowDownToLine,
  Printer,
  ShoppingBag,
  Search,
  Phone,
  AlertCircle,
  RefreshCw,
  Wallet,
  CircleDollarSign,
} from 'lucide-react';
import type { Order, PipelineStage } from '../types';
import { printPage } from '../lib/print';
import { formatMoney as formatMoneyShared, formatMediumDate } from '../lib/format';
import {
  CustomerName,
  MoneyDue,
  MoneyPaid,
  MoneyTotal,
  OrderId,
  StatusBadge,
} from './ui/ScanValue';

interface FinancialReportsProps {
  token: string;
  currency: string;
  shopName?: string;
}

interface FinancialData {
  orders: Order[];
  settings: {
    currency: string;
    pipeline_stages: PipelineStage[];
  };
}

type DateFilter = 'Today' | 'ThisWeek' | 'ThisMonth' | 'ThisYear' | 'Custom';

/** Order value after discount — falls back to total_amount for older rows. */
function orderValue(o: Pick<Order, 'final_total' | 'total_amount'>): number {
  return Number(o.final_total ?? o.total_amount) || 0;
}

function paidAmount(o: Pick<Order, 'paid_amount'>): number {
  return Number(o.paid_amount) || 0;
}

/** Remaining balance owed (never negative). */
function balanceDue(o: Pick<Order, 'final_total' | 'total_amount' | 'paid_amount'>): number {
  return Math.max(0, orderValue(o) - paidAmount(o));
}

/**
 * Paid amount applied toward the order (capped at order value).
 * Keeps Booked = Collected + Still owed when overpayments exist.
 */
function appliedPaid(o: Pick<Order, 'final_total' | 'total_amount' | 'paid_amount'>): number {
  return Math.min(paidAmount(o), orderValue(o));
}

function formatMoney(currency: string, amount: number): string {
  return formatMoneyShared(currency, amount);
}

function stageLabel(stages: PipelineStage[], status: string): string {
  return stages.find((s) => s.id === status)?.name || status;
}

function formatRangeLabel(start: Date, end: Date, filter: DateFilter): string {
  if (filter === 'Today') return formatMediumDate(start);
  const sameYear = start.getFullYear() === end.getFullYear();
  const from = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const to = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${from} – ${to}`;
}

export default function FinancialReports({ token, currency, shopName }: FinancialReportsProps) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>('ThisMonth');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toLocaleDateString('en-CA');
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(true);

  const fetchFinancials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/financials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load finances.');
      setData({
        orders: Array.isArray(json.orders) ? json.orders : [],
        settings: {
          currency: json.settings?.currency || currency,
          pipeline_stages: json.settings?.pipeline_stages || [],
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading finances.');
    } finally {
      setLoading(false);
    }
  }, [token, currency]);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  const pipelineStages = data?.settings?.pipeline_stages || [];
  const allOrders = data?.orders ?? [];

  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    end.setHours(23, 59, 59, 999);
    switch (dateFilter) {
      case 'Today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'ThisWeek':
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'ThisMonth':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'ThisYear':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'Custom':
        start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        break;
    }
    return { start, end };
  }, [dateFilter, customStartDate, customEndDate]);

  const periodLabel = useMemo(
    () => formatRangeLabel(dateRangeBounds.start, dateRangeBounds.end, dateFilter),
    [dateRangeBounds, dateFilter]
  );

  const filteredOrders = useMemo(() => {
    const { start, end } = dateRangeBounds;
    return allOrders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
  }, [allOrders, dateRangeBounds]);

  /** Period KPIs — booked / collected / still owed always add up. */
  const periodStats = useMemo(() => {
    let booked = 0;
    let collected = 0;
    let owed = 0;
    let unpaidOrders = 0;
    let deliveredCount = 0;
    let activeCount = 0;

    filteredOrders.forEach((o) => {
      const value = orderValue(o);
      const due = balanceDue(o);
      booked += value;
      collected += appliedPaid(o);
      owed += due;
      if (due > 0) unpaidOrders++;
      if (o.status === 'Delivered') deliveredCount++;
      else if (o.status !== 'Archived') activeCount++;
    });

    const collectionRate = booked > 0 ? (collected / booked) * 100 : 0;
    const avgOrder = filteredOrders.length > 0 ? booked / filteredOrders.length : 0;

    return {
      orderCount: filteredOrders.length,
      booked,
      collected,
      owed,
      unpaidOrders,
      deliveredCount,
      activeCount,
      collectionRate,
      avgOrder,
    };
  }, [filteredOrders]);

  const paymentMix = useMemo(() => {
    let fullyPaid = 0;
    let partiallyPaid = 0;
    let unpaid = 0;
    let fullyVal = 0;
    let partiallyVal = 0;
    let unpaidVal = 0;
    let partiallyCollected = 0;

    filteredOrders.forEach((o) => {
      const rev = orderValue(o);
      const col = paidAmount(o);
      if (rev <= 0 && col <= 0) return;
      if (col >= rev && rev > 0) {
        fullyPaid++;
        fullyVal += rev;
      } else if (col > 0) {
        partiallyPaid++;
        partiallyVal += rev;
        partiallyCollected += appliedPaid(o);
      } else {
        unpaid++;
        unpaidVal += rev;
      }
    });

    return { fullyPaid, partiallyPaid, unpaid, fullyVal, partiallyVal, unpaidVal, partiallyCollected };
  }, [filteredOrders]);

  /**
   * True receivables: every customer who still owes, across all orders.
   * Period filter does not hide old dues — that is what owners need day to day.
   */
  const customerBalances = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        name: string;
        phone: string;
        totalBooked: number;
        totalPaid: number;
        outstanding: number;
        ordersCount: number;
        unpaidOrders: number;
      }
    > = {};

    allOrders.forEach((o) => {
      if (!o.customer_id) return;
      if (!map[o.customer_id]) {
        map[o.customer_id] = {
          id: o.customer_id,
          name: o.customer_name || 'Unknown',
          phone: o.customer_phone || '',
          totalBooked: 0,
          totalPaid: 0,
          outstanding: 0,
          ordersCount: 0,
          unpaidOrders: 0,
        };
      }
      const row = map[o.customer_id];
      const due = balanceDue(o);
      row.totalBooked += orderValue(o);
      row.totalPaid += appliedPaid(o);
      row.outstanding += due;
      row.ordersCount += 1;
      if (due > 0) row.unpaidOrders += 1;
    });

    let list = Object.values(map);
    if (showDueOnly) list = list.filter((c) => c.outstanding > 0);

    const q = customerSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }

    return list.sort(
      (a, b) => b.outstanding - a.outstanding || b.totalBooked - a.totalBooked
    );
  }, [allOrders, customerSearch, showDueOnly]);

  const totalReceivables = useMemo(
    () => allOrders.reduce((sum, o) => sum + balanceDue(o), 0),
    [allOrders]
  );

  const customersOwingCount = useMemo(
    () =>
      new Set(
        allOrders.filter((o) => balanceDue(o) > 0 && o.customer_id).map((o) => o.customer_id)
      ).size,
    [allOrders]
  );

  const chartData = useMemo(() => {
    if (!filteredOrders.length) return [];
    const formatKey = (iso: string) => {
      const dt = new Date(iso);
      if (dateFilter === 'ThisYear') {
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      }
      return dt.toLocaleDateString('en-CA');
    };
    const formatLabel = (iso: string) => {
      const dt = new Date(iso);
      return dateFilter === 'ThisYear'
        ? dt.toLocaleDateString('en-US', { month: 'short' })
        : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const grouped: Record<
      string,
      { label: string; booked: number; collected: number; count: number; sortKey: string }
    > = {};
    filteredOrders.forEach((o) => {
      const key = formatKey(o.created_at);
      if (!grouped[key]) {
        grouped[key] = {
          label: formatLabel(o.created_at),
          booked: 0,
          collected: 0,
          count: 0,
          sortKey: key,
        };
      }
      grouped[key].booked += orderValue(o);
      grouped[key].collected += appliedPaid(o);
      grouped[key].count += 1;
    });
    return Object.values(grouped).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredOrders, dateFilter]);

  const handleExportCSV = () => {
    if (!filteredOrders.length) return;
    const headers = ['Order #', 'Customer', 'Phone', 'Date', 'Due', 'Status', 'Value', 'Paid', 'Balance'];
    const rows = filteredOrders.map((o) => {
      const rev = orderValue(o);
      const paid = paidAmount(o);
      return [
        o.order_number,
        o.customer_name || '',
        o.customer_phone || '',
        new Date(o.created_at).toLocaleDateString('en-CA'),
        o.due_date || '',
        stageLabel(pipelineStages, o.status),
        rev,
        paid,
        balanceDue(o),
      ];
    });
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Financial_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handlePrint = () => {
    // Give the print DOM a tick to be in the tree, then print.
    setTimeout(() => printPage(), 50);
  };

  const displayCurrency = data?.settings?.currency || currency;
  const canPrint = allOrders.length > 0;
  const printGeneratedAt = formatMediumDate(new Date());

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading finances">
        <div className="flex justify-between gap-3">
          <div className="h-7 bg-slate-200 rounded w-40 animate-pulse" />
          <div className="h-9 bg-slate-200 rounded w-56 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-24 animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
              <div className="h-7 bg-slate-200 rounded w-24 mb-1" />
              <div className="h-2 bg-slate-200 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="card h-56 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-32 mb-4" />
          <div className="h-full bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="w-10 h-10 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-800">{error}</p>
        <p className="text-xs text-slate-500">Check your connection and try again.</p>
        <button type="button" onClick={fetchFinancials} className="btn-primary text-xs">
          <RefreshCw className="icon-xs" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  const filterTabs: { id: DateFilter; label: string }[] = [
    { id: 'Today', label: 'Today' },
    { id: 'ThisWeek', label: 'Week' },
    { id: 'ThisMonth', label: 'Month' },
    { id: 'ThisYear', label: 'Year' },
    { id: 'Custom', label: 'Custom' },
  ];

  const maxChart = Math.max(...chartData.map((d) => Math.max(d.booked, d.collected)), 1);

  return (
    <div className="stack-lg">
      {/* Screen chrome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-h2">Finances</h1>
          <p className="text-helper mt-0">
            What you booked, what you collected, and who still owes you
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="filter-group overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDateFilter(tab.id)}
                className={`filter-tab whitespace-nowrap ${
                  dateFilter === tab.id ? 'filter-tab-solid' : ''
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={fetchFinancials}
              title="Refresh"
              className="btn-secondary py-1.5 px-2"
            >
              <RefreshCw className="icon-xs" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!filteredOrders.length}
              title="Download CSV"
              className={`btn-secondary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ArrowDownToLine className="icon-xs" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrint}
              title="Print report"
              className={`btn-primary py-1.5 px-2 ${!canPrint ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Printer className="icon-xs" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {dateFilter === 'Custom' && (
        <div className="card-soft flex flex-wrap gap-3 items-center print:hidden py-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor="finance-from" className="text-3xs font-bold text-slate-500 uppercase">
              From
            </label>
            <input
              id="finance-from"
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="input-base text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="finance-to" className="text-3xs font-bold text-slate-500 uppercase">
              To
            </label>
            <input
              id="finance-to"
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="input-base text-xs"
            />
          </div>
        </div>
      )}

      {/* Period context */}
      <p className="text-xs text-secondary print:hidden">
        Period figures are for orders placed{' '}
        <span className="font-semibold text-primary">{periodLabel}</span>
        {' · '}
        Booked = Collected + Still owed
      </p>

      {/* Period KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Booked</span>
            <div className="p-1.5 bg-info-50 text-info-700 rounded-lg">
              <ShoppingBag className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyTotal currency={displayCurrency} amount={periodStats.booked} className="text-2xl block" />
          <span className="text-3xs text-muted mt-0.5 block">
            {periodStats.orderCount} order{periodStats.orderCount !== 1 ? 's' : ''}
            {periodStats.orderCount > 0 && (
              <>
                {' · '}avg{' '}
                <MoneyTotal currency={displayCurrency} amount={periodStats.avgOrder} className="!inline !text-3xs" />
              </>
            )}
          </span>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Collected</span>
            <div className="p-1.5 bg-success-50 text-success-700 rounded-lg">
              <DollarSign className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyPaid currency={displayCurrency} amount={periodStats.collected} className="text-2xl font-display block" />
          <span className="text-3xs text-muted mt-0.5 block">
            {periodStats.collectionRate.toFixed(0)}% of booked value
          </span>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Still owed</span>
            <div className="p-1.5 bg-danger-50 text-danger-700 rounded-lg">
              <Wallet className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyDue currency={displayCurrency} amount={periodStats.owed} className="text-2xl font-display block" />
          <span className="text-3xs text-secondary mt-0.5 block">
            {periodStats.unpaidOrders} order{periodStats.unpaidOrders !== 1 ? 's' : ''} in this period
          </span>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">All customers owing</span>
            <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
              <CircleDollarSign className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyDue currency={displayCurrency} amount={totalReceivables} className="text-2xl font-display block" />
          <span className="text-3xs text-secondary mt-0.5 block">
            {customersOwingCount} customer{customersOwingCount !== 1 ? 's' : ''} · every unpaid order
          </span>
        </div>
      </div>

      {/* Who owes you — primary actionable list (all-time) */}
      <div className="print:hidden">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
          Who owes you
        </h2>
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <p className="text-3xs text-slate-400 font-medium">
              Open balances across all orders — not limited to the date filter above
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-3xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDueOnly}
                  onChange={(e) => setShowDueOnly(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Due only
              </label>
              <div className="relative">
                <Search className="icon-xs text-slate-400 absolute left-2.5 top-2.5" aria-hidden="true" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer…"
                  className="input-base pl-8 text-xs w-44"
                  aria-label="Search customers"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {customerBalances.length === 0 ? (
              <div className="empty-state py-6">
                <p className="empty-state-text">
                  {showDueOnly
                    ? 'Nobody owes you right now — all balances are clear.'
                    : 'No customers found.'}
                </p>
              </div>
            ) : (
              customerBalances.slice(0, 40).map((cust) => (
                <div key={cust.id} className="list-row !cursor-default">
                  <div className="min-w-0">
                    <CustomerName name={cust.name} as="p" className="truncate" />
                    <p className="text-3xs text-secondary">
                      {cust.unpaidOrders > 0
                        ? `${cust.unpaidOrders} unpaid · ${cust.ordersCount} total`
                        : `${cust.ordersCount} order${cust.ordersCount !== 1 ? 's' : ''}`}
                      {' · '}
                      booked{' '}
                      <MoneyTotal
                        currency={displayCurrency}
                        amount={cust.totalBooked}
                        className="!inline !text-3xs"
                      />
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      {cust.outstanding > 0 ? (
                        <>
                          <MoneyDue
                            currency={displayCurrency}
                            amount={cust.outstanding}
                            className="!text-xs block"
                          />
                          <p className="text-3xs font-bold text-feedback-warning uppercase">Follow up</p>
                        </>
                      ) : (
                        <>
                          <MoneyPaid
                            currency={displayCurrency}
                            amount={cust.totalPaid}
                            className="!text-xs block"
                          />
                          <p className="text-3xs font-semibold text-muted uppercase">Paid in full</p>
                        </>
                      )}
                    </div>
                    {cust.outstanding > 0 && cust.phone && (
                      <a
                        href={`tel:${cust.phone}`}
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition-colors"
                        title={`Call ${cust.name}`}
                      >
                        <Phone className="icon-xs" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="card empty-state py-12 print:hidden">
          <ShoppingBag className="empty-state-icon" aria-hidden="true" />
          <p className="empty-state-title">No orders in this period</p>
          <p className="empty-state-text">Try a different date range, or create an order first.</p>
        </div>
      ) : (
        <>
          {/* Payment mix */}
          <div className="print:hidden">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
              Payment mix · {periodLabel}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card">
                <p className="text-label mb-0">Fully paid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentMix.fullyPaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-money-paid mt-1">
                  {formatMoney(displayCurrency, paymentMix.fullyVal)}
                </p>
              </div>
              <div className="card">
                <p className="text-label mb-0">Partially paid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentMix.partiallyPaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-secondary mt-1">
                  <span className="text-money-paid">
                    {formatMoney(displayCurrency, paymentMix.partiallyCollected)}
                  </span>{' '}
                  paid of{' '}
                  <span className="text-money-total">
                    {formatMoney(displayCurrency, paymentMix.partiallyVal)}
                  </span>
                </p>
              </div>
              <div className="card">
                <p className="text-label mb-0">Unpaid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentMix.unpaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-money-due mt-1">
                  {formatMoney(displayCurrency, paymentMix.unpaidVal)} still due
                </p>
              </div>
            </div>
          </div>

          {/* Simple bar chart — works with a single day */}
          <div className="print:hidden">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
              Booked vs collected
            </h2>
            <div className="card">
              <div className="flex items-end gap-1.5 h-40 w-full overflow-x-auto pb-1">
                {chartData.map((d) => {
                  const bookedH = Math.max(4, (d.booked / maxChart) * 100);
                  const collectedH = Math.max(d.collected > 0 ? 4 : 0, (d.collected / maxChart) * 100);
                  return (
                    <div
                      key={d.sortKey}
                      className="flex-1 min-w-[2.25rem] h-full flex flex-col justify-end items-center gap-1"
                      title={`${d.label}: booked ${formatMoney(displayCurrency, d.booked)}, collected ${formatMoney(displayCurrency, d.collected)}`}
                    >
                      <div className="w-full flex items-end justify-center gap-0.5 h-[7.5rem]">
                        <div
                          className="w-[42%] max-w-[14px] rounded-t bg-neutral-900"
                          style={{ height: `${bookedH}%` }}
                        />
                        <div
                          className="w-[42%] max-w-[14px] rounded-t bg-neutral-400"
                          style={{ height: `${collectedH}%` }}
                        />
                      </div>
                      <span className="text-3xs text-slate-400 font-semibold truncate w-full text-center">
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-4 border-t border-slate-100 pt-2">
                <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase">
                  <span className="w-2.5 h-2.5 bg-neutral-900 inline-block rounded-sm" /> Booked
                </span>
                <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase">
                  <span className="w-2.5 h-2.5 bg-neutral-400 inline-block rounded-sm" /> Collected
                </span>
              </div>
            </div>
          </div>

          {/* Period order history */}
          <div className="card print:hidden">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 font-display">
              Orders · {periodLabel}
            </h2>
            <div className="table-wrap">
              <table className="table-base text-xs">
                <thead>
                  <tr>
                    <th className="table-th">Order</th>
                    <th className="table-th">Customer</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Value</th>
                    <th className="table-th text-right">Paid</th>
                    <th className="table-th text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const value = orderValue(o);
                    const paid = paidAmount(o);
                    const bal = balanceDue(o);
                    return (
                      <tr key={o.id} className="table-tr">
                        <td className="table-td">
                          <OrderId value={o.order_number} />
                        </td>
                        <td className="table-td">
                          <CustomerName name={o.customer_name || '—'} />
                        </td>
                        <td className="table-td text-secondary text-3xs">
                          {new Date(o.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="table-td">
                          <StatusBadge
                            status={o.status}
                            label={stageLabel(pipelineStages, o.status)}
                          />
                        </td>
                        <td className="table-td text-right">
                          <MoneyTotal currency={displayCurrency} amount={value} className="!text-xs" />
                        </td>
                        <td className="table-td text-right">
                          <MoneyPaid currency={displayCurrency} amount={paid} className="!text-xs" />
                        </td>
                        <td className="table-td text-right">
                          {bal <= 0 ? (
                            <span className="text-money-paid text-xs font-semibold">Paid</span>
                          ) : (
                            <MoneyDue currency={displayCurrency} amount={bal} className="!text-xs" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="table-td text-3xs uppercase font-bold" colSpan={4}>
                      Totals ({periodStats.orderCount} orders)
                    </td>
                    <td className="table-td text-right">
                      <MoneyTotal
                        currency={displayCurrency}
                        amount={periodStats.booked}
                        className="!text-xs"
                      />
                    </td>
                    <td className="table-td text-right">
                      <MoneyPaid
                        currency={displayCurrency}
                        amount={periodStats.collected}
                        className="!text-xs"
                      />
                    </td>
                    <td className="table-td text-right">
                      <MoneyDue
                        currency={displayCurrency}
                        amount={periodStats.owed}
                        className="!text-xs"
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Print-only report (must be #print-finances-report for global print CSS) ── */}
      <div id="print-finances-report" className="hidden print:block bg-white text-slate-900">
        <div className="text-center space-y-1 border-b-2 border-slate-900 pb-4 mb-4">
          <h1 className="text-2xl font-black tracking-tight uppercase">
            {shopName?.trim() || 'Tailor Shop'}
          </h1>
          <h2 className="text-base font-semibold tracking-wider text-slate-600 uppercase">
            Finances Report
          </h2>
          <p className="text-xs text-slate-600">
            Period: {periodLabel} · Generated {printGeneratedAt}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5 text-sm">
          <div className="border border-slate-300 p-2">
            <p className="text-3xs font-bold uppercase text-slate-500">Booked</p>
            <p className="font-black text-base">{formatMoney(displayCurrency, periodStats.booked)}</p>
            <p className="text-3xs text-slate-500">{periodStats.orderCount} orders</p>
          </div>
          <div className="border border-slate-300 p-2">
            <p className="text-3xs font-bold uppercase text-slate-500">Collected</p>
            <p className="font-black text-base">{formatMoney(displayCurrency, periodStats.collected)}</p>
            <p className="text-3xs text-slate-500">{periodStats.collectionRate.toFixed(0)}% collected</p>
          </div>
          <div className="border border-slate-300 p-2">
            <p className="text-3xs font-bold uppercase text-slate-500">Still owed (period)</p>
            <p className="font-black text-base">{formatMoney(displayCurrency, periodStats.owed)}</p>
            <p className="text-3xs text-slate-500">{periodStats.unpaidOrders} unpaid orders</p>
          </div>
          <div className="border border-slate-300 p-2">
            <p className="text-3xs font-bold uppercase text-slate-500">All customers owing</p>
            <p className="font-black text-base">{formatMoney(displayCurrency, totalReceivables)}</p>
            <p className="text-3xs text-slate-500">{customersOwingCount} customers</p>
          </div>
        </div>

        <h3 className="text-xs font-black uppercase tracking-wider border-b border-slate-400 pb-1 mb-2">
          Who owes you
        </h3>
        {customerBalances.filter((c) => c.outstanding > 0).length === 0 ? (
          <p className="text-xs text-slate-500 mb-4">No outstanding customer balances.</p>
        ) : (
          <table className="w-full text-xs mb-5 border-collapse">
            <thead>
              <tr className="border-b border-slate-400 text-left">
                <th className="py-1 pr-2 font-bold">Customer</th>
                <th className="py-1 pr-2 font-bold">Phone</th>
                <th className="py-1 pr-2 font-bold text-right">Unpaid orders</th>
                <th className="py-1 font-bold text-right">Balance due</th>
              </tr>
            </thead>
            <tbody>
              {customerBalances
                .filter((c) => c.outstanding > 0)
                .map((c) => (
                  <tr key={c.id} className="border-b border-slate-200">
                    <td className="py-1.5 pr-2 font-semibold">{c.name}</td>
                    <td className="py-1.5 pr-2">{c.phone || '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{c.unpaidOrders}</td>
                    <td className="py-1.5 text-right font-bold">
                      {formatMoney(displayCurrency, c.outstanding)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        <h3 className="text-xs font-black uppercase tracking-wider border-b border-slate-400 pb-1 mb-2">
          Orders · {periodLabel}
        </h3>
        {filteredOrders.length === 0 ? (
          <p className="text-xs text-slate-500">No orders in this period.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-400 text-left">
                <th className="py-1 pr-2 font-bold">Order</th>
                <th className="py-1 pr-2 font-bold">Customer</th>
                <th className="py-1 pr-2 font-bold">Date</th>
                <th className="py-1 pr-2 font-bold">Status</th>
                <th className="py-1 pr-2 font-bold text-right">Value</th>
                <th className="py-1 pr-2 font-bold text-right">Paid</th>
                <th className="py-1 font-bold text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => {
                const value = orderValue(o);
                const paid = paidAmount(o);
                const bal = balanceDue(o);
                return (
                  <tr key={o.id} className="border-b border-slate-200">
                    <td className="py-1 pr-2 font-mono">{o.order_number}</td>
                    <td className="py-1 pr-2">{o.customer_name || '—'}</td>
                    <td className="py-1 pr-2">
                      {new Date(o.created_at).toLocaleDateString('en-CA')}
                    </td>
                    <td className="py-1 pr-2">{stageLabel(pipelineStages, o.status)}</td>
                    <td className="py-1 pr-2 text-right">{formatMoney(displayCurrency, value)}</td>
                    <td className="py-1 pr-2 text-right">{formatMoney(displayCurrency, paid)}</td>
                    <td className="py-1 text-right font-semibold">
                      {bal <= 0 ? 'Paid' : formatMoney(displayCurrency, bal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 font-bold">
                <td className="py-2 pr-2" colSpan={4}>
                  Totals ({periodStats.orderCount})
                </td>
                <td className="py-2 pr-2 text-right">
                  {formatMoney(displayCurrency, periodStats.booked)}
                </td>
                <td className="py-2 pr-2 text-right">
                  {formatMoney(displayCurrency, periodStats.collected)}
                </td>
                <td className="py-2 text-right">
                  {formatMoney(displayCurrency, periodStats.owed)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
