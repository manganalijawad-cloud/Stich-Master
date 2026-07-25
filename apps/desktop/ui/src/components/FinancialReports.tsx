import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DollarSign,
  ArrowDownToLine,
  Printer,
  TrendingUp,
  TrendingDown,
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
import { formatMoney as formatMoneyShared } from '../lib/format';
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

/** Remaining balance owed (never negative for summary math). */
function balanceDue(o: Pick<Order, 'final_total' | 'total_amount' | 'paid_amount'>): number {
  return Math.max(0, orderValue(o) - paidAmount(o));
}

function formatMoney(currency: string, amount: number): string {
  return formatMoneyShared(currency, amount);
}

function stageLabel(stages: PipelineStage[], status: string): string {
  return stages.find((s) => s.id === status)?.name || status;
}

export default function FinancialReports({ token, currency }: FinancialReportsProps) {
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

  const previousPeriodBounds = useMemo(() => {
    const { start, end } = dateRangeBounds;
    const dur = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    return { start: new Date(prevEnd.getTime() - dur), end: prevEnd };
  }, [dateRangeBounds]);

  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    const { start, end } = dateRangeBounds;
    return data.orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
  }, [data, dateRangeBounds]);

  const previousPeriodOrders = useMemo(() => {
    if (!data?.orders) return [];
    const { start, end } = previousPeriodBounds;
    return data.orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
  }, [data, previousPeriodBounds]);

  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCollected = 0;
    let outstanding = 0;
    let pendingCount = 0;
    let activeCount = 0;
    let deliveredCount = 0;

    filteredOrders.forEach((o) => {
      const rev = orderValue(o);
      const col = paidAmount(o);
      const due = balanceDue(o);
      totalRevenue += rev;
      totalCollected += col;
      outstanding += due;
      if (due > 0) pendingCount++;
      if (o.status === 'Delivered') deliveredCount++;
      else if (o.status !== 'Archived') activeCount++;
    });

    const avgOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
    const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;

    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      totalCollected,
      outstanding,
      pendingCount,
      activeCount,
      deliveredCount,
      avgOrder,
      collectionRate,
    };
  }, [filteredOrders]);

  const previousStats = useMemo(() => {
    let rev = 0;
    let col = 0;
    previousPeriodOrders.forEach((o) => {
      rev += orderValue(o);
      col += paidAmount(o);
    });
    return { totalOrders: previousPeriodOrders.length, totalRevenue: rev, totalCollected: col };
  }, [previousPeriodOrders]);

  const trends = useMemo(() => {
    const pct = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
    return {
      revenueChange: pct(stats.totalRevenue, previousStats.totalRevenue),
      collectionChange: pct(stats.totalCollected, previousStats.totalCollected),
      orderVolumeChange: pct(stats.totalOrders, previousStats.totalOrders),
    };
  }, [stats, previousStats]);

  const paymentDistribution = useMemo(() => {
    let fullyPaid = 0;
    let partiallyPaid = 0;
    let unpaid = 0;
    let fullyVal = 0;
    let partiallyVal = 0;
    let unpaidVal = 0;
    let fullyCollected = 0;
    let partiallyCollected = 0;

    filteredOrders.forEach((o) => {
      const rev = orderValue(o);
      const col = paidAmount(o);
      if (rev <= 0 && col <= 0) return;
      if (col >= rev && rev > 0) {
        fullyPaid++;
        fullyVal += rev;
        fullyCollected += col;
      } else if (col > 0) {
        partiallyPaid++;
        partiallyVal += rev;
        partiallyCollected += col;
      } else {
        unpaid++;
        unpaidVal += rev;
      }
    });

    return {
      fullyPaid,
      partiallyPaid,
      unpaid,
      fullyVal,
      partiallyVal,
      unpaidVal,
      fullyCollected,
      partiallyCollected,
    };
  }, [filteredOrders]);

  const customerInsights = useMemo(() => {
    if (!filteredOrders.length) return [];
    const map: Record<
      string,
      {
        id: string;
        name: string;
        phone: string;
        totalBookings: number;
        totalPaid: number;
        outstanding: number;
        ordersCount: number;
      }
    > = {};

    filteredOrders.forEach((o) => {
      if (!o.customer_id) return;
      if (!map[o.customer_id]) {
        map[o.customer_id] = {
          id: o.customer_id,
          name: o.customer_name || 'Unknown',
          phone: o.customer_phone || '',
          totalBookings: 0,
          totalPaid: 0,
          outstanding: 0,
          ordersCount: 0,
        };
      }
      const row = map[o.customer_id];
      row.totalBookings += orderValue(o);
      row.totalPaid += paidAmount(o);
      row.outstanding += balanceDue(o);
      row.ordersCount += 1;
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
      (a, b) => b.outstanding - a.outstanding || b.totalBookings - a.totalBookings
    );
  }, [filteredOrders, customerSearch, showDueOnly]);

  const chartData = useMemo(() => {
    if (!filteredOrders.length) return [];
    const formatKey = (d: string) => {
      const dt = new Date(d);
      return dateFilter === 'ThisYear'
        ? dt.toLocaleDateString('en-US', { month: 'short' })
        : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const grouped: Record<
      string,
      { label: string; revenue: number; collected: number; count: number; date: Date }
    > = {};
    filteredOrders.forEach((o) => {
      const key = formatKey(o.created_at);
      if (!grouped[key]) {
        grouped[key] = {
          label: key,
          revenue: 0,
          collected: 0,
          count: 0,
          date: new Date(o.created_at),
        };
      }
      grouped[key].revenue += orderValue(o);
      grouped[key].collected += paidAmount(o);
      grouped[key].count += 1;
    });
    return Object.values(grouped).sort((a, b) => a.date.getTime() - b.date.getTime());
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
        Math.max(0, rev - paid),
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

  const TrendBadge = ({ value }: { value: number }) => {
    if (value === 0) return null;
    return value > 0 ? (
      <span className="flex items-center gap-0.5 text-slate-600 text-3xs font-semibold">
        <TrendingUp className="icon-xs" aria-hidden="true" /> +{value.toFixed(0)}%
      </span>
    ) : (
      <span className="flex items-center gap-0.5 text-slate-500 text-3xs font-semibold">
        <TrendingDown className="icon-xs" aria-hidden="true" /> {value.toFixed(0)}%
      </span>
    );
  };

  const filterTabs: { id: DateFilter; label: string }[] = [
    { id: 'Today', label: 'Today' },
    { id: 'ThisWeek', label: 'Week' },
    { id: 'ThisMonth', label: 'Month' },
    { id: 'ThisYear', label: 'Year' },
    { id: 'Custom', label: 'Custom' },
  ];

  const displayCurrency = data?.settings?.currency || currency;

  return (
    <div className="stack-lg print:space-y-6 print:bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-h2">Finances</h1>
          <p className="text-helper mt-0">
            Sales, payments, and balances for your shop
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
              onClick={() => printPage()}
              disabled={!filteredOrders.length}
              title="Print"
              className={`btn-primary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
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

      {/* KPI cards — PROJECT.md order money: total, paid, remaining */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Total sales</span>
            <div className="p-1.5 bg-info-50 text-info-700 rounded-lg">
              <ShoppingBag className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyTotal currency={displayCurrency} amount={stats.totalRevenue} className="text-2xl block" />
          <div className="mt-1 flex items-center gap-1.5">
            <TrendBadge value={trends.revenueChange} />
            <span className="text-3xs text-muted">vs previous period</span>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Payments in</span>
            <div className="p-1.5 bg-success-50 text-success-700 rounded-lg">
              <DollarSign className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyPaid currency={displayCurrency} amount={stats.totalCollected} className="text-2xl font-display block" />
          <div className="mt-1 flex items-center gap-1.5">
            <TrendBadge value={trends.collectionChange} />
            <span className="text-3xs text-muted">
              {stats.collectionRate.toFixed(0)}% collected
            </span>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Outstanding</span>
            <div className="p-1.5 bg-danger-50 text-danger-700 rounded-lg">
              <Wallet className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <MoneyDue currency={displayCurrency} amount={stats.outstanding} className="text-2xl font-display block" />
          <span className="text-3xs text-secondary mt-0.5 block">
            {stats.pendingCount} order{stats.pendingCount !== 1 ? 's' : ''} not fully paid
          </span>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label mb-0">Orders</span>
            <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
              <CircleDollarSign className="icon-xs" aria-hidden="true" />
            </div>
          </div>
          <span className="text-2xl font-bold text-primary font-display">{stats.totalOrders}</span>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs font-semibold text-secondary">
            <span>
              <span className="text-primary">{stats.activeCount}</span> active
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="text-primary">{stats.deliveredCount}</span> delivered
            </span>
            <span className="text-slate-300">·</span>
            <span>
              avg <MoneyTotal currency={displayCurrency} amount={stats.avgOrder} className="!inline !text-3xs" />
            </span>
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="card empty-state py-12">
          <ShoppingBag className="empty-state-icon" aria-hidden="true" />
          <p className="empty-state-title">No orders in this period</p>
          <p className="empty-state-text">Try a different date range, or create an order first.</p>
        </div>
      ) : (
        <>
          {/* Sales & payments chart */}
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
              Sales &amp; payments
            </h2>
            <div className="card">
              <div className="relative h-48 w-full flex items-end">
                {chartData.length < 2 ? (
                  <p className="w-full text-center text-xs text-slate-400 font-semibold py-16">
                    Need orders on at least two days to show a chart.
                  </p>
                ) : (
                  <svg className="w-full h-full" viewBox="0 0 500 180" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#171717" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#171717" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#737373" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#737373" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="45" x2="500" y2="45" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="90" x2="500" y2="90" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="135" x2="500" y2="135" stroke="#F1F5F9" strokeWidth="1" />
                    {(() => {
                      const maxVal = Math.max(...chartData.map((d) => Math.max(d.revenue, d.collected))) || 100;
                      const stepX = 500 / Math.max(chartData.length - 1, 1);
                      const ptsRev = chartData.map((d, i) => ({
                        x: i * stepX,
                        y: 180 - (d.revenue / maxVal) * 140 - 20,
                      }));
                      const ptsCol = chartData.map((d, i) => ({
                        x: i * stepX,
                        y: 180 - (d.collected / maxVal) * 140 - 20,
                      }));
                      const revPath =
                        `M${ptsRev[0].x} 180 ` +
                        ptsRev.map((p) => `L${p.x} ${p.y}`).join(' ') +
                        ` L${ptsRev[ptsRev.length - 1].x} 180 Z`;
                      const colPath =
                        `M${ptsCol[0].x} 180 ` +
                        ptsCol.map((p) => `L${p.x} ${p.y}`).join(' ') +
                        ` L${ptsCol[ptsCol.length - 1].x} 180 Z`;
                      const revLine = ptsRev.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
                      const colLine = ptsCol.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
                      return (
                        <>
                          <path d={revPath} fill="url(#revGrad)" />
                          <path d={colPath} fill="url(#colGrad)" />
                          <path d={revLine} fill="none" stroke="#171717" strokeWidth="2.5" strokeLinecap="round" />
                          <path d={colLine} fill="none" stroke="#737373" strokeWidth="2.5" strokeLinecap="round" />
                          {ptsRev.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke="#171717" strokeWidth="2" />
                              <circle
                                cx={ptsCol[i].x}
                                cy={ptsCol[i].y}
                                r="3.5"
                                fill="white"
                                stroke="#737373"
                                strokeWidth="2"
                              />
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <div className="flex gap-4">
                  <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase">
                    <span className="w-3 h-0.5 bg-neutral-900 inline-block rounded" /> Sales
                  </span>
                  <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase">
                    <span className="w-3 h-0.5 bg-neutral-400 inline-block rounded" /> Payments
                  </span>
                </div>
                <div className="flex gap-1 text-3xs text-slate-400 font-semibold">
                  {chartData.slice(0, 6).map((d, i) => (
                    <span key={i}>
                      {d.label}
                      {i < Math.min(5, chartData.length - 1) ? ',' : ''}
                    </span>
                  ))}
                  {chartData.length > 6 && <span>…</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Payment status summary */}
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
              Payment status
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card">
                <p className="text-label mb-0">Fully paid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentDistribution.fullyPaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-money-paid mt-1">
                  {formatMoney(displayCurrency, paymentDistribution.fullyVal)}
                </p>
              </div>
              <div className="card">
                <p className="text-label mb-0">Partially paid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentDistribution.partiallyPaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-secondary mt-1">
                  <span className="text-money-paid">{formatMoney(displayCurrency, paymentDistribution.partiallyCollected)}</span> paid of{' '}
                  <span className="text-money-total">{formatMoney(displayCurrency, paymentDistribution.partiallyVal)}</span>
                </p>
              </div>
              <div className="card">
                <p className="text-label mb-0">Unpaid</p>
                <p className="text-xl font-bold text-primary font-display mt-1">
                  {paymentDistribution.unpaid}
                  <span className="text-xs font-semibold text-muted ml-1">orders</span>
                </p>
                <p className="text-xs text-money-due mt-1">
                  {formatMoney(displayCurrency, paymentDistribution.unpaidVal)} still due
                </p>
              </div>
            </div>
          </div>

          {/* Customer balances */}
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">
              Customer balances
            </h2>
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <p className="text-3xs text-slate-400 font-medium">
                  Who still owes money in this period
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
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {customerInsights.length === 0 ? (
                  <div className="empty-state py-6">
                    <p className="empty-state-text">
                      {showDueOnly ? 'No outstanding balances in this period.' : 'No customers found.'}
                    </p>
                  </div>
                ) : (
                  customerInsights.slice(0, 25).map((cust) => (
                    <div
                      key={cust.id}
                      className="list-row !cursor-default"
                    >
                      <div className="min-w-0">
                        <CustomerName name={cust.name} as="p" className="truncate" />
                        <p className="text-3xs text-secondary">
                          {cust.ordersCount} order{cust.ordersCount !== 1 ? 's' : ''} · Total{' '}
                          <MoneyTotal currency={displayCurrency} amount={cust.totalBookings} className="!inline !text-3xs" />
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {cust.outstanding > 0 ? (
                            <>
                              <MoneyDue currency={displayCurrency} amount={cust.outstanding} className="!text-xs block" />
                              <p className="text-3xs font-bold text-feedback-warning uppercase">Follow up</p>
                            </>
                          ) : (
                            <>
                              <MoneyPaid currency={displayCurrency} amount={cust.totalPaid} className="!text-xs block" />
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
        </>
      )}

      {/* Order / transaction history */}
      <div className="card print:border-none print:shadow-none print:p-0">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 print:hidden font-display">
          Order history
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
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-td text-center text-muted font-semibold">
                    No records
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const value = orderValue(o);
                  const paid = paidAmount(o);
                  const bal = Math.max(0, value - paid);
                  return (
                    <tr key={o.id} className="table-tr">
                      <td className="table-td">
                        <OrderId value={o.order_number} />
                      </td>
                      <td className="table-td">
                        <CustomerName name={o.customer_name} />
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
                })
              )}
            </tbody>
            {filteredOrders.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="table-td text-3xs uppercase font-bold" colSpan={4}>
                    Totals ({stats.totalOrders} orders)
                  </td>
                  <td className="table-td text-right">
                    <MoneyTotal currency={displayCurrency} amount={stats.totalRevenue} className="!text-xs" />
                  </td>
                  <td className="table-td text-right">
                    <MoneyPaid currency={displayCurrency} amount={stats.totalCollected} className="!text-xs" />
                  </td>
                  <td className="table-td text-right">
                    <MoneyDue currency={displayCurrency} amount={stats.outstanding} className="!text-xs" />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
