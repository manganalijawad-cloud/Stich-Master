import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Resolve this module's absolute path for createRequire().
 * Prefer CJS `__filename` first: esbuild --format=cjs empties `import.meta`,
 * which previously crashed packaged Electron with:
 * "The argument 'filename' ... Received undefined".
 */
declare const __filename: string | undefined;
function resolveModuleFilename(): string {
  if (typeof __filename === "string" && __filename.length > 0) {
    return __filename;
  }
  // Dev/tsx ESM only — keep import.meta behind a Function so esbuild
  // does not rewrite it to an empty object in the CJS bundle.
  try {
    const metaUrl = new Function("return import.meta.url")() as unknown;
    if (typeof metaUrl === "string" && metaUrl.length > 0) {
      return fileURLToPath(metaUrl);
    }
  } catch {
    /* not ESM */
  }
  return path.resolve(process.cwd(), "dist", "server.cjs");
}

const moduleFilename = resolveModuleFilename();
const require = createRequire(moduleFilename);
const __dirname = path.dirname(moduleFilename);

let Database: any;

/**
 * Load better-sqlite3 for Electron offline DB.
 * Non-literal require keeps esbuild from bundling the native addon.
 * Also tries app.asar.unpacked (set via ELECTRON_RESOURCES_PATH from Electron main)
 * because server.cjs is shipped under resources/dist and cannot resolve asar deps alone.
 */
function loadBetterSqlite3(): any {
  // Ensure packaged Electron can resolve JS deps of the native addon (bindings, etc.)
  try {
    const Module = require("module");
    const resourcesPath = process.env.ELECTRON_RESOURCES_PATH || "";
    if (resourcesPath) {
      const roots = [
        path.join(resourcesPath, "app.asar.unpacked", "node_modules"),
        path.join(resourcesPath, "app.asar", "node_modules"),
        path.join(resourcesPath, "dist", "node_modules"),
        path.join(__dirname, "node_modules"),
      ].filter((p) => fs.existsSync(p));
      if (roots.length) {
        const parts = [...roots];
        if (process.env.NODE_PATH) parts.push(process.env.NODE_PATH);
        process.env.NODE_PATH = parts.join(path.delimiter);
        Module._initPaths();
      }
    }
  } catch {
    // ignore path bootstrap failures; require below will surface the real error
  }

  try {
    return require("better-" + "sqlite3");
  } catch {
    // fall through to explicit packaged paths
  }

  const resourcesPath = process.env.ELECTRON_RESOURCES_PATH || "";
  const candidates = [
    resourcesPath
      ? path.join(resourcesPath, "app.asar.unpacked", "node_modules", "better-sqlite3")
      : "",
    path.join(__dirname, "..", "app.asar.unpacked", "node_modules", "better-sqlite3"),
    path.join(__dirname, "node_modules", "better-sqlite3"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return require(candidate);
      }
    } catch {
      // try next
    }
  }
  return undefined;
}

Database = loadBetterSqlite3();

