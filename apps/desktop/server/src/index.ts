/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import {
  DEFAULT_SHOP_SETTINGS,
} from "@hello-darzi/shared";

import * as db from "./db";
import { isSupabaseAuthConfigured, verifySupabaseAccessToken } from "./auth/supabaseJwt";
import { startBackupScheduler, getAutoBackupsDir } from "./backupScheduler";
import { isCloudSyncConfigured, runCloudSync, markSyncOffline } from "./sync";

// Load .env from packaged resources, repo root (dev), and cwd.
// Electron main process usually injects Auth env first; this is a fallback.
try {
  const candidates: string[] = [
    path.resolve(process.cwd(), ".env"),
  ];
  if (process.env.ELECTRON_RESOURCES_PATH) {
    candidates.unshift(path.join(process.env.ELECTRON_RESOURCES_PATH, ".env"));
  }
  try {
    // Prefer CJS __filename (packaged server.cjs); fall back to import.meta in ESM/tsx.
    const here =
      typeof __filename === "string" && __filename
        ? path.dirname(__filename)
        : path.dirname(fileURLToPath(import.meta.url));
    candidates.unshift(path.resolve(here, "../../../../.env"));
    candidates.unshift(path.resolve(here, "../../../.env"));
  } catch {
    /* path resolution failed — dotenv still tries cwd below */
  }
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      break;
    }
  }
  dotenv.config();
} catch {
  try {
    dotenv.config();
  } catch {}
}

const app = express();
const PORT = 3000;

app.use(express.json());

/** Returns true if status matches a configured pipeline stage id (enabled or not). */
function isConfiguredPipelineStatus(settingsMap: Record<string, any>, status: string): boolean {
  const stages = settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages;
  if (!Array.isArray(stages)) return false;
  return stages.some((s: any) => s && String(s.id) === String(status));
}

async function loadPipelineSettingsForUser(req: AuthenticatedRequest): Promise<Record<string, any>> {
  return db.getSettings(req.user!.id);
}

// -------------------------------------------------------------------------
// BACKEND SECURITY MIDDLEWARE & ROLE AUTHORIZATION
// -------------------------------------------------------------------------
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: "Owner" | "Worker";
    shop_id: string;
  };
  token?: string;
}

const authCache = new Map<string, { profile: AuthenticatedRequest["user"]; expiresAt: number }>();
/** Owner mode grants keyed by userId (survives session refresh). */
const ownerModeCache = new Map<string, number>();
const OWNER_MODE_TTL_MS = 15 * 60 * 1000; // inactivity window (aligned with client idle timeout)
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;

function toAuthUser(profile: {
  id: string;
  email: string;
  name?: string;
  role?: string;
  shop_id?: string | null;
}): NonNullable<AuthenticatedRequest["user"]> {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || profile.email,
    role: (profile.role === "Worker" ? "Worker" : "Owner"),
    shop_id: profile.shop_id || "default-shop",
  };
}

function cacheAuthUser(token: string, profile: NonNullable<AuthenticatedRequest["user"]>): void {
  authCache.set(token, { profile, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

function grantOwnerMode(userId: string) {
  ownerModeCache.set(userId, Date.now() + OWNER_MODE_TTL_MS);
}

function touchOwnerMode(userId: string) {
  // Sliding expiration: Owner API activity counts as activity
  if (ownerModeCache.has(userId)) {
    ownerModeCache.set(userId, Date.now() + OWNER_MODE_TTL_MS);
  }
}

function revokeOwnerMode(userId: string) {
  ownerModeCache.delete(userId);
}

function isOwnerModeActive(userId: string): boolean {
  const expiresAt = ownerModeCache.get(userId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    ownerModeCache.delete(userId);
    return false;
  }
  return true;
}

function requireOwnerMode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.id || !isOwnerModeActive(req.user.id)) {
    return res.status(403).json({
      error: "Owner mode required. Unlock Owner mode with your password to continue.",
    });
  }
  touchOwnerMode(req.user.id);
  next();
}

/** Supabase JWT or local opaque device session (hddev_) for multi-day offline API access. */
function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized. Missing authentication token." });
      }
      const token = authHeader.split(" ")[1];

      const cached = authCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        req.user = cached.profile;
        req.token = token;
        if (req.user?.id && isOwnerModeActive(req.user.id)) touchOwnerMode(req.user.id);
        return next();
      }

      // Local device sessions survive JWT expiry without network.
      if (db.isDeviceSessionToken(token)) {
        const session = db.validateDeviceSession(token);
        if (!session) {
          authCache.delete(token);
          return res.status(401).json({
            error: "Device session expired. Reconnect to the internet and sign in again.",
          });
        }
        const profile = db.getProfile(session.userId);
        if (!profile) {
          return res.status(401).json({ error: "Account not found on this device. Sign in again to set up." });
        }
        const user = toAuthUser(profile);
        req.user = user;
        req.token = token;
        cacheAuthUser(token, user);
        if (isOwnerModeActive(user.id)) touchOwnerMode(user.id);
        return next();
      }

      const claims = await verifySupabaseAccessToken(token);
      if (!claims?.sub) {
        authCache.delete(token);
        return res.status(401).json({ error: "Session expired or invalid token. Please sign in again." });
      }

      const profile = db.getProfile(claims.sub);
      if (!profile) {
        // Allow ensure-profile to create the local mapping; other routes need a profile.
        const urlPath = (req.originalUrl || req.url || req.path || "").split("?")[0];
        if (urlPath.endsWith("/auth/ensure-profile")) {
          req.user = {
            id: claims.sub,
            email: claims.email || "",
            name: claims.email || "User",
            role: "Owner",
            shop_id: "default-shop",
          };
          req.token = token;
          return next();
        }
        return res.status(401).json({ error: "Account not found on this device. Sign in again to set up." });
      }

      const user = toAuthUser({
        ...profile,
        email: claims.email || profile.email,
      });
      req.user = user;
      req.token = token;
      cacheAuthUser(token, user);
      if (isOwnerModeActive(user.id)) touchOwnerMode(user.id);
      return next();
    } catch {
      return res.status(401).json({ error: "Authentication failed. Please sign in again." });
    }
  })();
}

function requireRole(roles: Array<"Owner" | "Worker">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions. Owner access required for this operation." });
    }
    next();
  };
}

// -------------------------------------------------------------------------
// LOGGER UTILITY
// -------------------------------------------------------------------------
const ACTION_MODULE_MAP: Record<string, string> = {
  USER_LOGIN: "Auth",
  ACCOUNT_SETUP: "Auth",
  ROLE_SWITCH_VERIFICATION_SUCCESS: "Auth",
  CREATE_CUSTOMER: "Customers",
  GET_EXISTING_CUSTOMER_DUPLICATE: "Customers",
  CREATE_ORDER: "Orders",
  EDIT_ORDER: "Orders",
  DELETE_ORDER: "Orders",
  UPDATE_ORDER_STATUS: "Orders",
  DELIVERY_COMPLETED: "Orders",
  ARCHIVE_ORDERS: "Orders",
  PAYMENT_RECEIVED: "Payments",
  REFUND: "Payments",
  UPDATE_MEASUREMENTS: "Measurements",
  CREATE_MEASUREMENTS: "Measurements",
  CREATE_WORKER: "Staff",
  DELETE_WORKER: "Staff",
  UPDATE_SETTINGS: "Settings",
  CREATE_GARMENT_TYPE: "Garment Types",
  UPDATE_GARMENT_TYPE: "Garment Types",
  DELETE_GARMENT_TYPE: "Garment Types",
  REORDER_GARMENT_TYPES: "Garment Types",
  CREATE_STYLING_CATEGORY: "Styling",
  UPDATE_STYLING_CATEGORY: "Styling",
  DELETE_STYLING_CATEGORY: "Styling",
  REORDER_STYLING_CATEGORIES: "Styling",
  SYSTEM_BACKUP: "System",
  SYSTEM_RESTORE: "System",
};

