import { db, nowISO } from "./db";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
let _online = false;

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 5_000;

// Tables that are synced bidirectionally
const SYNC_TABLES = [
  "customers", "measurements", "orders", "shop_settings",
  "garment_types", "styling_categories", "inventory"
] as const;

// Tables that are synced from local only (backup to cloud)
const LOCAL_ONLY_TABLES = ["audit_logs"] as const;

export function getSyncStatus(): {
  status: SyncStatus;
  online: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
} {
  const pendingCount = (db.prepare(
    "SELECT COUNT(*) as c FROM sync_queue WHERE status IN ('pending','failed')"
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

// ---------------------------------------------------------------------------
// Queue local mutations for sync
// ---------------------------------------------------------------------------
export function queueSync(tableName: string, rowId: string, operation: "insert" | "update" | "delete", payload?: any): void {
  // For audit_logs and other local-only tables, push them directly
  // For sync tables, queue for processing
  try {
    db.prepare(`
      INSERT INTO sync_queue (table_name, row_id, operation, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(tableName, rowId, operation, payload ? JSON.stringify(payload) : null, nowISO());
  } catch {}
}

export function clearSyncQueue(): void {
  db.prepare("DELETE FROM sync_queue WHERE status = 'synced'").run();
}

// ---------------------------------------------------------------------------
// Push local changes to Supabase
// ---------------------------------------------------------------------------
async function pushChanges(token: string): Promise<number> {
  if (!_supabase) return 0;

  // Process queue in order
  const pendingItems = db.prepare(
    "SELECT * FROM sync_queue WHERE status IN ('pending','failed') AND retry_count < ? ORDER BY id ASC LIMIT 50"
  ).all(MAX_RETRIES) as any[];

  let pushed = 0;

  for (const item of pendingItems) {
    try {
      // Mark as processing
      db.prepare("UPDATE sync_queue SET status = 'processing' WHERE id = ?").run(item.id);

      const table = item.table_name as string;
      const rowId = item.row_id;

      // Check if we can push (table has created_by column)
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId) as any;

      if (item.operation === "delete") {
        const { error } = await _supabase.from(table).delete().eq("id", rowId);
        if (error) throw error;
      } else if (row) {
        // Prepare the data for Supabase (convert JSON string columns back to objects)
        const supabaseData: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          if (key === "sync_status") continue;
          // Try to parse JSON strings
          if (typeof val === "string" && (key === "items" || key === "data" || key === "measurement_snapshot" ||
              key === "measurement_fields" || key === "options" || key === "details")) {
            try { supabaseData[key] = JSON.parse(val); } catch { supabaseData[key] = val; }
          } else {
            supabaseData[key] = val;
          }
        }

        if (item.operation === "insert") {
          const { error } = await _supabase.from(table).upsert(supabaseData, { onConflict: "id" });
          if (error) throw error;
        } else {
          const { error } = await _supabase.from(table).update(supabaseData).eq("id", rowId);
          if (error) throw error;
        }
      }

      // Remove from queue
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

// ---------------------------------------------------------------------------
// Pull remote changes from Supabase
// ---------------------------------------------------------------------------
async function pullChanges(token: string): Promise<number> {
  if (!_supabase) return 0;

  let pulled = 0;

  for (const table of SYNC_TABLES) {
    try {
      // Get the last sync timestamp
      const meta = db.prepare("SELECT last_synced_at FROM sync_metadata WHERE table_name = ?").get(table) as { last_synced_at: string } | undefined;
      const since = meta?.last_synced_at || "1970-01-01T00:00:00.000Z";

      // Fetch from Supabase
      const { data, error } = await _supabase
        .from(table)
        .select("*")
        .gte("updated_at", since)
        .order("updated_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) continue;

      // Upsert each row into local DB
      const upsertStmt = buildUpsertStmt(table);
      if (!upsertStmt) continue;

      for (const row of data) {
        try {
          // Convert Supabase data types to SQLite-compatible values
          const localRow = flattenRow(row);

          // Check conflict: if local row has newer updated_at, skip (local changes take precedence)
          const local = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(row.id) as { updated_at: string } | undefined;
          if (local && local.updated_at > row.updated_at) {
            // Local version is newer than cloud version - keep local changes
            continue;
          }

          upsertStmt(localRow);
          pulled++;
        } catch {}
      }

      // Update last_synced_at
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

function buildUpsertStmt(table: string): ((row: Record<string, any>) => void) | null {
  // Get column info from the table
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.length === 0) return null;

  const colNames = columns.map(c => c.name).filter(c => c !== "sync_status");
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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    _status = "offline";
    return;
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  _status = "syncing";

  try {
    // Pull all data from Supabase
    let totalPulled = 0;
    for (const table of SYNC_TABLES) {
      try {
        const { data, error } = await _supabase.from(table).select("*");
        if (error) throw error;
        if (!data || data.length === 0) continue;

        const upsertStmt = buildUpsertStmt(table);
        if (!upsertStmt) continue;

        for (const row of data) {
          const localRow = flattenRow(row);
          try { upsertStmt(localRow); totalPulled++; } catch {}
        }

        // Update sync metadata
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
async function syncCycle(token: string): Promise<void> {
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
    // 1. Push local changes
    const pushed = await pushChanges(token);

    // 2. Pull remote changes
    const pulled = await pullChanges(token);

    _lastSyncAt = nowISO();
    _lastError = null;

    _status = "synced";
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

  // Check online status
  checkOnline().then((online) => {
    _online = online;
    if (online) {
      initialSync(token);
    }
  });

  // Periodic sync
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    if (_userId && _supabase) {
      await syncCycle(token);
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
}

export function updateSyncToken(token: string): void {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (supabaseUrl && supabaseAnonKey && token) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
}

// Trigger an immediate sync (called after local mutations)
export function triggerSync(token: string): void {
  if (_status === "syncing") return;
  syncCycle(token);
}

// ---------------------------------------------------------------------------
// Insert sync middleware / helpers for server.ts
// ---------------------------------------------------------------------------
export function syncAfterMutation(tableName: string, rowId: string, operation: "insert" | "update" | "delete", payload?: any, token?: string): void {
  if (!token) return;
  queueSync(tableName, rowId, operation, payload);
  // Debounce: trigger sync after write
  triggerSync(token);
}
