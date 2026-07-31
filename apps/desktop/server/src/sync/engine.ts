/**
 * Offline-first cloud sync engine.
 *
 * Flow:
 *  1. All writes go to SQLite first (callers enqueue outbox entries).
 *  2. When online + Supabase JWT available, push outbox then pull remote.
 *  3. Conflicts resolve with Last-Write-Wins on updated_at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  db,
  nowISO,
  enqueueFullSnapshot,
  getPendingCount,
  getSyncState,
  listOutbox,
  markOutboxError,
  removeOutbox,
  updateSyncState,
  type SyncStatus,
} from "../db";
import { createUserSupabaseClient, isCloudSyncConfigured } from "./supabaseClient";
import {
  prepareSettingValueForCloud,
  prepareSettingValueForLocal,
} from "./storage";
import { getSyncTable, SYNC_TABLES, type SyncTableDef } from "./tables";

export interface SyncResult {
  ok: boolean;
  status: SyncStatus;
  pushed: number;
  pulled: number;
  pendingChanges: number;
  lastBackupAt: string | null;
  error?: string;
}

function parseTs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function localTableExists(name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return !!row;
}

function getLocalRow(table: string, id: string): Record<string, any> | null {
  if (!localTableExists(table)) return null;
  return (db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, any>) || null;
}

function localColumns(table: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

/** Convert a local SQLite row into a Supabase-friendly payload. */
async function toRemoteRow(
  client: SupabaseClient,
  def: SyncTableDef,
  row: Record<string, any>,
  userId: string
): Promise<Record<string, any>> {
  const out: Record<string, any> = { ...row };
  delete out.sync_status;

  for (const col of def.jsonColumns || []) {
    if (typeof out[col] === "string") {
      try {
        out[col] = JSON.parse(out[col]);
      } catch {
        /* keep string */
      }
    }
  }
  for (const col of def.boolColumns || []) {
    if (out[col] !== undefined && out[col] !== null) {
      out[col] = Boolean(out[col]);
    }
  }

  // UUID owner columns must be strings matching auth.users
  if (def.name === "shop_settings" && typeof out.value === "string") {
    out.value = await prepareSettingValueForCloud(client, userId, out.key, out.value);
  }

  if (def.supportsDeletedAt && out.deleted_at === undefined) {
    out.deleted_at = null;
  }

  return out;
}

/** Convert a remote row into SQLite column values. */
async function toLocalRow(
  client: SupabaseClient,
  def: SyncTableDef,
  row: Record<string, any>
): Promise<Record<string, any>> {
  const out: Record<string, any> = { ...row };
  delete out.deleted_at;

  for (const col of def.jsonColumns || []) {
    if (out[col] !== undefined && out[col] !== null && typeof out[col] !== "string") {
      out[col] = JSON.stringify(out[col]);
    }
  }
  for (const col of def.boolColumns || []) {
    if (out[col] !== undefined && out[col] !== null) {
      out[col] = out[col] ? 1 : 0;
    }
  }

  if (def.name === "shop_settings" && typeof out.value === "string") {
    out.value = await prepareSettingValueForLocal(client, out.value);
  }

  // Normalize timestamptz strings for SQLite text columns
  for (const key of Object.keys(out)) {
    if (out[key] instanceof Date) {
      out[key] = out[key].toISOString();
    }
  }

  return out;
}

