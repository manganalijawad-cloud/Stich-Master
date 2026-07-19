import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Calendar, ArrowUpDown, ChevronLeft, ChevronRight,
  X, ShoppingBag, Users, DollarSign, Settings,
  LogIn, Edit, Trash2, Plus,
  Truck, Shield, RefreshCw, Download, Upload,
  Undo2, ArrowRightCircle, UserPlus, UserMinus,
  Ruler, Layers, Archive
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  shop_id?: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  user_role?: string;
  action: string;
  module?: string;
  record_id?: string;
  previous_value?: any;
  new_value?: any;
  device?: string;
  ip_address?: string;
  notes?: string;
  details: Record<string, any>;
  created_at: string;
}

interface ActivityLogSectionProps {
  token: string;
  userRole: string;
  currentUserId: string;
  currentUserName: string;
}

const PAGE_SIZE = 25;

const ACTION_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  USER_LOGIN: { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', icon: LogIn },
  ROLE_SWITCH_VERIFICATION_SUCCESS: { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', icon: Shield },
  GET_EXISTING_CUSTOMER_DUPLICATE: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Users },
  CREATE_CUSTOMER: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: UserPlus },
  CREATE_ORDER: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: ShoppingBag },
  EDIT_ORDER: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Edit },
  DELETE_ORDER: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: Trash2 },
  UPDATE_ORDER_STATUS: { color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: ArrowRightCircle },
  PAYMENT_RECEIVED: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: DollarSign },
  REFUND: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Undo2 },
  DELIVERY_COMPLETED: { color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200', icon: Truck },
  UPDATE_MEASUREMENTS: { color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: Ruler },
  CREATE_MEASUREMENTS: { color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: Plus },
  UPDATE_SETTINGS: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Settings },
  CREATE_WORKER: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: UserPlus },
  DELETE_WORKER: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: UserMinus },
  CREATE_GARMENT_TYPE: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Layers },
  UPDATE_GARMENT_TYPE: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Layers },
  DELETE_GARMENT_TYPE: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: Layers },
  REORDER_GARMENT_TYPES: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Layers },
  CREATE_STYLING_CATEGORY: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Layers },
  UPDATE_STYLING_CATEGORY: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Layers },
  DELETE_STYLING_CATEGORY: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: Layers },
  REORDER_STYLING_CATEGORIES: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Layers },
  SYSTEM_BACKUP: { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: Download },
  SYSTEM_RESTORE: { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: Upload },
  ARCHIVE_ORDERS: { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: Archive },
};

const DEFAULT_ACTION_STYLE = { color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: Shield };

function getActionStyle(action: string) {
  const base = action.replace(/_FALLBACK$/, '');
  return ACTION_STYLES[action] || ACTION_STYLES[base] || DEFAULT_ACTION_STYLE;
}

