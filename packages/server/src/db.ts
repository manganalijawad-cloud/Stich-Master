import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

let Database: any;
try {
  // Non-literal string prevents bundlers (esbuild) from resolving at compile time
  // This module is only used in Electron mode with the local SQLite database
  Database = require("better-" + "sqlite3");
} catch {
  // better-sqlite3 native module not available (e.g., Vercel serverless)
}

export let db: any;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
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
  whatsapp TEXT DEFAULT '',
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
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Cutting','Stitching','Fitting','Ready','Ready to Deliver','Delivered','Archived')),
  items TEXT NOT NULL DEFAULT '[]',
  total_amount REAL NOT NULL DEFAULT 0,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT REFERENCES shops(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
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

-- Sync tracking
CREATE TABLE IF NOT EXISTS sync_metadata (
  table_name TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  last_push_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','failed'))
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
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
`;

export function initDatabase(dbPath?: string): void {
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

  seedSyncMetadata();
}

function seedSyncMetadata(): void {
  const tables = [
    "customers", "measurements", "orders", "shop_settings",
    "profiles", "shops", "inventory", "garment_types", "styling_categories"
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO sync_metadata (table_name) VALUES (?)"
  );
  for (const t of tables) {
    insert.run(t);
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
  whatsapp?: string; address?: string; email?: string; notes?: string;
  created_by: string; updated_by?: string;
  created_at: string; updated_at: string;
}

export function getCustomers(createdBy: string, search?: string, shopId?: string): DbCustomer[] {
  let sql = "SELECT * FROM customers WHERE created_by = ?";
  const params: any[] = [createdBy];
  if (search) {
    sql += " AND (name LIKE ? OR phone LIKE ? OR whatsapp LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q);
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

export function createCustomer(data: {
  id?: string; shop_id?: string; name: string; phone?: string;
  whatsapp?: string; address?: string; email?: string; notes?: string;
  created_by: string; updated_by?: string;
}): DbCustomer {
  const id = data.id || uuidv4();
  const now = nowISO();
  db.prepare(`
    INSERT INTO customers (id, shop_id, name, phone, whatsapp, address, email, notes, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.shop_id || null, data.name, data.phone || null,
    data.whatsapp || null, data.address || null, data.email || null,
    data.notes || null, data.created_by, data.updated_by || data.created_by, now, now
  );
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as DbCustomer;
}

export function updateCustomer(id: string, createdBy: string, data: Partial<DbCustomer>): DbCustomer | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  const allowed = ["name", "phone", "whatsapp", "address", "email", "notes", "shop_id", "updated_by"];
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
  return getCustomerById(id, createdBy);
}