function upsertLocal(table: string, row: Record<string, any>): void {
  const cols = localColumns(table);
  const keys = Object.keys(row).filter((k) => cols.has(k) && k !== "sync_status");
  if (!keys.length || !row.id) return;
  const placeholders = keys.map(() => "?").join(", ");
  const vals = keys.map((k) => row[k] ?? null);
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`
  ).run(...vals);
}

function deleteLocal(table: string, id: string): void {
  if (!localTableExists(table)) return;
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

async function pushOutboxItem(
  client: SupabaseClient,
  userId: string,
  item: { id: string; table_name: string; record_id: string; op: string; changed_at: string }
): Promise<void> {
  const def = getSyncTable(item.table_name);
  if (!def) {
    removeOutbox(item.id);
    return;
  }
  if (def.optionalLocal && !localTableExists(def.name)) {
    removeOutbox(item.id);
    return;
  }

  if (item.op === "delete") {
    // Soft-delete on remote so other devices can LWW-apply the tombstone
    const { data: remote, error: fetchErr } = await client
      .from(def.name)
      .select("*")
      .eq("id", item.record_id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    if (!remote) {
      // Never existed in cloud — nothing to delete
      removeOutbox(item.id);
      return;
    }

    if (parseTs(remote.updated_at) > parseTs(item.changed_at)) {
      // Remote newer — drop local delete intent
      removeOutbox(item.id);
      return;
    }

    const tombstoneAt = item.changed_at || nowISO();
    const { error } = await client
      .from(def.name)
      .update({ deleted_at: tombstoneAt, updated_at: tombstoneAt })
      .eq("id", item.record_id);
    if (error) throw new Error(error.message);
    removeOutbox(item.id);
    return;
  }

  const local = getLocalRow(item.table_name, item.record_id);
  if (!local) {
    // Row gone locally without a delete op — treat as delete
    removeOutbox(item.id);
    return;
  }

  const { data: remote } = await client
    .from(def.name)
    .select("updated_at, deleted_at")
    .eq("id", item.record_id)
    .maybeSingle();

  if (remote && parseTs(remote.updated_at) > parseTs(local.updated_at)) {
    // Remote wins — skip push; pull will apply
    removeOutbox(item.id);
    return;
  }

  const payload = await toRemoteRow(client, def, local, userId);
  const { error } = await client.from(def.name).upsert(payload, { onConflict: "id" });
  if (error) throw new Error(`${def.name}/${item.record_id}: ${error.message}`);
  removeOutbox(item.id);
}

async function pullTable(
  client: SupabaseClient,
  userId: string,
  def: SyncTableDef,
  since: string | null
): Promise<number> {
  if (def.optionalLocal && !localTableExists(def.name)) return 0;

  let query = client.from(def.name).select("*");
  if (def.ownerColumn === "created_by") query = query.eq("created_by", userId);
  else if (def.ownerColumn === "user_id") query = query.eq("user_id", userId);
  else if (def.ownerColumn === "id") query = query.eq("id", userId);

  if (since) {
    query = query.gt("updated_at", since);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Pull ${def.name}: ${error.message}`);
  if (!data?.length) return 0;

  let applied = 0;
  for (const remote of data) {
    const local = getLocalRow(def.name, remote.id);
    const remoteTs = parseTs(remote.updated_at);

    if (remote.deleted_at) {
      if (!local || remoteTs >= parseTs(local.updated_at)) {
        deleteLocal(def.name, remote.id);
        applied++;
      }
      continue;
    }

    if (local && parseTs(local.updated_at) > remoteTs) {
      // Local newer — keep local; ensure outbox has it
      continue;
    }

    const row = await toLocalRow(client, def, remote);
    upsertLocal(def.name, row);
    applied++;
  }
  return applied;
}

/**
 * Run a full sync cycle for a user. Safe to call concurrently — uses syncing status lock.
 */
export async function runCloudSync(
  userId: string,
  accessToken: string,
  options?: { forceFullPush?: boolean }
): Promise<SyncResult> {
  if (!isCloudSyncConfigured()) {
    return {
      ok: false,
      status: "error",
      pushed: 0,
      pulled: 0,
      pendingChanges: getPendingCount(userId),
      lastBackupAt: getSyncState(userId).last_backup_at,
      error: "Supabase is not configured for cloud sync.",
    };
  }

  const current = getSyncState(userId);
  if (current.status === "syncing") {
    return {
      ok: true,
      status: "syncing",
      pushed: 0,
      pulled: 0,
      pendingChanges: getPendingCount(userId),
      lastBackupAt: current.last_backup_at,
    };
  }

  updateSyncState(userId, { status: "syncing", last_error: null });

  let pushed = 0;
  let pulled = 0;

  try {
    const client = createUserSupabaseClient(accessToken);

    // First backup / explicit Backup Now seeds the full snapshot into the outbox.
    if (options?.forceFullPush || !current.last_pushed_at) {
      enqueueFullSnapshot(userId);
    }

    const outbox = listOutbox(userId);
    for (const item of outbox) {
      try {
        await pushOutboxItem(client, userId, item);
        pushed++;
      } catch (err: any) {
        markOutboxError(item.id, err?.message || String(err));
        throw err;
      }
    }

    const since = current.last_pulled_at;
    for (const def of SYNC_TABLES) {
      pulled += await pullTable(client, userId, def, since);
    }

    const now = nowISO();
    const state = updateSyncState(userId, {
      status: "ok",
      last_pushed_at: now,
      last_pulled_at: now,
      last_backup_at: now,
      last_error: null,
    });

    return {
      ok: true,
      status: state.status,
      pushed,
      pulled,
      pendingChanges: getPendingCount(userId),
      lastBackupAt: state.last_backup_at,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    const state = updateSyncState(userId, {
      status: "error",
      last_error: message.slice(0, 500),
    });
    return {
      ok: false,
      status: state.status,
      pushed,
      pulled,
      pendingChanges: getPendingCount(userId),
      lastBackupAt: state.last_backup_at,
      error: message,
    };
  }
}

export function markSyncOffline(userId: string): void {
  updateSyncState(userId, { status: "offline" });
}