function getModuleFromAction(action: string): string {
  return ACTION_MODULE_MAP[action] || "General";
}

// -------------------------------------------------------------------------
// AUTHENTICATION API ENDPOINTS (Supabase Auth + local profile mapping)
// -------------------------------------------------------------------------

app.get("/api/config-status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    localDb: true,
    supabaseAuth: isSupabaseAuthConfigured(),
  });
});

function profileResponse(
  user: NonNullable<AuthenticatedRequest["user"]>,
  shopName?: string | null
) {
  const displayName = (shopName || user.name || user.email || "").trim();
  return {
    id: user.id,
    email: user.email,
    name: displayName,
    shop_name: displayName,
    role: user.role,
    shop_id: user.shop_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subscription_status: "active" as const,
  };
}

function normalizeEmail(email: string | undefined | null): string {
  return (email || "").trim().toLowerCase();
}

/** Placeholder / pre-cloud local emails that are safe to claim on first Supabase link. */
function isClaimableLegacyEmail(email: string | undefined | null): boolean {
  const e = normalizeEmail(email);
  return !e || e.endsWith("@users.local") || e.endsWith("@local");
}

/**
 * After Supabase Auth succeeds, ensure a local profile/shop exists for business data.
 * Auth credentials never touch SQLite — only the identity → shop mapping.
 */
app.post("/api/auth/ensure-profile", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const supabaseUserId = req.user!.id;
  const email = (req.user!.email || "").trim();
  const shopNameInput = typeof req.body?.shopName === "string" ? req.body.shopName.trim() : "";

  try {
    let profile = db.getProfile(supabaseUserId);

    // One-time migrate a single pre-Supabase local owner onto this Auth user.
    // Never re-bind an existing shop to a *different* Auth account — that made
    // every new sign-in inherit the previous shop on this device.
    if (!profile) {
      const all = db.listAllProfiles();
      if (all.length === 1) {
        const legacyOwner = all[0];
        if (legacyOwner && legacyOwner.id !== supabaseUserId) {
          const samePerson =
            !!normalizeEmail(email) &&
            normalizeEmail(legacyOwner.email) === normalizeEmail(email);
          const claimablePlaceholder = isClaimableLegacyEmail(legacyOwner.email);
          if (samePerson || claimablePlaceholder) {
            db.rekeyProfileOwnership(legacyOwner.id, supabaseUserId, email || legacyOwner.email);
            profile = db.getProfile(supabaseUserId);
          }
        }
      }
    }

    if (!profile) {
      if (!shopNameInput) {
        return res.json({ needsShopSetup: true });
      }
      const shop = db.createShop(shopNameInput, supabaseUserId);
      db.upsertProfile({
        id: supabaseUserId,
        email: email || `${supabaseUserId}@users.local`,
        name: shopNameInput,
        role: "Owner",
        shop_id: shop.id,
        created_by: supabaseUserId,
      });
      // Persist to shop_settings so bootstrap/sidebar pick up the name immediately
      // (GET /api/settings already falls back to shops.shop_name; bootstrap did not).
      db.saveSetting("shop_name", shopNameInput, supabaseUserId, supabaseUserId);
      profile = db.getProfile(supabaseUserId);
      db.logAction("ACCOUNT_SETUP", supabaseUserId, email, shop.id, { shop_name: shopNameInput });
    } else if (email && email !== profile.email) {
      db.upsertProfile({
        id: profile.id,
        email,
        name: profile.name,
        role: profile.role,
        shop_id: profile.shop_id,
        created_by: profile.id,
      });
      profile = db.getProfile(supabaseUserId) || profile;
    }

    if (!profile) {
      return res.status(500).json({ error: "Failed to create local profile." });
    }

    // Prefer Auth email + shop display name so a prior rekey cannot keep showing
    // an old person/shop label for the currently signed-in account.
    const shop = profile.shop_id ? db.getShop(profile.shop_id) : undefined;
    const shopName = shop?.shop_name || shop?.name || "";
    if (shopName && shopName !== profile.name) {
      db.upsertProfile({
        id: profile.id,
        email: email || profile.email,
        name: shopName,
        role: profile.role,
        shop_id: profile.shop_id,
        created_by: profile.id,
      });
      profile = db.getProfile(supabaseUserId) || profile;
    }

    const user = toAuthUser({
      ...profile,
      email: email || profile.email,
      name: shopName || profile.name,
    });
    if (req.token) cacheAuthUser(req.token, user);

    return res.json({
      success: true,
      user: profileResponse(user, shopName || user.name),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to ensure local profile." });
  }
});

app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// Owner Protection: Verify account password against the local unlock verifier.
app.post("/api/auth/verify-password", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password is required." });
  }

  const profile = db.getProfile(req.user!.id);
  const role = profile?.role || req.user!.role;
  if (role && role !== "Owner") {
    return res.status(403).json({ error: "Permission denied. Stayed in Manager mode." });
  }
  if (!db.hasOwnerUnlockVerifier(req.user!.id)) {
    return res.status(401).json({
      error: "No password verifier is set up for this account yet. Sign in once with your password to enable Owner unlock.",
    });
  }
  if (!db.verifyOwnerUnlockPassword(req.user!.id, password)) {
    return res.status(401).json({ error: "Verification failed. Stayed in Manager mode." });
  }

  grantOwnerMode(req.user!.id);
  db.logAction("ROLE_SWITCH_VERIFICATION_SUCCESS", req.user!.id, req.user!.email, req.user!.shop_id, {});
  return res.json({ success: true });
});

// Cache/refresh the salted password verifier used for Owner unlock.
app.post("/api/auth/store-unlock-verifier", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { password } = req.body;
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password is required." });
  }
  try {
    db.setOwnerUnlockVerifier(req.user!.id, password);
    return res.json({ success: true, stored: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to store unlock verifier." });
  }
});

app.post("/api/auth/exit-owner-mode", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.id) {
    revokeOwnerMode(req.user.id);
  }
  return res.json({ success: true });
});

/** Client heartbeat / sync: report whether Owner grant is live; refresh TTL if so. */
app.get("/api/auth/owner-mode", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const active = isOwnerModeActive(userId);
  if (active) touchOwnerMode(userId);
  return res.json({ active });
});

/**
 * Mint a local opaque device session after a valid Supabase JWT auth.
 * Used so APIs keep working offline after the access JWT expires.
 */
