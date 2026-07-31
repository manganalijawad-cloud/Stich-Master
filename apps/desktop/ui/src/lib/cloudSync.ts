/**
 * Client helpers for offline-first cloud backup/sync.
 * SQLite (via /api) is always written first; this module only triggers
 * background sync when a live Supabase session + network are available.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { isAccessTokenExpired, isDeviceSessionToken } from './auth';
import { localDataStore } from './localDataStore';

export type CloudSyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline';

export interface CloudSyncStatusPayload {
  status: CloudSyncStatus;
  lastBackupAt: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  pendingChanges: number;
  lastError: string | null;
  tables: string[];
  configured?: boolean;
  onlineCapable?: boolean;
  pushed?: number;
  pulled?: number;
  ok?: boolean;
  error?: string;
}

let syncInFlight: Promise<CloudSyncStatusPayload | null> | null = null;

/** Best-effort Supabase access token for cloud sync (not the local hddev_ session). */
export async function getCloudAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token || null;
    if (!token || isDeviceSessionToken(token) || isAccessTokenExpired(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export async function fetchSyncStatus(apiToken: string): Promise<CloudSyncStatusPayload> {
  const cloud = await getCloudAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}` };
  if (cloud) headers['X-Supabase-Access-Token'] = cloud;
  const res = await fetch('/api/sync/status', { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load sync status');
  return data as CloudSyncStatusPayload;
}

/**
 * Run cloud sync. Dedupes concurrent calls.
 * Returns null when offline / no Supabase session (silent skip for background).
 */
export async function runCloudSync(
  apiToken: string,
  options?: { forceFullPush?: boolean; silent?: boolean }
): Promise<CloudSyncStatusPayload | null> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    if (!isBrowserOnline()) {
      try {
        await fetch('/api/sync/offline', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}` },
        });
      } catch {
        /* ignore */
      }
      if (!options?.silent) {
        throw new Error('You are offline. Changes stay on this PC and will sync when you reconnect.');
      }
      return null;
    }

    const cloud = await getCloudAccessToken();
    if (!cloud) {
      if (!options?.silent) {
        throw new Error('Cloud sync needs an online sign-in. Reconnect and sign in again.');
      }
      return null;
    }

    const res = await fetch('/api/sync/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
        'X-Supabase-Access-Token': cloud,
      },
      body: JSON.stringify({ forceFullPush: Boolean(options?.forceFullPush) }),
    });
    const data = (await res.json().catch(() => ({}))) as CloudSyncStatusPayload;
    if (!res.ok) {
      throw new Error(data.error || 'Cloud sync failed');
    }
    // Apply pulled cloud rows into the in-memory UI cache
    if ((data.pulled ?? 0) > 0) {
      try {
        await localDataStore.hydrate(apiToken, { force: true });
      } catch {
        /* hydrate best-effort */
      }
    }
    return data;
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

/** Start listening for reconnect → auto-sync pending changes. */
export function startCloudSyncAutoRunner(getApiToken: () => string | null): () => void {
  let stopped = false;

  const trySync = () => {
    if (stopped) return;
    const token = getApiToken();
    if (!token || !isBrowserOnline()) return;
    void runCloudSync(token, { silent: true }).catch(() => {
      /* background — status page shows errors */
    });
  };

  const onOnline = () => {
    // Small delay so the network stack / token refresh can settle
    setTimeout(trySync, 800);
  };

  window.addEventListener('online', onOnline);

  // Initial attempt shortly after boot (covers already-online sessions)
  const bootTimer = setTimeout(trySync, 2500);

  // Periodic drain while online (pending outbox)
  const interval = setInterval(() => {
    if (!isBrowserOnline()) return;
    void fetchSyncStatus(getApiToken() || '').then((s) => {
      if (s.pendingChanges > 0) trySync();
    }).catch(() => {});
  }, 5 * 60 * 1000);

  return () => {
    stopped = true;
    clearTimeout(bootTimer);
    clearInterval(interval);
    window.removeEventListener('online', onOnline);
  };
}
