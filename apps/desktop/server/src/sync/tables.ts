/**
 * Registry of tables synced to Supabase.
 * Add new business tables here — outbox + engine pick them up automatically.
 *
 * SQLite remains the source of truth; these names must match both local and
 * remote (Supabase) schemas.
 */

export type SyncOp = "upsert" | "delete";

export type JsonColumnMap = Record<string, "json" | "bool">;

export interface SyncTableDef {
  /** Local + remote table name */
  name: string;
  /** Column used for ownership scoping on remote */
  ownerColumn: "created_by" | "user_id" | "id";
  /** Columns stored as JSON text locally / jsonb remotely */
  jsonColumns?: string[];
  /** Integer 0/1 locally ↔ boolean remotely */
  boolColumns?: string[];
  /** Skip soft-deleted remote rows when pulling into SQLite hard-delete model */
  supportsDeletedAt?: boolean;
  /**
   * When true, table may not exist yet locally (future feature).
   * Sync skips quietly until the local table is created.
   */
  optionalLocal?: boolean;
}

/** Ordered for FK-friendly push/pull (parents before children). */
export const SYNC_TABLES: SyncTableDef[] = [
  { name: "shops", ownerColumn: "created_by" },
  { name: "profiles", ownerColumn: "id" },
  {
    name: "customers",
    ownerColumn: "created_by",
    supportsDeletedAt: true,
  },
  {
    name: "measurements",
    ownerColumn: "created_by",
    jsonColumns: ["data"],
    supportsDeletedAt: true,
  },
  {
    name: "garment_types",
    ownerColumn: "created_by",
    jsonColumns: ["measurement_fields"],
    boolColumns: ["enabled"],
    supportsDeletedAt: true,
  },
  {
    name: "styling_categories",
    ownerColumn: "created_by",
    jsonColumns: ["options"],
    supportsDeletedAt: true,
  },
  {
    name: "orders",
    ownerColumn: "created_by",
    jsonColumns: ["items", "measurement_snapshot"],
    supportsDeletedAt: true,
  },
  {
    name: "payments",
    ownerColumn: "created_by",
    supportsDeletedAt: true,
  },
  {
    name: "expenses",
    ownerColumn: "created_by",
    supportsDeletedAt: true,
  },
  {
    name: "shop_settings",
    ownerColumn: "user_id",
    supportsDeletedAt: true,
  },
];

export const SYNC_TABLE_NAMES = SYNC_TABLES.map((t) => t.name);

export function getSyncTable(name: string): SyncTableDef | undefined {
  return SYNC_TABLES.find((t) => t.name === name);
}

/** Settings keys whose values are data-URL images → Supabase Storage. */
export const STORAGE_SETTING_KEYS = new Set(["shop_logo"]);

export const STORAGE_BUCKET = "shop-assets";
export const STORAGE_VALUE_PREFIX = "supabase-storage:";
