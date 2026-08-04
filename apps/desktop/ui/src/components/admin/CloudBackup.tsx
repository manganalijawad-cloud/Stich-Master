import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  fetchSyncStatus,
  runCloudSync,
  isBrowserOnline,
  type CloudSyncStatusPayload,
} from '../../lib/cloudSync';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { localDataStore } from '../../lib/localDataStore';

interface CloudBackupProps {
  token: string;
  onOwnerModeRequired?: () => void;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: CloudSyncStatusPayload['status'], online: boolean): string {
  if (!online) return 'Offline — changes saved locally';
  switch (status) {
    case 'syncing':
      return 'Syncing…';
    case 'ok':
      return 'Up to date';
    case 'error':
      return 'Sync error';
    case 'offline':
      return 'Waiting for connection';
    default:
      return 'Ready';
  }
}

export default function CloudBackup({ token, onOwnerModeRequired }: CloudBackupProps) {
  const [status, setStatus] = useState<CloudSyncStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(isBrowserOnline());
  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSyncStatus(token);
      setStatus(data);
      setError(null);
    } catch (err: any) {
      if (err?.message && /owner mode required/i.test(err.message)) {
        onOwnerModeRequired?.();
        return;
      }
      setError(err?.message || 'Failed to load sync status');
    } finally {
      setLoading(false);
    }
  }, [token, onOwnerModeRequired]);

  useEffect(() => {
    void refresh();
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const poll = setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(poll);
    };
  }, [refresh]);

  const handleBackupNow = async () => {
    setBackingUp(true);
    setMessage(null);
    setError(null);
    try {
      const result = await runCloudSync(token, { forceFullPush: true });
      if (!result) {
        setError('Could not reach the cloud. Check your connection and sign-in.');
        return;
      }
      setStatus(result);
      setMessage(
        result.ok
          ? `Backup complete — ${result.pushed ?? 0} pushed, ${result.pulled ?? 0} pulled.`
          : result.error || 'Backup finished with errors.'
      );
      if (!result.ok && result.error) setError(result.error);
      if (result.ok && (result.pulled ?? 0) > 0) {
        await localDataStore.hydrate(token, { force: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Backup failed');
    } finally {
      setBackingUp(false);
      void refresh();
    }
  };

  const syncStatus = status?.status || 'idle';
  const pending = status?.pendingChanges ?? 0;
  const StatusIcon = !online
    ? CloudOff
    : syncStatus === 'syncing' || backingUp
      ? Loader2
      : syncStatus === 'error'
        ? AlertCircle
        : syncStatus === 'ok'
          ? CheckCircle2
          : Cloud;

  return (
    <div className="p-4 space-y-3 animate-fade-in">
      <div className="card-flat space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-sky-50 rounded-xl border border-sky-100 shrink-0">
            <StatusIcon
              className={`icon-md text-sky-700 ${
                syncStatus === 'syncing' || backingUp ? 'animate-spin' : ''
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">
              Cloud backup
            </h3>
            <p className="text-3xs text-slate-500 mt-0.5">
              This PC’s SQLite database is the source of truth. Changes save locally first, then
              sync both ways with Supabase when you are online — including updates from other
              devices signed in to the same account.
            </p>
          </div>
        </div>

        {!configured && (
          <div className="alert-error text-xs py-1.5">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then apply
            the SQL migration in <code className="text-3xs">supabase/migrations</code>.
          </div>
        )}

        {loading && !status ? (
          <p className="text-xs text-slate-500">Loading sync status…</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <dt className="text-3xs font-bold text-slate-500 uppercase tracking-wider">Status</dt>
              <dd className="font-semibold text-slate-800">{statusLabel(syncStatus, online)}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
                Last backup
              </dt>
              <dd className="font-semibold text-slate-800">{formatWhen(status?.lastBackupAt ?? null)}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
                Pending changes
              </dt>
              <dd className="font-semibold text-slate-800">
                {pending === 0 ? 'None' : `${pending} waiting to sync`}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
                Connection
              </dt>
              <dd className="font-semibold text-slate-800">
                {online ? 'Online' : 'Offline'}
                {status?.onlineCapable === false && online ? ' · cloud session needed' : ''}
              </dd>
            </div>
          </dl>
        )}

        {status?.lastError && (
          <div className="alert-error text-xs py-1.5">{status.lastError}</div>
        )}
        {message && <div className="alert-success text-xs py-1.5 animate-fade-in">{message}</div>}
        {error && <div className="alert-error text-xs py-1.5 animate-fade-in">{error}</div>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleBackupNow()}
            disabled={backingUp || !configured}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-slate-900 transition-colors"
          >
            {backingUp ? (
              <Loader2 className="icon-xs animate-spin" />
            ) : (
              <Cloud className="icon-xs" />
            )}
            {backingUp ? 'Backing up…' : 'Backup Now'}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || backingUp}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-slate-200 transition-colors"
          >
            <RefreshCw className="icon-xs" />
            Refresh
          </button>
        </div>

        <p className="text-3xs text-slate-400">
          Syncs customers, measurements, orders, payments, expenses, settings, garment types, and
          shop assets. Conflicts use the latest <code>updated_at</code> (last write wins). Local
          JSON backups on this PC still work independently.
        </p>
      </div>
    </div>
  );
}
