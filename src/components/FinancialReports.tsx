/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Calendar, 
  ArrowDownToLine, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Users, 
  ShoppingBag, 
  ChevronRight, 
  FileText, 
  Search,
  MessageSquare,
  Phone,
  Filter,
  RefreshCw
} from 'lucide-react';
import { Order, OrderStatus, PipelineStage } from '../types';

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
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
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
    
    const stages = data.settings.pipeline_stages || [];
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
      const dateStr = new Date(o.created_at).toISOString().split('T')[0];
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
      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-4 space-y-2">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <div>
          <h3 className="font-bold text-lg">Failed to Load Financial Engine</h3>
          <p className="text-sm mt-1 text-rose-600">{error}</p>
        </div>
        <button 
          onClick={fetchFinancials}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-8 print:bg-white print:p-0">
      
      {/* HEADER CONTROL BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-h1 font-black text-slate-900 tracking-tight font-display uppercase">Financial Command Center</h1>
          <p className="text-body-sm text-slate-500 font-medium">Real-time revenue monitoring, payment collections, and liquidity trends</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Filters */}
          <div className="bg-white border border-slate-200 p-1 rounded-xl flex shadow-2xs">
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
                className={`py-1.5 px-3.5 rounded-lg text-btn-sm font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  dateFilter === tab.id
                    ? 'bg-[#0F172A] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              disabled={!filteredOrders.length}
              className={`p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs text-slate-600 hover:text-slate-800 transition-colors cursor-pointer ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Download CSV Statement"
            >
              <ArrowDownToLine className="icon-sm" />
            </button>
            <button
              onClick={handlePrint}
              disabled={!filteredOrders.length}
              className={`p-2.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-xl shadow-md transition-colors cursor-pointer ${!filteredOrders.length ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Print Financial Statement"
            >
              <Printer className="icon-sm" />
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOM DATE PICKERS (Conditional) */}
      {dateFilter === 'Custom' && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-4 items-center animate-fade-in print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">From:</span>
            <input 
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-slate-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">To:</span>
            <input 
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-slate-500"
            />
          </div>
          <button 
            onClick={fetchFinancials}
            className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Apply Range
          </button>
        </div>
      )}

      {/* BENTO GRID: BUSINESS SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-32 group hover:border-slate-300 transition-all">
          <div className="absolute right-4 top-4 p-2 bg-blue-50 text-blue-600 rounded-xl">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Booked Volume</span>
            <span className="text-display-lg font-black mt-2 font-display text-slate-900 block">{currency}{stats.totalRevenue.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-2xs font-semibold">
            {trends.revenueChange >= 0 ? (
              <span className="text-emerald-600 flex items-center gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" /> +{trends.revenueChange.toFixed(1)}%
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-0.5">
                <TrendingDown className="w-3.5 h-3.5" /> {trends.revenueChange.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400">vs previous period</span>
          </div>
        </div>

        {/* Total Collected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-32 group hover:border-slate-300 transition-all">
          <div className="absolute right-4 top-4 p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Liquid Collected</span>
            <span className="text-display-lg font-black mt-2 font-display text-emerald-600 block">{currency}{stats.totalCollected.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-2xs font-semibold">
            {trends.collectionChange >= 0 ? (
              <span className="text-emerald-600 flex items-center gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" /> +{trends.collectionChange.toFixed(1)}%
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-0.5">
                <TrendingDown className="w-3.5 h-3.5" /> {trends.collectionChange.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400">vs previous period</span>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-32 group hover:border-slate-300 transition-all">
          <div className="absolute right-4 top-4 p-2 bg-amber-50 text-amber-600 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Outstanding Receivables</span>
            <span className="text-display-lg font-black mt-2 font-display text-amber-500 block">{currency}{stats.outstandingBalance.toLocaleString()}</span>
          </div>

        </div>

        {/* Average Order Value & Sales Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-32 group hover:border-slate-300 transition-all">
          <div className="absolute right-4 top-4 p-2 bg-purple-50 text-purple-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Average Order Value</span>
            <span className="text-display-lg font-black mt-2 font-display text-purple-600 block">{currency}{Math.round(stats.averageOrderValue).toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-2xs font-semibold">
            <span className="text-purple-600 font-bold">{stats.totalOrders}</span>
            <span className="text-slate-400">total orders registered</span>
          </div>
        </div>
      </div>

      {/* CONDITIONAL BENTO ROW FOR EXPENSES (IF INVENTORY EXISTS) */}
      {stats.hasExpenses && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4 print:hidden">
          {/* Total Expenses */}
          <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-2xl flex items-center justify-between shadow-2xs">
            <div>
              <span className="text-3xs font-black text-rose-500 uppercase tracking-wider block">Inventory Asset Cost</span>
              <span className="text-xl font-extrabold mt-1.5 font-display text-rose-700 block">{currency}{stats.totalExpenses.toLocaleString()}</span>
            </div>
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          {/* Net Profit */}
          <div className={`border p-5 rounded-2xl flex items-center justify-between shadow-2xs ${stats.netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
            <div>
              <span className={`text-3xs font-black uppercase tracking-wider block ${stats.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Net Operating Profit</span>
              <span className={`text-xl font-extrabold mt-1.5 font-display block ${stats.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{currency}{stats.netProfit.toLocaleString()}</span>
            </div>
            <div className={`p-2.5 rounded-xl ${stats.netProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Profit Margin */}
          <div className={`border p-5 rounded-2xl flex items-center justify-between shadow-2xs ${stats.profitMargin >= 30 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}`}>
            <div>
              <span className={`text-3xs font-black uppercase tracking-wider block ${stats.profitMargin >= 30 ? 'text-emerald-500' : 'text-amber-500'}`}>Net Margin</span>
              <span className={`text-xl font-extrabold mt-1.5 font-display block ${stats.profitMargin >= 30 ? 'text-emerald-700' : 'text-amber-700'}`}>{stats.profitMargin.toFixed(1)}%</span>
            </div>
            <div className={`p-2.5 rounded-xl ${stats.profitMargin >= 30 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* SMART INSIGHTS */}
      {smartInsights.length > 0 && (
        <div className="bg-[#0F172A] border border-slate-800 text-white rounded-2xl p-5 shadow-md relative overflow-hidden print:hidden">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4.5 h-4.5 text-[#38BDF8]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">Autonomous Financial Insights</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {smartInsights.map((insight, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded-xl flex items-start gap-3 border transition-colors ${
                  insight.type === 'success' 
                    ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-300' 
                    : insight.type === 'warning' 
                    ? 'bg-amber-950/30 border-amber-900/40 text-amber-300' 
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
                }`}
              >
                <div className="mt-0.5">
                  {insight.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                  {insight.type === 'info' && <Clock className="w-4 h-4 text-[#38BDF8] shrink-0" />}
                </div>
                <p className="text-xs font-medium leading-relaxed">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
          <ShoppingBag className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-slate-800">No transactions recorded for this period</h3>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">There are no orders registered within the selected time window. Try adjusting your date filters or choose a custom calendar range.</p>
        </div>
      ) : (
        <>
          {/* INTERACTIVE CHARTS DIVISION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CHART 1: REVENUE vs COLLECTIONS HISTORICAL TREND (SVG AREA CHART) */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Revenue vs Collection Trend</h3>
                <p className="text-3xs text-slate-400 font-medium">Historical comparison of booked value versus collections</p>
              </div>

              {/* Chart Stage */}
              <div className="relative mt-6 h-64 w-full flex items-end">
                {chartData.length < 2 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400">
                    Not enough data points in this period to draw trends.
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

                    {/* Grid lines */}
                    <line x1="0" y1="50" x2="500" y2="50" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="150" x2="500" y2="150" stroke="#F1F5F9" strokeWidth="1" />

                    {/* Logic to plot area path coordinates */}
                    {(() => {
                      const maxVal = Math.max(...chartData.map(d => Math.max(d.revenue, d.collected))) || 100;
                      const stepX = 500 / (chartData.length - 1);
                      
                      const pointsRev = chartData.map((d, idx) => {
                        const x = idx * stepX;
                        const y = 200 - (d.revenue / maxVal) * 160 - 20; // safe padding top/bottom
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
                          {/* Paths with gradients */}
                          <path d={dPathRev} fill="url(#colorRev)" />
                          <path d={dPathCol} fill="url(#colorCol)" />

                          {/* Lines */}
                          <path d={dLineRev} fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
                          <path d={dLineCol} fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />

                          {/* Hover Interactive Nodes */}
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
                              <circle cx={p.x} cy={p.y} r="5" fill="#FFFFFF" stroke="#38BDF8" strokeWidth="3" className="transition-all group-hover/node:r-7" />
                              <circle cx={pointsCol[idx].x} cy={pointsCol[idx].y} r="5" fill="#FFFFFF" stroke="#10B981" strokeWidth="3" className="transition-all group-hover/node:r-7" />
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                )}

                {/* Hover Tooltip Render */}
                {activeTooltip && (
                  <div 
                    className="absolute bg-slate-900 text-white text-2xs p-2.5 rounded-xl border border-slate-800 pointer-events-none shadow-md z-30 transition-all flex flex-col gap-1 w-36"
                    style={{ left: `${Math.min(activeTooltip.x - 50, 360)}px`, top: `${activeTooltip.y}px` }}
                  >
                    <span className="font-bold text-slate-300 block border-b border-slate-800 pb-1">{activeTooltip.label}</span>
                    <span className="flex justify-between mt-1">
                      <span>Booked:</span>
                      <span className="font-black text-[#38BDF8]">{currency}{activeTooltip.revenue.toLocaleString()}</span>
                    </span>
                    <span className="flex justify-between">
                      <span>Collected:</span>
                      <span className="font-black text-emerald-400">{currency}{activeTooltip.collected.toLocaleString()}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Chart Legends & Timeline labels */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-2xs font-bold text-slate-500 uppercase tracking-wider">
                    <span className="w-3 h-3 bg-sky-400 rounded-full inline-block" />
                    Booked Value
                  </div>
                  <div className="flex items-center gap-1.5 text-2xs font-bold text-slate-500 uppercase tracking-wider">
                    <span className="w-3 h-3 bg-emerald-500 rounded-full inline-block" />
                    Liquid Collected
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

            {/* CHART 2: PAYMENT STATUS BREAKDOWN (DONUT ARC VISUALIZER) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Liquidity Health</h3>
                <p className="text-3xs text-slate-400 font-medium">Breakdown of orders based on payment progress</p>
              </div>

              {/* Donut SVG Ring */}
              <div className="my-6 flex items-center justify-center relative">
                <svg className="w-40 h-40 transform -rotate-90">
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

                    return (
                      <>
                        {/* Unpaid */}
                        <circle 
                          cx="80" cy="80" r={radius} 
                          fill="transparent" 
                          stroke="#FDA4AF" 
                          strokeWidth="14"
                          strokeDasharray={circumference}
                          strokeDashoffset={0}
                        />
                        {/* Partially Paid */}
                        <circle 
                          cx="80" cy="80" r={radius} 
                          fill="transparent" 
                          stroke="#FCD34D" 
                          strokeWidth="14"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeUnpaid}
                        />
                        {/* Fully Paid */}
                        <circle 
                          cx="80" cy="80" r={radius} 
                          fill="transparent" 
                          stroke="#34D399" 
                          strokeWidth="14"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeUnpaid + strokePartially}
                        />
                      </>
                    );
                  })()}
                </svg>

                {/* Donut Inner Metric */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">Collection</span>
                  <span className="text-xl font-black text-slate-800 font-display mt-0.5">
                    {stats.totalRevenue > 0 ? ((stats.totalCollected / stats.totalRevenue) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>

              {/* Rings Legends */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
                    Fully Paid ({paymentDistribution.fullyPaid.count})
                  </div>
                  <span className="text-emerald-600">{currency}{paymentDistribution.fullyPaid.value.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2.5 h-2.5 bg-amber-300 rounded-full" />
                    Partially Paid ({paymentDistribution.partiallyPaid.count})
                  </div>
                  <span className="text-amber-500">{currency}{paymentDistribution.partiallyPaid.value.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2.5 h-2.5 bg-rose-300 rounded-full" />
                    Unpaid ({paymentDistribution.unpaid.count})
                  </div>
                  <span className="text-rose-400">{currency}{paymentDistribution.unpaid.value.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* TWO COLUMN ANALYSIS: PIPELINE VALUE & CUSTOMERS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* COLUMN 1: ORDER VALUE PER PIPELINE STAGE */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Value by Pipeline Stage</h3>
                <p className="text-3xs text-slate-400 font-medium">Value, Collections, and Outstanding balances across workflow steps</p>
              </div>

              <div className="space-y-3 pt-2">
                {pipelineFinancials.map(stage => {
                  const pct = stats.totalRevenue > 0 ? (stage.totalValue / stats.totalRevenue) * 100 : 0;
                  return (
                    <div key={stage.id} className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col gap-2.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-3xs font-black uppercase tracking-wider">{stage.count} Orders</span>
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">{stage.name}</h4>
                        </div>
                        <span className="font-extrabold text-slate-900 text-xs">{currency}{stage.totalValue.toLocaleString()}</span>
                      </div>

                      {/* Stacked Progress Bar */}
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-400 h-full" style={{ width: `${stage.totalValue > 0 ? (stage.collected / stage.totalValue) * 100 : 0}%` }} title="Collected" />
                        <div className="bg-amber-300 h-full" style={{ width: `${stage.totalValue > 0 ? (stage.remaining / stage.totalValue) * 100 : 0}%` }} title="Outstanding" />
                      </div>

                      {/* Detail Metrics breakdown */}
                      <div className="flex justify-between text-3xs font-black text-slate-400 uppercase tracking-wide">
                        <span className="text-emerald-600">Collected: {currency}{stage.collected.toLocaleString()}</span>
                        <span className="text-amber-500">Dues: {currency}{stage.remaining.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COLUMN 2: CUSTOMER FINANCIAL INSIGHTS & RECEIVABLES */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Customer Ledger & Receivables</h3>
                  <p className="text-3xs text-slate-400 font-medium">Outstanding balances, collections, and billing history</p>
                </div>
                
                {/* Search customer name */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search ledger..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-3xs font-bold text-slate-600 placeholder:text-slate-400 focus:outline-hidden focus:bg-white"
                  />
                </div>
              </div>

              {/* Customers Ledger List */}
              <div className="space-y-2.5 pt-2 max-h-[380px] overflow-y-auto pr-1">
                {customerInsights.length === 0 ? (
                  <p className="text-slate-400 text-center py-6 text-2xs uppercase font-bold tracking-wider">No matching customer entries found.</p>
                ) : (
                  customerInsights.slice(0, 20).map(cust => (
                    <div key={cust.id} className="p-3 bg-white border border-slate-100 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all hover:shadow-2xs">
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs">{cust.name}</h4>
                        <span className="text-3xs text-slate-400 font-bold block mt-0.5 uppercase tracking-wide">
                          {cust.ordersCount} booked • total booked: {currency}{cust.totalBookings.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          {cust.outstanding > 0 ? (
                            <>
                              <span className="text-2xs font-extrabold text-amber-500 block">{currency}{cust.outstanding.toLocaleString()}</span>
                              <span className="text-3xs font-black text-rose-400 block uppercase tracking-wide">Outstanding</span>
                            </>
                          ) : (
                            <>
                              <span className="text-2xs font-extrabold text-emerald-500 block">{currency}{cust.totalPaid.toLocaleString()}</span>
                              <span className="text-3xs font-bold text-slate-400 block uppercase tracking-wide">Paid</span>
                            </>
                          )}
                        </div>

                        {/* Direct Follow-up links */}
                        {cust.outstanding > 0 && (
                          <div className="flex gap-1.5">
                            <a 
                              href={`tel:${cust.phone}`}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                              title="Call Customer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                            <a 
                              href={`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(cust.name)}%2C%20this%20is%20a%20gentle%20reminder%20from%20our%20shop%20regarding%20your%20pending%20balance%20of%20${currency}${cust.outstanding}%20on%20your%20garment%20booking.%20Thank%20you!`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded-lg cursor-pointer transition-colors"
                              title="WhatsApp Reminder"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
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

      {/* PRINT STATEMENT & DETAILED AUDITED HISTORICAL TABLE */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs mt-6 print:border-none print:shadow-none print:p-0">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display">Statement of Accounts</h3>
            <p className="text-3xs text-slate-400 font-medium">Detailed audit trail of bookings registered during the selected interval</p>
          </div>
        </div>

        {/* PRINT ONLY BRAND HEADER */}
        <div className="hidden print:flex flex-col items-center text-center pb-6 border-b border-slate-200 mb-6">
          <h1 className="text-2xl font-black uppercase text-slate-900 tracking-tight">Tailor Shop Financial Report</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Period: {dateRangeBounds.start.toLocaleDateString()} to {dateRangeBounds.end.toLocaleDateString()}</p>
          <div className="grid grid-cols-3 gap-12 mt-6 w-full max-w-lg">
            <div className="border border-slate-200 p-3 rounded-xl">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider block">Gross Bookings</span>
              <span className="text-base font-black text-slate-800 mt-1">{currency}{stats.totalRevenue.toLocaleString()}</span>
            </div>
            <div className="border border-slate-200 p-3 rounded-xl">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider block">Liquid Collected</span>
              <span className="text-base font-black text-emerald-600 mt-1">{currency}{stats.totalCollected.toLocaleString()}</span>
            </div>
            <div className="border border-slate-200 p-3 rounded-xl">
              <span className="text-3xs font-black text-slate-400 uppercase tracking-wider block">Outstanding Dues</span>
              <span className="text-base font-black text-amber-500 mt-1">{currency}{stats.outstandingBalance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Statement Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-table-cell">
            <thead>
              <tr className="border-b border-slate-200 text-table-header uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Booking Date</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Order Value</th>
                <th className="py-3 px-4 text-right">Paid Advance</th>
                <th className="py-3 px-4 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 font-medium uppercase tracking-wider">No transactional records available.</td>
                </tr>
              ) : (
                filteredOrders.map(o => {
                  const balance = (Number(o.total_amount) || 0) - (Number(o.paid_amount) || 0);
                  const isPaid = balance <= 0;
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-950 uppercase">{o.order_number}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">{o.customer_name}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">{new Date(o.due_date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider inline-block ${
                          o.status === 'Delivered' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : o.status === 'Ready' || o.status === 'Ready to Deliver'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">{currency}{(Number(o.total_amount) || 0).toLocaleString()}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">{currency}{(Number(o.paid_amount) || 0).toLocaleString()}</td>
                      <td className={`py-3.5 px-4 text-right font-extrabold ${isPaid ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {currency}{balance.toLocaleString()}
                      </td>
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