app.post("/api/auth/device-session", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.token || db.isDeviceSessionToken(req.token)) {
    return res.status(403).json({
      error: "Online sign-in required to create a device session.",
    });
  }
  try {
    db.revokeDeviceSessionsForUser(req.user!.id);
    const session = db.createDeviceSession(req.user!.id);
    return res.json({ token: session.token, expiresAt: session.expiresAt });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to create device session." });
  }
});

/** Revoke the current device token and/or all device sessions for this user. */
app.post("/api/auth/revoke-device-session", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const bodyToken = typeof req.body?.token === "string" ? req.body.token : null;
    if (bodyToken && db.isDeviceSessionToken(bodyToken)) {
      db.revokeDeviceSession(bodyToken);
    }
    if (req.token && db.isDeviceSessionToken(req.token)) {
      db.revokeDeviceSession(req.token);
    }
    if (req.body?.all) {
      db.revokeDeviceSessionsForUser(req.user!.id);
    }
    if (req.token) authCache.delete(req.token);
    if (bodyToken) authCache.delete(bodyToken);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to revoke device session." });
  }
});

// -------------------------------------------------------------------------
// OFFLINE BOOTSTRAP — single local read for instant UI hydrate
// -------------------------------------------------------------------------
function parseJsonColumn(val: unknown, fallback: unknown) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  if (typeof val !== "string") return fallback;
  try {
    let parsed: unknown = JSON.parse(val);
    // Some rows were double-encoded historically — unwrap once more.
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* keep first parse result */
      }
    }
    return parsed;
  } catch {
    return fallback;
  }
}

/** Ensure order.items is always a real array with object snapshots (never JSON strings). */
function normalizeOrderItems(items: unknown): any[] {
  const parsed = parseJsonColumn(items, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item: any) => {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      price: Number(item.price) || 0,
      measurement_snapshot: parseJsonColumn(item.measurement_snapshot, {}),
      styling_snapshot: parseJsonColumn(item.styling_snapshot, {}),
    };
  });
}

function normalizeGarmentTypeRow(row: any) {
  return {
    ...row,
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === "1",
    price: Number(row.price) || 0,
    measurement_fields: parseJsonColumn(row.measurement_fields, []),
  };
}

function normalizeStylingCategoryRow(row: any) {
  return {
    ...row,
    options: parseJsonColumn(row.options, []),
  };
}

