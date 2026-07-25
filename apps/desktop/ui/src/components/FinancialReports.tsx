import { useState, useMemo, useEffect } from 'react';
import {
  DollarSign, ArrowDownToLine, Printer, TrendingUp, TrendingDown,
  ShoppingBag, Search, Phone, AlertCircle, RefreshCw
} from 'lucide-react';
import type { Order, PipelineStage } from '../types';
import { printPage } from '../lib/print';

interface FinancialReportsProps {
  token: string;
  currency: string;
}

interface FinancialData {
  orders: Order[];
  inventory: any[];
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

export default function FinancialReports({ token, currency }: FinancialReportsProps) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>('ThisMonth');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toLocaleDateString('en-CA');
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [customerSearch, setCustomerSearch] = useState('');

  const fetchFinancials = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/reports/financials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch financial records.');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error loading financial reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFinancials(); }, [token]);

  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    end.setHours(23, 59, 59, 999);
    switch (dateFilter) {
      case 'Today': start.setHours(0, 0, 0, 0); break;
      case 'ThisWeek': start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); break;
      case 'ThisMonth': start.setDate(1); start.setHours(0, 0, 0, 0); break;
      case 'ThisYear': start.setMonth(0, 1); start.setHours(0, 0, 0, 0); break;
      case 'Custom': start = new Date(customStartDate); start.setHours(0, 0, 0, 0); end = new Date(customEndDate); end.setHours(23, 59, 59, 999); break;
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
    return data.orders.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; });
  }, [data, dateRangeBounds]);

  const previousPeriodOrders = useMemo(() => {
    if (!data?.orders) return [];
    const { start, end } = previousPeriodBounds;
    return data.orders.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; });
  }, [data, previousPeriodBounds]);

  const stats = useMemo(() => {
    let totalRevenue = 0, totalCollected = 0, pendingCount = 0, activeCount = 0, deliveredCount = 0;
    filteredOrders.forEach(o => {
      const rev = orderValue(o);
      const col = Number(o.paid_amount) || 0;
      totalRevenue += rev; totalCollected += col;
      if (col < rev) pendingCount++;
      if (o.status === 'Delivered') deliveredCount++;
      else if (o.status !== 'Archived') activeCount++;
    });
    let totalExpenses = 0;
    if (data?.inventory) {
      data.inventory.forEach((item: any) => {
        totalExpenses += (Number(item.price) || 0) * (Number(item.quantity) || 0);
      });
    }
    const outstanding = totalRevenue - totalCollected;
    const avgOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
    const profit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    return {
      totalOrders: filteredOrders.length, totalRevenue, totalCollected, outstanding,
      pendingCount, activeCount, deliveredCount, avgOrder, totalExpenses, profit, margin,
      hasExpenses: data?.inventory && data.inventory.length > 0
    };
  }, [filteredOrders, data]);

  const previousStats = useMemo(() => {
    let rev = 0, col = 0;
    previousPeriodOrders.forEach(o => { rev += orderValue(o); col += Number(o.paid_amount) || 0; });
    return { totalOrders: previousPeriodOrders.length, totalRevenue: rev, totalCollected: col };
  }, [previousPeriodOrders]);

  const trends = useMemo(() => {
    const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
    return {
      revenueChange: pct(stats.totalRevenue, previousStats.totalRevenue),
      collectionChange: pct(stats.totalCollected, previousStats.totalCollected),
      orderVolumeChange: pct(stats.totalOrders, previousStats.totalOrders),
    };
  }, [stats, previousStats]);

  const pipelineFinancials = useMemo(() => {
    if (!data) return [];
    const stages = (data?.settings?.pipeline_stages || []).filter((s: PipelineStage) => s.enabled);
    return stages.map((stage: PipelineStage) => {
      const so = filteredOrders.filter(o => o.status === stage.id);
      const value = so.reduce((s, o) => s + orderValue(o), 0);
      const collected = so.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0);
      return { id: stage.id, name: stage.name, count: so.length, value, collected, remaining: value - collected };
    });
  }, [data, filteredOrders]);

  const customerInsights = useMemo(() => {
    if (!filteredOrders.length) return [];
    const map: Record<string, any> = {};
    filteredOrders.forEach(o => {
      if (!o.customer_id) return;
      if (!map[o.customer_id]) {
        map[o.customer_id] = { id: o.customer_id, name: o.customer_name || 'Unknown', phone: o.customer_phone || '', totalBookings: 0, totalPaid: 0, outstanding: 0, ordersCount: 0 };
      }
      const rev = orderValue(o);
      const col = Number(o.paid_amount) || 0;
      map[o.customer_id].totalBookings += rev;
      map[o.customer_id].totalPaid += col;
      map[o.customer_id].outstanding += (rev - col);
      map[o.customer_id].ordersCount += 1;
    });
    let list = Object.values(map);
    const q = customerSearch.toLowerCase().trim();
    if (q) list = list.filter((c: any) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    return list.sort((a: any, b: any) => b.outstanding - a.outstanding || b.totalBookings - a.totalBookings);
  }, [filteredOrders, customerSearch]);

  const chartData = useMemo(() => {
    if (!filteredOrders.length) return [];
    const formatKey = (d: string) => {
      const dt = new Date(d);
      return dateFilter === 'ThisYear'
        ? dt.toLocaleDateString('en-US', { month: 'short' })
        : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const grouped: Record<string, { label: string; revenue: number; collected: number; count: number; date: Date }> = {};
    filteredOrders.forEach(o => {
      const key = formatKey(o.created_at);
      if (!grouped[key]) grouped[key] = { label: key, revenue: 0, collected: 0, count: 0, date: new Date(o.created_at) };
      grouped[key].revenue += orderValue(o);
      grouped[key].collected += Number(o.paid_amount) || 0;
      grouped[key].count += 1;
    });
    return Object.values(grouped).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredOrders, dateFilter]);

  const paymentDistribution = useMemo(() => {
    let fullyPaid = 0, partiallyPaid = 0, unpaid = 0;
    let fullyVal = 0, partiallyVal = 0, unpaidVal = 0;
    filteredOrders.forEach(o => {
      const rev = orderValue(o);
      const col = Number(o.paid_amount) || 0;
      if (col >= rev && rev > 0) { fullyPaid++; fullyVal += rev; }
      else if (col > 0) { partiallyPaid++; partiallyVal += rev; }
      else { unpaid++; unpaidVal += rev; }
    });
    return { fullyPaid, partiallyPaid, unpaid, fullyVal, partiallyVal, unpaidVal };
  }, [filteredOrders]);

  const handleExportCSV = () => {
    if (!filteredOrders.length) return;
    const headers = ['Order #','Customer','Phone','Date','Due','Status','Value','Paid','Balance'];
    const rows = filteredOrders.map(o => {
      const rev = orderValue(o);
      const paid = Number(o.paid_amount) || 0;
      return [
        o.order_number, o.customer_name || '', o.customer_phone || '',
        new Date(o.created_at).toLocaleDateString('en-CA'), o.due_date, o.status,
        rev, paid, rev - paid
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Financial_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between"><div className="h-7 bg-slate-200 rounded w-40 animate-pulse" /><div className="h-9 bg-slate-200 rounded w-48 animate-pulse" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse"><div className="h-3 bg-slate-200 rounded w-20 mb-2" /><div className="h-7 bg-slate-200 rounded w-24 mb-1" /><div className="h-2 bg-slate-200 rounded w-16" /></div>)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse p-4"><div className="h-5 bg-slate-200 rounded w-32 mb-4" /><div className="h-full bg-slate-100 rounded" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl flex flex-col items-center gap-3">
        <AlertCircle className="w-10 h-10" />
        <p className="text-sm font-medium">{error}</p>
        <button onClick={fetchFinancials} className="btn-danger text-xs"><RefreshCw className="icon-xs" /> Try Again</button>
      </div>
    );
  }

  const TrendBadge = ({ value }: { value: number }) => {
    if (value === 0) return null;
    return value > 0
      ? <span className="flex items-center gap-0.5 text-emerald-600 text-3xs font-semibold"><TrendingUp className="icon-xs" /> +{value.toFixed(1)}%</span>
      : <span className="flex items-center gap-0.5 text-rose-600 text-3xs font-semibold"><TrendingDown className="icon-xs" /> {value.toFixed(1)}%</span>;
  };

  const filterTabs: { id: DateFilter; label: string }[] = [
    { id: 'Today', label: 'Today' },
    { id: 'ThisWeek', label: 'Week' },
    { id: 'ThisMonth', label: 'Month' },
    { id: 'ThisYear', label: 'Year' },
    { id: 'Custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4 print:space-y-6 print:bg-white">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
        <h1 className="text-base font-black text-slate-900 tracking-tight font-display uppercase">Financial Report</h1>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-slate-200 p-0.5 rounded-lg flex shadow-2xs">
            {filterTabs.map(tab => (
              <button key={tab.id} onClick={() => setDateFilter(tab.id)}
                className={`py-1 px-2.5 rounded-md text-3xs font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  dateFilter === tab.id ? 'bg-brand-sidebar text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}>{tab.label}</button>
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={handleExportCSV} disabled={!filteredOrders.length} title="Download CSV"
              className={`btn-secondary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <ArrowDownToLine className="icon-xs" />
            </button>
            <button onClick={() => printPage()} disabled={!filteredOrders.length} title="Print"
              className={`btn-primary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Printer className="icon-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date */}
      {dateFilter === 'Custom' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-center print:hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-bold text-slate-500 uppercase">From:</span>
            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="input-base text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-bold text-slate-500 uppercase">To:</span>
            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="input-base text-xs" />
          </div>
          <button onClick={fetchFinancials} className="btn-primary py-1.5 px-3 text-xs">Apply</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Total Sales</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><ShoppingBag className="icon-xs" /></div>
          </div>
          <span className="text-2xl font-black text-slate-900 font-display">{currency}{stats.totalRevenue.toLocaleString()}</span>
          <div className="mt-1 flex items-center gap-1.5">
            <TrendBadge value={trends.revenueChange} />
            <span className="text-3xs text-slate-400">vs prev period</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Payments In</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><DollarSign className="icon-xs" /></div>
          </div>
          <span className="text-2xl font-black text-emerald-600 font-display">{currency}{stats.totalCollected.toLocaleString()}</span>
          <div className="mt-1 flex items-center gap-1.5">
            <TrendBadge value={trends.collectionChange} />
            <span className="text-3xs text-slate-400">vs prev period</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Outstanding</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><TrendingUp className="icon-xs" /></div>
          </div>
          <span className="text-2xl font-black text-amber-500 font-display">{currency}{stats.outstanding.toLocaleString()}</span>
          <span className="text-3xs text-slate-500 mt-0.5 block">{stats.pendingCount} orders not fully paid</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Orders</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg"><ShoppingBag className="icon-xs" /></div>
          </div>
          <span className="text-2xl font-black text-purple-600 font-display">{stats.totalOrders}</span>
          <div className="mt-1 flex items-center gap-2 text-3xs font-semibold text-slate-500">
            <span><span className="text-slate-700">{stats.activeCount}</span> active</span>
            <span className="text-slate-300">|</span>
            <span><span className="text-emerald-600">{stats.deliveredCount}</span> delivered</span>
            <span className="text-slate-300">|</span>
            <span>avg <span className="text-slate-700">{currency}{Math.round(stats.avgOrder).toLocaleString()}</span></span>
          </div>
        </div>
      </div>

      {/* Profit (if inventory data exists) */}
      {stats.hasExpenses && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
            <span className="text-3xs font-bold text-rose-500 uppercase tracking-wider">Material Costs</span>
            <span className="text-base font-bold text-rose-700 font-display block mt-0.5">{currency}{stats.totalExpenses.toLocaleString()}</span>
          </div>
          <div className={`border p-3 rounded-xl ${stats.profit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <span className={`text-3xs font-bold uppercase tracking-wider ${stats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Net Profit</span>
            <span className={`text-base font-bold font-display block mt-0.5 ${stats.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{currency}{stats.profit.toLocaleString()}</span>
          </div>
          <div className={`border p-3 rounded-xl ${stats.margin >= 30 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <span className={`text-3xs font-bold uppercase tracking-wider ${stats.margin >= 30 ? 'text-emerald-500' : 'text-amber-500'}`}>Profit Margin</span>
            <span className={`text-base font-bold font-display block mt-0.5 ${stats.margin >= 30 ? 'text-emerald-700' : 'text-amber-700'}`}>{stats.margin.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No orders in this period</p>
          <p className="text-xs text-slate-400 mt-1">Try a different date range.</p>
        </div>
      ) : (
        <>
          {/* Sales & Payments Chart */}
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">Sales &amp; Payments Over Time</h2>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="relative h-48 w-full flex items-end">
                {chartData.length < 2 ? (
                  <p className="w-full text-center text-xs text-slate-400 font-semibold">Not enough data for a chart.</p>
                ) : (
                  <svg className="w-full h-full" viewBox="0 0 500 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="45" x2="500" y2="45" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="90" x2="500" y2="90" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="135" x2="500" y2="135" stroke="#F1F5F9" strokeWidth="1" />
                    {(() => {
                      const maxVal = Math.max(...chartData.map(d => Math.max(d.revenue, d.collected))) || 100;
                      const stepX = 500 / Math.max(chartData.length - 1, 1);
                      const ptsRev = chartData.map((d, i) => ({ x: i * stepX, y: 180 - (d.revenue / maxVal) * 140 - 20, d }));
                      const ptsCol = chartData.map((d, i) => ({ x: i * stepX, y: 180 - (d.collected / maxVal) * 140 - 20, d }));
                      const revPath = `M${ptsRev[0].x} 180 ` + ptsRev.map(p => `L${p.x} ${p.y}`).join(' ') + ` L${ptsRev[ptsRev.length-1].x} 180 Z`;
                      const colPath = `M${ptsCol[0].x} 180 ` + ptsCol.map(p => `L${p.x} ${p.y}`).join(' ') + ` L${ptsCol[ptsCol.length-1].x} 180 Z`;
                      const revLine = ptsRev.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
                      const colLine = ptsCol.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
                      return (
                        <>
                          <path d={revPath} fill="url(#revGrad)" />
                          <path d={colPath} fill="url(#colGrad)" />
                          <path d={revLine} fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
                          <path d={colLine} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
                          {ptsRev.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#38BDF8" strokeWidth="2.5" />
                              <circle cx={ptsCol[i].x} cy={ptsCol[i].y} r="4" fill="white" stroke="#10B981" strokeWidth="2.5" />
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase"><span className="w-3 h-3 bg-sky-400 rounded-full inline-block" /> Sales</span>
                  <span className="flex items-center gap-1.5 text-3xs font-bold text-slate-500 uppercase"><span className="w-3 h-3 bg-emerald-500 rounded-full inline-block" /> Payments</span>
                </div>
                <div className="flex gap-1 text-3xs text-slate-400 font-semibold">
                  {chartData.slice(0, 6).map((d, i) => <span key={i}>{d.label}{i < Math.min(5, chartData.length-1) ? ',' : ''}</span>)}
                  {chartData.length > 6 && <span>...</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Status & Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Payment Status */}
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 font-display">Payment Status</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" /> Fully Paid</span>
                    <span className="text-emerald-600 font-bold">{paymentDistribution.fullyPaid} orders</span>
                  </div>
                  <span className="text-2xs text-slate-500 block">{currency}{paymentDistribution.fullyVal.toLocaleString()}</span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 bg-amber-300 rounded-full" /> Partially Paid</span>
                    <span className="text-amber-500 font-bold">{paymentDistribution.partiallyPaid} orders</span>
                  </div>
                  <span className="text-2xs text-slate-500 block">{currency}{paymentDistribution.partiallyVal.toLocaleString()}</span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 bg-rose-300 rounded-full" /> Unpaid</span>
                    <span className="text-rose-400 font-bold">{paymentDistribution.unpaid} orders</span>
                  </div>
                  <span className="text-2xs text-slate-500 block">{currency}{paymentDistribution.unpaidVal.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-semibold">Overall Collection</span>
                  <span className="font-black text-slate-800">{stats.totalRevenue > 0 ? ((stats.totalCollected / stats.totalRevenue) * 100).toFixed(0) : 0}%</span>
                </div>
              </div>
            </div>

            {/* Orders by Stage */}
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 font-display">Orders by Stage</h2>
              <div className="space-y-2">
                {pipelineFinancials.map(stage => (
                  <div key={stage.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-3xs font-bold">{stage.count}</span>
                        <span className="text-xs font-bold text-slate-700 uppercase">{stage.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">{currency}{stage.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                      <div className="bg-emerald-400 h-full" style={{ width: `${stage.value > 0 ? (stage.collected / stage.value) * 100 : 0}%` }} />
                      <div className="bg-amber-300 h-full" style={{ width: `${stage.value > 0 ? (stage.remaining / stage.value) * 100 : 0}%` }} />
                    </div>
                    <div className="flex justify-between text-3xs font-bold text-slate-400 mt-1">
                      <span className="text-emerald-600">Paid: {currency}{stage.collected.toLocaleString()}</span>
                      <span className="text-amber-500">Due: {currency}{stage.remaining.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Customer Outstanding Balances */}
          <div>
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">Customer Balances</h2>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-3xs text-slate-400 font-medium">Customers with outstanding balances in this period</p>
                <div className="relative">
                  <Search className="icon-xs text-slate-400 absolute left-2.5 top-2.5" />
                  <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Search..." className="input-base pl-8 text-xs" />
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {customerInsights.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4 font-semibold">No customers found.</p>
                ) : (
                  customerInsights.slice(0, 20).map(cust => (
                    <div key={cust.id} className="p-3 bg-white border border-slate-100 rounded-lg flex items-center justify-between hover:border-slate-200 transition-colors">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{cust.name}</p>
                        <p className="text-3xs text-slate-400 font-semibold">{cust.ordersCount} order{cust.ordersCount !== 1 ? 's' : ''} · Total: {currency}{cust.totalBookings.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {cust.outstanding > 0 ? (
                            <>
                              <p className="text-xs font-bold text-amber-500">Due: {currency}{cust.outstanding.toLocaleString()}</p>
                              <p className="text-3xs font-bold text-rose-400 uppercase">Follow up</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-emerald-500">{currency}{cust.totalPaid.toLocaleString()}</p>
                              <p className="text-3xs font-semibold text-slate-400 uppercase">Paid in full</p>
                            </>
                          )}
                        </div>
                        {cust.outstanding > 0 && (
                          <div className="flex gap-1">
                            <a href={`tel:${cust.phone}`} className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-lg transition-colors" title="Call">
                              <Phone className="icon-xs" />
                            </a>
                          </div>
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

      {/* Order Details Table */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 print:border-none print:shadow-none print:p-0">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 print:hidden font-display">Order Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-3xs uppercase font-bold text-slate-500">
                <th className="py-2 px-3">Order</th>
                <th className="py-2 px-3">Customer</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Value</th>
                <th className="py-2 px-3 text-right">Paid</th>
                <th className="py-2 px-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={7} className="py-4 text-center text-slate-400 font-semibold text-3xs uppercase">No records.</td></tr>
              ) : (
                filteredOrders.map(o => {
                  const value = orderValue(o);
                  const bal = value - (Number(o.paid_amount) || 0);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 uppercase text-3xs">{o.order_number}</td>
                      <td className="py-2 px-3 font-semibold text-slate-700">{o.customer_name}</td>
                      <td className="py-2 px-3 text-slate-500 text-3xs">{new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded-full text-3xs font-bold uppercase ${
                          o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700'
                          : o.status === 'Ready' || o.status === 'Ready to Deliver' ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">{currency}{value.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">{currency}{(Number(o.paid_amount)||0).toLocaleString()}</td>
                      <td className={`py-2 px-3 text-right font-bold ${bal <= 0 ? 'text-emerald-600' : 'text-amber-500'}`}>{currency}{bal.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
