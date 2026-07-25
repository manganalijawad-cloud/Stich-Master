import { db, nowISO } from "./db";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SyncStatus = "offline" | "syncing" | "synced" | "error";

let _status: SyncStatus = "offline";
let _lastError: string | null = null;
let _lastSyncAt: string | null = null;
let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _supabase: SupabaseClient | null = null;
let _userId: string | null = null;
let _token: string | null = null;
let _online = false;

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRIES = 10;

// Tables that are synced bidirectionally
// inventory intentionally omitted until a V1 inventory UI exists (PROJECT.md §2)
const SYNC_TABLES = [
  "customers", "measurements", "orders", "shop_settings",
  "garment_types", "styling_categories"
] as const;

export function getSyncStatus(): {
  status: SyncStatus;
  online: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
} {
  const pendingCount = (db.prepare(
    "SELECT COUNT(*) as c FROM sync_queue WHERE status IN ('pending','failed','processing')"
  ).get() as { c: number }).c;

  return {
    status: _status,
    online: _online,
    lastSyncAt: _lastSyncAt,
    lastError: _lastError,
    pendingCount,
  };
}

// ---------------------------------------------------------------------------
// Online / offline detection
// ---------------------------------------------------------------------------
async function checkOnline(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    if (!supabaseUrl) { _online = false; return false; }
    const response = await fetch(supabaseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    _online = response.ok;
  } catch {
    _online = false;
  }
  return _online;
}