function normalizeMeasurementRow(row: any) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    data: parseJsonColumn(row.data, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

function normalizeOrderRow(row: any, customer?: { name?: string; phone?: string; address?: string } | null) {
  return {
    ...row,
    items: normalizeOrderItems(row.items),
    measurement_snapshot: parseJsonColumn(row.measurement_snapshot, {}),
    total_amount: Number(row.total_amount) || 0,
    discount_value: Number(row.discount_value) || 0,
    discount_amount: Number(row.discount_amount) || 0,
    final_total: row.final_total != null ? Number(row.final_total) : Number(row.total_amount) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    customer_name: customer?.name || row.customer_name || "Unknown Customer",
    customer_phone: customer?.phone || row.customer_phone || "N/A",
    customer_address: customer?.address ?? row.customer_address ?? null,
  };
}

app.get("/api/bootstrap", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const shopId = req.user!.shop_id;
    const settingsMap = db.getSettings(userId);
    const shop = shopId ? db.getShop(shopId) : undefined;
    const shopNameFromShop = shop?.shop_name || shop?.name || "";
    const shopName =
      (typeof settingsMap.shop_name === "string" && settingsMap.shop_name.trim())
        ? settingsMap.shop_name.trim()
        : shopNameFromShop;
    const customers = db.getCustomers(userId);
    const measurements = db.getAllMeasurements(userId).map(normalizeMeasurementRow);
    const garmentTypes = db.getGarmentTypes(userId, shopId).map(normalizeGarmentTypeRow);
    const stylingCategories = db.getStylingCategories(userId).map(normalizeStylingCategoryRow);
    const orders = db.getOrders(userId).map((o) => {
      const c = db.getCustomerById(o.customer_id, userId);
      return normalizeOrderRow(o, c);
    });

    return res.json({
      settings: {
        ...DEFAULT_SHOP_SETTINGS,
        ...settingsMap,
        shop_name: shopName,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      customers,
      measurements,
      orders,
      garmentTypes,
      stylingCategories,
      hydratedAt: new Date().toISOString(),
      source: "local",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Bootstrap failed" });
  }
});

// -------------------------------------------------------------------------
// CUSTOMER MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/customers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const query = (req.query.q as string || "").toLowerCase().trim();
  const page = parseInt(req.query.page as string || "1");
  const limit = parseInt(req.query.limit as string || "50");
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort as string || "name";
  const sortOrder = req.query.order as string || "asc";

  try {
    let data = db.getCustomers(req.user!.id, query);
    if (sortBy === "name") {
      data.sort((a, b) => sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    } else {
      data.sort((a, b) => sortOrder === "asc" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
    }
    data = data.slice(offset, offset + limit);
    return res.json(data || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    const data = db.getCustomerById(customerId, req.user!.id);
    if (!data) return res.status(404).json({ error: "Customer not found or access denied." });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/customers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { name, phone, address, email, notes, measurements } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Customer name is required." });
  }

  const profiles = measurements && typeof measurements === "object" ? (measurements as any).profiles : null;
  const hasCompletedMeasurement = Array.isArray(profiles) && profiles.some((p: any) => {
    if (!p || !p.garment_type_id || !p.values || typeof p.values !== "object") return false;
    return Object.values(p.values).some((v) => String(v ?? "").trim() !== "");
  });
  if (!hasCompletedMeasurement) {
    return res.status(400).json({
      error: "At least one garment measurement must be completed before saving a customer.",
    });
  }

  const cleanPhone = phone && phone.trim() !== "" ? phone.trim() : null;
  const dbPhone = cleanPhone || `NO-PHONE-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
  const now = new Date().toISOString();

  try {
    // Enforce name duplicate validation
    const nameMatch = db.getCustomers(req.user!.id, name.trim());
    if (nameMatch.length > 0 && !cleanPhone) {
      return res.status(400).json({ error: "A customer with this name already exists. A Phone Number is required to save a duplicate name." });
    }
    // Check phone duplicate
    if (cleanPhone) {
      const existing = db.getCustomers(req.user!.id).find(c => c.phone === cleanPhone);
      if (existing) {
        db.logAction("GET_EXISTING_CUSTOMER_DUPLICATE", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: existing.id, name: existing.name });
        return res.status(200).json({ alreadyExists: true, customer: existing });
      }
    }
    const customer = db.createCustomer({
      name, phone: dbPhone, address: address || null,
      email: email || null, notes: notes || null,
      shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id,
    });
    db.upsertMeasurement(customer.id, req.user!.id, measurements || {}, req.user!.id);
    db.logAction("CREATE_CUSTOMER", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customer.id, name });
    return res.status(201).json(customer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update customer
app.put("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { name, phone, address } = req.body;
  try {
    const customer = db.getCustomerById(customerId, req.user!.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const updated = db.updateCustomer(customerId, req.user!.id, { name, phone, address, updated_by: req.user!.id });
    db.logAction("UPDATE_CUSTOMER", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete customer
app.delete("/api/customers/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    const deleted = db.deleteCustomer(customerId, req.user!.id);
    if (!deleted) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    db.logAction("DELETE_CUSTOMER", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// MEASUREMENT MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/customers/:id/measurements", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    const customer = db.getCustomerById(customerId, req.user!.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const data = db.getMeasurements(customerId, req.user!.id);
    if (!data || data.length === 0) {
      return res.json({ customer_id: customerId, data: {} });
    }
    return res.json(normalizeMeasurementRow(data[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/customers/:id/measurements", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { data: measurementData } = req.body;
  const now = new Date().toISOString();

  try {
    const customer = db.getCustomerById(customerId, req.user!.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const updated = db.upsertMeasurement(customerId, req.user!.id, measurementData, req.user!.id);
    db.logAction("UPDATE_MEASUREMENTS", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/customers/:id/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    const customer = db.getCustomerById(customerId, req.user!.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const data = db.getOrders(req.user!.id, { customerId });
    const enriched = (data || []).map((o: any) => {
      const c = db.getCustomerById(o.customer_id, req.user!.id);
      return normalizeOrderRow(o, c);
    });
    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// ORDER MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const statusFilter = req.query.status as string;
  const search = (req.query.q as string || "").toLowerCase().trim();
  const page = parseInt(req.query.page as string || "1");
  const limit = parseInt(req.query.limit as string || "50");
  const offset = (page - 1) * limit;

  try {
    const settingsMap = db.getSettings(req.user!.id);
    let autoArchiveDays = 30;
    if (settingsMap.auto_archive_days !== undefined) {
      autoArchiveDays = Number(settingsMap.auto_archive_days);
    }
    let autoArchivedCount = 0;
    if (autoArchiveDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - autoArchiveDays);
      const archived = db.archiveOrders(req.user!.id, cutoffDate.toISOString());
      autoArchivedCount = archived.count;
    }
    let data;
    if (statusFilter === "finished") {
      const delivered = db.getOrders(req.user!.id, { status: "Delivered", search });
      const archived = db.getOrders(req.user!.id, { status: "Archived", search });
      data = [...delivered, ...archived];
    } else if (statusFilter && statusFilter !== "All") {
      data = db.getOrders(req.user!.id, { status: statusFilter, search });
    } else {
      data = db.getOrders(req.user!.id, { status: "active", search });
    }
    const enriched = data.map(o => {
      const c = db.getCustomerById(o.customer_id, req.user!.id);
      return normalizeOrderRow(o, c);
    });
    const sliced = enriched.slice(offset, offset + limit);
    res.setHeader("X-Hello-Darzi-Auto-Archived", String(autoArchivedCount));
    return res.json(sliced);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
    const data = db.getOrderById(orderId, req.user!.id);
    if (!data) return res.status(404).json({ error: "Order not found or access denied." });
    const c = db.getCustomerById(data.customer_id, req.user!.id);
    return res.json(normalizeOrderRow(data, c));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { customer_id, items, total_amount, discount_type, discount_value, discount_amount, final_total, paid_amount, due_date } = req.body;
  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer and at least one item are required." });
  }

  for (const item of items) {
    if (item == null || Number(item.price) < 0 || Number.isNaN(Number(item.price))) {
      return res.status(400).json({ error: "Each garment item must have a non-negative price." });
    }
  }

  const totalNum = Number(total_amount);
  const discountNum = Number(discount_amount || 0);
  const finalNum = Number(final_total ?? total_amount);
  const paidNum = Number(paid_amount || 0);
  if ([totalNum, discountNum, finalNum, paidNum].some((n) => Number.isNaN(n))) {
    return res.status(400).json({ error: "Order money fields must be valid numbers." });
  }
  if (totalNum < 0 || finalNum < 0 || paidNum < 0 || discountNum < 0) {
    return res.status(400).json({ error: "Order amounts cannot be negative." });
  }
  if (discountNum > totalNum) {
    return res.status(400).json({ error: "Discount cannot exceed order total." });
  }
  if (paidNum > finalNum) {
    return res.status(400).json({ error: "Paid amount cannot exceed final total." });
  }
  if (!due_date) {
    return res.status(400).json({ error: "Due date is required." });
  }

  const now = new Date().toISOString();

  try {
    const customerCheck = db.getCustomerById(customer_id, req.user!.id);
    if (!customerCheck) {
      return res.status(400).json({ error: "Invalid customer ID or access denied." });
    }
    const meas = db.getMeasurements(customer_id, req.user!.id);
    let snapshot = {};
    if (meas.length > 0) {
      try { snapshot = typeof meas[0].data === "string" ? JSON.parse(meas[0].data) : meas[0].data; } catch { snapshot = {}; }
    }
    const settingsMap = db.getSettings(req.user!.id);
    let defaultStatus = "Pending";
    const stages = settingsMap.pipeline_stages || [{ id: "Pending", name: "Getting Ready", enabled: true }];
    const firstActive = stages.find((s: any) => s.enabled && s.id !== "Archived");
    if (firstActive) { defaultStatus = firstActive.id; }
    const nextNum = db.getNextOrderNumber(req.user!.id);
    const orderNumber = `ORD-${1000 + nextNum}`;
    const order = db.createOrder({
      order_number: orderNumber, customer_id, status: defaultStatus, items,
      total_amount, discount_type, discount_value, discount_amount,
      final_total: final_total ?? total_amount,
      paid_amount, due_date, measurement_snapshot: snapshot,
      shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id,
    });
    db.logAction("CREATE_ORDER", req.user!.id, req.user!.email, req.user!.shop_id,
      { order_id: order.id, order_number: orderNumber, status: defaultStatus },
      {
        userName: req.user!.name, userRole: req.user!.role,
        module: "Orders", recordId: order.id,
        newValue: { status: defaultStatus },
        notes: "Order created",
      }
    );
    const c = db.getCustomerById(order.customer_id, req.user!.id);
    return res.status(201).json(normalizeOrderRow(order, c));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** Remaining balance for delivery payment gate (PROJECT.md §10). */
function getOrderRemainingBalance(order: { paid_amount?: unknown; final_total?: unknown; total_amount?: unknown } | null | undefined): number {
  if (!order) return 0;
  const total = Number(order.final_total ?? order.total_amount) || 0;
  const paid = Number(order.paid_amount) || 0;
  return Math.max(0, total - paid);
}

app.put("/api/orders/:id/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const now = new Date().toISOString();

  if (!status) {
    return res.status(400).json({ error: "Status value is required." });
  }

  try {
    const settingsMap = await loadPipelineSettingsForUser(req);
    if (!isConfiguredPipelineStatus(settingsMap, status)) {
      return res.status(400).json({
        error: `Invalid order status "${status}". Choose a stage from this shop's pipeline settings.`,
      });
    }

    const oldOrder = db.getOrderById(orderId, req.user!.id);
    if (!oldOrder) return res.status(404).json({ error: "Order not found or access denied." });

    if (status === "Delivered") {
      const deliverPaymentMode =
        settingsMap.deliver_payment_mode ?? DEFAULT_SHOP_SETTINGS.deliver_payment_mode;
      const remaining = getOrderRemainingBalance(oldOrder);
      if (deliverPaymentMode === "require" && remaining > 0) {
        return res.status(400).json({
          error: `Collect remaining balance (${remaining}) before marking as Delivered.`,
          remaining,
          paid_amount: oldOrder.paid_amount,
          final_total: oldOrder.final_total ?? oldOrder.total_amount,
        });
      }
    }

    const updateData: any = { status, updated_by: req.user!.id };
    if (status === "Delivered") { updateData.delivered_at = now; }
    else if (status !== "Archived") { updateData.delivered_at = null; }
    const order = db.updateOrder(orderId, req.user!.id, updateData);
    if (!order) return res.status(404).json({ error: "Order not found or access denied." });

    db.logAction("UPDATE_ORDER_STATUS", req.user!.id, req.user!.email, req.user!.shop_id,
      { order_id: orderId, order_number: order.order_number, status },
      {
        userName: req.user!.name, userRole: req.user!.role,
        module: "Orders", recordId: orderId,
        previousValue: { status: oldOrder?.status },
        newValue: { status },
      }
    );
    if (status === "Delivered") {
      db.logAction("DELIVERY_COMPLETED", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Orders", recordId: orderId,
          notes: "Order delivered",
        }
      );
    }

    const c = db.getCustomerById(order.customer_id, req.user!.id);
    // Normalize so items/snapshots are objects — raw SQLite JSON strings crash the UI on .map().
    return res.json(normalizeOrderRow(order, c));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Day-to-day payment collection (Manager allowed). Full order edits use PUT /:id with Owner mode.
app.put("/api/orders/:id/payment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { paid_amount } = req.body;
  const now = new Date().toISOString();

  if (paid_amount === undefined || paid_amount === null || Number.isNaN(Number(paid_amount))) {
    return res.status(400).json({ error: "paid_amount is required." });
  }
  if (Number(paid_amount) < 0) {
    return res.status(400).json({ error: "paid_amount cannot be negative." });
  }
  if (Number(paid_amount) > 1_000_000_000) {
    return res.status(400).json({ error: "paid_amount is unreasonably large." });
  }

  try {
    const oldOrder = db.getOrderById(orderId, req.user!.id);
    if (!oldOrder) return res.status(404).json({ error: "Order not found or access denied." });

    const order = db.updateOrder(orderId, req.user!.id, {
      paid_amount: Number(paid_amount),
      updated_by: req.user!.id,
    });
    if (!order) return res.status(404).json({ error: "Order not found or access denied." });

    const oldPaid = oldOrder.paid_amount || 0;
    const newPaid = order.paid_amount || 0;
    const paymentDiff = newPaid - oldPaid;

    if (paymentDiff > 0) {
      db.logAction("PAYMENT_RECEIVED", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number, amount: paymentDiff },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Payments", recordId: orderId,
          previousValue: { paid_amount: oldPaid },
          newValue: { paid_amount: newPaid },
          notes: `Payment of ${paymentDiff} collected`,
        }
      );
    } else if (paymentDiff < 0) {
      db.logAction("REFUND", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number, amount: Math.abs(paymentDiff) },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Payments", recordId: orderId,
          previousValue: { paid_amount: oldPaid },
          newValue: { paid_amount: newPaid },
          notes: `Refund of ${Math.abs(paymentDiff)} processed`,
        }
      );
    }

    const c = db.getCustomerById(order.customer_id, req.user!.id);
    return res.json(normalizeOrderRow(order, c));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Full order edit (items, discounts, totals, due date, etc.) — Owner mode required (§5 / §13)