export let db: any;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  mobile_number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Owner' CHECK(role IN ('Owner','Worker')),
  shop_id TEXT REFERENCES shops(id),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  data TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  order_number TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'Pending',
  items TEXT NOT NULL DEFAULT '[]',
  total_amount REAL NOT NULL DEFAULT 0,
  discount_type TEXT CHECK(discount_type IN ('fixed','percentage')),
  discount_value REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_total REAL,
  paid_amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  measurement_snapshot TEXT DEFAULT '{}',
  delivered_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_settings (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  UNIQUE(key, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  user_id TEXT,
  user_email TEXT,
  user_name TEXT DEFAULT '',
  user_role TEXT DEFAULT '',
  action TEXT NOT NULL,
  module TEXT DEFAULT '',
  record_id TEXT DEFAULT '',
  previous_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  device TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  details TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Local-only: salted password verifier for Owner-mode unlock
CREATE TABLE IF NOT EXISTS owner_unlock_verifier (
  user_id TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Local-only: opaque sessions minted after successful password unlock
CREATE TABLE IF NOT EXISTS device_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);

CREATE TABLE IF NOT EXISTS garment_types (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  price REAL DEFAULT 0,
  measurement_fields TEXT DEFAULT '[]',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS styling_categories (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  garment_type_id TEXT REFERENCES garment_types(id),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  options TEXT DEFAULT '[]',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_measurements_customer_id ON measurements(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_settings_key ON shop_settings(key);
CREATE INDEX IF NOT EXISTS idx_garment_types_shop_id ON garment_types(shop_id);
CREATE INDEX IF NOT EXISTS idx_styling_categories_garment_type_id ON styling_categories(garment_type_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);

-- Payment ledger (orders.paid_amount remains the live total; rows sync to cloud)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  order_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  expense_date TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);

-- Cloud sync outbox + status (local-only; never exported as business backup rows)
CREATE TABLE IF NOT EXISTS sync_state (
  user_id TEXT PRIMARY KEY,
  last_pulled_at TEXT,
  last_pushed_at TEXT,
  last_backup_at TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK(op IN ('upsert','delete')),
  changed_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE(user_id, table_name, record_id, op)
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_user ON sync_outbox(user_id, changed_at);

`;

export function initDatabase(dbPath?: string): void {
  if (!Database) {
    throw new Error(
      "better-sqlite3 native module is not available. " +
      "Offline database cannot start. Rebuild the desktop app so " +
      "app.asar.unpacked/node_modules/better-sqlite3 is packaged correctly."
    );
  }

  const electronUserData = process.env.ELECTRON_USER_DATA;
  const resolvedPath = dbPath
    || (electronUserData ? path.join(electronUserData, "data", "hellodarzi.db")
    : path.join(process.cwd(), "data", "hellodarzi.db"));

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  db.exec(SCHEMA);

  migrateAuditLogsSchema();
  migrateOrdersSchema();
  migrateShopsSchema();
  migrateShopSettingsSchema();
  migrateSyncSchema();
  // Drop legacy device PIN table (feature removed)
  try {
    db.exec("DROP TABLE IF EXISTS device_unlock_verifier");
  } catch {
    // ignore
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}

export function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// CUSTOMER HELPERS
// ---------------------------------------------------------------------------
export interface DbCustomer {
  id: string; shop_id?: string; name: string; phone?: string;
  address?: string; email?: string; notes?: string;
  created_by: string; updated_by?: string;
  created_at: string; updated_at: string;
}

export function getCustomers(createdBy: string, search?: string, shopId?: string): DbCustomer[] {
  let sql = "SELECT * FROM customers WHERE created_by = ?";
  const params: any[] = [createdBy];
  if (search) {
    sql += " AND (name LIKE ? OR phone LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q);
  }
  if (shopId) {
    sql += " AND shop_id = ?";
    params.push(shopId);
  }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params) as DbCustomer[];
}

export function getCustomerById(id: string, createdBy: string): DbCustomer | undefined {
  return db.prepare("SELECT * FROM customers WHERE id = ? AND created_by = ?").get(id, createdBy) as DbCustomer | undefined;
}

/**
 * Ensure a shops row exists for a cloud/local shop id so FK columns (profiles,
 * audit_logs, customers, …) do not fail when offline. Skips placeholders.
 */
export function ensureShop(
  shopId: string | undefined | null,
  createdBy: string,
  shopName = ""
): string | null {
  if (!shopId || shopId === "default-shop") return null;
  const existing = db.prepare("SELECT id FROM shops WHERE id = ?").get(shopId) as { id: string } | undefined;
  if (existing) return shopId;
  const now = nowISO();
  db.prepare(`
    INSERT INTO shops (id, shop_name, address, mobile_number, created_by, created_at, updated_at)
    VALUES (?, ?, '', '', ?, ?, ?)
  `).run(shopId, shopName || "", createdBy, now, now);
  try {
    db.prepare("UPDATE shops SET name = ? WHERE id = ?").run(shopName || "", shopId);
  } catch {
    /* legacy name column may be absent */
  }
  enqueueSync(createdBy, "shops", shopId, "upsert");
  return shopId;
}

/** Resolve a shop_id safe for FK inserts (null if missing / placeholder / unknown). */
export function shopIdForFk(shopId: string | undefined | null): string | null {
  if (!shopId || shopId === "default-shop") return null;
  const row = db.prepare("SELECT id FROM shops WHERE id = ?").get(shopId);
  return row ? shopId : null;
}

export function createCustomer(data: {
  id?: string; shop_id?: string; name: string; phone?: string;
  address?: string; email?: string; notes?: string;
  created_by: string; updated_by?: string;
}): DbCustomer {
  const id = data.id || uuidv4();
  const now = nowISO();
  const shopId = ensureShop(data.shop_id, data.created_by);
  db.prepare(`
    INSERT INTO customers (id, shop_id, name, phone, address, email, notes, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, shopId, data.name, data.phone || null,
    data.address || null, data.email || null,
    data.notes || null, data.created_by, data.updated_by || data.created_by, now, now
  );
  enqueueSync(data.created_by, "customers", id, "upsert");
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as DbCustomer;
}

export function updateCustomer(id: string, createdBy: string, data: Partial<DbCustomer>): DbCustomer | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  const allowed = ["name", "phone", "address", "email", "notes", "shop_id", "updated_by"];
  for (const key of allowed) {
    if (data[key as keyof typeof data] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(data[key as keyof typeof data]);
    }
  }
  if (sets.length === 0) return getCustomerById(id, createdBy);
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  db.prepare(`UPDATE customers SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  enqueueSync(createdBy, "customers", id, "upsert");
  return getCustomerById(id, createdBy);
}

export function deleteCustomer(id: string, createdBy: string): boolean {
  const customer = getCustomerById(id, createdBy);
  if (!customer) return false;
  const measurementIds = (
    db.prepare("SELECT id FROM measurements WHERE customer_id = ? AND created_by = ?").all(id, createdBy) as { id: string }[]
  ).map((r) => r.id);
  db.prepare("DELETE FROM measurements WHERE customer_id = ? AND created_by = ?").run(id, createdBy);
  db.prepare("DELETE FROM customers WHERE id = ? AND created_by = ?").run(id, createdBy);
  for (const mid of measurementIds) enqueueSync(createdBy, "measurements", mid, "delete");
  enqueueSync(createdBy, "customers", id, "delete");
  return true;
}

// ---------------------------------------------------------------------------
// MEASUREMENT HELPERS
// ---------------------------------------------------------------------------
export interface DbMeasurement {
  id: string; shop_id?: string; customer_id: string;
  data: string; created_by: string; updated_by?: string;
  created_at: string; updated_at: string;
}

export function getMeasurements(customerId: string, createdBy: string): DbMeasurement[] {
  return db.prepare(
    "SELECT * FROM measurements WHERE customer_id = ? AND created_by = ? ORDER BY created_at DESC"
  ).all(customerId, createdBy) as DbMeasurement[];
}

/** All measurement rows for a user — used by offline bootstrap preload. */
export function getAllMeasurements(createdBy: string): DbMeasurement[] {
  return db.prepare(
    "SELECT * FROM measurements WHERE created_by = ? ORDER BY updated_at DESC"
  ).all(createdBy) as DbMeasurement[];
}

export function upsertMeasurement(customerId: string, createdBy: string, measurementData: Record<string, any>, updatedBy?: string): DbMeasurement {
  const existing = db.prepare(
    "SELECT * FROM measurements WHERE customer_id = ? AND created_by = ? LIMIT 1"
  ).get(customerId, createdBy) as DbMeasurement | undefined;

  const now = nowISO();
  if (existing) {
    db.prepare("UPDATE measurements SET data = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(measurementData), updatedBy || createdBy, now, existing.id
    );
    enqueueSync(createdBy, "measurements", existing.id, "upsert");
    return db.prepare("SELECT * FROM measurements WHERE id = ?").get(existing.id) as DbMeasurement;
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO measurements (id, customer_id, data, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, customerId, JSON.stringify(measurementData), createdBy, updatedBy || createdBy, now, now);
    enqueueSync(createdBy, "measurements", id, "upsert");
    return db.prepare("SELECT * FROM measurements WHERE id = ?").get(id) as DbMeasurement;
  }
}

// ---------------------------------------------------------------------------
// ORDER HELPERS
// ---------------------------------------------------------------------------
export interface DbOrder {
  id: string; shop_id?: string; order_number: string;
  customer_id: string; status: string;
  items: string; total_amount: number;
  discount_type?: string; discount_value?: number; discount_amount?: number; final_total?: number;
  paid_amount: number;
  due_date?: string; measurement_snapshot?: string;
  delivered_at?: string; created_by: string; updated_by?: string;
  created_at: string; updated_at: string;
}

export function getOrders(createdBy: string, filters?: {
  status?: string; search?: string; fromDate?: string; toDate?: string;
  customerId?: string; shopId?: string;
}): DbOrder[] {
  let sql = "SELECT * FROM orders WHERE created_by = ?";
  const params: any[] = [createdBy];

  if (filters?.status) {
    if (filters.status === "active") {
      sql += " AND status NOT IN ('Archived','Delivered')";
    } else {
      sql += " AND status = ?";
      params.push(filters.status);
    }
  }
  if (filters?.search) {
    sql += " AND (order_number LIKE ? OR customer_id IN (SELECT id FROM customers WHERE name LIKE ?))";
    const q = `%${filters.search}%`;
    params.push(q, q);
  }
  if (filters?.customerId) {
    sql += " AND customer_id = ?";
    params.push(filters.customerId);
  }
  if (filters?.fromDate) {
    sql += " AND created_at >= ?";
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    sql += " AND created_at <= ?";
    params.push(filters.toDate);
  }
  if (filters?.shopId) {
    sql += " AND shop_id = ?";
    params.push(filters.shopId);
  }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params) as DbOrder[];
}

export function getOrderById(id: string, createdBy: string): DbOrder | undefined {
  return db.prepare("SELECT * FROM orders WHERE id = ? AND created_by = ?").get(id, createdBy) as DbOrder | undefined;
}

export function getNextOrderNumber(createdBy: string): number {
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(order_number, 5) AS INTEGER)) AS max_num FROM orders WHERE created_by = ?"
  ).get(createdBy) as { max_num: number | null };
  return (row?.max_num || 0) + 1;
}

export function createOrder(data: {
  id?: string; shop_id?: string; order_number: string;
  customer_id: string; status?: string; items?: any[];
  total_amount?: number; discount_type?: string; discount_value?: number;
  discount_amount?: number; final_total?: number;
  paid_amount?: number; due_date?: string;
  measurement_snapshot?: any; created_by: string; updated_by?: string;
}): DbOrder {
  const id = data.id || uuidv4();
  const now = nowISO();
  const shopId = ensureShop(data.shop_id, data.created_by);
  db.prepare(`
    INSERT INTO orders (id, shop_id, order_number, customer_id, status, items, total_amount, discount_type, discount_value, discount_amount, final_total, paid_amount, due_date, measurement_snapshot, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, shopId, data.order_number, data.customer_id,
    data.status || "Pending", JSON.stringify(data.items || []),
    data.total_amount || 0, data.discount_type || null, data.discount_value || 0,
    data.discount_amount || 0, data.final_total ?? data.total_amount ?? 0,
    data.paid_amount || 0,
    data.due_date || null, JSON.stringify(data.measurement_snapshot || {}),
    data.created_by, data.updated_by || data.created_by, now, now
  );
  enqueueSync(data.created_by, "orders", id, "upsert");
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as DbOrder;
}

export function updateOrder(id: string, createdBy: string, data: Partial<DbOrder>): DbOrder | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  const allowed = ["status", "items", "total_amount", "discount_type", "discount_value", "discount_amount", "final_total", "paid_amount", "due_date", "measurement_snapshot", "delivered_at", "updated_by", "shop_id", "order_number", "customer_id"];
  for (const key of allowed) {
    if (data[key as keyof typeof data] !== undefined) {
      let val = data[key as keyof typeof data];
      if (key === "items" || key === "measurement_snapshot") {
        val = JSON.stringify(val);
      }
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (sets.length === 0) return getOrderById(id, createdBy);
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  db.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  enqueueSync(createdBy, "orders", id, "upsert");
  return getOrderById(id, createdBy);
}

export function deleteOrder(id: string, createdBy: string): boolean {
  const result = db.prepare("DELETE FROM orders WHERE id = ? AND created_by = ?").run(id, createdBy);
  if (result.changes > 0) enqueueSync(createdBy, "orders", id, "delete");
  return result.changes > 0;
}

/**
 * Archive closed orders only (Delivered → Archived).
 * Never touches active pipeline work. Optional beforeDate filters by
 * COALESCE(delivered_at, created_at) so undated deliveries still qualify.
 * Returns ids of orders that were archived (for sync enqueue).
 */
export function archiveOrders(createdBy: string, beforeDate?: string): { count: number; ids: string[] } {
  let selectSql = `
    SELECT id FROM orders
    WHERE created_by = ?
      AND status = 'Delivered'
  `;
  const selectParams: any[] = [createdBy];
  if (beforeDate) {
    selectSql += " AND COALESCE(delivered_at, created_at) < ?";
    selectParams.push(beforeDate);
  }
  const ids = (db.prepare(selectSql).all(...selectParams) as { id: string }[]).map(r => r.id);
  if (ids.length === 0) return { count: 0, ids: [] };

  let sql = `
    UPDATE orders
    SET status = 'Archived', updated_at = ?
    WHERE created_by = ?
      AND status = 'Delivered'
  `;
  const params: any[] = [nowISO(), createdBy];
  if (beforeDate) {
    sql += " AND COALESCE(delivered_at, created_at) < ?";
    params.push(beforeDate);
  }
  const result = db.prepare(sql).run(...params);
  enqueueSyncMany(createdBy, "orders", ids, "upsert");
  return { count: result.changes, ids };
}

// ---------------------------------------------------------------------------
// DASHBOARD / REPORT HELPERS
// ---------------------------------------------------------------------------
export function getDashboardStats(createdBy: string, shopId?: string): {
  totalCustomers: number; totalOrders: number; activeOrders: number;
  deliveredOrders: number; pendingAmount: number; revenue: number; received: number;
} {
  const params: any[] = [createdBy];
  if (shopId) { params.push(shopId); }

  const customerCount = (db.prepare(
    `SELECT COUNT(*) as c FROM customers WHERE created_by = ?${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { c: number }).c;

  const totalOrders = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE created_by = ?${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { c: number }).c;

  const activeOrders = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE created_by = ? AND status NOT IN ('Archived','Delivered')${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { c: number }).c;

  const deliveredOrders = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE created_by = ? AND status = 'Delivered'${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { c: number }).c;

  const moneyRow = db.prepare(
    `SELECT COALESCE(SUM(COALESCE(final_total, total_amount)), 0) as rev,
            COALESCE(SUM(paid_amount), 0) as received
     FROM orders WHERE created_by = ?${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { rev: number; received: number };

  const pendingRow = db.prepare(
    `SELECT COALESCE(SUM(COALESCE(final_total, total_amount) - paid_amount), 0) as pend
     FROM orders WHERE created_by = ? AND status NOT IN ('Archived','Delivered')${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { pend: number };

  return {
    totalCustomers: customerCount,
    totalOrders,
    activeOrders,
    deliveredOrders,
    pendingAmount: pendingRow.pend,
    revenue: moneyRow.rev,
    received: moneyRow.received,
  };
}

// ---------------------------------------------------------------------------
// PROFILE HELPERS
// ---------------------------------------------------------------------------
export function getProfile(userId: string): { id: string; email: string; name: string; role: string; shop_id?: string } | undefined {
  return db.prepare("SELECT id, email, name, role, shop_id FROM profiles WHERE id = ?").get(userId) as any | undefined;
}

export function upsertProfile(profile: { id: string; email: string; name?: string; role?: string; shop_id?: string; created_by?: string }): void {
  const existing = db.prepare("SELECT id FROM profiles WHERE id = ?").get(profile.id);
  const now = nowISO();
  const shopId = ensureShop(profile.shop_id, profile.created_by || profile.id, profile.name || "");
  if (existing) {
    db.prepare("UPDATE profiles SET email = ?, name = COALESCE(?, name), role = COALESCE(?, role), shop_id = COALESCE(?, shop_id), updated_at = ? WHERE id = ?").run(
      profile.email, profile.name || null, profile.role || null, shopId, now, profile.id
    );
  } else {
    db.prepare("INSERT INTO profiles (id, email, name, role, shop_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      profile.id, profile.email, profile.name || profile.email, profile.role || "Owner",
      shopId, profile.created_by || profile.id, now, now
    );
  }
  enqueueSync(profile.id, "profiles", profile.id, "upsert");
  if (shopId) enqueueSync(profile.created_by || profile.id, "shops", shopId, "upsert");
}

export function getProfilesByOwner(ownerId: string): any[] {
  return db.prepare("SELECT id, email, name, role, shop_id, created_at FROM profiles WHERE created_by = ? ORDER BY created_at DESC").all(ownerId);
}

/** Every local profile — used for first-run setup checks and the offline unlock/login screens. */
export function listAllProfiles(): Array<{ id: string; email: string; name: string; role: string; shop_id?: string }> {
  return db.prepare(
    "SELECT id, email, name, role, shop_id FROM profiles ORDER BY created_at ASC"
  ).all() as Array<{ id: string; email: string; name: string; role: string; shop_id?: string }>;
}

/** True once at least one local profile exists (device has completed first-run setup). */
export function hasAnyProfile(): boolean {
  const row = db.prepare("SELECT 1 AS ok FROM profiles LIMIT 1").get() as { ok: number } | undefined;
  return !!row;
}

export function deleteProfile(userId: string): boolean {
  return db.prepare("DELETE FROM profiles WHERE id = ?").run(userId).changes > 0;
}

/**
 * Re-key a local profile (and its created_by ownership) to a Supabase Auth user id.
 * Used once when migrating from local-only auth to Supabase Auth.
 * Does not touch auth credentials — only business ownership ids.
 */
export function rekeyProfileOwnership(oldUserId: string, newUserId: string, email: string): void {
  if (!oldUserId || !newUserId || oldUserId === newUserId) return;
  const existingNew = db.prepare("SELECT id FROM profiles WHERE id = ?").get(newUserId);
  if (existingNew) return;

  const old = getProfile(oldUserId);
  if (!old) return;

  const now = nowISO();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO profiles (id, email, name, role, shop_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newUserId,
      email || old.email,
      old.name || email,
      old.role || "Owner",
      old.shop_id || null,
      newUserId,
      now,
      now
    );

    const ownershipTables = [
      "customers",
      "measurements",
      "orders",
      "payments",
      "expenses",
      "garment_types",
      "styling_categories",
      "inventory",
      "shops",
    ] as const;
    for (const table of ownershipTables) {
      try {
        db.prepare(`UPDATE ${table} SET created_by = ? WHERE created_by = ?`).run(newUserId, oldUserId);
      } catch {
        /* table may lack created_by on older schemas */
      }
      try {
        db.prepare(`UPDATE ${table} SET updated_by = ? WHERE updated_by = ?`).run(newUserId, oldUserId);
      } catch {
        /* optional column */
      }
    }

    try {
      db.prepare("UPDATE shop_settings SET user_id = ? WHERE user_id = ?").run(newUserId, oldUserId);
    } catch {
      /* ignore */
    }

    // Move owner-unlock verifier if present (Owner mode unlock — not Supabase Auth).
    try {
      db.prepare(`
        INSERT OR REPLACE INTO owner_unlock_verifier (user_id, salt, hash, updated_at)
        SELECT ?, salt, hash, ? FROM owner_unlock_verifier WHERE user_id = ?
      `).run(newUserId, now, oldUserId);
      db.prepare("DELETE FROM owner_unlock_verifier WHERE user_id = ?").run(oldUserId);
    } catch {
      /* ignore */
    }

    db.prepare("DELETE FROM device_sessions WHERE user_id = ?").run(oldUserId);
    db.prepare("DELETE FROM profiles WHERE id = ?").run(oldUserId);
  });
  transaction();
}

// ---------------------------------------------------------------------------
// SHOP HELPERS
// ---------------------------------------------------------------------------
export function createShop(
  name: string,
  createdBy: string,
  extras?: { address?: string; mobile_number?: string }
): { id: string; name: string; shop_name: string } {
  const id = uuidv4();
  const now = nowISO();
  const shopName = name || "";
  db.prepare(`
    INSERT INTO shops (id, shop_name, address, mobile_number, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    shopName,
    extras?.address || "",
    extras?.mobile_number || "",
    createdBy,
    now,
    now
  );
  // Legacy DBs may still have a `name` column — keep it in sync when present
  try {
    db.prepare("UPDATE shops SET name = ? WHERE id = ?").run(shopName, id);
  } catch {
    /* column may not exist on new installs */
  }
  enqueueSync(createdBy, "shops", id, "upsert");
  return { id, name: shopName, shop_name: shopName };
}

export function getShop(shopId: string): { id: string; name: string; shop_name: string } | undefined {
  const row = db.prepare("SELECT * FROM shops WHERE id = ?").get(shopId) as any;
  if (!row) return undefined;
  const display = row.shop_name || row.name || "";
  return { id: row.id, name: display, shop_name: display };
}

// ---------------------------------------------------------------------------
// SETTINGS HELPERS
// ---------------------------------------------------------------------------
export function getSettings(userId: string): Record<string, any> {
  const rows = db.prepare("SELECT key, value FROM shop_settings WHERE user_id = ? OR key LIKE ?").all(
    userId, `${userId}:%`
  ) as { key: string; value: string }[];
  const result: Record<string, any> = {};
  const prefix = `${userId}:`;
  for (const row of rows) {
    let key = row.key;
    if (key.startsWith(prefix)) key = key.slice(prefix.length);
    try { result[key] = JSON.parse(row.value); } catch { result[key] = row.value; }
  }
  return result;
}

export function saveSetting(key: string, value: any, userId: string, updatedBy?: string): { id: string; key: string; user_id: string } {
  const now = nowISO();
  const strVal = typeof value === "string" ? value : JSON.stringify(value);
  const existing = db.prepare(
    "SELECT id FROM shop_settings WHERE key = ? AND user_id = ?"
  ).get(key, userId) as { id: string | number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE shop_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ? AND user_id = ?
    `).run(strVal, now, updatedBy || userId, key, userId);
    enqueueSync(userId, "shop_settings", String(existing.id), "upsert");
    return { id: String(existing.id), key, user_id: userId };
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO shop_settings (id, key, value, user_id, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, key, strVal, userId, now, updatedBy || userId);
  enqueueSync(userId, "shop_settings", id, "upsert");
  return { id, key, user_id: userId };
}

// ---------------------------------------------------------------------------
// GARMENT TYPE HELPERS
// ---------------------------------------------------------------------------
export function getGarmentTypes(createdBy: string, shopId?: string | null): any[] {
  let sql = "SELECT * FROM garment_types WHERE created_by = ?";
  const params: any[] = [createdBy];
  // ensureShop() stores NULL for missing/"default-shop"; never filter by that placeholder
  // or newly created rows (shop_id NULL) will not appear after a successful create.
  if (shopId && shopId !== "default-shop") {
    sql += " AND shop_id = ?";
    params.push(shopId);
  }
  sql += " ORDER BY display_order ASC, name ASC";
  return db.prepare(sql).all(...params);
}

export function createGarmentType(data: any): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  const shopId = ensureShop(data.shop_id, data.created_by);
  db.prepare(`
    INSERT INTO garment_types (id, shop_id, name, enabled, display_order, price, measurement_fields, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, shopId, data.name, data.enabled !== false ? 1 : 0,
    data.display_order || 0, data.price || 0,
    JSON.stringify(data.measurement_fields || []),
    data.created_by, data.updated_by || data.created_by, now, now);
  enqueueSync(data.created_by, "garment_types", id, "upsert");
  return db.prepare("SELECT * FROM garment_types WHERE id = ?").get(id);
}

export function updateGarmentType(id: string, createdBy: string, data: any): any {
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of ["name", "enabled", "display_order", "price", "measurement_fields", "shop_id", "updated_by"]) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === "measurement_fields") val = JSON.stringify(val);
      if (key === "enabled") val = val ? 1 : 0;
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (sets.length === 0) {
    return db.prepare("SELECT * FROM garment_types WHERE id = ? AND created_by = ?").get(id, createdBy);
  }
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  const result = db.prepare(`UPDATE garment_types SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  if (result.changes === 0) return null;
  enqueueSync(createdBy, "garment_types", id, "upsert");
  return db.prepare("SELECT * FROM garment_types WHERE id = ?").get(id);
}

export function deleteGarmentType(id: string, createdBy: string): boolean {
  const styleIds = (
    db.prepare("SELECT id FROM styling_categories WHERE garment_type_id = ?").all(id) as { id: string }[]
  ).map((r) => r.id);
  db.prepare("DELETE FROM styling_categories WHERE garment_type_id = ?").run(id);
  const ok = db.prepare("DELETE FROM garment_types WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
  if (ok) {
    for (const sid of styleIds) enqueueSync(createdBy, "styling_categories", sid, "delete");
    enqueueSync(createdBy, "garment_types", id, "delete");
  }
  return ok;
}

export function reorderGarmentTypes(ids: string[], createdBy: string): void {
  const update = db.prepare("UPDATE garment_types SET display_order = ?, updated_at = ? WHERE id = ? AND created_by = ?");
  const now = nowISO();
  for (let i = 0; i < ids.length; i++) {
    update.run(i, now, ids[i], createdBy);
    enqueueSync(createdBy, "garment_types", ids[i], "upsert");
  }
}

// ---------------------------------------------------------------------------
// STYLING CATEGORY HELPERS
// ---------------------------------------------------------------------------
export function getStylingCategories(createdBy: string, garmentTypeId?: string): any[] {
  let sql = "SELECT * FROM styling_categories WHERE created_by = ?";
  const params: any[] = [createdBy];
  if (garmentTypeId) { sql += " AND garment_type_id = ?"; params.push(garmentTypeId); }
  sql += " ORDER BY display_order ASC, name ASC";
  return db.prepare(sql).all(...params);
}

export function createStylingCategory(data: any): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  db.prepare(`
    INSERT INTO styling_categories (id, shop_id, garment_type_id, name, display_order, options, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.shop_id || null, data.garment_type_id, data.name,
    data.display_order || 0, JSON.stringify(data.options || []),
    data.created_by, data.updated_by || data.created_by, now, now);
  enqueueSync(data.created_by, "styling_categories", id, "upsert");
  return db.prepare("SELECT * FROM styling_categories WHERE id = ?").get(id);
}

export function updateStylingCategory(id: string, createdBy: string, data: any): any {
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of ["name", "display_order", "options", "garment_type_id", "shop_id", "updated_by"]) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === "options") val = JSON.stringify(val);
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (sets.length === 0) return db.prepare("SELECT * FROM styling_categories WHERE id = ? AND created_by = ?").get(id, createdBy);
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  db.prepare(`UPDATE styling_categories SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  enqueueSync(createdBy, "styling_categories", id, "upsert");
  return db.prepare("SELECT * FROM styling_categories WHERE id = ?").get(id);
}

export function deleteStylingCategory(id: string, createdBy: string): boolean {
  const ok = db.prepare("DELETE FROM styling_categories WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
  if (ok) enqueueSync(createdBy, "styling_categories", id, "delete");
  return ok;
}

export function reorderStylingCategories(ids: string[], createdBy: string): void {
  const update = db.prepare("UPDATE styling_categories SET display_order = ?, updated_at = ? WHERE id = ? AND created_by = ?");
  const now = nowISO();
  for (let i = 0; i < ids.length; i++) {
    update.run(i, now, ids[i], createdBy);
    enqueueSync(createdBy, "styling_categories", ids[i], "upsert");
  }
}

// ---------------------------------------------------------------------------
// AUDIT LOG HELPERS
// ---------------------------------------------------------------------------
function migrateAuditLogsSchema(): void {
  const newColumns: [string, string][] = [
    ["user_name", "TEXT DEFAULT ''"],
    ["user_role", "TEXT DEFAULT ''"],
    ["module", "TEXT DEFAULT ''"],
    ["record_id", "TEXT DEFAULT ''"],
    ["previous_value", "TEXT DEFAULT ''"],
    ["new_value", "TEXT DEFAULT ''"],
    ["device", "TEXT DEFAULT ''"],
    ["ip_address", "TEXT DEFAULT ''"],
    ["notes", "TEXT DEFAULT ''"],
  ];
  for (const [col, def] of newColumns) {
    try {
      db.exec(`ALTER TABLE audit_logs ADD COLUMN ${col} ${def}`);
    } catch {
    }
  }
}

function migrateOrdersSchema(): void {
  const newColumns: [string, string][] = [
    ["discount_type", "TEXT"],
    ["discount_value", "REAL DEFAULT 0"],
    ["discount_amount", "REAL DEFAULT 0"],
    ["final_total", "REAL"],
  ];
  for (const [col, def] of newColumns) {
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${def}`);
    } catch {
    }
  }

  // Pipeline stages are configurable (PROJECT.md §10). Existing DBs may still have a
  // hard-coded status CHECK that rejects custom stage_* ids — rebuild without it.
  migrateOrdersStatusCheckConstraint();
}

function migrateOrdersStatusCheckConstraint(): void {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'"
  ).get() as { sql: string } | undefined;

  if (!row?.sql || !/CHECK\s*\(\s*status\s+IN/i.test(row.sql)) {
    return;
  }

  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE orders_migrated (
        id TEXT PRIMARY KEY,
        shop_id TEXT REFERENCES shops(id),
        order_number TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'Pending',
        items TEXT NOT NULL DEFAULT '[]',
        total_amount REAL NOT NULL DEFAULT 0,
        discount_type TEXT CHECK(discount_type IN ('fixed','percentage')),
        discount_value REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        final_total REAL,
        paid_amount REAL NOT NULL DEFAULT 0,
        due_date TEXT,
        measurement_snapshot TEXT DEFAULT '{}',
        delivered_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO orders_migrated (
        id, shop_id, order_number, customer_id, status, items,
        total_amount, discount_type, discount_value, discount_amount, final_total,
        paid_amount, due_date, measurement_snapshot, delivered_at,
        created_by, updated_by, created_at, updated_at
      )
      SELECT
        id, shop_id, order_number, customer_id, status, items,
        total_amount, discount_type, discount_value, discount_amount, final_total,
        paid_amount, due_date, measurement_snapshot, delivered_at,
        created_by, updated_by, created_at, updated_at
      FROM orders;

      DROP TABLE orders;
      ALTER TABLE orders_migrated RENAME TO orders;

      CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
    `);
  });

  rebuild();
  console.log("Migrated orders table: removed hard-coded status CHECK for configurable pipeline stages.");
}

/** Ensure shops rows expose shop_name, address, mobile_number. */
function migrateShopsSchema(): void {
  const newColumns: [string, string][] = [
    ["shop_name", "TEXT NOT NULL DEFAULT ''"],
    ["address", "TEXT NOT NULL DEFAULT ''"],
    ["mobile_number", "TEXT NOT NULL DEFAULT ''"],
    ["updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))"],
  ];
  for (const [col, def] of newColumns) {
    try {
      db.exec(`ALTER TABLE shops ADD COLUMN ${col} ${def}`);
    } catch {
      /* already exists */
    }
  }

  // Copy legacy `name` into shop_name when shop_name is empty
  try {
    const cols = db.prepare("PRAGMA table_info(shops)").all() as { name: string }[];
    const hasName = cols.some(c => c.name === "name");
    const hasShopName = cols.some(c => c.name === "shop_name");
    if (hasName && hasShopName) {
      db.prepare(`
        UPDATE shops
        SET shop_name = name
        WHERE (shop_name IS NULL OR shop_name = '')
          AND name IS NOT NULL
          AND name != ''
      `).run();
    }
  } catch (err: any) {
    console.warn("shops name→shop_name backfill skipped:", err?.message || err);
  }
}

/** Align local shop_settings id with cloud: TEXT UUID instead of INTEGER AUTOINCREMENT. */
function migrateShopSettingsSchema(): void {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'shop_settings'"
  ).get() as { sql: string } | undefined;

  if (!row?.sql) return;
  // Already TEXT / UUID-style primary key
  if (!/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i.test(row.sql)) {
    return;
  }

  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE shop_settings_migrated (
        id TEXT PRIMARY KEY,
        shop_id TEXT REFERENCES shops(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        user_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        UNIQUE(key, user_id)
      );
    `);

    const oldRows = db.prepare("SELECT * FROM shop_settings").all() as any[];
    const insert = db.prepare(`
      INSERT INTO shop_settings_migrated (id, shop_id, key, value, user_id, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of oldRows) {
      insert.run(
        uuidv4(),
        r.shop_id || null,
        r.key,
        r.value ?? "",
        r.user_id || null,
        r.updated_at || nowISO(),
        r.updated_by || null
      );
    }

    db.exec(`
      DROP TABLE shop_settings;
      ALTER TABLE shop_settings_migrated RENAME TO shop_settings;
      CREATE INDEX IF NOT EXISTS idx_shop_settings_key ON shop_settings(key);
    `);
  });

  rebuild();
  console.log("Migrated shop_settings: id column is now TEXT UUID.");
}

export function logAction(
  action: string,
  userId: string,
  userEmail: string,
  shopId: string | undefined,
  details: Record<string, any>,
  extra?: {
    userName?: string;
    userRole?: string;
    module?: string;
    recordId?: string;
    previousValue?: any;
    newValue?: any;
    device?: string;
    ipAddress?: string;
    notes?: string;
  }
): void {
  const id = uuidv4();
  const now = nowISO();
  const enriched = {
    ...details,
    _meta: {
      userName: extra?.userName || details.user_name || '',
      userRole: extra?.userRole || details.user_role || '',
      module: extra?.module || details.module || '',
      recordId: extra?.recordId || details.record_id || details.order_id || details.id || '',
      previousValue: extra?.previousValue || details.previous_value || null,
      newValue: extra?.newValue || details.new_value || null,
      device: extra?.device || details.device || '',
      ipAddress: extra?.ipAddress || details.ip_address || '',
      notes: extra?.notes || details.notes || '',
    }
  };
  db.prepare(`
    INSERT INTO audit_logs (id, shop_id, user_id, user_email, user_name, user_role, action, module, record_id, previous_value, new_value, device, ip_address, notes, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    shopIdForFk(shopId),
    userId,
    userEmail,
    extra?.userName || details.user_name || '',
    extra?.userRole || details.user_role || '',
    action,
    extra?.module || details.module || '',
    extra?.recordId || details.record_id || details.order_id || details.id || '',
    extra?.previousValue ? JSON.stringify(extra.previousValue) : (details.previous_value ? JSON.stringify(details.previous_value) : null),
    extra?.newValue ? JSON.stringify(extra.newValue) : (details.new_value ? JSON.stringify(details.new_value) : null),
    extra?.device || details.device || '',
    extra?.ipAddress || details.ip_address || '',
    extra?.notes || details.notes || '',
    JSON.stringify(enriched),
    now
  );
}

export function getAuditLogs(options: {
  userId?: string;
  recordId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  actionFilter?: string;
  moduleFilter?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}): { data: any[]; total: number } {
  const { userId, recordId, search, fromDate, toDate, actionFilter, moduleFilter, sort = 'newest', page = 1, limit = 50 } = options;
  const conditions: string[] = [];
  const params: any[] = [];

  if (userId) {
    conditions.push("user_id = ?");
    params.push(userId);
  }
  if (recordId) {
    // Match column or older rows that only stored order_id inside details JSON
    conditions.push("(record_id = ? OR details LIKE ?)");
    params.push(recordId, `%"order_id":"${recordId}"%`);
  }
  if (search) {
    conditions.push("(action LIKE ? OR user_email LIKE ? OR user_name LIKE ? OR module LIKE ? OR notes LIKE ? OR record_id LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q, q, q, q);
  }
  if (fromDate) {
    conditions.push("created_at >= ?");
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push("created_at <= ?");
    params.push(toDate);
  }
  if (actionFilter) {
    conditions.push("action = ?");
    params.push(actionFilter);
  }
  if (moduleFilter) {
    conditions.push("module = ?");
    params.push(moduleFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDir = sort === 'oldest' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${where}`).get(...params) as { c: number };
  const total = countRow.c;

  const data = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at ${orderDir} LIMIT ? OFFSET ?`).all(...params, limit, offset);

  return { data, total };
}

// ---------------------------------------------------------------------------
// CLOUD SYNC OUTBOX / STATE (local SQLite only)
// ---------------------------------------------------------------------------
const SYNCABLE_TABLES = [
  "shops",
  "profiles",
  "customers",
  "measurements",
  "garment_types",
  "styling_categories",
  "orders",
  "payments",
  "expenses",
  "shop_settings",
] as const;

export type SyncOp = "upsert" | "delete";
export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "offline";

export interface SyncStateRow {
  user_id: string;
  last_pulled_at: string | null;
  last_pushed_at: string | null;
  last_backup_at: string | null;
  status: SyncStatus;
  last_error: string | null;
  updated_at: string;
}

export interface OutboxRow {
  id: string;
  user_id: string;
  table_name: string;
  record_id: string;
  op: SyncOp;
  changed_at: string;
  attempts: number;
  last_error: string | null;
}

function syncTableExists(name: string): boolean {
  try {
    const row = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) as { ok: number } | undefined;
    return !!row;
  } catch {
    return false;
  }
}

/** Ensure sync tables exist on older DBs that predate SCHEMA additions. */
export function migrateSyncSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      shop_id TEXT REFERENCES shops(id),
      order_id TEXT,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      shop_id TEXT REFERENCES shops(id),
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      expense_date TEXT,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sync_state (
      user_id TEXT PRIMARY KEY,
      last_pulled_at TEXT,
      last_pushed_at TEXT,
      last_backup_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      last_error TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK(op IN ('upsert','delete')),
      changed_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      UNIQUE(user_id, table_name, record_id, op)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_user ON sync_outbox(user_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
    CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
  `);
}

/** Enqueue a local change for background cloud sync. */
export function enqueueSync(
  userId: string,
  tableName: string,
  recordId: string,
  op: SyncOp = "upsert"
): void {
  if (!userId || !tableName || !recordId) return;
  if (!(SYNCABLE_TABLES as readonly string[]).includes(tableName)) return;
  if (!db || !syncTableExists("sync_outbox")) return;
  const now = nowISO();
  try {
    db.prepare(`
      INSERT INTO sync_outbox (id, user_id, table_name, record_id, op, changed_at, attempts, last_error)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(user_id, table_name, record_id, op) DO UPDATE SET
        changed_at = excluded.changed_at,
        attempts = 0,
        last_error = NULL
    `).run(uuidv4(), userId, tableName, recordId, op, now);
  } catch (err) {
    console.warn("[sync] enqueue failed:", err);
  }
}

export function enqueueSyncMany(
  userId: string,
  tableName: string,
  recordIds: string[],
  op: SyncOp = "upsert"
): void {
  for (const id of recordIds) enqueueSync(userId, tableName, id, op);
}

export function getPendingCount(userId: string): number {
  if (!db || !syncTableExists("sync_outbox")) return 0;
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sync_outbox WHERE user_id = ?")
    .get(userId) as { c: number };
  return row?.c || 0;
}

export function listOutbox(userId: string, limit = 500): OutboxRow[] {
  return db
    .prepare(
      `SELECT * FROM sync_outbox WHERE user_id = ? ORDER BY changed_at ASC LIMIT ?`
    )
    .all(userId, limit) as OutboxRow[];
}

export function removeOutbox(id: string): void {
  db.prepare("DELETE FROM sync_outbox WHERE id = ?").run(id);
}

export function markOutboxError(id: string, error: string): void {
  db.prepare(
    `UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`
  ).run(error.slice(0, 500), id);
}

export function getSyncState(userId: string): SyncStateRow {
  if (!db || !syncTableExists("sync_state")) {
    return {
      user_id: userId,
      last_pulled_at: null,
      last_pushed_at: null,
      last_backup_at: null,
      status: "idle",
      last_error: null,
      updated_at: nowISO(),
    };
  }
  const row = db
    .prepare("SELECT * FROM sync_state WHERE user_id = ?")
    .get(userId) as SyncStateRow | undefined;
  if (row) return row;
  const now = nowISO();
  db.prepare(`
    INSERT INTO sync_state (user_id, status, updated_at)
    VALUES (?, 'idle', ?)
  `).run(userId, now);
  return {
    user_id: userId,
    last_pulled_at: null,
    last_pushed_at: null,
    last_backup_at: null,
    status: "idle",
    last_error: null,
    updated_at: now,
  };
}

export function updateSyncState(
  userId: string,
  patch: Partial<Omit<SyncStateRow, "user_id">>
): SyncStateRow {
  getSyncState(userId);
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of [
    "last_pulled_at",
    "last_pushed_at",
    "last_backup_at",
    "status",
    "last_error",
  ] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(userId);
  db.prepare(`UPDATE sync_state SET ${sets.join(", ")} WHERE user_id = ?`).run(...params);
  return getSyncState(userId);
}

/** Seed outbox with every local row for a first full backup/push. */
export function enqueueFullSnapshot(userId: string): number {
  let count = 0;
  for (const table of SYNCABLE_TABLES) {
    if (!syncTableExists(table)) continue;
    let rows: { id: string }[] = [];
    try {
      if (table === "shop_settings") {
        rows = db
          .prepare("SELECT id FROM shop_settings WHERE user_id = ?")
          .all(userId) as { id: string }[];
      } else if (table === "profiles") {
        rows = db
          .prepare("SELECT id FROM profiles WHERE id = ?")
          .all(userId) as { id: string }[];
      } else if (table === "shops") {
        const profile = db
          .prepare("SELECT shop_id FROM profiles WHERE id = ?")
          .get(userId) as { shop_id?: string } | undefined;
        if (profile?.shop_id) {
          rows = db
            .prepare("SELECT id FROM shops WHERE id = ? OR created_by = ?")
            .all(profile.shop_id, userId) as { id: string }[];
        } else {
          rows = db
            .prepare("SELECT id FROM shops WHERE created_by = ?")
            .all(userId) as { id: string }[];
        }
      } else {
        rows = db
          .prepare(`SELECT id FROM ${table} WHERE created_by = ?`)
          .all(userId) as { id: string }[];
      }
    } catch {
      continue;
    }
    for (const row of rows) {
      enqueueSync(userId, table, row.id, "upsert");
      count++;
    }
  }
  return count;
}

export function getSyncStatusPayload(userId: string): {
  status: SyncStatus;
  lastBackupAt: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  pendingChanges: number;
  lastError: string | null;
  tables: string[];
} {
  const state = getSyncState(userId);
  return {
    status: state.status,
    lastBackupAt: state.last_backup_at,
    lastPulledAt: state.last_pulled_at,
    lastPushedAt: state.last_pushed_at,
    pendingChanges: getPendingCount(userId),
    lastError: state.last_error,
    tables: [...SYNCABLE_TABLES],
  };
}

// ---------------------------------------------------------------------------
// PAYMENTS / EXPENSES (sync-ready; UI can adopt later)
// ---------------------------------------------------------------------------
export function createPayment(data: {
  id?: string; shop_id?: string; order_id?: string; amount: number;
  method?: string; notes?: string; created_by: string; updated_by?: string;
}): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  const shopId = ensureShop(data.shop_id, data.created_by);
  db.prepare(`
    INSERT INTO payments (id, shop_id, order_id, amount, method, notes, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, shopId, data.order_id || null, data.amount || 0,
    data.method || "", data.notes || "",
    data.created_by, data.updated_by || data.created_by, now, now
  );
  enqueueSync(data.created_by, "payments", id, "upsert");
  return db.prepare("SELECT * FROM payments WHERE id = ?").get(id);
}

export function deletePayment(id: string, createdBy: string): boolean {
  const ok = db.prepare("DELETE FROM payments WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
  if (ok) enqueueSync(createdBy, "payments", id, "delete");
  return ok;
}

export function createExpense(data: {
  id?: string; shop_id?: string; category?: string; description?: string;
  amount: number; expense_date?: string; created_by: string; updated_by?: string;
}): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  const shopId = ensureShop(data.shop_id, data.created_by);
  db.prepare(`
    INSERT INTO expenses (id, shop_id, category, description, amount, expense_date, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, shopId, data.category || "", data.description || "",
    data.amount || 0, data.expense_date || null,
    data.created_by, data.updated_by || data.created_by, now, now
  );
  enqueueSync(data.created_by, "expenses", id, "upsert");
  return db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
}

export function deleteExpense(id: string, createdBy: string): boolean {
  const ok = db.prepare("DELETE FROM expenses WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
  if (ok) enqueueSync(createdBy, "expenses", id, "delete");
  return ok;
}

// ---------------------------------------------------------------------------
// BACKUP / RESTORE HELPERS
// ---------------------------------------------------------------------------
export function exportBackup(createdBy: string): Record<string, any[]> {
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(createdBy) as { shop_id?: string } | undefined;
  const shopId = profile?.shop_id || null;
  return {
    shops: shopId
      ? db.prepare("SELECT * FROM shops WHERE id = ? OR created_by = ?").all(shopId, createdBy)
      : db.prepare("SELECT * FROM shops WHERE created_by = ?").all(createdBy),
    profiles: db.prepare("SELECT * FROM profiles WHERE id = ? OR created_by = ?").all(createdBy, createdBy),
    customers: db.prepare("SELECT * FROM customers WHERE created_by = ?").all(createdBy),
    measurements: db.prepare("SELECT * FROM measurements WHERE created_by = ?").all(createdBy),
    orders: db.prepare("SELECT * FROM orders WHERE created_by = ?").all(createdBy),
    payments: db.prepare("SELECT * FROM payments WHERE created_by = ?").all(createdBy),
    expenses: db.prepare("SELECT * FROM expenses WHERE created_by = ?").all(createdBy),
    shop_settings: db.prepare("SELECT * FROM shop_settings WHERE user_id = ? OR key LIKE ?").all(createdBy, `${createdBy}:%`),
    garment_types: db.prepare("SELECT * FROM garment_types WHERE created_by = ?").all(createdBy),
    styling_categories: db.prepare("SELECT * FROM styling_categories WHERE created_by = ?").all(createdBy),
  };
}

/**
 * Full-replace restore: clears this shop's business tables, then inserts backup rows.
 * Account profile for the signed-in user is preserved; shop settings/data are replaced.
 */
export function importBackup(data: Record<string, any[]>, targetUserId: string): { imported: number } {
  const ALLOWED = new Set([
    "shops",
    "customers",
    "measurements",
    "orders",
    "payments",
    "expenses",
    "shop_settings",
    "garment_types",
    "styling_categories",
  ]);
  const TABLE_ORDER = [
    "shops",
    "customers",
    "measurements",
    "garment_types",
    "styling_categories",
    "orders",
    "payments",
    "expenses",
    "shop_settings",
  ];

  let imported = 0;
  const now = nowISO();
  const errors: string[] = [];

  const transaction = db.transaction(() => {
    // Child tables first so FK cleanup succeeds
    db.prepare("DELETE FROM payments WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM expenses WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM orders WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM measurements WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM customers WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM garment_types WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM styling_categories WHERE created_by = ?").run(targetUserId);
    db.prepare("DELETE FROM shop_settings WHERE user_id = ? OR key LIKE ?").run(targetUserId, `${targetUserId}:%`);

    for (const table of TABLE_ORDER) {
      const rows = data[table];
      if (!Array.isArray(rows) || !ALLOWED.has(table)) continue;
      for (const row of rows) {
        try {
          if (!row || typeof row !== "object" || !row.id) {
            throw new Error("row missing id");
          }
          const keys = Object.keys(row).filter((k) => k !== "sync_status");
          const vals = keys.map((k) => {
            if (k === "created_at" || k === "updated_at") return row[k] || now;
            if (k === "updated_by") return row[k] || targetUserId;
            if (k === "created_by") return targetUserId;
            if (k === "user_id" && table === "shop_settings") return targetUserId;
            if (k === "shop_id" && !row[k]) return null;
            if (typeof row[k] === "object" && row[k] !== null) return JSON.stringify(row[k]);
            return row[k];
          });
          const placeholders = keys.map(() => "?").join(", ");
          db.prepare(
            `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`
          ).run(...vals);
          imported++;
        } catch (err: any) {
          errors.push(`${table}/${row?.id || "?"}: ${err?.message || String(err)}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Restore incomplete (${errors.length} row error(s)). First: ${errors[0]}`);
    }
  });

  transaction();
  // Local restore is source of truth — queue a full cloud push for next online sync.
  try {
    enqueueFullSnapshot(targetUserId);
  } catch {
    /* sync optional */
  }
  return { imported };
}

// ---------------------------------------------------------------------------
// INVENTORY HELPERS
// ---------------------------------------------------------------------------
export function getInventory(createdBy: string): any[] {
  return db.prepare("SELECT * FROM inventory WHERE created_by = ? ORDER BY name ASC").all(createdBy);
}

export function createInventoryItem(data: any): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  db.prepare(`
    INSERT INTO inventory (id, name, quantity, price, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.quantity || 0, data.price || 0,
    data.created_by, data.updated_by || data.created_by, now, now);
  return db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
}

export function updateInventoryItem(id: string, createdBy: string, data: any): any {
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of ["name", "quantity", "price", "updated_by"]) {
    if (data[key] !== undefined) { sets.push(`${key} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return db.prepare("SELECT * FROM inventory WHERE id = ? AND created_by = ?").get(id, createdBy);
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  db.prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  return db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
}

export function deleteInventoryItem(id: string, createdBy: string): boolean {
  return db.prepare("DELETE FROM inventory WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
}

// ---------------------------------------------------------------------------
// OWNER UNLOCK VERIFIER (local-only)
// ---------------------------------------------------------------------------
export function setOwnerUnlockVerifier(userId: string, password: string): void {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  db.prepare(`
    INSERT INTO owner_unlock_verifier (user_id, salt, hash, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, updated_at = excluded.updated_at
  `).run(userId, salt, hash, nowISO());
}

export function hasOwnerUnlockVerifier(userId: string): boolean {
  const row = db.prepare("SELECT 1 AS ok FROM owner_unlock_verifier WHERE user_id = ?").get(userId) as { ok: number } | undefined;
  return !!row;
}

export function verifyOwnerUnlockPassword(userId: string, password: string): boolean {
  const row = db.prepare(
    "SELECT salt, hash FROM owner_unlock_verifier WHERE user_id = ?"
  ).get(userId) as { salt: string; hash: string } | undefined;
  if (!row) return false;
  try {
    const computed = scryptSync(password, row.salt, 64);
    const expected = Buffer.from(row.hash, "hex");
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

export function clearOwnerUnlockVerifier(userId: string): void {
  db.prepare("DELETE FROM owner_unlock_verifier WHERE user_id = ?").run(userId);
}

// ---------------------------------------------------------------------------
// LOCAL DEVICE SESSIONS
// ---------------------------------------------------------------------------
const DEVICE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const DEVICE_SESSION_PREFIX = "hddev_";

function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isDeviceSessionToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(DEVICE_SESSION_PREFIX);
}

/** Mint an opaque local session token. Returns the raw token (store only the hash). */
export function createDeviceSession(userId: string): { token: string; expiresAt: string } {
  const raw = DEVICE_SESSION_PREFIX + randomBytes(32).toString("hex");
  const tokenHash = hashDeviceToken(raw);
  const now = Date.now();
  const expiresAt = new Date(now + DEVICE_SESSION_TTL_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  db.prepare(`
    INSERT INTO device_sessions (token_hash, user_id, created_at, expires_at, last_used_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenHash, userId, nowIso, expiresAt, nowIso);
  return { token: raw, expiresAt };
}

export function validateDeviceSession(token: string): { userId: string; expiresAt: string } | null {
  if (!isDeviceSessionToken(token)) return null;
  const tokenHash = hashDeviceToken(token);
  const row = db.prepare(
    "SELECT user_id, expires_at FROM device_sessions WHERE token_hash = ?"
  ).get(tokenHash) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM device_sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  // Sliding activity window
  const newExpires = new Date(Date.now() + DEVICE_SESSION_TTL_MS).toISOString();
  db.prepare(
    "UPDATE device_sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?"
  ).run(nowISO(), newExpires, tokenHash);
  return { userId: row.user_id, expiresAt: newExpires };
}

export function revokeDeviceSession(token: string): void {
  if (!isDeviceSessionToken(token)) return;
  db.prepare("DELETE FROM device_sessions WHERE token_hash = ?").run(hashDeviceToken(token));
}

export function revokeDeviceSessionsForUser(userId: string): void {
  db.prepare("DELETE FROM device_sessions WHERE user_id = ?").run(userId);
}