/** Crash recovery: rows left in processing never retried otherwise. */
export function resetStuckProcessing(): void {
  try {
    const result = db.prepare(
      "UPDATE sync_queue SET status = 'pending' WHERE status = 'processing'"
    ).run();
    if (result.changes > 0) {
      console.log(`Sync: reset ${result.changes} stuck processing queue row(s) to pending.`);
    }
  } catch (err: any) {
    console.warn("Sync: failed to reset stuck processing rows:", err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Queue local mutations for sync
// ---------------------------------------------------------------------------
export function queueSync(tableName: string, rowId: string, operation: "insert" | "update" | "delete", payload?: any): void {
  try {
    db.prepare(`
      INSERT INTO sync_queue (table_name, row_id, operation, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(tableName, rowId, operation, payload ? JSON.stringify(payload) : null, nowISO());
  } catch (err: any) {
    console.warn("queueSync failed:", err?.message || err);
  }
}

export function clearSyncQueue(): void {
  // Successful items are deleted on push; this cleans abandoned failed rows past max retries
  db.prepare("DELETE FROM sync_queue WHERE status = 'failed' AND retry_count >= ?").run(MAX_RETRIES);
}

// ---------------------------------------------------------------------------
// Push local changes to Supabase
// ---------------------------------------------------------------------------
async function pushChanges(_token: string): Promise<number> {
  if (!_supabase) return 0;

  const pendingItems = db.prepare(
    "SELECT * FROM sync_queue WHERE status IN ('pending','failed') AND retry_count < ? ORDER BY id ASC LIMIT 50"
  ).all(MAX_RETRIES) as any[];

  let pushed = 0;

  for (const item of pendingItems) {
    try {
      db.prepare("UPDATE sync_queue SET status = 'processing' WHERE id = ?").run(item.id);

      const table = item.table_name as string;
      const rowId = item.row_id;

      if (item.operation === "delete") {
        const { error } = await _supabase.from(table).delete().eq("id", rowId);
        if (error) throw error;
      } else if (table === "shop_settings") {
        await pushShopSettingRow(rowId);
      } else {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId) as any;
        if (row) {
          const supabaseData = prepareRowForSupabase(row);

          // Always upsert so offline-created rows still reach cloud on "update" queue ops
          const { error } = await _supabase.from(table).upsert(supabaseData, { onConflict: "id" });
          if (error) throw error;
        }
      }

      db.prepare("DELETE FROM sync_queue WHERE id = ?").run(item.id);
      pushed++;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      db.prepare("UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?")
        .run(errMsg, item.id);
    }
  }

  return pushed;
}

function prepareRowForSupabase(row: Record<string, any>): Record<string, any> {
  const supabaseData: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === "sync_status") continue;
    if (typeof val === "string" && (key === "items" || key === "data" || key === "measurement_snapshot" ||
        key === "measurement_fields" || key === "options" || key === "details" || key === "value")) {
      try { supabaseData[key] = JSON.parse(val); } catch { supabaseData[key] = val; }
    } else if (key === "enabled" && (val === 0 || val === 1)) {
      supabaseData[key] = Boolean(val);
    } else {
      supabaseData[key] = val;
    }
  }
  return supabaseData;
}

/**
 * Local shop_settings use INTEGER ids; cloud uses UUID + `${userId}:${key}`.
 * Upsert by composite unique (key, user_id) instead of local id.
 */
async function pushShopSettingRow(rowId: string): Promise<void> {
  if (!_supabase) return;
  const row = db.prepare("SELECT * FROM shop_settings WHERE id = ?").get(rowId) as any;
  if (!row) return;

  let value: any = row.value;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { /* keep string */ }
  }

  const plainKey = String(row.key || "");
  const userId = row.user_id;
  const cloudKey = plainKey.includes(":") ? plainKey : `${userId}:${plainKey}`;

  const { error } = await _supabase.from("shop_settings").upsert(
    {
      key: cloudKey,
      value,
      user_id: userId,
      updated_at: row.updated_at || nowISO(),
      updated_by: row.updated_by || userId,
    },
    { onConflict: "key,user_id" }
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Pull remote changes from Supabase
// ---------------------------------------------------------------------------
async function pullChanges(_token: string): Promise<number> {
  if (!_supabase) return 0;

  let pulled = 0;

  for (const table of SYNC_TABLES) {
    try {
      const meta = db.prepare("SELECT last_synced_at FROM sync_metadata WHERE table_name = ?").get(table) as { last_synced_at: string } | undefined;
      const since = meta?.last_synced_at || "1970-01-01T00:00:00.000Z";

      const { data, error } = await _supabase
        .from(table)
        .select("*")
        .gte("updated_at", since)
        .order("updated_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) continue;

      if (table === "shop_settings") {
        for (const row of data) {
          try {
            pullShopSettingRow(row);
            pulled++;
          } catch {}
        }
      } else {
        const upsertStmt = buildUpsertStmt(table);
        if (!upsertStmt) continue;

        for (const row of data) {
          try {
            const localRow = flattenRow(row);
            const local = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(row.id) as { updated_at: string } | undefined;
            if (local && local.updated_at > row.updated_at) {
              continue;
            }
            upsertStmt(localRow);
            pulled++;
          } catch {}
        }
      }

      const maxUpdated = data.reduce((max: string, row: any) => {
        return row.updated_at > max ? row.updated_at : max;
      }, since);
      db.prepare("UPDATE sync_metadata SET last_synced_at = ? WHERE table_name = ?").run(maxUpdated, table);

    } catch (err: any) {
      console.error(`Sync pull failed for ${table}:`, err?.message || err);
    }
  }

  return pulled;
}

/** Store cloud settings under plain key locally for getSettings compatibility. */
function pullShopSettingRow(row: any): void {
  const userId = row.user_id;
  if (!userId) return;
  let plainKey = String(row.key || "");
  const prefix = `${userId}:`;
  if (plainKey.startsWith(prefix)) {
    plainKey = plainKey.slice(prefix.length);
  }
  const value = typeof row.value === "string" ? row.value : JSON.stringify(row.value ?? {});
  const now = row.updated_at || nowISO();

  const existing = db.prepare(
    "SELECT id, updated_at FROM shop_settings WHERE key = ? AND user_id = ?"
  ).get(plainKey, userId) as { id: number; updated_at: string } | undefined;

  if (existing && existing.updated_at > now) {
    return; // local newer
  }

  if (existing) {
    db.prepare(
      "UPDATE shop_settings SET value = ?, updated_at = ?, updated_by = ? WHERE id = ?"
    ).run(value, now, row.updated_by || userId, existing.id);
  } else {
    db.prepare(`
      INSERT INTO shop_settings (id, key, value, user_id, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.id || uuidv4(), plainKey, value, userId, now, row.updated_by || userId);
  }
}

function buildUpsertStmt(table: string): ((row: Record<string, any>) => void) | null {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.length === 0) return null;

  const colNames = columns.map(c => c.name).filter(c => c !== "sync_status");
  // shop_settings synced via key+user_id helpers, not generic id upsert
  if (table === "shop_settings") return null;
  if (!colNames.includes("id")) return null;

  const placeholders = colNames.map(() => "?").join(", ");
  const updateSet = colNames.map(c => `${c} = excluded.${c}`).join(", ");

  const stmt = db.prepare(`
    INSERT INTO ${table} (${colNames.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updateSet}
  `);

  return (row: Record<string, any>) => {
    const vals = colNames.map(c => row[c] !== undefined ? row[c] : null);
    stmt.run(...vals);
  };
}

function flattenRow(row: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (val === null || val === undefined) {
      flat[key] = null;
    } else if (typeof val === "object" && !(val instanceof Date)) {
      flat[key] = JSON.stringify(val);
    } else if (val instanceof Date) {
      flat[key] = val.toISOString();
    } else if (typeof val === "boolean") {
      flat[key] = val ? 1 : 0;
    } else {
      flat[key] = val;
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Full initial sync — import all existing Supabase data
// ---------------------------------------------------------------------------
export async function initialSync(token: string): Promise<void> {
  updateSyncToken(token);

  if (!_supabase) {
    _status = "offline";
    return;
  }

  _status = "syncing";

  try {
    let totalPulled = 0;
    for (const table of SYNC_TABLES) {
      try {
        const { data, error } = await _supabase.from(table).select("*");
        if (error) throw error;
        if (!data || data.length === 0) continue;

        if (table === "shop_settings") {
          for (const row of data) {
            try { pullShopSettingRow(row); totalPulled++; } catch {}
          }
        } else {
          const upsertStmt = buildUpsertStmt(table);
          if (!upsertStmt) continue;

          for (const row of data) {
            const localRow = flattenRow(row);
            // LWW: keep newer local offline edits
            const local = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(row.id) as { updated_at: string } | undefined;
            if (local && local.updated_at > (row.updated_at || "")) {
              continue;
            }
            try { upsertStmt(localRow); totalPulled++; } catch {}
          }
        }

        const maxUpdated = data.reduce((max: string, row: any) => {
          return row.updated_at > max ? row.updated_at : max;
        }, "1970-01-01T00:00:00.000Z");
        db.prepare("UPDATE sync_metadata SET last_synced_at = ? WHERE table_name = ?").run(maxUpdated, table);
      } catch (err: any) {
        console.error(`Initial sync failed for ${table}:`, err?.message || err);
      }
    }

    _lastSyncAt = nowISO();
    _lastError = null;
    _status = "synced";
    _online = true;

    if (totalPulled > 0) {
      console.log(`Initial sync complete: imported ${totalPulled} records from cloud`);
    }
  } catch (err: any) {
    _lastError = err?.message || String(err);
    _status = "error";
  }
}

// ---------------------------------------------------------------------------
// Periodic sync cycle
// ---------------------------------------------------------------------------
async function syncCycle(): Promise<void> {
  const token = _token;
  if (!token) return;

  if (!_online) {
    const online = await checkOnline();
    if (!online) {
      _status = "offline";
      return;
    }
  }

  if (_status === "syncing") return;

  _status = "syncing";

  try {
    const pushed = await pushChanges(token);
    const pulled = await pullChanges(token);

    _lastSyncAt = nowISO();
    _lastError = null;
    _status = "synced";

    if (pushed > 0 || pulled > 0) {
      console.log(`Sync cycle: pushed ${pushed}, pulled ${pulled}`);
    }
  } catch (err: any) {
    _lastError = err?.message || String(err);
    _status = "error";
  }
}

// ---------------------------------------------------------------------------
// Start / stop the sync engine
// ---------------------------------------------------------------------------
export function startSyncEngine(userId: string, token: string): void {
  _userId = userId;
  updateSyncToken(token);
  resetStuckProcessing();

  checkOnline().then((online) => {
    _online = online;
    if (online) {
      initialSync(token);
    }
  });

  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    if (_userId && _token) {
      await syncCycle();
    }
  }, SYNC_INTERVAL_MS);
}

export function stopSyncEngine(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
  _status = "offline";
  _online = false;
  _token = null;
}

export function updateSyncToken(token: string): void {
  _token = token;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (supabaseUrl && supabaseAnonKey && token) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
}

export function triggerSync(token?: string): void {
  if (token) {
    updateSyncToken(token);
  }
  if (_status === "syncing") return;
  void syncCycle();
}

// ---------------------------------------------------------------------------
// Insert sync middleware / helpers for server.ts
// ---------------------------------------------------------------------------
export function syncAfterMutation(tableName: string, rowId: string, operation: "insert" | "update" | "delete", payload?: any, token?: string): void {
  if (!token) return;
  updateSyncToken(token);
  queueSync(tableName, String(rowId), operation, payload);
  triggerSync(token);
}

/** After a local restore/import, queue every synced row for the user so cloud catches up. */
export function queueAllLocalDataForSync(userId: string, token?: string): void {
  if (!token) return;
  updateSyncToken(token);

  const ownedTables = ["customers", "measurements", "orders", "garment_types", "styling_categories"] as const;
  for (const table of ownedTables) {
    try {
      const rows = db.prepare(`SELECT id FROM ${table} WHERE created_by = ?`).all(userId) as { id: string }[];
      for (const row of rows) {
        queueSync(table, row.id, "update");
      }
    } catch (err: any) {
      console.warn(`queueAllLocalDataForSync(${table}) failed:`, err?.message || err);
    }
  }

  try {
    const settings = db.prepare(
      "SELECT id FROM shop_settings WHERE user_id = ? OR key LIKE ?"
    ).all(userId, `${userId}:%`) as { id: string }[];
    for (const row of settings) {
      queueSync("shop_settings", String(row.id), "update");
    }
  } catch (err: any) {
    console.warn("queueAllLocalDataForSync(shop_settings) failed:", err?.message || err);
  }

  triggerSync(token);
}