app.put("/api/orders/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { items, total_amount, discount_type, discount_value, discount_amount, final_total, paid_amount, due_date, status, measurement_snapshot } = req.body;
  const now = new Date().toISOString();

  try {
    const oldOrder = db.getOrderById(orderId, req.user!.id);
    const updateData: any = { updated_by: req.user!.id };
    if (items !== undefined) updateData.items = items;
    if (total_amount !== undefined) updateData.total_amount = total_amount;
    if (discount_type !== undefined) updateData.discount_type = discount_type;
    if (discount_value !== undefined) updateData.discount_value = discount_value;
    if (discount_amount !== undefined) updateData.discount_amount = discount_amount;
    if (final_total !== undefined) updateData.final_total = final_total;
    if (paid_amount !== undefined) updateData.paid_amount = paid_amount;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (status !== undefined) updateData.status = status;
    if (measurement_snapshot !== undefined) updateData.measurement_snapshot = measurement_snapshot;
    const order = db.updateOrder(orderId, req.user!.id, updateData);
    if (!order) return res.status(404).json({ error: "Order not found or access denied." });

    const oldPaid = oldOrder?.paid_amount || 0;
    const newPaid = order.paid_amount || 0;
    const paymentDiff = newPaid - oldPaid;

    db.logAction("EDIT_ORDER", req.user!.id, req.user!.email, req.user!.shop_id,
      { order_id: orderId, order_number: order.order_number },
      {
        userName: req.user!.name, userRole: req.user!.role,
        module: "Orders", recordId: orderId,
        previousValue: { paid_amount: oldPaid, total_amount: oldOrder?.total_amount },
        newValue: { paid_amount: newPaid, total_amount: order.total_amount },
      }
    );

    if (paymentDiff > 0) {
      db.logAction("PAYMENT_RECEIVED", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number, amount: paymentDiff },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Payments", recordId: orderId,
          previousValue: { paid_amount: oldPaid },
          newValue: { paid_amount: newPaid },
          notes: `Payment of ${paymentDiff} collected`,
        }
      );
    } else if (paymentDiff < 0) {
      db.logAction("REFUND", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number, amount: Math.abs(paymentDiff) },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Payments", recordId: orderId,
          previousValue: { paid_amount: oldPaid },
          newValue: { paid_amount: newPaid },
          notes: `Refund of ${Math.abs(paymentDiff)} processed`,
        }
      );
    }

    if (status && oldOrder && oldOrder.status !== status) {
      db.logAction("UPDATE_ORDER_STATUS", req.user!.id, req.user!.email, req.user!.shop_id,
        { order_id: orderId, order_number: order.order_number, status },
        {
          userName: req.user!.name, userRole: req.user!.role,
          module: "Orders", recordId: orderId,
          previousValue: { status: oldOrder.status },
          newValue: { status },
        }
      );
      if (status === "Delivered") {
        db.logAction("DELIVERY_COMPLETED", req.user!.id, req.user!.email, req.user!.shop_id,
          { order_id: orderId, order_number: order.order_number },
          {
            userName: req.user!.name, userRole: req.user!.role,
            module: "Orders", recordId: orderId,
            notes: "Order marked as delivered",
          }
        );
      }
    }

    const c = db.getCustomerById(order.customer_id, req.user!.id);
    return res.json(normalizeOrderRow(order, c));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/orders/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
    const order = db.getOrderById(orderId, req.user!.id);
    const deleted = db.deleteOrder(orderId, req.user!.id);
    if (!deleted) return res.status(404).json({ error: "Order not found or access denied." });
    db.logAction("DELETE_ORDER", req.user!.id, req.user!.email, req.user!.shop_id, { id: orderId, order_number: order?.order_number });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// WORKER MANAGEMENT — disabled for V1 (PROJECT.md §5: one account per shop)
