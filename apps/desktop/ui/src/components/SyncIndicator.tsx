import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Cloud, CloudOff, AlertTriangle } from 'lucide-react';

type SyncStatus = 'synced' | 'syncing' | 'error' | 'offline' | 'idle';

interface SyncState {
  status: SyncStatus;
  lastSync: string | null;
  pendingChanges: number;
  error: string | null;
}

export default function SyncIndicator({ token, collapsed }: { token?: string | null; collapsed: boolean }) {
  const [state, setState] = useState<SyncState>(() => ({
    status: token ? 'idle' : 'offline',
    lastSync: null,
    pendingChanges: 0,
    error: null
  }));
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const res = await fetch('/api/sync-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch sync status');
        const data = await res.json();
        if (mounted.current) {
          setState({
            status: data.status || 'idle',
            lastSync: data.lastSyncAt || null,
            pendingChanges: data.pendingCount || 0,
            error: data.lastError || null
          });
        }
      } catch {
        if (mounted.current) {
          setState(prev => ({ ...prev, status: 'offline' }));
        }
      }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [token]);

  const iconClass = "icon-xs shrink-0";
  let icon: React.ReactNode;
  let label: string;
  let colorClass: string;

  switch (state.status) {
    case 'synced':
      icon = <Cloud className={`${iconClass} text-neutral-300`} />;
      label = 'Up to date';
      colorClass = 'text-neutral-300';
      break;
    case 'syncing':
      icon = <RefreshCw className={`${iconClass} text-white animate-spin`} />;
      label = 'Saving…';
      colorClass = 'text-white';
      break;
    case 'error':
      icon = <AlertTriangle className={`${iconClass} text-white`} />;
      label = state.error ? `Problem: ${state.error}` : 'Save problem';
      colorClass = 'text-neutral-200';
      break;
    case 'offline':
      icon = <CloudOff className={`${iconClass} text-neutral-500`} />;
      label = 'Offline';
      colorClass = 'text-neutral-500';
      break;
    default:
      icon = <CloudOff className={`${iconClass} text-neutral-500`} />;
      label = 'Not connected';
      colorClass = 'text-neutral-500';
  }

  if (state.pendingChanges > 0 && state.status !== 'syncing') {
    label += ` (${state.pendingChanges} pending)`;
  }

  return (
    <div className={`${collapsed ? 'flex justify-center' : 'flex items-center gap-2'} relative group`}>
      <div className={`flex items-center gap-1.5 ${collapsed ? '' : 'w-full'} ${colorClass}`}>
        {icon}
        {!collapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-wider truncate">
            {label}
          </span>
        )}
      </div>
      {collapsed && (
        <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
          <div className="tooltip">{label}</div>
        </div>
      )}
    </div>
  );
}
