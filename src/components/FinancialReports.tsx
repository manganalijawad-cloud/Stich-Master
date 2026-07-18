/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  ArrowDownToLine, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Clock, 
  ShoppingBag, 
  FileText, 
  Search,
  MessageSquare,
  Phone,
  RefreshCw
} from 'lucide-react';
import { Order, PipelineStage } from '../types';

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

export default function FinancialReports({ token, currency }: FinancialReportsProps) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [dateFilter, setDateFilter] = useState<'Today' | 'ThisWeek' | 'ThisMonth' | 'ThisYear' | 'Custom'>('ThisMonth');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toLocaleDateString('en-CA');
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA');
  });

  // Search filter for Customer lists
  const [customerSearch, setCustomerSearch] = useState('');

  // Tooltip State for SVG Chart
  const [activeTooltip, setActiveTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    revenue: number;
    collected: number;
  } | null>(null);

  // Fetch Financial Data
  const fetchFinancials = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/financials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch financial records.');
      }
      setData(json);
    } catch (err: any) {
      console.error('Error loading financial reports:', err);
      setError(err.message || 'An error occurred while communicating with the server.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchFinancials();
  }, [token]);

  // Determine date ranges
  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    // Reset hours for precise calendar comparisons
    end.setHours(23, 59, 59, 999);

    switch (dateFilter) {
      case 'Today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'ThisWeek':
        // Current week Sunday to Saturday
        const dayOfWeek = now.getDay();
        start.setDate(now.getDate() - dayOfWeek);
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

  // Preceding Period Date Bounds (for Period-over-Period comparisons)
  const previousPeriodBounds = useMemo(() => {
    const { start, end } = dateRangeBounds;
    const durationMs = end.getTime() - start.getTime();

    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);

    return { start: prevStart, end: prevEnd };
  }, [dateRangeBounds]);

  // Filter orders based on date range bounds
  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    const { start, end } = dateRangeBounds;

    return data.orders.filter(order => {
      const createdAt = new Date(order.created_at);
      return createdAt >= start && createdAt <= end;
    });
  }, [data, dateRangeBounds]);

  // Orders from previous equivalent period
  const previousPeriodOrders = useMemo(() => {
    if (!data?.orders) return [];
    const { start, end } = previousPeriodBounds;

    return data.orders.filter(order => {
      const createdAt = new Date(order.created_at);
      return createdAt >= start && createdAt <= end;
    });
  }, [data, previousPeriodBounds]);

  // Core Financial Stats Calculations
  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    let totalRevenue = 0;
    let totalCollected = 0;
    let pendingPaymentsCount = 0;
    let activeOrdersCount = 0;
    let deliveredOrdersCount = 0;

    filteredOrders.forEach(o => {
      const rev = Number(o.total_amount) || 0;
      const col = Number(o.paid_amount) || 0;
      totalRevenue += rev;
      totalCollected += col;

      if (col < rev) {
        pendingPaymentsCount++;
      }

      if (o.status === 'Delivered') {
        deliveredOrdersCount++;
      } else if (o.status !== 'Archived') {
        activeOrdersCount++;
      }
    });

    const outstandingBalance = totalRevenue - totalCollected;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Calculate Expenses (Inventory table value: sum of price * quantity)
    // In a real expense tracker we would log specific purchases, but as inventory
    // exists in this system, we use its cumulative cost as the Expense data point.
    let totalExpenses = 0;
    if (data?.inventory && data.inventory.length > 0) {
      data.inventory.forEach(item => {
        totalExpenses += (Number(item.price) || 0) * (Number(item.quantity) || 0);
      });
    }

    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      totalOrders,
      totalRevenue,
      totalCollected,
      outstandingBalance,
      pendingPaymentsCount,
      activeOrdersCount,
      deliveredOrdersCount,
      averageOrderValue,
      totalExpenses,
      netProfit,
      profitMargin,
      hasExpenses: data?.inventory && data.inventory.length > 0
    };
  }, [filteredOrders, data]);

  // Previous Period Financial Stats (for trends)
  const previousStats = useMemo(() => {
    const totalOrders = previousPeriodOrders.length;
    let totalRevenue = 0;
    let totalCollected = 0;

    previousPeriodOrders.forEach(o => {
      totalRevenue += Number(o.total_amount) || 0;
      totalCollected += Number(o.paid_amount) || 0;
    });

    return {
      totalOrders,
      totalRevenue,
      totalCollected
    };
  }, [previousPeriodOrders]);

  // Period over Period Comparison Calculations
  const trends = useMemo(() => {
    const calcPctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      revenueChange: calcPctChange(stats.totalRevenue, previousStats.totalRevenue),
      collectionChange: calcPctChange(stats.totalCollected, previousStats.totalCollected),
      orderVolumeChange: calcPctChange(stats.totalOrders, previousStats.totalOrders),
    };
  }, [stats, previousStats]);

  // Order Financial Value grouped by Pipeline Stages
  const pipelineFinancials = useMemo(() => {
    if (!data) return [];
    
    const stages = data?.settings?.pipeline_stages || [];
    const activeStages = stages.filter(s => s.enabled);

    return activeStages.map(stage => {
      const stageOrders = filteredOrders.filter(o => o.status === stage.id);
      const value = stageOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const collected = stageOrders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
      const remaining = value - collected;

      return {
        id: stage.id,
        name: stage.name,
        count: stageOrders.length,
        totalValue: value,
        collected,
        remaining
      };
    });
  }, [data, filteredOrders]);

  // Customer Financial Analytics & Outstanding Balances
  const customerInsights = useMemo(() => {
    if (!filteredOrders.length) return [];

    const customerMap: Record<string, {
      id: string;
      name: string;
      phone: string;
      totalBookings: number;
      totalPaid: number;
      outstanding: number;
      ordersCount: number;
    }> = {};

    filteredOrders.forEach(o => {
      const custId = o.customer_id;
      if (!custId) return;

      const rev = Number(o.total_amount) || 0;
      const col = Number(o.paid_amount) || 0;

      if (!customerMap[custId]) {
        customerMap[custId] = {
          id: custId,
          name: o.customer_name || 'Unknown Customer',
          phone: o.customer_phone || 'N/A',
          totalBookings: 0,
          totalPaid: 0,
          outstanding: 0,
          ordersCount: 0
        };
      }

      customerMap[custId].totalBookings += rev;
      customerMap[custId].totalPaid += col;
      customerMap[custId].outstanding += (rev - col);
      customerMap[custId].ordersCount += 1;
    });

    const list = Object.values(customerMap);

    // Filter by customerSearch
    const query = customerSearch.toLowerCase().trim();
    const filteredList = query 
      ? list.filter(c => c.name.toLowerCase().includes(query) || c.phone.includes(query))
      : list;

    // Sort by outstanding balance first, then totalBookings
    return filteredList.sort((a, b) => b.outstanding - a.outstanding || b.totalBookings - a.totalBookings);
  }, [filteredOrders, customerSearch]);

  // High Value Customers (Top 5 by total booked volume)
  const topCustomers = useMemo(() => {
    return [...customerInsights]
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);
  }, [customerInsights]);

  // Date Grouping for Charts (Daily for shorter ranges, Monthly for Year)
  const chartData = useMemo(() => {
    if (!filteredOrders.length) return [];

    const formatKey = (dateStr: string) => {
      const d = new Date(dateStr);
      if (dateFilter === 'ThisYear') {
        // Group by Month (e.g. "Jan", "Feb")
        return d.toLocaleDateString('en-US', { month: 'short' });
      } else {
        // Group by Day (e.g. "Jul 10")
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    };

    const grouped: Record<string, { label: string; revenue: number; collected: number; count: number; date: Date }> = {};

    filteredOrders.forEach(o => {
      const key = formatKey(o.created_at);
      const rev = Number(o.total_amount) || 0;
      const col = Number(o.paid_amount) || 0;

      if (!grouped[key]) {
        grouped[key] = {
          label: key,
          revenue: 0,
          collected: 0,
          count: 0,
          date: new Date(o.created_at)
        };
      }

      grouped[key].revenue += rev;
      grouped[key].collected += col;
      grouped[key].count += 1;
    });

    const list = Object.values(grouped);

    // Sort chronologically
    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredOrders, dateFilter]);

  // Payment Status Distribution (Donut Chart representation)
  const paymentDistribution = useMemo(() => {
    let fullyPaidCount = 0;
    let partiallyPaidCount = 0;
    let unpaidCount = 0;

    let fullyPaidValue = 0;
    let partiallyPaidValue = 0;
    let unpaidValue = 0;

    filteredOrders.forEach(o => {
      const rev = Number(o.total_amount) || 0;
      const col = Number(o.paid_amount) || 0;

      if (col >= rev && rev > 0) {
        fullyPaidCount++;
        fullyPaidValue += rev;
      } else if (col > 0) {
        partiallyPaidCount++;
        partiallyPaidValue += rev;
      } else {
        unpaidCount++;
        unpaidValue += rev;
      }
    });

    const totalCount = filteredOrders.length || 1;
    return {
      fullyPaid: { count: fullyPaidCount, value: fullyPaidValue, pct: (fullyPaidCount / totalCount) * 100 },
      partiallyPaid: { count: partiallyPaidCount, value: partiallyPaidValue, pct: (partiallyPaidCount / totalCount) * 100 },
      unpaid: { count: unpaidCount, value: unpaidValue, pct: (unpaidCount / totalCount) * 100 }
    };
  }, [filteredOrders]);

  // Automatically generated insights list
  const smartInsights = useMemo(() => {
    const list: Array<{ type: 'info' | 'warning' | 'success'; text: string; actionText?: string; action?: () => void }> = [];

    if (!data) return [];

    // 1. Period over Period Revenue trend
    if (trends.revenueChange > 0) {
      list.push({
        type: 'success',
        text: `Growth Trend: Your business revenue increased by ${trends.revenueChange.toFixed(1)}% compared to the previous period.`
      });
    } else if (trends.revenueChange < 0) {
      list.push({
        type: 'warning',
        text: `Sales Slowdown: Your business revenue decreased by ${Math.abs(trends.revenueChange).toFixed(1)}% compared to the previous period.`
      });
    }

    // 2. Collection Rate efficiency insight
    const collectionRate = stats.totalRevenue > 0 ? (stats.totalCollected / stats.totalRevenue) * 100 : 0;
    if (collectionRate >= 85) {
      list.push({
        type: 'success',
        text: `High Liquidity: Your collection rate is outstanding at ${collectionRate.toFixed(1)}%. Keep securing strong advances!`
      });
    } else if (collectionRate < 70 && collectionRate > 0) {
      list.push({
        type: 'warning',
        text: `Cashflow Warning: Only ${collectionRate.toFixed(1)}% of your booked revenue is collected. You have high outstanding customer dues.`
      });
    }

    // 3. Pending customer balances needing immediate follow-up
    const outstandingCustomersCount = customerInsights.filter(c => c.outstanding > 0).length;
    const totalDuesAmount = stats.outstandingBalance;
    if (outstandingCustomersCount > 0 && totalDuesAmount > 0) {
      list.push({
        type: 'warning',
        text: `Receivables Alert: ${outstandingCustomersCount} customers have outstanding balances totaling ${currency}${totalDuesAmount.toLocaleString()}. Follow-up is advised.`
      });
    }

    // 4. Pending payments count on orders
    if (stats.pendingPaymentsCount > 0) {
      list.push({
        type: 'info',
        text: `${stats.pendingPaymentsCount} orders are currently in progress with pending milestone or fitting clearances.`
      });
    }

    // 5. Best performing period
    if (chartData.length > 0) {
      const sortedByRev = [...chartData].sort((a, b) => b.revenue - a.revenue);
      const topPeriod = sortedByRev[0];
      if (topPeriod && topPeriod.revenue > 0) {
        list.push({
          type: 'success',
          text: `Peak Sales Day/Period: ${topPeriod.label} was your top-performing period in this view, yielding ${currency}${topPeriod.revenue.toLocaleString()} in booked garment values.`
        });
      }
    }

    return list;
  }, [trends, stats, customerInsights, chartData, data, currency]);

  // Export filtered orders as CSV
  const handleExportCSV = () => {
    if (!filteredOrders.length) return;

    // CSV Headers
    const headers = ['Order Number', 'Customer Name', 'Customer Phone', 'Order Date', 'Due Date', 'Status', 'Total Value', 'Amount Paid', 'Outstanding Balance'];
    
    // CSV Rows
    const rows = filteredOrders.map(o => {
      const balance = (Number(o.total_amount) || 0) - (Number(o.paid_amount) || 0);
      const dateStr = new Date(o.created_at).toLocaleDateString('en-CA');
      return [
        o.order_number,
        o.customer_name || 'N/A',
        o.customer_phone || 'N/A',
        dateStr,
        o.due_date,
        o.status,
        Number(o.total_amount) || 0,
        Number(o.paid_amount) || 0,
        balance
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TailorShop_Financial_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Print Report
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading Skeletons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="h-8 bg-slate-200 rounded-lg w-1/3 animate-pulse" />
          <div className="h-10 bg-slate-200 rounded-lg w-1/4 animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 h-32 animate-pulse flex flex-col justify-between">
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-8 bg-slate-200 rounded w-1/2" />
              <div className="h-3 bg-slate-200 rounded w-3/4" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 h-96 animate-pulse p-6">
            <div className="h-6 bg-slate-200 rounded w-1/4 mb-4" />
            <div className="h-full bg-slate-100 rounded" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 h-96 animate-pulse p-6">
            <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
            <div className="h-full bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-4 space-y-2">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div>
          <h3 className="font-semibold text-lg">Failed to Load Financial Engine</h3>
          <p className="text-sm mt-1 text-rose-600">{error}</p>
        </div>
        <button 
          onClick={fetchFinancials}
          className="btn-danger"
        >
          <RefreshCw className="icon-xs" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 print:space-y-8 print:bg-white print:p-0">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight font-display uppercase">Sales Overview</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="bg-white border border-slate-200 p-0.5 rounded-lg flex shadow-2xs">
            {[
              { id: 'Today', label: 'Today' },
              { id: 'ThisWeek', label: 'Week' },
              { id: 'ThisMonth', label: 'Month' },
              { id: 'ThisYear', label: 'Year' },
              { id: 'Custom', label: 'Custom' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDateFilter(tab.id as any)}
                className={`py-1 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-[background-color,color] cursor-pointer ${
                  dateFilter === tab.id
                    ? 'bg-brand-sidebar text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCSV}
              disabled={!filteredOrders.length}
              className={`btn-secondary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Download CSV"
            >
              <ArrowDownToLine className="icon-xs" />
            </button>
            <button
              onClick={handlePrint}
              disabled={!filteredOrders.length}
              className={`btn-primary py-1.5 px-2 ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Print Report"
            >
              <Printer className="icon-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOM DATE PICKERS */}
      {dateFilter === 'Custom' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-center animate-fade-in print:hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-semibold text-slate-500 uppercase tracking-wider">From:</span>
            <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="input-base text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-semibold text-slate-500 uppercase tracking-wider">To:</span>
            <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="input-base text-xs" />
          </div>
          <button onClick={fetchFinancials} className="btn-primary py-1.5 px-3 text-xs">Apply</button>
        </div>
      )}

      {/* === SECTION 1: KEY NUMBERS AT A GLANCE === */}
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">

          {/* Total Sales */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">Total Sales</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><ShoppingBag className="icon-xs" /></div>
            </div>
            <span className="text-xl font-black font-display text-slate-900 block">{currency}{stats.totalRevenue.toLocaleString()}</span>
            <div className="mt-1 flex items-center gap-1 text-3xs font-semibold">
              {trends.revenueChange >= 0 ? (
                <span className="text-emerald-600 flex items-center gap-0.5"><TrendingUp className="icon-xs" /> +{trends.revenueChange.toFixed(1)}%</span>
              ) : (
                <span className="text-rose-600 flex items-center gap-0.5"><TrendingDown className="icon-xs" /> {trends.revenueChange.toFixed(1)}%</span>
              )}
              <span className="text-slate-400">vs prev</span>
            </div>
          </div>

          {/* Payments Received */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">Payments Received</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><DollarSign className="icon-xs" /></div>
            </div>
            <span className="text-xl font-black font-display text-emerald-600 block">{currency}{stats.totalCollected.toLocaleString()}</span>
            <div className="mt-1 flex items-center gap-1 text-3xs font-semibold">
              {trends.collectionChange >= 0 ? (
                <span className="text-emerald-600 flex items-center gap-0.5"><TrendingUp className="icon-xs" /> +{trends.collectionChange.toFixed(1)}%</span>
              ) : (
                <span className="text-rose-600 flex items-center gap-0.5"><TrendingDown className="icon-xs" /> {trends.collectionChange.toFixed(1)}%</span>
              )}
              <span className="text-slate-400">vs prev</span>
            </div>
          </div>

          {/* Still to Collect */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">Still to Collect</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><Clock className="icon-xs" /></div>
            </div>
            <span className="text-xl font-black font-display text-amber-500 block">{currency}{stats.outstandingBalance.toLocaleString()}</span>
            <span className="text-3xs text-slate-500 block mt-0.5">{stats.pendingPaymentsCount} orders pending</span>
          </div>

          {/* Average per Order */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">Avg per Order</span>
              <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg"><FileText className="icon-xs" /></div>
            </div>
            <span className="text-xl font-black font-display text-purple-600 block">{currency}{Math.round(stats.averageOrderValue).toLocaleString()}</span>
            <div className="mt-1 flex items-center gap-1 text-3xs font-semibold">
              <span className="text-purple-600 font-semibold">{stats.totalOrders}</span>
              <span className="text-slate-400">orders</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span className="text-emerald-600 font-semibold">{stats.deliveredOrdersCount}</span>
              <span className="text-slate-400">delivered</span>
            </div>
          </div>
        </div>
      </div>

      {/* === EXPENSES & PROFIT (only if inventory data exists) === */}
      {stats.hasExpenses && (
        <div>
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 font-display">Costs & Profit</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl">
              <span className="text-3xs font-black text-rose-500 uppercase tracking-wider block">Material Costs</span>
              <span className="text-base font-bold mt-0.5 font-display text-rose-700 block">{currency}{stats.totalExpenses.toLocaleString()}</span>
            </div>
            <div className={`border p-3 rounded-xl ${stats.netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
              <span className={`text-3xs font-black uppercase tracking-wider block ${stats.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Profit</span>
              <span className={`text-base font-bold mt-0.5 font-display block ${stats.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{currency}{stats.netProfit.toLocaleString()}</span>
            </div>
            <div className={`border p-3 rounded-xl ${stats.profitMargin >= 30 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}`}>
              <span className={`text-3xs font-black uppercase tracking-wider block ${stats.profitMargin >= 30 ? 'text-emerald-500' : 'text-amber-500'}`}>Profit Margin</span>
              <span className={`text-base font-bold mt-0.5 font-display block ${stats.profitMargin >= 30 ? 'text-emerald-700' : 'text-amber-700'}`}>{stats.profitMargin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* === EMPTY STATE === */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2">
          <ShoppingBag className="w-12 h-12 text-slate-300" />
          <h3 className="font-semibold text-slate-800">No orders in this period</h3>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">There are no orders registered within the selected time window. Try adjusting your date filters or choose a custom range.</p>
        </div>
      ) : (
        <>

          {/* === SECTION 2: SALES & PAYMENTS OVER TIME === */}
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 font-display">Sales &amp; Payments Over Time</h2>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <p className="text-3xs text-slate-400 font-medium mb-3">Shows how your sales (blue) and payments received (green) change over the selected period. Hover over a point for details.</p>

              <div className="relative h-52 w-full flex items-end">
                {chartData.length < 2 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400">
                    Not enough data in this period to draw a chart.
                  </div>
                ) : (
                  <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="50" x2="500" y2="50" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="150" x2="500" y2="150" stroke="#F1F5F9" strokeWidth="1" />
                    {(() => {
                      const maxVal = Math.max(...chartData.map(d => Math.max(d.revenue, d.collected))) || 100;
                      const stepX = 500 / (chartData.length - 1);
                      const pointsRev = chartData.map((d, idx) => {
                        const x = idx * stepX;
                        const y = 200 - (d.revenue / maxVal) * 160 - 20;
                        return { x, y, data: d };
                      });
                      const pointsCol = chartData.map((d, idx) => {
                        const x = idx * stepX;
                        const y = 200 - (d.collected / maxVal) * 160 - 20;
                        return { x, y, data: d };
                      });
                      const dPathRev = `M ${pointsRev[0].x} 200 ` + pointsRev.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${pointsRev[pointsRev.length-1].x} 200 Z`;
                      const dLineRev = pointsRev.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      const dPathCol = `M ${pointsCol[0].x} 200 ` + pointsCol.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${pointsCol[pointsCol.length-1].x} 200 Z`;
                      const dLineCol = pointsCol.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      return (
                        <>
                          <path d={dPathRev} fill="url(#colorRev)" />
                          <path d={dPathCol} fill="url(#colorCol)" />
                          <path d={dLineRev} fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
                          <path d={dLineCol} fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
                          {pointsRev.map((p, idx) => (
                            <g key={idx} className="cursor-pointer group/node" onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const container = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                              if (rect && container) {
                                setActiveTooltip({
                                  x: rect.left - container.left,
                                  y: rect.top - container.top - 70,
                                  label: p.data.label,
                                  revenue: p.data.revenue,
                                  collected: p.data.collected
                                });
                              }
                            }} onMouseLeave={() => setActiveTooltip(null)}>
                              <circle cx={p.x} cy={p.y} r="5" fill="#FFFFFF" stroke="#38BDF8" strokeWidth="3" />
                              <circle cx={pointsCol[idx].x} cy={pointsCol[idx].y} r="5" fill="#FFFFFF" stroke="#10B981" strokeWidth="3" />
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}

                {activeTooltip && (
                  <div
                    className="absolute bg-slate-900 text-white text-xs p-2.5 rounded-xl border border-slate-800 pointer-events-none shadow-md z-30 flex flex-col gap-1 w-36"
                    style={{ left: `${Math.min(activeTooltip.x - 50, 360)}px`, top: `${activeTooltip.y}px` }}
                  >
                    <span className="font-semibold text-slate-300 border-b border-slate-800 pb-1">{activeTooltip.label}</span>
                    <span className="flex justify-between mt-1">
                      <span>Sales:</span>
                      <span className="font-black text-brand-sky">{currency}{activeTooltip.revenue.toLocaleString()}</span>
                    </span>
                    <span className="flex justify-between">
                      <span>Payments:</span>
                      <span className="font-black text-emerald-400">{currency}{activeTooltip.collected.toLocaleString()}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <span className="w-4 h-4 bg-sky-400 rounded-full inline-block" />
                    Sales
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <span className="w-4 h-4 bg-emerald-500 rounded-full inline-block" />
                    Payments
                  </div>
                </div>
                <div className="flex gap-1.5 text-3xs font-black text-slate-400 uppercase tracking-wide">
                  {chartData.slice(0, 5).map((d, i) => (
                    <span key={i}>{d.label}</span>
                  ))}
                  {chartData.length > 5 && <span>...</span>}
                </div>
              </div>
            </div>
          </div>

          {/* === SECTION 3: PAYMENT STATUS === */}
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 font-display">Payment Status</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Donut Chart */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col items-center justify-center">
                <p className="text-3xs text-slate-400 font-medium mb-1 text-center">How many orders are fully paid, partly paid, or not yet paid</p>
                <div className="my-2 flex items-center justify-center relative">
                  <svg className="w-36 h-36 transform -rotate-90">
                    {(() => {
                      const radius = 60;
                      const circumference = 2 * Math.PI * radius;
                      const fullyPaidVal = paymentDistribution.fullyPaid.count;
                      const partiallyPaidVal = paymentDistribution.partiallyPaid.count;
                      const unpaidVal = paymentDistribution.unpaid.count;
                      const total = fullyPaidVal + partiallyPaidVal + unpaidVal || 1;
                      const strokeFully = (fullyPaidVal / total) * circumference;
                      const strokePartially = (partiallyPaidVal / total) * circumference;
                      const strokeUnpaid = (unpaidVal / total) * circumference;
                      const segs = [
                        { color: '#FDA4AF', length: strokeUnpaid, offset: 0 },
                        { color: '#FCD34D', length: strokePartially, offset: strokeUnpaid },
                        { color: '#34D399', length: strokeFully, offset: strokeUnpaid + strokePartially },
                      ];
                      return segs.filter(s => s.length > 0).map((s, i) => (
                        <circle key={i} cx="80" cy="80" r={radius} fill="transparent" stroke={s.color} strokeWidth="14"
                          strokeDasharray={`${s.length} ${circumference - s.length}`}
                          strokeDashoffset={-s.offset} />
                      ));
                    })()}
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">Collected</span>
                    <span className="text-xl font-black text-slate-800 font-display mt-0.5">
                      {stats.totalRevenue > 0 ? ((stats.totalCollected / stats.totalRevenue) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>

                <div className="w-full space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
                      Fully Paid ({paymentDistribution.fullyPaid.count})
                    </div>
                    <span className="text-emerald-600">{currency}{paymentDistribution.fullyPaid.value.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span className="w-2.5 h-2.5 bg-amber-300 rounded-full" />
                      Partly Paid ({paymentDistribution.partiallyPaid.count})
                    </div>
                    <span className="text-amber-500">{currency}{paymentDistribution.partiallyPaid.value.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span className="w-2.5 h-2.5 bg-rose-300 rounded-full" />
                      Not Yet Paid ({paymentDistribution.unpaid.count})
                    </div>
                    <span className="text-rose-400">{currency}{paymentDistribution.unpaid.value.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* === SECTION 4: ORDERS BY STAGE === */}
              <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <p className="text-3xs text-slate-400 font-medium mb-3">Orders grouped by their current stage, showing how much has been collected vs still owed</p>
                <div className="space-y-2">
                  {pipelineFinancials.map(stage => (
                    <div key={stage.id} className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-3xs font-black uppercase tracking-wider">{stage.count} orders</span>
                          <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">{stage.name}</h4>
                        </div>
                        <span className="font-extrabold text-slate-900 text-xs">{currency}{stage.totalValue.toLocaleString()}</span>
                      </div>

                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-400 h-full" style={{ width: `${stage.totalValue > 0 ? (stage.collected / stage.totalValue) * 100 : 0}%` }} title="Collected" />
                        <div className="bg-amber-300 h-full" style={{ width: `${stage.totalValue > 0 ? (stage.remaining / stage.totalValue) * 100 : 0}%` }} title="Outstanding" />
                      </div>

                      <div className="flex justify-between text-3xs font-black text-slate-400 uppercase tracking-wide">
                        <span className="text-emerald-600">Collected: {currency}{stage.collected.toLocaleString()}</span>
                        <span className="text-amber-500">Unpaid: {currency}{stage.remaining.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* === SECTION 5: CUSTOMER PAYMENTS === */}
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 font-display">Customer Payments</h2>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-3xs text-slate-400 font-medium">Customers who have orders in this period, showing what they still owe</p>
                <div className="relative">
                  <Search className="icon-xs text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer..."
                    className="input-base pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {customerInsights.length === 0 ? (
                  <p className="text-slate-400 text-center py-6 text-xs uppercase font-semibold tracking-wider">No customer entries found.</p>
                ) : (
                  customerInsights.slice(0, 20).map(cust => (
                    <div key={cust.id} className="p-3 bg-white border border-slate-100 rounded-xl flex items-center justify-between hover:border-slate-300 transition-[border-color,box-shadow] hover:shadow-2xs">
                      <div>
                        <h4 className="font-semibold text-slate-800 text-sm">{cust.name}</h4>
                        <span className="text-3xs text-slate-400 font-semibold mt-0.5 uppercase tracking-wide">
                          {cust.ordersCount} order{cust.ordersCount !== 1 ? 's' : ''} • Total ordered: {currency}{cust.totalBookings.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          {cust.outstanding > 0 ? (
                            <>
                              <span className="text-xs font-extrabold text-amber-500 block">Unpaid: {currency}{cust.outstanding.toLocaleString()}</span>
                              <span className="text-3xs font-black text-rose-400 block uppercase tracking-wide">Needs Follow-Up</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-extrabold text-emerald-500 block">{currency}{cust.totalPaid.toLocaleString()}</span>
                              <span className="text-3xs font-semibold text-slate-400 block uppercase tracking-wide">Paid in Full</span>
                            </>
                          )}
                        </div>

                        {cust.outstanding > 0 && (
                          <div className="flex gap-1.5">
                            <a
                              href={`tel:${cust.phone}`}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                              title="Call Customer"
                            >
                              <Phone className="icon-xs" />
                            </a>
                            <a
                              href={`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${cust.name}, this is a gentle reminder from our shop regarding your pending balance of ${currency}${cust.outstanding} on your garment booking. Thank you!`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded-lg cursor-pointer transition-colors"
                              title="Send WhatsApp Reminder"
                            >
                              <MessageSquare className="icon-xs" />
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

      {/* === PRINT & DETAILED TABLE === */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs print:border-none print:shadow-none print:p-0">
        <div className="flex items-center justify-between mb-3 print:hidden">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Order Details</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-3xs uppercase tracking-wider font-bold text-slate-500">
                <th className="py-2 px-3">Order</th>
                <th className="py-2 px-3">Customer</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Due</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Value</th>
                <th className="py-2 px-3 text-right">Paid</th>
                <th className="py-2 px-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={8} className="py-4 text-center text-slate-400 font-medium uppercase tracking-wider text-xs">No records available.</td></tr>
              ) : (
                filteredOrders.map(o => {
                  const balance = (Number(o.total_amount) || 0) - (Number(o.paid_amount) || 0);
                  const isPaid = balance <= 0;
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 uppercase">{o.order_number}</td>
                      <td className="py-2 px-3 font-semibold text-slate-700">{o.customer_name}</td>
                      <td className="py-2 px-3 text-slate-500">{new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 px-3 text-slate-500">{new Date(o.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded-full text-3xs font-bold uppercase inline-block ${
                          o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700'
                          : o.status === 'Ready' || o.status === 'Ready to Deliver' ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">{currency}{(Number(o.total_amount) || 0).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">{currency}{(Number(o.paid_amount) || 0).toLocaleString()}</td>
                      <td className={`py-2 px-3 text-right font-bold ${isPaid ? 'text-emerald-600' : 'text-amber-500'}`}>{currency}{balance.toLocaleString()}</td>
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