// Runtime auth uses Manager/Owner session modes (requireOwnerMode).
// profiles.role "Worker" is legacy multi-seat — these routes stay stubbed.
// -------------------------------------------------------------------------
const V1_NO_MULTI_SEAT = {
  error:
    "Multi-seat Worker accounts are not available in V1. Hello Darzi uses one shop account with Manager and Owner modes.",
};

app.get("/api/workers", requireAuth, requireRole(["Owner"]), requireOwnerMode, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json(V1_NO_MULTI_SEAT);
});

app.post("/api/workers", requireAuth, requireRole(["Owner"]), requireOwnerMode, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json(V1_NO_MULTI_SEAT);
});

app.delete("/api/workers/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json(V1_NO_MULTI_SEAT);
});

// -------------------------------------------------------------------------
// SHOP SETTINGS & SYSTEM BACKUPS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settingsMap = db.getSettings(req.user!.id);
    const shop = req.user!.shop_id ? db.getShop(req.user!.shop_id) : undefined;
    const shopNameFromShop = shop?.shop_name || shop?.name || "";
    const shopName =
      (typeof settingsMap.shop_name === "string" && settingsMap.shop_name.trim())
        ? settingsMap.shop_name.trim()
        : shopNameFromShop;
    return res.json({
      ...DEFAULT_SHOP_SETTINGS,
      ...settingsMap,
      shop_name: shopName,
      updated_at: new Date().toISOString(),
      updated_by: req.user!.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/settings", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const settingsData = req.body;

  try {
    // Cloud shop ids often land in JWT/profile before a local shops row exists;
    // ensure the FK parent so audit_logs / profile writes cannot fail save.
    if (req.user!.shop_id && req.user!.shop_id !== "default-shop") {
      db.ensureShop(
        req.user!.shop_id,
        req.user!.id,
        typeof settingsData.shop_name === "string" ? settingsData.shop_name : (req.user!.name || "")
      );
    }
    for (const [key, value] of Object.entries(settingsData)) {
      if (key === "updated_at" || key === "updated_by") continue;
      db.saveSetting(key, value, req.user!.id, req.user!.id);
    }
    db.logAction("UPDATE_SETTINGS", req.user!.id, req.user!.email, req.user!.shop_id, {});
    return res.json(settingsData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// GARMENT TYPES HELPERS & ENDPOINTS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/garment-types", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = db.getGarmentTypes(req.user!.id, req.user!.shop_id).map(normalizeGarmentTypeRow);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/garment-types", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { name, enabled, display_order, price, measurement_fields } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Garment Type name is required." });
  }

  const userId = req.user!.id;
  const shopId = req.user!.shop_id || "default-shop";
  const now = new Date().toISOString();

  try {
    const data = db.createGarmentType({
      name, enabled, display_order, price, measurement_fields,
      shop_id: shopId, created_by: userId, updated_by: userId
    });
    db.logAction("CREATE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id: data.id, name });
    return res.status(201).json(normalizeGarmentTypeRow(data));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/garment-types/reorder", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "An array of garment type IDs is required." });
  }

  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    db.reorderGarmentTypes(ids, userId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/garment-types/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, enabled, display_order, price, measurement_fields } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    const data = db.updateGarmentType(id, userId, { name, enabled, display_order, price, measurement_fields, updated_by: userId });
    if (!data) return res.status(404).json({ error: "Garment type not found." });
    db.logAction("UPDATE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id, name });
    return res.json(normalizeGarmentTypeRow(data));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/garment-types/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    const gt = db.getGarmentTypes(userId).find((g: any) => g.id === id);
    if (!gt) return res.status(404).json({ error: "Garment type not found." });
    const del = db.deleteGarmentType(id, userId);
    if (!del) return res.status(404).json({ error: "Garment type not found." });
    db.logAction("DELETE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id, name: gt.name });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// STYLING CATEGORIES HELPERS & ENDPOINTS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/styling-categories", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const garmentTypeId = req.query.garment_type_id as string | undefined;
  try {
    const data = db.getStylingCategories(req.user!.id, garmentTypeId).map(normalizeStylingCategoryRow);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/styling-categories", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { name, display_order, options, garment_type_id } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Styling Category name is required." });
  }

  const userId = req.user!.id;
  const shopId = req.user!.shop_id || "default-shop";
  const now = new Date().toISOString();

  try {
    const data = db.createStylingCategory({
      name, display_order, options, garment_type_id,
      shop_id: shopId, created_by: userId, updated_by: userId
    });
    db.logAction("CREATE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id: data.id, name });
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/styling-categories/reorder", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "An array of styling category IDs is required." });
  }

  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    db.reorderStylingCategories(ids, userId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/styling-categories/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, display_order, options, garment_type_id } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    const data = db.updateStylingCategory(id, userId, { name, display_order, options, garment_type_id });
    if (!data) return res.status(404).json({ error: "Styling category not found." });
    db.logAction("UPDATE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id, name });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/styling-categories/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    db.deleteStylingCategory(id, userId);
    db.logAction("DELETE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/backup", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = db.exportBackup(req.user!.id);
    const backup = { timestamp: new Date().toISOString(), version: "1.0", data };
    db.logAction("SYSTEM_BACKUP", req.user!.id, req.user!.email, req.user!.shop_id, {});
    return res.json(backup);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to download database backup: " + err.message });
  }
});

// -------------------------------------------------------------------------
// CLOUD BACKUP / SYNC (Supabase — SQLite remains source of truth)
// -------------------------------------------------------------------------
function extractCloudAccessToken(req: AuthenticatedRequest): string | null {
  const header = req.headers["x-supabase-access-token"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader && !db.isDeviceSessionToken(fromHeader)) return fromHeader;
  if (req.token && !db.isDeviceSessionToken(req.token)) return req.token;
  return null;
}

/** Sync status for Cloud Backup page (works offline — reads local outbox/state). */
app.get("/api/sync/status", requireAuth, requireRole(["Owner"]), (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = db.getSyncStatusPayload(req.user!.id);
    return res.json({
      ...payload,
      configured: isCloudSyncConfigured(),
      onlineCapable: Boolean(extractCloudAccessToken(req)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to read sync status." });
  }
});

/**
 * Push pending SQLite changes to Supabase, then pull remote (LWW on updated_at).
 * Requires a live Supabase access token (Bearer JWT or X-Supabase-Access-Token).
 */
app.post("/api/sync/run", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const accessToken = extractCloudAccessToken(req);
  if (!accessToken) {
    markSyncOffline(req.user!.id);
    return res.status(401).json({
      error: "Cloud sync requires an online Supabase session. Reconnect to the internet and sign in again.",
      ...db.getSyncStatusPayload(req.user!.id),
      configured: isCloudSyncConfigured(),
    });
  }

  // Verify JWT still valid (also refreshes JWKS cache when online)
  try {
    const claims = await verifySupabaseAccessToken(accessToken);
    if (!claims?.sub) {
      markSyncOffline(req.user!.id);
      return res.status(401).json({
        error: "Supabase session expired. Sign in again while online.",
        ...db.getSyncStatusPayload(req.user!.id),
      });
    }
    if (claims.sub !== req.user!.id) {
      return res.status(403).json({ error: "Cloud session does not match the signed-in account." });
    }
  } catch (err: any) {
    markSyncOffline(req.user!.id);
    return res.status(401).json({
      error: err?.message || "Supabase session expired. Sign in again while online.",
      ...db.getSyncStatusPayload(req.user!.id),
    });
  }

  const forceFullPush = Boolean(req.body?.forceFullPush);
  try {
    const result = await runCloudSync(req.user!.id, accessToken, { forceFullPush });
    if (result.ok) {
      db.logAction("CLOUD_SYNC", req.user!.id, req.user!.email, req.user!.shop_id, {
        pushed: result.pushed,
        pulled: result.pulled,
        forceFullPush,
      });
    }
    return res.status(result.ok ? 200 : 500).json({
      ...result,
      configured: isCloudSyncConfigured(),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Cloud sync failed.",
      ...db.getSyncStatusPayload(req.user!.id),
    });
  }
});

/** Mark sync state offline (client lost connectivity). */
app.post("/api/sync/offline", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    markSyncOffline(req.user!.id);
    return res.json(db.getSyncStatusPayload(req.user!.id));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** Path to the daily auto-backup folder (same JSON format as manual download). */
app.get("/api/backup/auto-dir", requireAuth, requireRole(["Owner"]), requireOwnerMode, (_req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ path: getAutoBackupsDir() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to resolve auto-backup folder." });
  }
});

app.post("/api/restore", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { backupData } = req.body;
  if (!backupData || !backupData.data) {
    return res.status(400).json({ error: "Invalid backup data provided." });
  }

  try {
    const result = db.importBackup(backupData.data, req.user!.id);
    db.logAction("SYSTEM_RESTORE", req.user!.id, req.user!.email, req.user!.shop_id, {
      timestamp: backupData.timestamp,
      imported: result.imported,
      mode: "replace",
    });
    return res.json({ success: true, imported: result.imported, mode: "replace" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to restore backup: " + err.message });
  }
});

app.post("/api/archive-orders", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { beforeDate } = req.body;
  if (!beforeDate) {
    return res.status(400).json({ error: "Please specify a cutoff date." });
  }

  const cutoff = new Date(beforeDate);
  if (Number.isNaN(cutoff.getTime())) {
    return res.status(400).json({ error: "Invalid cutoff date." });
  }

  try {
    // Only Delivered (closed) orders — never active pipeline stages
    const { count, ids } = db.archiveOrders(req.user!.id, cutoff.toISOString());
    db.logAction("ARCHIVE_ORDERS", req.user!.id, req.user!.email, req.user!.shop_id, {
      beforeDate,
      archivedCount: count,
    });
    return res.json({ success: true, archivedCount: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// REPORTS & STATEMENTS (Owner Only)
// -------------------------------------------------------------------------
// Finances overview (Owner-only). Live order totals — no inventory/expenses in V1 (PROJECT.md §2).
app.get("/api/reports/financials", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = db.getOrders(req.user!.id);
    const settingsMap = db.getSettings(req.user!.id);
    const mappedOrders = orders.map((o: any) => {
      const c = db.getCustomerById(o.customer_id, req.user!.id);
      return normalizeOrderRow(o, c);
    });
    return res.json({
      orders: mappedOrders,
      settings: {
        currency: settingsMap.currency || "PKR",
        pipeline_stages: settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages,
      },
    });
  } catch (err: any) {
    console.error("Error in /api/reports/financials:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-logs", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      search, from, to, userId, action, module,
      sort = 'newest', page = '1', limit = '50'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

    const result = db.getAuditLogs({
      userId: userId || undefined,
      search: search || undefined,
      fromDate: from || undefined,
      toDate: to || undefined,
      actionFilter: action || undefined,
      moduleFilter: module || undefined,
      sort: sort === 'oldest' ? 'oldest' : 'newest',
      page: pageNum,
      limit: limitNum,
    });

    const parsed = result.data.map((r: any) => {
      let details = {};
      let meta: Record<string, any> = {};
      try { details = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { details = {}; }
      meta = (details as Record<string, any>)._meta || {};

      const moduleVal = r.module || meta.module || getModuleFromAction(r.action) || 'General';
      const userRole = r.user_role || meta.userRole || '';
      const userName = r.user_name || meta.userName || r.user_email || 'Unknown';

      return {
        id: r.id, shop_id: r.shop_id, user_id: r.user_id,
        user_email: r.user_email, user_name: userName, user_role: userRole,
        action: r.action, module: moduleVal, record_id: r.record_id || meta.recordId || '',
        previous_value: r.previous_value || meta.previousValue || null,
        new_value: r.new_value || meta.newValue || null,
        device: r.device || meta.device || '',
        ip_address: r.ip_address || meta.ipAddress || '',
        notes: r.notes || meta.notes || '',
        details, created_at: r.created_at,
      };
    });

    return res.json({ data: parsed, total: result.total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// General error handler middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  if (req.path.startsWith("/api/")) {
    console.error("API Error Handler caught:", err);
    return res.status(err.status || 500).json({
      error: err.message || "An unexpected server-side error occurred on the API endpoint."
    });
  }
  next(err);
});

// -------------------------------------------------------------------------
// DATA IMPORT
// -------------------------------------------------------------------------
app.post("/api/import/customers", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const { customers, create_measurements, garment_type_id } = req.body;

  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: "No customer data provided." });
  }

  const now = new Date().toISOString();
  const results = { imported: 0, skipped: 0, errors: [] as string[], details: [] as any[] };

  let knownFields: string[] = [];
  let importGarmentName = "Imported";
  if (create_measurements && garment_type_id) {
    const dbFields = db.getGarmentTypes(req.user!.id);
    const found = dbFields.find((t: any) => t.id === garment_type_id);
    if (found?.name) importGarmentName = String(found.name);
    if (found?.measurement_fields) {
      try { knownFields = typeof found.measurement_fields === "string" ? JSON.parse(found.measurement_fields).map((f: any) => f.name || f) : found.measurement_fields.map((f: any) => f.name || f); } catch { knownFields = []; }
    }
  }

  /** Wrap flat import columns into the profiles shape used by order booking. */
  const toMeasurementProfilesData = (measurements: Record<string, unknown>) => {
    const filtered: Record<string, string> = {};
    for (const field of knownFields) {
      if (measurements[field] !== undefined && measurements[field] !== null && measurements[field] !== "") {
        filtered[field] = String(measurements[field]);
      }
    }
    for (const [k, v] of Object.entries(measurements)) {
      if (v !== undefined && v !== null && v !== "" && !filtered[k] && k !== "profiles") {
        filtered[k] = String(v);
      }
    }
    if (Object.keys(filtered).length === 0) return null;
    // Already profile-shaped from a newer importer
    if (Array.isArray((measurements as any).profiles)) {
      return { profiles: (measurements as any).profiles };
    }
    const stamp = now;
    return {
      profiles: [
        {
          id: `import-${garment_type_id || "default"}-${Date.now()}`,
          garment_type_id: garment_type_id || "",
          garment_name: importGarmentName,
          values: filtered,
          created_at: stamp,
          updated_at: stamp,
        },
      ],
    };
  };

  for (const row of customers) {
    try {
      const { measurements, ...customerData } = row;

      if (!customerData.name || String(customerData.name).trim() === "") {
        results.errors.push(`Row ${results.imported + results.skipped + 1}: Name is required.`);
        results.skipped++;
        continue;
      }

      const cleanPhone = customerData.phone && String(customerData.phone).trim() !== "" ? String(customerData.phone).trim() : null;
      const dbPhone = cleanPhone || `NO-PHONE-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;

      const existing = db.getCustomers(req.user!.id).find((c) => c.phone === cleanPhone);
      if (existing) { results.skipped++; results.details.push({ name: customerData.name, status: "skipped", reason: `Duplicate phone: ${cleanPhone}` }); continue; }
      const nameMatch = db.getCustomers(req.user!.id, String(customerData.name).trim());
      if (nameMatch.length > 0 && !cleanPhone) { results.skipped++; results.details.push({ name: customerData.name, status: "skipped", reason: "Duplicate name, no phone." }); continue; }
      const created = db.createCustomer({
        name: String(customerData.name).trim(), phone: dbPhone,
        email: customerData.email ? String(customerData.email).trim() : undefined,
        address: customerData.address ? String(customerData.address).trim() : undefined,
        notes: customerData.notes ? String(customerData.notes).trim() : undefined,
        shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id,
      });
      if (create_measurements && measurements && typeof measurements === "object") {
        const profileData = toMeasurementProfilesData(measurements as Record<string, unknown>);
        if (profileData) {
          db.upsertMeasurement(created.id, req.user!.id, profileData, req.user!.id);
        }
      }
      results.imported++;
      results.details.push({ name: created.name, status: "imported" });
    } catch (err: any) {
      results.errors.push(`Unexpected: ${err.message}`);
      results.skipped++;
    }
  }

  return res.json(results);
});

// Catch-all for undefined /api routes (must be after all specific API routes)
app.all("/api/*", (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found.` });
});

// -------------------------------------------------------------------------
// EXPRESS GLOBAL ERROR HANDLER (must be registered after all routes)
// -------------------------------------------------------------------------
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[server.ts] Unhandled error processing request:", {
    method: req.method,
    path: req.path,
    error: err?.message || String(err),
    stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined,
  });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: "Internal server error. Please check server logs for details.",
    ...(process.env.NODE_ENV !== "production" ? { detail: err?.message || String(err) } : {}),
  });
});

// -------------------------------------------------------------------------
// VITE DEV SERVER / STATIC ASSETS & SPA ROUTING
// -------------------------------------------------------------------------
// Serve production static files and SPA fallback
// Skip on Vercel: Vercel handles static serving and SPA fallback via vercel.json rewrites.
// Running Express static middleware on Vercel can cause 404 loops since __dirname
// may not resolve correctly in the serverless function context.
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  let distPath = path.join(process.cwd(), "dist");
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    const fallbacks = [
      __dirname,
      path.join(__dirname, "dist"),
      path.join(__dirname, "..", "dist"),
    ];
    for (const p of fallbacks) {
      if (fs.existsSync(path.join(p, "index.html"))) { distPath = p; break; }
    }
  }
  if (fs.existsSync(path.join(distPath, "index.html"))) {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn(`Static files not found at ${distPath} — SPA catch-all not registered`);
  }
}