function formatActionLabel(action: string): string {
  const cleaned = action.replace(/_FALLBACK$/, '');
  return cleaned
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const UNIQUE_ACTIONS = (() => {
  const seen = new Set<string>();
  const result: string[] = [];
  const allKeys = Object.keys(ACTION_STYLES);
  const fallbackBases = allKeys.map(k => k.replace(/_FALLBACK$/, ''));
  const deduped = [...new Set([...allKeys, ...fallbackBases])].sort();
  for (const a of deduped) {
    const base = a.replace(/_FALLBACK$/, '');
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  // Add _FALLBACK variants that are actually used
  const actualFallbacks = ['CREATE_GARMENT_TYPE_FALLBACK', 'UPDATE_GARMENT_TYPE_FALLBACK', 'DELETE_GARMENT_TYPE_FALLBACK', 'REORDER_GARMENT_TYPES_FALLBACK', 'CREATE_STYLING_CATEGORY_FALLBACK', 'UPDATE_STYLING_CATEGORY_FALLBACK', 'DELETE_STYLING_CATEGORY_FALLBACK', 'REORDER_STYLING_CATEGORIES_FALLBACK'];
  return [...result, ...actualFallbacks].sort();
})();

const MODULES = [
  'Auth', 'Customers', 'Orders', 'Payments', 'Measurements',
  'Staff', 'Settings', 'Garment Types', 'Styling', 'System', 'General'
];

export default function ActivityLogSection({ token, userRole, currentUserId, currentUserName }: ActivityLogSectionProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
      if (actionFilter) params.set('action', actionFilter);
      if (moduleFilter) params.set('module', moduleFilter);
      params.set('sort', sortOrder);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch audit logs');
      }
      const data = await res.json();
      setLogs(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, search, dateFrom, dateTo, actionFilter, moduleFilter, sortOrder, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, actionFilter, moduleFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleResetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setActionFilter('');
    setModuleFilter('');
    setSortOrder('newest');
    setPage(1);
  };

  const hasActiveFilters = search || dateFrom || dateTo || actionFilter || moduleFilter;

  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && logs.length === 0 && !error) {
      fetch('/api/audit-logs-debug', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json().catch(() => null))
        .then(d => {
          if (d) setDebugInfo(JSON.stringify(d, null, 2));
        })
        .catch(() => {});
    }
  }, [loading, logs.length, error, token]);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
  };

  const formatFullTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const renderDetailValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') {
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return String(value);
  };

  return (
    <div className="h-full flex flex-col gap-2 max-w-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1">
        <div>
          <h2 className="text-h3 text-slate-900">Activity Log</h2>
          <p className="text-caption-xs mt-0.5">
            Complete audit trail of all manager actions
            {total > 0 && <span className="ml-1">— <strong>{total}</strong> total {total === 1 ? 'entry' : 'entries'}</span>}
          </p>
        </div>
        {hasActiveFilters && (
          <button onClick={handleResetFilters} className="btn-ghost text-xs gap-1.5">
            <X className="icon-xs" />
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="card !p-2.5 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 icon-xs text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activities…"
              className="input-base !pl-8 text-xs"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 icon-xs text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-base !pl-8 text-xs"
                title="From date"
              />
            </div>
            <div className="flex-1 relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 icon-xs text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-base !pl-8 text-xs"
                title="To date"
              />
            </div>
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="select-base text-xs"
          >
            <option value="">All Actions</option>
            {UNIQUE_ACTIONS.map((a) => (
              <option key={a} value={a}>{formatActionLabel(a)}</option>
            ))}
          </select>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="select-base text-xs"
          >
            <option value="">All Modules</option>
            {Array.from(new Set(MODULES)).sort().map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <button
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            className="btn-secondary text-xs gap-1.5"
            title={`Sort by ${sortOrder === 'newest' ? 'oldest' : 'newest'} first`}
          >
            <ArrowUpDown className="icon-xs" />
            {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>
      </div>

      {/* ── Activity List ── */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="card flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="icon-md text-brand-sky animate-spin" />
              <p className="text-caption-xs">Loading activity log…</p>
            </div>
          </div>
        ) : error ? (
          <div className="card">
            <div className="alert-error">{error}</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Search className="empty-state-icon" />
              <p className="empty-state-title">No Activities Found</p>
              <p className="empty-state-text">
                {hasActiveFilters
                  ? 'No activities match your current filters. Try adjusting or clearing them.'
                  : 'No activities recorded yet. Perform an action (create order, add customer) and check again.'}
              </p>
              {debugInfo && (
                <details className="mt-3 w-full max-w-md text-left">
                  <summary className="text-3xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600">Debug Info</summary>
                  <pre className="mt-1 bg-slate-50 border border-slate-200 rounded p-2 text-3xs font-mono text-slate-600 overflow-x-auto max-h-40 whitespace-pre-wrap">{debugInfo}</pre>
                </details>
              )}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-th w-10"></th>
                  <th className="table-th">Timestamp</th>
                  <th className="table-th">User</th>
                  <th className="table-th">Action</th>
                  <th className="table-th">Module</th>
                  <th className="table-th">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const style = getActionStyle(log.action);
                  const Icon = style.icon;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="table-tr cursor-pointer"
                    >
                      <td className="table-td">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg} ${style.color}`}>
                          <Icon className="icon-sm" />
                        </div>
                      </td>
                      <td className="table-td whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-800">{formatTimestamp(log.created_at)}</span>
                          <span className="text-3xs text-slate-400">{formatFullTimestamp(log.created_at)}</span>
                        </div>
                      </td>
                      <td className="table-td">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-800">{log.user_name || log.user_email || 'Unknown'}</span>
                          {log.user_role && (
                            <span className="text-3xs text-slate-400 uppercase tracking-wider">{log.user_role}</span>
                          )}
                        </div>
                      </td>
                      <td className="table-td">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${style.bg} ${style.color} ${style.border} border`}>
                          <Icon className="icon-xs" />
                          {formatActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="table-td">
                        <span className="chip text-3xs">{log.module || 'General'}</span>
                      </td>
                      <td className="table-td max-w-[200px]">
                        <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                          {log.record_id && (
                            <span className="truncate font-mono text-3xs text-slate-400">
                              ID: {log.record_id.slice(0, 12)}…
                            </span>
                          )}
                          {log.notes && (
                            <span className="truncate text-3xs text-slate-500 italic">"{log.notes}"</span>
                          )}
                          {!log.record_id && !log.notes && (
                            <span className="text-3xs text-slate-400">
                              {Object.keys(log.details || {}).filter(k => !k.startsWith('_')).slice(0, 2).map(k => `${k}: ${renderDetailValue(log.details[k]).slice(0, 30)}`).join(', ') || '—'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1 py-1">
          <span className="text-xs text-slate-500 font-medium">
            Page {page} of {totalPages}
            <span className="ml-1 text-slate-400">({total} total)</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary !p-1.5 disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft className="icon-sm" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    p === page
                      ? 'bg-brand-sidebar text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-secondary !p-1.5 disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight className="icon-sm" />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Slide-over Panel ── */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-modal border-l border-slate-200 overflow-y-auto animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 z-10 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Activity Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="icon-md" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Action Header */}
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getActionStyle(selectedLog.action).bg} ${getActionStyle(selectedLog.action).color}`}>
                  {React.createElement(getActionStyle(selectedLog.action).icon, { className: 'icon-md' })}
                </div>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getActionStyle(selectedLog.action).bg} ${getActionStyle(selectedLog.action).color} ${getActionStyle(selectedLog.action).border}`}>
                    {formatActionLabel(selectedLog.action)}
                  </span>
                  {selectedLog.module && (
                    <span className="ml-2 chip text-3xs">{selectedLog.module}</span>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    {formatFullTimestamp(selectedLog.created_at)}
                  </p>
                </div>
              </div>

              {/* User Info */}
              <div className="card-soft !p-3 space-y-2">
                <h4 className="section-title !text-3xs">Performed By</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Name</span>
                    <p className="font-semibold text-slate-800">{selectedLog.user_name || selectedLog.user_email || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Role</span>
                    <p className="font-semibold text-slate-800">{selectedLog.user_role || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Email</span>
                    <p className="font-semibold text-slate-800 truncate">{selectedLog.user_email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">User ID</span>
                    <p className="font-mono text-3xs text-slate-600 truncate">{selectedLog.user_id.slice(0, 16)}…</p>
                  </div>
                </div>
              </div>

              {/* Record Info */}
              {selectedLog.record_id && (
                <div className="card-soft !p-3 space-y-2">
                  <h4 className="section-title !text-3xs">Affected Record</h4>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-slate-400">Record ID</span>
                      <p className="font-mono text-xs text-slate-700 break-all">{selectedLog.record_id}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Previous / New Values */}
              {(selectedLog.previous_value || selectedLog.new_value) && (
                <div className="card-soft !p-3 space-y-2">
                  <h4 className="section-title !text-3xs">Change Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedLog.previous_value && (
                      <div>
                        <span className="text-3xs font-bold text-red-600 uppercase tracking-wider mb-1 block">Previous Value</span>
                        <pre className="bg-white border border-slate-200 rounded-lg p-2 text-3xs font-mono text-slate-700 overflow-x-auto max-h-32 whitespace-pre-wrap">
                          {renderDetailValue(selectedLog.previous_value)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.new_value && (
                      <div>
                        <span className="text-3xs font-bold text-emerald-600 uppercase tracking-wider mb-1 block">New Value</span>
                        <pre className="bg-white border border-slate-200 rounded-lg p-2 text-3xs font-mono text-slate-700 overflow-x-auto max-h-32 whitespace-pre-wrap">
                          {renderDetailValue(selectedLog.new_value)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedLog.notes && (
                <div className="card-soft !p-3 space-y-1">
                  <h4 className="section-title !text-3xs">Notes</h4>
                  <p className="text-xs text-slate-700">{selectedLog.notes}</p>
                </div>
              )}

              {/* Device & IP */}
              {(selectedLog.device || selectedLog.ip_address) && (
                <div className="card-soft !p-3 space-y-2">
                  <h4 className="section-title !text-3xs">Environment</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selectedLog.device && (
                      <div>
                        <span className="text-slate-400">Device / Platform</span>
                        <p className="font-semibold text-slate-700 text-xs break-words">{selectedLog.device}</p>
                      </div>
                    )}
                    {selectedLog.ip_address && (
                      <div>
                        <span className="text-slate-400">IP Address</span>
                        <p className="font-mono text-xs text-slate-700">{selectedLog.ip_address}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw Details JSON */}
              <details className="card-soft !p-3">
                <summary className="text-3xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none">
                  Raw Data
                </summary>
                <pre className="mt-2 bg-white border border-slate-200 rounded-lg p-2 text-3xs font-mono text-slate-600 overflow-x-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