export function deleteCustomer(id: string, createdBy: string): boolean {
  const customer = getCustomerById(id, createdBy);
  if (!customer) return false;
  db.prepare("DELETE FROM measurements WHERE customer_id = ? AND created_by = ?").run(id, createdBy);
  db.prepare("DELETE FROM customers WHERE id = ? AND created_by = ?").run(id, createdBy);
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

export function upsertMeasurement(customerId: string, createdBy: string, measurementData: Record<string, any>, updatedBy?: string): DbMeasurement {
  const existing = db.prepare(
    "SELECT * FROM measurements WHERE customer_id = ? AND created_by = ? LIMIT 1"
  ).get(customerId, createdBy) as DbMeasurement | undefined;

  const now = nowISO();
  if (existing) {
    db.prepare("UPDATE measurements SET data = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(measurementData), updatedBy || createdBy, now, existing.id
    );
    return db.prepare("SELECT * FROM measurements WHERE id = ?").get(existing.id) as DbMeasurement;
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO measurements (id, customer_id, data, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, customerId, JSON.stringify(measurementData), createdBy, updatedBy || createdBy, now, now);
    return db.prepare("SELECT * FROM measurements WHERE id = ?").get(id) as DbMeasurement;
  }
}

// ---------------------------------------------------------------------------
// ORDER HELPERS
// ---------------------------------------------------------------------------
export interface DbOrder {
  id: string; shop_id?: string; order_number: string;
  customer_id: string; status: string;
  items: string; total_amount: number; paid_amount: number;
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
  total_amount?: number; paid_amount?: number; due_date?: string;
  measurement_snapshot?: any; created_by: string; updated_by?: string;
}): DbOrder {
  const id = data.id || uuidv4();
  const now = nowISO();
  db.prepare(`
    INSERT INTO orders (id, shop_id, order_number, customer_id, status, items, total_amount, paid_amount, due_date, measurement_snapshot, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.shop_id || null, data.order_number, data.customer_id,
    data.status || "Pending", JSON.stringify(data.items || []),
    data.total_amount || 0, data.paid_amount || 0,
    data.due_date || null, JSON.stringify(data.measurement_snapshot || {}),
    data.created_by, data.updated_by || data.created_by, now, now
  );
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as DbOrder;
}

export function updateOrder(id: string, createdBy: string, data: Partial<DbOrder>): DbOrder | undefined {
  const sets: string[] = [];
  const params: any[] = [];
  const allowed = ["status", "items", "total_amount", "paid_amount", "due_date", "measurement_snapshot", "delivered_at", "updated_by", "shop_id", "order_number", "customer_id"];
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
  return getOrderById(id, createdBy);
}

export function deleteOrder(id: string, createdBy: string): boolean {
  const result = db.prepare("DELETE FROM orders WHERE id = ? AND created_by = ?").run(id, createdBy);
  return result.changes > 0;
}

export function archiveOrders(createdBy: string, beforeDate?: string, status?: string): number {
  let sql = "UPDATE orders SET status = 'Archived', updated_at = ? WHERE created_by = ? AND status NOT IN ('Archived','Delivered')";
  const params: any[] = [nowISO(), createdBy];
  if (beforeDate) {
    sql += " AND created_at < ?";
    params.push(beforeDate);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  const result = db.prepare(sql).run(...params);
  return result.changes;
}

// ---------------------------------------------------------------------------
// DASHBOARD / REPORT HELPERS
// ---------------------------------------------------------------------------
export function getDashboardStats(createdBy: string, shopId?: string): {
  totalCustomers: number; totalOrders: number; activeOrders: number;
  deliveredOrders: number; pendingAmount: number; revenue: number;
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

  const revenueRow = db.prepare(
    `SELECT COALESCE(SUM(paid_amount), 0) as rev FROM orders WHERE created_by = ? AND status = 'Delivered'${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { rev: number };

  const pendingRow = db.prepare(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as pend FROM orders WHERE created_by = ? AND status NOT IN ('Archived','Delivered')${shopId ? " AND shop_id = ?" : ""}`
  ).get(...params) as { pend: number };

  return {
    totalCustomers: customerCount,
    totalOrders,
    activeOrders,
    deliveredOrders,
    pendingAmount: pendingRow.pend,
    revenue: revenueRow.rev,
  };
}

export function getFinancialReport(createdBy: string, fromDate?: string, toDate?: string, shopId?: string): {
  revenue: number; collected: number; pending: number; orderCount: number;
  chartData: { label: string; revenue: number; collected: number }[];
} {
  let params: any[] = [createdBy];
  let dateFilter = "";
  if (fromDate) { dateFilter += " AND o.created_at >= ?"; params.push(fromDate); }
  if (toDate) { dateFilter += " AND o.created_at <= ?"; params.push(toDate); }
  const shopFilter = shopId ? " AND o.shop_id = ?" : "";
  if (shopId) params.push(shopId);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(o.total_amount), 0) as rev, COALESCE(SUM(o.paid_amount), 0) as col,
           COUNT(*) as cnt FROM orders o WHERE o.created_by = ?${dateFilter}${shopFilter}
  `).get(...params) as { rev: number; col: number; cnt: number };

  const pending = db.prepare(`
    SELECT COALESCE(SUM(o.total_amount - o.paid_amount), 0) as pend FROM orders o
    WHERE o.created_by = ? AND o.status NOT IN ('Archived','Delivered')${dateFilter}${shopFilter}
  `).get(...params) as { pend: number };

  const chartRows = db.prepare(`
    SELECT SUBSTR(o.created_at, 1, 7) as label,
           COALESCE(SUM(o.total_amount), 0) as revenue,
           COALESCE(SUM(o.paid_amount), 0) as collected
    FROM orders o WHERE o.created_by = ?${dateFilter}${shopFilter}
    GROUP BY label ORDER BY label ASC
  `).all(...params) as { label: string; revenue: number; collected: number }[];

  return {
    revenue: totals.rev,
    collected: totals.col,
    pending: pending.pend,
    orderCount: totals.cnt,
    chartData: chartRows,
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
  if (existing) {
    db.prepare("UPDATE profiles SET email = ?, name = COALESCE(?, name), role = COALESCE(?, role), shop_id = COALESCE(?, shop_id), updated_at = ? WHERE id = ?").run(
      profile.email, profile.name || null, profile.role || null, profile.shop_id || null, now, profile.id
    );
  } else {
    db.prepare("INSERT INTO profiles (id, email, name, role, shop_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      profile.id, profile.email, profile.name || profile.email, profile.role || "Owner",
      profile.shop_id || null, profile.created_by || profile.id, now, now
    );
  }
}

export function getProfilesByOwner(ownerId: string): any[] {
  return db.prepare("SELECT id, email, name, role, shop_id, created_at FROM profiles WHERE created_by = ? ORDER BY created_at DESC").all(ownerId);
}

export function deleteProfile(userId: string): boolean {
  return db.prepare("DELETE FROM profiles WHERE id = ?").run(userId).changes > 0;
}

// ---------------------------------------------------------------------------
// SHOP HELPERS
// ---------------------------------------------------------------------------
export function createShop(name: string, createdBy: string): { id: string; name: string } {
  const id = uuidv4();
  const now = nowISO();
  db.prepare("INSERT INTO shops (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, name, createdBy, now, now);
  return { id, name };
}

export function getShop(shopId: string): { id: string; name: string } | undefined {
  return db.prepare("SELECT id, name FROM shops WHERE id = ?").get(shopId) as any | undefined;
}

// ---------------------------------------------------------------------------
// SETTINGS HELPERS
// ---------------------------------------------------------------------------
export function getSettings(userId: string): Record<string, any> {
  const rows = db.prepare("SELECT key, value FROM shop_settings WHERE user_id = ? OR key LIKE ?").all(
    userId, `${userId}:%`
  ) as { key: string; value: string }[];
  const result: Record<string, any> = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
}

export function saveSetting(key: string, value: any, userId: string, updatedBy?: string): void {
  const now = nowISO();
  const strVal = typeof value === "string" ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO shop_settings (key, value, user_id, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(key, strVal, userId, now, updatedBy || userId);
}

// ---------------------------------------------------------------------------
// GARMENT TYPE HELPERS
// ---------------------------------------------------------------------------
export function getGarmentTypes(createdBy: string, shopId?: string): any[] {
  let sql = "SELECT * FROM garment_types WHERE created_by = ?";
  const params: any[] = [createdBy];
  if (shopId) { sql += " AND shop_id = ?"; params.push(shopId); }
  sql += " ORDER BY display_order ASC, name ASC";
  return db.prepare(sql).all(...params);
}

export function createGarmentType(data: any): any {
  const id = data.id || uuidv4();
  const now = nowISO();
  db.prepare(`
    INSERT INTO garment_types (id, shop_id, name, enabled, display_order, price, measurement_fields, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.shop_id || null, data.name, data.enabled !== false ? 1 : 0,
    data.display_order || 0, data.price || 0,
    JSON.stringify(data.measurement_fields || []),
    data.created_by, data.updated_by || data.created_by, now, now);
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
  if (sets.length === 0) return db.prepare("SELECT * FROM garment_types WHERE id = ? AND created_by = ?").get(id, createdBy);
  sets.push("updated_at = ?");
  params.push(nowISO());
  params.push(id, createdBy);
  db.prepare(`UPDATE garment_types SET ${sets.join(", ")} WHERE id = ? AND created_by = ?`).run(...params);
  return db.prepare("SELECT * FROM garment_types WHERE id = ?").get(id);
}

export function deleteGarmentType(id: string, createdBy: string): boolean {
  db.prepare("DELETE FROM styling_categories WHERE garment_type_id = ?").run(id);
  return db.prepare("DELETE FROM garment_types WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
}

export function reorderGarmentTypes(ids: string[], createdBy: string): void {
  const update = db.prepare("UPDATE garment_types SET display_order = ?, updated_at = ? WHERE id = ? AND created_by = ?");
  const now = nowISO();
  for (let i = 0; i < ids.length; i++) {
    update.run(i, now, ids[i], createdBy);
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
  return db.prepare("SELECT * FROM styling_categories WHERE id = ?").get(id);
}

export function deleteStylingCategory(id: string, createdBy: string): boolean {
  return db.prepare("DELETE FROM styling_categories WHERE id = ? AND created_by = ?").run(id, createdBy).changes > 0;
}

export function reorderStylingCategories(ids: string[], createdBy: string): void {
  const update = db.prepare("UPDATE styling_categories SET display_order = ?, updated_at = ? WHERE id = ? AND created_by = ?");
  const now = nowISO();
  for (let i = 0; i < ids.length; i++) {
    update.run(i, now, ids[i], createdBy);
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
      recordId: extra?.recordId || details.record_id || '',
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
    shopId || null,
    userId,
    userEmail,
    extra?.userName || details.user_name || '',
    extra?.userRole || details.user_role || '',
    action,
    extra?.module || details.module || '',
    extra?.recordId || details.record_id || '',
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
  search?: string;
  fromDate?: string;
  toDate?: string;
  actionFilter?: string;
  moduleFilter?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}): { data: any[]; total: number } {
  const { userId, search, fromDate, toDate, actionFilter, moduleFilter, sort = 'newest', page = 1, limit = 50 } = options;
  const conditions: string[] = [];
  const params: any[] = [];

  if (userId) {
    conditions.push("user_id = ?");
    params.push(userId);
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
// BACKUP / RESTORE HELPERS
// ---------------------------------------------------------------------------
export function exportBackup(createdBy: string): Record<string, any[]> {
  return {
    profiles: db.prepare("SELECT * FROM profiles WHERE id = ? OR created_by = ?").all(createdBy, createdBy),
    customers: db.prepare("SELECT * FROM customers WHERE created_by = ?").all(createdBy),
    measurements: db.prepare("SELECT * FROM measurements WHERE created_by = ?").all(createdBy),
    orders: db.prepare("SELECT * FROM orders WHERE created_by = ?").all(createdBy),
    shop_settings: db.prepare("SELECT * FROM shop_settings WHERE user_id = ? OR key LIKE ?").all(createdBy, `${createdBy}:%`),
    garment_types: db.prepare("SELECT * FROM garment_types WHERE created_by = ?").all(createdBy),
    styling_categories: db.prepare("SELECT * FROM styling_categories WHERE created_by = ?").all(createdBy),
  };
}

export function importBackup(data: Record<string, any[]>, targetUserId: string): { imported: number } {
  let imported = 0;
  const now = nowISO();
  const transaction = db.transaction(() => {
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        try {
          const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(row.id);
          if (existing) continue;
          const keys = Object.keys(row).filter(k => k !== "sync_status");
          const vals = keys.map(k => {
            if (k === "created_at" || k === "updated_at") return row[k] || now;
            if (k === "updated_by") return row[k] || targetUserId;
            if (k === "created_by") return targetUserId;
            if (k === "shop_id" && !row[k]) return null;
            if (typeof row[k] === "object") return JSON.stringify(row[k]);
            return row[k];
          });
          const placeholders = keys.map(() => "?").join(", ");
          db.prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`).run(...vals);
          imported++;
        } catch {}
      }
    }
  });
  transaction();
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