const DEV_PORT_FILE = path.join(process.cwd(), ".dev-server-port");

/** Publish port for wait-and-start-desktop.mjs / local browser. Skip packaged production. */
function shouldPublishDevPort(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === "production" && process.env.ELECTRON_SERVER_MANAGED === "1") {
    return false;
  }
  return process.env.NODE_ENV !== "production" || process.env.ELECTRON_RUN === "true";
}

function clearDevPortFile(): void {
  try {
    if (fs.existsSync(DEV_PORT_FILE)) fs.unlinkSync(DEV_PORT_FILE);
  } catch {
    // Ignore cleanup failures; a stale file is overwritten on the next boot.
  }
}

function writeDevPortFile(port: number): void {
  if (!shouldPublishDevPort()) return;
  try {
    fs.writeFileSync(DEV_PORT_FILE, String(port), "utf8");
  } catch (err: any) {
    console.warn("Could not write .dev-server-port:", err?.message || err);
  }
}

async function startServer(preferredPort?: number): Promise<number> {
  let initialized = false;

  if (shouldPublishDevPort()) {
    clearDevPortFile();
  }

  async function initOnce(): Promise<void> {
    if (initialized) return;
    initialized = true;

    // SQLite is the only database — fail loudly if it cannot load so the
    // desktop shell surfaces the problem instead of running with no storage.
    db.initDatabase();
    console.log("SQLite database initialized successfully");
    startBackupScheduler();
  }

  async function serveAtPort(port: number): Promise<number> {
    await initOnce();

    return new Promise<number>((resolve, reject) => {
      // Desktop must not expose the local API on the LAN.
      const host = process.env.ELECTRON_RUN === "true" ? "127.0.0.1" : "0.0.0.0";
      const server = app.listen(port, host, () => {
        const actualPort = (server.address() as any).port;
        writeDevPortFile(actualPort);
        console.log(`Express Server booted successfully on http://${host}:${actualPort}`);
        // Open browser only for non-Electron local `npm run dev`.
        if (shouldPublishDevPort() && process.env.ELECTRON_RUN !== "true") {
          const url = `http://localhost:${actualPort}`;
          const cmd = process.platform === "win32" ? `start ${url}` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
          setTimeout(() => exec(cmd), 1000);
        }
        resolve(actualPort);
      });
      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          const nextPort = port + 1;
          console.warn(`Port ${port} is in use, trying port ${nextPort}...`);
          server.close(() => {
            serveAtPort(nextPort).then(resolve).catch(reject);
          });
        } else {
          reject(err);
        }
      });
    });
  }

  // Set up static/Vite middleware once before binding
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const viteConfigPath = path.resolve(
        process.cwd(),
        "apps/desktop/ui/vite.config.ts",
      );
      const vite = await viteModule.createServer({
        configFile: viteConfigPath,
        server: { middlewareMode: true, allowedHosts: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch {
      let distPath = path.join(process.cwd(), "dist");
      if (!fs.existsSync(path.join(distPath, "index.html"))) {
        const fallbacks = [
          __dirname,
          path.join(__dirname, "dist"),
          path.join(__dirname, "..", "dist"),
        ];
        for (const p of fallbacks) {
          if (fs.existsSync(path.join(p, "index.html"))) { distPath = p; break; }
        }
      }
      if (fs.existsSync(path.join(distPath, "index.html"))) {
        console.log(`[Dev fallback] Serving static files from: ${distPath}`);
        app.use(express.static(distPath));
        app.get("*", (req: Request, res: Response) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    }
  }

  return serveAtPort(preferredPort || PORT);
}

export { app, PORT, startServer };

// Auto-start for `npm run dev` and `npm run dev:desktop` (ELECTRON_RUN=true).
// Packaged Electron sets ELECTRON_SERVER_MANAGED=1 and calls startServer() itself.
if (!process.env.VERCEL && process.env.ELECTRON_SERVER_MANAGED !== "1") {
  const cleanupDevPort = () => clearDevPortFile();
  process.once("exit", cleanupDevPort);
  process.once("SIGINT", () => {
    cleanupDevPort();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanupDevPort();
    process.exit(0);
  });

  startServer().catch((err) => {
    cleanupDevPort();
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
