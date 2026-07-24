/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { exec } from "node:child_process";

import dotenv from "dotenv";
import { createClient as supabaseCreateClient, SupabaseClient } from "@supabase/supabase-js";

import * as db from "./db";
import * as sync from "./sync";
import { runMigrations } from "./migrate";

let localDbAvailable = false;

function useLocalDb(): boolean {
  return process.env.ELECTRON_RUN === "true" && localDbAvailable;
}

// In development, load .env via dotenv.
// In production, electron/main.cjs injects the required environment
// variables before the server module is loaded.
if (process.env.NODE_ENV !== "production") {
  try {
    dotenv.config();
  } catch {}
}

const app = express();
const PORT = 3000;

app.use(express.json());

// -------------------------------------------------------------------------
// COMPATIBILITY LAYER FOR MISSING MULTI-TENANT DATABASE SCHEMA
// -------------------------------------------------------------------------
let IS_MULTI_TENANT_AVAILABLE = true;
let IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE = true;
let IS_DELIVERED_AT_AVAILABLE = true;
let IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE = true;
let IS_PRICE_IN_GARMENT_TYPES_AVAILABLE = true;

function proxyBuilder(builder: any, relation?: string): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === "function") {
        return function(this: any, ...args: any[]) {
          // 1. Handle missing user_id in shop_settings
          if (relation === "shop_settings" && !IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE) {
            if ((prop === "eq" || prop === "in" || prop === "neq") && args[0] === "user_id") {
              return this;
            }
            if (prop === "select") {
              if (typeof args[0] === "string" && args[0].includes("user_id")) {
                let cleanSelect = args[0]
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter((s: string) => s !== "user_id")
                  .join(",");
                args[0] = cleanSelect;
              }
            }
            if (prop === "insert" || prop === "upsert" || prop === "update") {
              let payload = args[0];
              if (payload) {
                if (Array.isArray(payload)) {
                  args[0] = payload.map(item => {
                    const { user_id, ...rest } = item;
                    return rest;
                  });
                } else if (typeof payload === "object") {
                  const { user_id, ...rest } = payload;
                  args[0] = rest;
                }
              }
            }
          }

          // 2. Handle missing multi-tenant schema (shops / shop_id columns)
          if (!IS_MULTI_TENANT_AVAILABLE) {
            if ((prop === "eq" || prop === "in" || prop === "neq") && args[0] === "shop_id") {
              return this;
            }
            if (prop === "select") {
              if (typeof args[0] === "string" && args[0].includes("shop_id")) {
                let cleanSelect = args[0]
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter((s: string) => s !== "shop_id")
                  .join(",");
                args[0] = cleanSelect;
              }
            }
            if (prop === "insert" || prop === "upsert" || prop === "update") {
              let payload = args[0];
              if (payload) {
                if (Array.isArray(payload)) {
                  args[0] = payload.map(item => {
                    const { shop_id, ...rest } = item;
                    return rest;
                  });
                } else if (typeof payload === "object") {
                  const { shop_id, ...rest } = payload;
                  args[0] = rest;
                }
              }
            }
          }

          // 3. Handle missing delivered_at in orders
          if (relation === "orders" && !IS_DELIVERED_AT_AVAILABLE) {
            if ((prop === "eq" || prop === "in" || prop === "neq" || prop === "lte" || prop === "gte" || prop === "lt" || prop === "gt") && args[0] === "delivered_at") {
              return this;
            }
            if (prop === "select") {
              if (typeof args[0] === "string" && args[0].includes("delivered_at")) {
                let cleanSelect = args[0]
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter((s: string) => s !== "delivered_at" && s !== "")
                  .join(",");
                args[0] = cleanSelect;
              }
            }
            if (prop === "insert" || prop === "upsert" || prop === "update") {
              let payload = args[0];
              if (payload) {
                if (Array.isArray(payload)) {
                  args[0] = payload.map(item => {
                    const { delivered_at, ...rest } = item;
                    return rest;
                  });
                } else if (typeof payload === "object") {
                  const { delivered_at, ...rest } = payload;
                  args[0] = rest;
                }
              }
            }
          }
          
          // 4. Handle missing garment_type_id in styling_categories
          if (relation === "styling_categories" && !IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE) {
            if ((prop === "eq" || prop === "in" || prop === "neq") && args[0] === "garment_type_id") {
              return this;
            }
            if (prop === "select") {
              if (typeof args[0] === "string" && args[0].includes("garment_type_id")) {
                let cleanSelect = args[0]
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter((s: string) => s !== "garment_type_id")
                  .join(",");
                args[0] = cleanSelect;
              }
            }
            if (prop === "insert" || prop === "upsert" || prop === "update") {
              let payload = args[0];
              if (payload) {
                if (Array.isArray(payload)) {
                  args[0] = payload.map(item => {
                    const { garment_type_id, ...rest } = item;
                    return rest;
                  });
                } else if (typeof payload === "object") {
                  const { garment_type_id, ...rest } = payload;
                  args[0] = rest;
                }
              }
            }
          }

          // 5. Handle missing price in garment_types
          if (relation === "garment_types" && !IS_PRICE_IN_GARMENT_TYPES_AVAILABLE) {
            if (prop === "select") {
              if (typeof args[0] === "string" && args[0].includes("price")) {
                let cleanSelect = args[0]
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter((s: string) => s !== "price" && s !== "")
                  .join(",");
                args[0] = cleanSelect;
              }
            }
            if (prop === "insert" || prop === "upsert" || prop === "update") {
              let payload = args[0];
              if (payload) {
                if (Array.isArray(payload)) {
                  args[0] = payload.map(item => {
                    const { price, ...rest } = item;
                    return rest;
                  });
                } else if (typeof payload === "object") {
                  const { price, ...rest } = payload;
                  args[0] = rest;
                }
              }
            }
          }
          
          const result = val.apply(target, args);
          if (result && typeof result === "object" && typeof result.then === "function") {
            return proxyBuilder(result, relation);
          }
          return result;
        };
      }
      return val;
    }
  });
}

function createClient(url: string, key: string, options?: any, isAdminClient: boolean = false): SupabaseClient {
  const client = supabaseCreateClient(url, key, options);
  const originalFrom = client.from.bind(client);
  client.from = function(relation: string) {
    if (relation === "shop_settings" && !IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE && !isAdminClient) {
      return supabaseAdmin.from(relation);
    }
    let builder = originalFrom(relation);
    return proxyBuilder(builder, relation);
  };
  return client;
}

// -------------------------------------------------------------------------
// SUPABASE CLIENT INITIALIZATION
// -------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  console.error(
    `[server.ts] Missing Supabase configuration: ${missing.join(", ")}.\n` +
    "Server will start in degraded mode — routes requiring Supabase will return errors."
  );
}

// Service role client is used for administrative operations (like worker user creation/deletion)
let supabaseAdmin: SupabaseClient;
let supabaseAnon: SupabaseClient;

try {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  }, true);

  supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  }, false);
} catch (err) {
  console.error("[server.ts] Failed to create Supabase clients:", err);
  // Create stub clients so the module loads without crashing;
  // any API handler that actually uses them will get a runtime error.
  const stubOpts = { auth: { persistSession: false } };
  supabaseAdmin = supabaseCreateClient(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || "placeholder-key",
    stubOpts
  );
  supabaseAnon = supabaseCreateClient(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY || "placeholder-key",
    stubOpts
  );
}

// Helper to get a dynamic user-scoped client that respects Row Level Security
function getSupabaseClient(token?: string) {
  if (token) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }, false);
  }
  return supabaseAnon;
}

// Dynamically check database schema at runtime
async function checkDatabaseSchema() {
  try {
    const { error: shopError } = await supabaseAdmin.from("shops").select("id").limit(1);
    const { error: profileError } = await supabaseAdmin.from("profiles").select("shop_id").limit(1);
    
    if (
      (shopError && (shopError.code === "PGRST205" || shopError.message?.includes("relation \"public.shops\" does not exist"))) ||
      (profileError && (profileError.code === "42703" || profileError.message?.includes("column profiles.shop_id does not exist") || profileError.message?.includes("column \"shop_id\" does not exist")))
    ) {
      console.warn("WARNING: Multi-tenant schema (shops table / shop_id columns) is missing in Supabase. Falling back to single-tenant compatibility mode.");
      IS_MULTI_TENANT_AVAILABLE = false;
    } else {
      console.log("Database schema check passed: multi-tenant mode active.");
    }

    // Check if user_id column exists in shop_settings
    const { error: settingsError } = await supabaseAdmin.from("shop_settings").select("user_id").limit(1);
    if (
      settingsError && 
      (settingsError.code === "42703" || 
       settingsError.message?.includes("column") || 
       settingsError.message?.includes("user_id") ||
       settingsError.message?.includes("Could not find the"))
    ) {
      console.warn("WARNING: user_id column is missing in shop_settings. Striping user_id from shop_settings.");
      IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE = false;
    } else {
      console.log("Database check: user_id column is available in shop_settings.");
    }

    // Check if delivered_at column exists in orders
    const { error: ordersError } = await supabaseAdmin.from("orders").select("delivered_at").limit(1);
    if (
      ordersError && 
      (ordersError.code === "42703" || 
       ordersError.message?.includes("column") || 
       ordersError.message?.includes("delivered_at") ||
       ordersError.message?.includes("Could not find the"))
    ) {
      console.warn("WARNING: delivered_at column is missing in orders. Striping delivered_at from orders queries.");
      IS_DELIVERED_AT_AVAILABLE = false;
    } else {
      console.log("Database check: delivered_at column is available in orders.");
    }

    // Check if garment_type_id column exists in styling_categories
    const { error: stylingError } = await supabaseAdmin.from("styling_categories").select("garment_type_id").limit(1);
    if (
      stylingError && 
      (stylingError.code === "42703" || 
       stylingError.message?.includes("column") || 
       stylingError.message?.includes("garment_type_id") ||
       stylingError.message?.includes("Could not find the"))
    ) {
      console.warn("WARNING: garment_type_id column is missing in styling_categories. Fallback / memory filter will handle it.");
      IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE = false;
    } else {
      console.log("Database check: garment_type_id column is available in styling_categories.");
    }

    // Check if price column exists in garment_types
    const { error: priceError } = await supabaseAdmin.from("garment_types").select("price").limit(1);
    if (
      priceError && 
      (priceError.code === "42703" || 
       priceError.message?.includes("column") || 
       priceError.message?.includes("price") ||
       priceError.message?.includes("Could not find the"))
    ) {
      console.warn("WARNING: price column is missing in garment_types. Striping price from garment_types queries.");
      IS_PRICE_IN_GARMENT_TYPES_AVAILABLE = false;
    } else {
      console.log("Database check: price column is available in garment_types.");
    }
  } catch (err) {
    console.error("Database schema check failed, defaulting to single-tenant mode:", err);
    IS_MULTI_TENANT_AVAILABLE = false;
    IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE = false;
    IS_DELIVERED_AT_AVAILABLE = false;
  }
}

// -------------------------------------------------------------------------
// DEFAULT BACKUP DATA FOR BOOTSTRAPPING DEFAULT VALUES
// -------------------------------------------------------------------------
const DEFAULT_SHOP_SETTINGS = {
  shop_name: "",
  phone: "",
  address: "",
  currency: "PKR",
  measurement_fields: [],
  pipeline_stages: [
    { id: "Pending", name: "Getting Ready", enabled: true },
    { id: "Ready to Deliver", name: "Ready to Deliver", enabled: true },
    { id: "Delivered", name: "Delivered", enabled: true },
    { id: "Archived", name: "Archived", enabled: true }
  ],
  auto_archive_days: 30,
  measurement_unit: "Inches",
  terms_conditions: "",
  receipt_footer_text: "Receipt is generated by Hello Darzi - 03163455358",
  default_print_receipt: true,
  default_print_measure: true,
  updated_at: new Date().toISOString(),
  updated_by: "system"
};

// -------------------------------------------------------------------------
// ACCOUNT-SPECIFIC SHOP SETTINGS HELPERS (PREFIX-BASED MULTI-TENANCY)
// -------------------------------------------------------------------------
const settingsCache = new Map<string, Record<string, any>>();

async function getAccountSettings(userSupabase: any, userId: string): Promise<Record<string, any>> {
  if (settingsCache.has(userId)) {
    return JSON.parse(JSON.stringify(settingsCache.get(userId)));
  }

  // 1. Fetch settings prefixed with the user's ID
  const { data, error } = await userSupabase
    .from("shop_settings")
    .select("*")
    .like("key", `${userId}:%`);

  if (error) {
    console.error(`Error loading account settings for user ${userId}:`, error);
  }

  const settingsMap: Record<string, any> = {};

  if (data && data.length > 0) {
    data.forEach((row: any) => {
      const parts = row.key.split(":");
      const key = parts.slice(1).join(":"); // recover original key
      settingsMap[key] = row.value;
    });
  }

  // Check if we retrieved the critical settings keys. If not, seed defaults (always isolated, no cloning)
  const criticalKeys = ["shop_name", "phone", "address", "currency", "pipeline_stages", "measurement_fields", "auto_archive_days", "measurement_unit", "terms_conditions", "receipt_footer_text", "default_print_receipt", "default_print_measure"];
  const hasSomeSettings = criticalKeys.some(k => settingsMap[k] !== undefined);

  if (!hasSomeSettings) {
    console.log(`Seeding brand new settings for user ${userId}...`);
    // Seed default settings for this user
    for (const [k, v] of Object.entries(DEFAULT_SHOP_SETTINGS)) {
      if (k === "updated_at" || k === "updated_by") continue;
      await supabaseAdmin.from("shop_settings").upsert({
        key: `${userId}:${k}`,
        value: v,
        updated_at: new Date().toISOString(),
        updated_by: userId
      });
      settingsMap[k] = v;
    }
  }

  // Ensure crucial fields always exist
  if (!settingsMap.pipeline_stages) {
    settingsMap.pipeline_stages = DEFAULT_SHOP_SETTINGS.pipeline_stages;
  }
  if (!settingsMap.measurement_fields) {
    settingsMap.measurement_fields = DEFAULT_SHOP_SETTINGS.measurement_fields;
  }
  if (!settingsMap.measurement_unit) {
    settingsMap.measurement_unit = "Inches";
  }
  settingsCache.set(userId, JSON.parse(JSON.stringify(settingsMap)));
  return settingsMap;
}

async function saveAccountSettings(userSupabase: any, userId: string, settingsData: Record<string, any>): Promise<void> {
  settingsCache.delete(userId);
  const now = new Date().toISOString();
  const entries = Object.entries(settingsData);
  for (const [key, value] of entries) {
    const prefixedKey = `${userId}:${key}`;
    const { error } = await userSupabase.from("shop_settings").upsert({
      key: prefixedKey,
      value,
      updated_at: now,
      updated_by: userId
    });
    if (error) {
      console.error(`Error saving settings key ${key} for user ${userId}:`, error);
      throw error;
    }
  }
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

const authCache = new Map<string, { profile: any; expiresAt: number }>();
const ownerModeCache = new Map<string, number>();
const OWNER_MODE_TTL_MS = 8 * 60 * 60 * 1000;

let syncEngineStarted = false;

function grantOwnerMode(token: string) {
  ownerModeCache.set(token, Date.now() + OWNER_MODE_TTL_MS);
}

function revokeOwnerMode(token: string) {
  ownerModeCache.delete(token);
}

function isOwnerModeActive(token: string): boolean {
  const expiresAt = ownerModeCache.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    ownerModeCache.delete(token);
    return false;
  }
  return true;
}

function requireOwnerMode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.token || !isOwnerModeActive(req.token)) {
    return res.status(403).json({
      error: "Owner mode required. Switch to Owner mode to delete orders.",
    });
  }
  next();
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing authentication token." });
  }
  const token = authHeader.split(" ")[1];

  const nowTime = Date.now();
  if (authCache.has(token)) {
    const cached = authCache.get(token)!;
    if (cached.expiresAt > nowTime) {
      req.user = cached.profile;
      req.token = token;
      return next();
    } else {
      authCache.delete(token);
    }
  }

  try {
    const result = await supabaseAnon.auth.getUser(token);
    if (!result.data?.user) {
      return res.status(401).json({ error: "Session expired or invalid token." });
    }

    const user = result.data.user;
    const { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profError || !profile) {
      return res.status(401).json({
        error: "Account not fully set up. Please sign in again to complete your profile."
      });
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role || "Owner",
      shop_id: profile.shop_id || "default-shop"
    };
    req.token = token;

    if (useLocalDb() && !syncEngineStarted) {
      try {
        sync.updateSyncToken(token);
        sync.startSyncEngine(profile.id, token);
        syncEngineStarted = true;
      } catch (syncErr: any) {
        console.error("Failed to start sync engine:", syncErr.message);
      }
    }

    authCache.set(token, {
      profile: req.user,
      expiresAt: Date.now() + 300000
    });

    return next();
  } catch (err: any) {
    console.error("Auth verification error:", err?.message || err);
    return res.status(500).json({
      error: "Internal security validation error.",
      details: err?.message || String(err)
    });
  }
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

function handleSupabaseError(err: any, res: Response) {
  const errMsg = err.message || "";
  const errCode = err.code || "";
  
  if (
    errCode === "PGRST204" || 
    errMsg.includes("schema cache") || 
    errMsg.includes("Could not find the") || 
    errMsg.includes("column")
  ) {
    let missingColumn = "column";
    let targetTable = "customers";

    const colMatch = errMsg.match(/Could not find the '([^']+)' column/i);
    if (colMatch && colMatch[1]) {
      missingColumn = colMatch[1];
    }

    const tableMatch = errMsg.match(/of '([^']+)'/i);
    if (tableMatch && tableMatch[1]) {
      targetTable = tableMatch[1];
    }

    return res.status(500).json({
      error: `Supabase Schema Cache Desync: ${errMsg}.\n\nTo resolve this:\nALTER TABLE public.${targetTable} ADD COLUMN IF NOT EXISTS ${missingColumn} TEXT;\nNOTIFY pgrst, 'reload schema';`
    });
  }

  if (errCode === "23514" || errMsg.includes("violates check constraint")) {
    return res.status(400).json({
      error: `Supabase Check Constraint Violation: ${errMsg}.\n\nTo resolve this:\nALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;\nALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('Pending', 'Cutting', 'Stitching', 'Fitting', 'Ready', 'Ready to Deliver', 'Delivered', 'Archived'));`
    });
  }
  
  if (errCode === "42P01" || errMsg.includes("relation") || errMsg.includes("does not exist") || errMsg.includes("Could not find the table")) {
    return res.status(500).json({
      error: "Database tables are missing in your Supabase project. Please execute the complete SQL script in /src/schema.sql inside your Supabase SQL Editor to initialize all tables."
    });
  }

  return res.status(500).json({ error: errMsg });
}

// -------------------------------------------------------------------------
// LOGGER UTILITY
// -------------------------------------------------------------------------
const ACTION_MODULE_MAP: Record<string, string> = {
  USER_LOGIN: "Auth",
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

function deriveUserNameFromDetails(details: Record<string, any>): string {
  return details.user_name || details.manager_name || details.name || details.email || '';
}

function deriveRecordIdFromDetails(action: string, details: Record<string, any>): string {
  return details.record_id || details.order_id || details.customer_id || details.id || details.workerId || '';
}

async function logAction(
  user: { id: string; email: string; shop_id?: string; name?: string; role?: string },
  action: string,
  details: Record<string, any>,
  token?: string,
  extra?: {
    module?: string;
    recordId?: string;
    previousValue?: any;
    newValue?: any;
    device?: string;
    ipAddress?: string;
    notes?: string;
  }
) {
  try {
    const moduleName = extra?.module || details.module || getModuleFromAction(action);
    const recordId = extra?.recordId || details.record_id || deriveRecordIdFromDetails(action, details);
    const enrichedDetails = {
      ...details,
      _meta: {
        userName: user.name || '',
        userRole: user.role || '',
        module: moduleName,
        recordId: recordId,
        previousValue: extra?.previousValue ?? details.previous_value ?? null,
        newValue: extra?.newValue ?? details.new_value ?? null,
        device: extra?.device || details.device || '',
        ipAddress: extra?.ipAddress || details.ip_address || '',
        notes: extra?.notes || details.notes || '',
      }
    };

    if (useLocalDb()) {
      db.logAction(
        action, user.id, user.email, user.shop_id, details,
        {
          userName: user.name || deriveUserNameFromDetails(details),
          userRole: user.role || 'Owner',
          module: moduleName,
          recordId,
          previousValue: extra?.previousValue ?? details.previous_value ?? undefined,
          newValue: extra?.newValue ?? details.new_value ?? undefined,
          device: extra?.device || details.device || '',
          ipAddress: extra?.ipAddress || details.ip_address || '',
          notes: extra?.notes || details.notes || '',
        }
      );
    } else {
      const userSupabase = getSupabaseClient(token);
      try {
        await userSupabase.from("audit_logs").insert([{
          user_id: user.id,
          user_email: user.email,
          user_name: user.name || deriveUserNameFromDetails(details) || '',
          user_role: user.role || 'Owner',
          shop_id: user.shop_id,
          action,
          module: moduleName,
          record_id: recordId,
          previous_value: extra?.previousValue ? JSON.stringify(extra.previousValue) : (details.previous_value ? JSON.stringify(details.previous_value) : null),
          new_value: extra?.newValue ? JSON.stringify(extra.newValue) : (details.new_value ? JSON.stringify(details.new_value) : null),
          device: extra?.device || details.device || '',
          ip_address: extra?.ipAddress || details.ip_address || '',
          notes: extra?.notes || details.notes || '',
          details: enrichedDetails,
          created_at: new Date().toISOString()
        }]);
      } catch (supaErr) {
        // Fallback: schema may not have new columns yet
        await userSupabase.from("audit_logs").insert([{
          user_id: user.id,
          user_email: user.email,
          shop_id: user.shop_id,
          action,
          details: enrichedDetails,
          created_at: new Date().toISOString()
        }]);
      }
    }
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

// -------------------------------------------------------------------------
// AUTHENTICATION API ENDPOINTS
// -------------------------------------------------------------------------

app.get("/api/config-status", (req: Request, res: Response) => {
  res.json({
    supabaseConnected: true,
    supabaseUrl: SUPABASE_URL || null,
    supabaseAnonKey: SUPABASE_ANON_KEY || null
  });
});

app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// Owner Protection: Verify account password using Supabase Auth
app.post("/api/auth/verify-password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password is required." });
  }

  try {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: req.user!.email,
      password: password
    });

    if (error || !data.session) {
      return res.status(401).json({ error: "Verification failed. Stayed in Worker mode." });
    }

    const { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user!.id)
      .single();

    if (profError || !profile || profile.role !== "Owner") {
      return res.status(403).json({ error: "Permission denied. Stayed in Worker mode." });
    }

    grantOwnerMode(req.token!);
    await logAction(req.user!, "ROLE_SWITCH_VERIFICATION_SUCCESS", {}, req.token);
    return res.json({ success: true });
  } catch (err) {
    console.error("Password switch verification error:", err);
    return res.status(401).json({ error: "Verification failed. Stayed in Worker mode." });
  }
});

app.post("/api/auth/exit-owner-mode", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.token) {
    revokeOwnerMode(req.token);
  }
  return res.json({ success: true });
});

// -------------------------------------------------------------------------
// SYNC STATUS ENDPOINTS
// -------------------------------------------------------------------------
app.get("/api/sync-status", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    if (!useLocalDb()) {
      res.json({ status: "synced", online: true, lastSyncAt: null, lastError: null, pendingCount: 0 });
      return;
    }
    const status = sync.getSyncStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync-now", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    sync.triggerSync(req.token || "");
    res.json({ message: "Sync triggered" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    if (useLocalDb()) {
      let data = db.getCustomers(req.user!.id, query);
      if (sortBy === "name") {
        data.sort((a, b) => sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
      } else {
        data.sort((a, b) => sortOrder === "asc" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
      }
      data = data.slice(offset, offset + limit);
      return res.json(data || []);
    }
    const userSupabase = getSupabaseClient(req.token);
    let reqQuery = userSupabase.from("customers").select("*").eq("created_by", req.user!.id);
    if (query) {
      reqQuery = reqQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
    }
    const { data, error } = await reqQuery
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.get("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    if (useLocalDb()) {
      const data = db.getCustomerById(customerId, req.user!.id);
      if (!data) return res.status(404).json({ error: "Customer not found or access denied." });
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();
    if (error) throw error;
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

  const cleanPhone = phone && phone.trim() !== "" ? phone.trim() : null;
  const dbPhone = cleanPhone || `NO-PHONE-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
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
      sync.syncAfterMutation("customers", customer.id, "insert", customer, req.token);
      return res.status(201).json(customer);
    }

    const userSupabase = getSupabaseClient(req.token);

    // Enforce name duplicate validation - if name already exists, phone number is required
    const { data: nameMatch } = await userSupabase
      .from("customers")
      .select("id")
      .eq("created_by", req.user!.id)
      .ilike("name", name.trim());

    if (nameMatch && nameMatch.length > 0 && !cleanPhone) {
      return res.status(400).json({ error: "A customer with this name already exists. A Phone Number is required to save a duplicate name." });
    }

    if (cleanPhone) {
      const { data: existing } = await userSupabase
        .from("customers")
        .select("*")
        .eq("phone", cleanPhone)
        .eq("created_by", req.user!.id)
        .maybeSingle();

      if (existing) {
        await logAction(req.user!, "GET_EXISTING_CUSTOMER_DUPLICATE", { customer_id: existing.id, name: existing.name }, req.token);
        return res.status(200).json({ alreadyExists: true, customer: existing });
      }
    }

    const { data: customer, error: custErr } = await userSupabase
      .from("customers")
      .insert([{
        name,
        phone: dbPhone,
        address: address || null,
        email: email || null,
        notes: notes || null,
        shop_id: req.user!.shop_id,
        created_by: req.user!.id,
        updated_by: req.user!.id,
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();

    if (custErr || !customer) throw custErr;

    const initialMeas = {
      customer_id: customer.id,
      shop_id: req.user!.shop_id,
      data: measurements || {},
      created_by: req.user!.id,
      updated_by: req.user!.id,
      created_at: now,
      updated_at: now
    };
    const { error: measErr } = await userSupabase.from("measurements").insert([initialMeas]);
    if (measErr) throw measErr;

    await logAction(req.user!, "CREATE_CUSTOMER", { customer_id: customer.id, name }, req.token);
    return res.status(201).json(customer);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

// Update customer
app.put("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { name, phone, address } = req.body;
  try {
    if (useLocalDb()) {
      const customer = db.getCustomerById(customerId, req.user!.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found or access denied." });
      }
      const updated = db.updateCustomer(customerId, req.user!.id, { name, phone, address, updated_by: req.user!.id });
      db.logAction("UPDATE_CUSTOMER", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
      sync.syncAfterMutation("customers", customerId, "update", updated, req.token);
      return res.json(updated);
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data: customer } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const { data: updated, error } = await userSupabase
      .from("customers")
      .update({
        name,
        phone: phone || null,
        address: address || null,
        updated_by: req.user!.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .select()
      .single();
    if (error) throw error;
    await logAction(req.user!, "UPDATE_CUSTOMER", { customer_id: customerId }, req.token);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete customer
app.delete("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    if (useLocalDb()) {
      const deleted = db.deleteCustomer(customerId, req.user!.id);
      if (!deleted) {
        return res.status(404).json({ error: "Customer not found or access denied." });
      }
      db.logAction("DELETE_CUSTOMER", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
      sync.syncAfterMutation("customers", customerId, "delete", null, req.token);
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data: customer } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();
    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }
    const { error: measErr } = await userSupabase
      .from("measurements")
      .delete()
      .eq("customer_id", customerId)
      .eq("created_by", req.user!.id);
    if (measErr) throw measErr;
    const { error } = await userSupabase
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("created_by", req.user!.id);
    if (error) throw error;
    await logAction(req.user!, "DELETE_CUSTOMER", { customer_id: customerId }, req.token);
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
    if (useLocalDb()) {
      const customer = db.getCustomerById(customerId, req.user!.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found or access denied." });
      }
      const data = db.getMeasurements(customerId, req.user!.id);
      if (!data || data.length === 0) {
        return res.json({ customer_id: customerId, data: {} });
      }
      return res.json(data[0]);
    }
    const userSupabase = getSupabaseClient(req.token);
    
    // First verify customer ownership
    const { data: customer } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }

    const { data, error } = await userSupabase
      .from("measurements")
      .select("*")
      .eq("customer_id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.json({ customer_id: customerId, data: {} });
    }
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/customers/:id/measurements", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { data: measurementData } = req.body;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const customer = db.getCustomerById(customerId, req.user!.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found or access denied." });
      }
      const updated = db.upsertMeasurement(customerId, req.user!.id, measurementData, req.user!.id);
      db.logAction("UPDATE_MEASUREMENTS", req.user!.id, req.user!.email, req.user!.shop_id, { customer_id: customerId });
      sync.syncAfterMutation("measurements", updated.id, "update", updated, req.token);
      return res.json(updated);
    }
    const userSupabase = getSupabaseClient(req.token);

    // First verify customer ownership
    const { data: customer } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }

    const { data, error } = await userSupabase
      .from("measurements")
      .select("*")
      .eq("customer_id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const { data: updated, error: uErr } = await userSupabase
        .from("measurements")
        .update({
          data: measurementData,
          updated_by: req.user!.id,
          updated_at: now
        })
        .eq("customer_id", customerId)
        .eq("created_by", req.user!.id)
        .select()
        .single();
      if (uErr) throw uErr;
      await logAction(req.user!, "UPDATE_MEASUREMENTS", { customer_id: customerId }, req.token);
      return res.json(updated);
    } else {
      const { data: inserted, error: iErr } = await userSupabase
        .from("measurements")
        .insert([{
          customer_id: customerId,
          shop_id: req.user!.shop_id,
          data: measurementData,
          created_by: req.user!.id,
          updated_by: req.user!.id,
          created_at: now,
          updated_at: now
        }])
        .select()
        .single();
      if (iErr) throw iErr;
      await logAction(req.user!, "CREATE_MEASUREMENTS", { customer_id: customerId }, req.token);
      return res.json(inserted);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/customers/:id/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    if (useLocalDb()) {
      const customer = db.getCustomerById(customerId, req.user!.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found or access denied." });
      }
      const data = db.getOrders(req.user!.id, { customerId });
      const enriched = (data || []).map((o: any) => {
        const c = db.getCustomerById(o.customer_id, req.user!.id);
        return { ...o, customer_name: c?.name || "Unknown Customer", customer_phone: c?.phone || "N/A", customer_address: c?.address || null };
      });
      return res.json(enriched);
    }
    const userSupabase = getSupabaseClient(req.token);

    // First verify customer ownership
    const { data: customer } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ error: "Customer not found or access denied." });
    }

    const { data, error } = await userSupabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_id,
        status,
        items,
        total_amount,
        paid_amount,
        due_date,
        created_at,
        updated_at,
        created_by,
        updated_by,
        customers (
          name,
          phone,
          address
        )
      `)
      .eq("customer_id", customerId)
      .eq("created_by", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const enriched = (data || []).map((o: any) => ({
      ...o,
      customer_name: o.customers?.name || "Unknown Customer",
      customer_phone: o.customers?.phone || "N/A",
      customer_address: o.customers?.address || null
    }));
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
    if (useLocalDb()) {
      const settingsMap = db.getSettings(req.user!.id);
      let autoArchiveDays = 30;
      if (settingsMap.auto_archive_days !== undefined) {
        autoArchiveDays = Number(settingsMap.auto_archive_days);
      }
      if (autoArchiveDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - autoArchiveDays);
        db.archiveOrders(req.user!.id, cutoffDate.toISOString(), "Delivered");
      }
      let data;
      if (statusFilter && statusFilter !== "All") {
        data = db.getOrders(req.user!.id, { status: statusFilter, search });
      } else {
        data = db.getOrders(req.user!.id, { status: "active", search });
      }
      const enriched = data.map(o => {
        const c = db.getCustomerById(o.customer_id, req.user!.id);
        return {
          ...o,
          customer_name: c?.name || "Unknown Customer",
          customer_phone: c?.phone || "N/A",
          customer_address: c?.address || null
        };
      });
      const sliced = enriched.slice(offset, offset + limit);
      return res.json(sliced);
    }

    const userSupabase = getSupabaseClient(req.token);
    let autoArchiveDays = 30;
    try {
      const settingsMap = await getAccountSettings(userSupabase, req.user!.id);
      if (settingsMap.auto_archive_days !== undefined) {
        autoArchiveDays = Number(settingsMap.auto_archive_days);
      }
    } catch (err) {
      console.error("Error loading auto_archive_days from settings in Supabase:", err);
    }

    if (autoArchiveDays > 0 && IS_DELIVERED_AT_AVAILABLE) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - autoArchiveDays);
      const { data: ordersToArchive } = await userSupabase
        .from("orders")
        .select("id")
        .eq("status", "Delivered")
        .eq("created_by", req.user!.id)
        .lte("delivered_at", cutoffDate.toISOString());

      if (ordersToArchive && ordersToArchive.length > 0) {
        const ids = ordersToArchive.map((o: any) => o.id);
        await userSupabase
          .from("orders")
          .update({ status: "Archived", updated_at: new Date().toISOString() })
          .eq("created_by", req.user!.id)
          .in("id", ids);
      }
    }

    let query = userSupabase.from("orders").select(`
      id,
      order_number,
      customer_id,
      status,
      items,
      total_amount,
      paid_amount,
      due_date,
      delivered_at,
      created_at,
      updated_at,
      created_by,
      updated_by,
      customers (
        name,
        phone
      )
    `).eq("created_by", req.user!.id);

    if (statusFilter && statusFilter !== "All") {
      query = query.eq("status", statusFilter);
    } else {
      query = query.neq("status", "Delivered").neq("status", "Archived");
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    let orders = (data || []).map((o: any) => ({
      ...o,
      customer_name: o.customers?.name || "Unknown Customer",
      customer_phone: o.customers?.phone || "N/A",
      customer_address: o.customers?.address || null
    }));

    if (search) {
      orders = orders.filter(
        (o: any) =>
          o.order_number.toLowerCase().includes(search) ||
          o.customer_name.toLowerCase().includes(search) ||
          o.customer_phone.includes(search)
      );
    }

    return res.json(orders);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.get("/api/orders/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
    if (useLocalDb()) {
      const data = db.getOrderById(orderId, req.user!.id);
      if (!data) return res.status(404).json({ error: "Order not found or access denied." });
      const c = db.getCustomerById(data.customer_id, req.user!.id);
      const mapped = {
        ...data,
        customer_name: c?.name || "Unknown Customer",
        customer_phone: c?.phone || "N/A",
        customer_address: c?.address || null
      };
      return res.json(mapped);
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("orders")
      .select(`
        *,
        customers (
          name,
          phone,
          address
        )
      `)
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found or access denied." });
    const mapped = {
      ...data,
      customer_name: data.customers?.name || "Unknown Customer",
      customer_phone: data.customers?.phone || "N/A",
      customer_address: data.customers?.address || null
    };
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { customer_id, items, total_amount, discount_type, discount_value, discount_amount, final_total, paid_amount, due_date } = req.body;
  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer and at least one item are required." });
  }

  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
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
      db.logAction("CREATE_ORDER", req.user!.id, req.user!.email, req.user!.shop_id, { order_id: order.id, order_number: orderNumber });
      sync.syncAfterMutation("orders", order.id, "insert", order, req.token);
      const c = db.getCustomerById(order.customer_id, req.user!.id);
      return res.status(201).json({
        ...order,
        customer_name: c?.name || "Unknown Customer",
        customer_phone: c?.phone || "N/A",
        customer_address: c?.address || null
      });
    }

    const userSupabase = getSupabaseClient(req.token);

    // Verify that the customer belongs to this shop
    const { data: customerCheck } = await userSupabase
      .from("customers")
      .select("id")
      .eq("id", customer_id)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    if (!customerCheck) {
      return res.status(400).json({ error: "Invalid customer ID or access denied." });
    }

    const { data: meas } = await userSupabase
      .from("measurements")
      .select("data")
      .eq("customer_id", customer_id)
      .eq("created_by", req.user!.id)
      .maybeSingle();

    const snapshot = meas ? meas.data : {};

    let defaultStatus = "Pending";
    try {
      const settingsMap = await getAccountSettings(userSupabase, req.user!.id);
      const stages = settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages;
      const firstActive = stages.find((s: any) => s.enabled && s.id !== "Archived");
      if (firstActive) {
        defaultStatus = firstActive.id;
      }
    } catch (err) {
      console.error("Failed to resolve starting status:", err);
    }

    let orderNumber = "";
    try {
      const { data: latestOrders, error: latestErr } = await supabaseAdmin
        .from("orders")
        .select("order_number")
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestErr) { throw latestErr; }

      let nextNum = 1001;
      if (latestOrders && latestOrders.length > 0) {
        const latest = latestOrders[0].order_number;
        const match = latest.match(/(\d+)/);
        if (match) { nextNum = parseInt(match[1], 10) + 1; }
      } else {
        const { count: globalCount } = await supabaseAdmin
          .from("orders")
          .select("*", { count: "exact", head: true });
        nextNum = (globalCount || 0) + 1001;
      }
      orderNumber = `ORD-${nextNum}`;
    } catch (err) {
      console.error("Failed to generate incrementing order number, using robust fallback:", err);
      orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    }

    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .insert([{
        shop_id: req.user!.shop_id,
        order_number: orderNumber,
        customer_id,
        status: defaultStatus,
        items,
        total_amount,
        discount_type: discount_type || null,
        discount_value: discount_value || 0,
        discount_amount: discount_amount || 0,
        final_total: final_total ?? total_amount,
        paid_amount,
        due_date,
        measurement_snapshot: snapshot,
        created_by: req.user!.id,
        updated_by: req.user!.id,
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();

    if (orderErr) throw orderErr;

    const { data: cust } = await userSupabase
      .from("customers")
      .select("name, phone, address")
      .eq("id", customer_id)
      .maybeSingle();

    await logAction(req.user!, "CREATE_ORDER", { order_id: order.id, order_number: orderNumber }, req.token);
    return res.status(201).json({
      ...order,
      customer_name: cust?.name || "Unknown Customer",
      customer_phone: cust?.phone || "N/A",
      customer_address: cust?.address || null
    });
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.put("/api/orders/:id/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const now = new Date().toISOString();

  if (!status) {
    return res.status(400).json({ error: "Status value is required." });
  }

  try {
    if (useLocalDb()) {
      const oldOrder = db.getOrderById(orderId, req.user!.id);
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

      sync.syncAfterMutation("orders", orderId, "update", order, req.token);
      const c = db.getCustomerById(order.customer_id, req.user!.id);
      return res.json({
        ...order,
        customer_name: c?.name || "Unknown Customer",
        customer_phone: c?.phone || "N/A",
        customer_address: c?.address || null
      });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data: oldOrder } = await userSupabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .single();

    const updateData: any = {
      status,
      updated_by: req.user!.id,
      updated_at: now
    };

    if (status === "Delivered") {
      updateData.delivered_at = now;
    } else if (status !== "Archived") {
      updateData.delivered_at = null;
    }

    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .select()
      .single();

    if (orderErr) throw orderErr;

    const { data: cust } = await userSupabase
      .from("customers")
      .select("name, phone, address")
      .eq("id", order.customer_id)
      .maybeSingle();

    await logAction(req.user!, "UPDATE_ORDER_STATUS", { order_id: orderId, order_number: order?.order_number, status }, req.token, {
      module: "Orders", recordId: orderId,
      previousValue: { status: oldOrder?.status },
      newValue: { status },
    });

    if (status === "Delivered") {
      await logAction(req.user!, "DELIVERY_COMPLETED", { order_id: orderId, order_number: order?.order_number }, req.token, {
        module: "Orders", recordId: orderId,
        notes: "Order delivered",
      });
    }

    return res.json({
      ...order,
      customer_name: cust?.name || "Unknown Customer",
      customer_phone: cust?.phone || "N/A",
      customer_address: cust?.address || null
    });
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.put("/api/orders/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { items, total_amount, discount_type, discount_value, discount_amount, final_total, paid_amount, due_date, status, measurement_snapshot } = req.body;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
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

      sync.syncAfterMutation("orders", orderId, "update", order, req.token);
      const c = db.getCustomerById(order.customer_id, req.user!.id);
      return res.json({
        ...order,
        customer_name: c?.name || "Unknown Customer",
        customer_phone: c?.phone || "N/A",
        customer_address: c?.address || null
      });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data: oldOrder } = await userSupabase
      .from("orders")
      .select("paid_amount, total_amount, status")
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .single();

    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .update({
        items,
        total_amount,
        discount_type: discount_type ?? undefined,
        discount_value,
        discount_amount,
        final_total,
        paid_amount,
        due_date,
        status,
        measurement_snapshot,
        updated_by: req.user!.id,
        updated_at: now
      })
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .select()
      .single();

    if (orderErr) throw orderErr;

    const oldPaid = oldOrder?.paid_amount || 0;
    const newPaid = order.paid_amount || 0;
    const paymentDiff = newPaid - oldPaid;

    await logAction(req.user!, "EDIT_ORDER", { order_id: orderId, order_number: order?.order_number }, req.token, {
      module: "Orders", recordId: orderId,
      previousValue: { paid_amount: oldPaid, total_amount: oldOrder?.total_amount },
      newValue: { paid_amount: newPaid, total_amount: order.total_amount },
    });

    if (paymentDiff > 0) {
      await logAction(req.user!, "PAYMENT_RECEIVED", { order_id: orderId, order_number: order?.order_number, amount: paymentDiff }, req.token, {
        module: "Payments", recordId: orderId,
        previousValue: { paid_amount: oldPaid },
        newValue: { paid_amount: newPaid },
        notes: `Payment of ${paymentDiff} collected`,
      });
    } else if (paymentDiff < 0) {
      await logAction(req.user!, "REFUND", { order_id: orderId, order_number: order?.order_number, amount: Math.abs(paymentDiff) }, req.token, {
        module: "Payments", recordId: orderId,
        previousValue: { paid_amount: oldPaid },
        newValue: { paid_amount: newPaid },
        notes: `Refund of ${Math.abs(paymentDiff)} processed`,
      });
    }

    if (status && oldOrder && oldOrder.status !== status) {
      await logAction(req.user!, "UPDATE_ORDER_STATUS", { order_id: orderId, order_number: order?.order_number, status }, req.token, {
        module: "Orders", recordId: orderId,
        previousValue: { status: oldOrder.status },
        newValue: { status },
      });
      if (status === "Delivered") {
        await logAction(req.user!, "DELIVERY_COMPLETED", { order_id: orderId, order_number: order?.order_number }, req.token, {
          module: "Orders", recordId: orderId,
          notes: "Order marked as delivered",
        });
      }
    }

    const { data: cust } = await userSupabase
      .from("customers")
      .select("name, phone, address")
      .eq("id", order.customer_id)
      .maybeSingle();

    return res.json({
      ...order,
      customer_name: cust?.name || "Unknown Customer",
      customer_phone: cust?.phone || "N/A",
      customer_address: cust?.address || null
    });
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.delete("/api/orders/:id", requireAuth, requireRole(["Owner"]), requireOwnerMode, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
    if (useLocalDb()) {
      const order = db.getOrderById(orderId, req.user!.id);
      const deleted = db.deleteOrder(orderId, req.user!.id);
      if (!deleted) return res.status(404).json({ error: "Order not found or access denied." });
      db.logAction("DELETE_ORDER", req.user!.id, req.user!.email, req.user!.shop_id, { id: orderId, order_number: order?.order_number });
      sync.syncAfterMutation("orders", orderId, "delete", null, req.token);
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data: order } = await userSupabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .eq("created_by", req.user!.id)
      .single();

    const { error } = await userSupabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("created_by", req.user!.id);

    if (error) throw error;
    await logAction(req.user!, "DELETE_ORDER", { id: orderId, order_number: order?.order_number }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// WORKER MANAGEMENT (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/workers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const data = db.getProfilesByOwner(req.user!.id);
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("profiles")
      .select("*")
      .eq("created_by", req.user!.id);
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/workers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Worker Name is required." });
  }

  const role = "Worker";
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const email = `${sanitizedName}_${randomSuffix}@internal-worker.local`;
  const password = Math.random().toString(36).substring(2, 15) + "Wk!" + Math.floor(Math.random() * 1000) + "S!";

  const now = new Date().toISOString();

  try {
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authErr || !authUser.user) {
      throw new Error(authErr?.message || "Failed to create Supabase Auth credentials.");
    }

    const newProfile = {
      id: authUser.user.id,
      email,
      name,
      role,
      shop_id: req.user!.shop_id,
      created_by: req.user!.id,
      updated_by: req.user!.id
    };

    if (useLocalDb()) {
      db.upsertProfile(newProfile);
      db.logAction("CREATE_WORKER", req.user!.id, req.user!.email, req.user!.shop_id, { email, role, name });
      sync.syncAfterMutation("profiles", newProfile.id, "insert", newProfile, req.token);
    } else {
      const { error: profErr } = await supabaseAdmin.from("profiles").upsert([{ ...newProfile, created_at: now, updated_at: now }], { onConflict: 'id' });
      if (profErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        throw profErr;
      }
    }

    await logAction(req.user!, "CREATE_WORKER", { email, role, name }, req.token);
    
    return res.status(201).json({
      id: newProfile.id,
      name: newProfile.name,
      role: newProfile.role,
      shop_id: newProfile.shop_id,
      created_at: now,
      updated_at: now
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/workers/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.params.id;

  if (workerId === req.user!.id) {
    return res.status(400).json({ error: "You cannot delete your own Owner account." });
  }

  try {
    let targetProfile;
    if (useLocalDb()) {
      const profiles = db.getProfilesByOwner(req.user!.id);
      targetProfile = profiles.find((p: any) => p.id === workerId);
    } else {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", workerId)
        .eq("created_by", req.user!.id)
        .maybeSingle();
      targetProfile = data;
    }

    if (!targetProfile) {
      return res.status(404).json({ error: "Worker not found or access denied." });
    }

    if (targetProfile.role === "Owner") {
      let count;
      if (useLocalDb()) {
        const allProfiles = db.getProfilesByOwner(req.user!.id);
        count = allProfiles.filter((p: any) => p.role === "Owner").length;
      } else {
        const { count: c } = await supabaseAdmin
          .from("profiles")
          .select("*", { count: "exact" })
          .eq("role", "Owner")
          .eq("created_by", req.user!.id);
        count = c;
      }

      if (count && count <= 1) {
        return res.status(400).json({ error: "Cannot delete the last Owner account. Create another Owner first." });
      }
    }

    if (useLocalDb()) {
      db.deleteProfile(workerId);
      db.logAction("DELETE_WORKER", req.user!.id, req.user!.email, req.user!.shop_id, { id: workerId, email: targetProfile.email });
    } else {
      await supabaseAdmin.from("audit_logs").delete().eq("user_id", workerId);
      await supabaseAdmin.from("shop_settings").delete().eq("user_id", workerId);
      await supabaseAdmin.from("shops").delete().eq("created_by", workerId);
      const { error: profErr } = await supabaseAdmin.from("profiles").delete().eq("id", workerId);
      if (profErr) throw profErr;
      try { await supabaseAdmin.from("auth.identities").delete().eq("id", workerId); } catch (e) { /* identities table may not be accessible */ }
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(workerId);
    if (authErr) throw authErr;

    await logAction(req.user!, "DELETE_WORKER", { id: workerId, email: targetProfile?.email }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// SHOP SETTINGS & SYSTEM BACKUPS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const settingsMap = db.getSettings(req.user!.id);
      return res.json({
        ...DEFAULT_SHOP_SETTINGS,
        ...settingsMap,
        updated_at: new Date().toISOString(),
        updated_by: req.user!.id
      });
    }
    const userSupabase = getSupabaseClient(req.token);
    const settingsMap = await getAccountSettings(userSupabase, req.user!.id);
    return res.json(settingsMap);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/settings", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const settingsData = req.body;

  try {
    if (useLocalDb()) {
      for (const [key, value] of Object.entries(settingsData)) {
        if (key === "updated_at" || key === "updated_by") continue;
        db.saveSetting(key, value, req.user!.id, req.user!.id);
      }
      db.logAction("UPDATE_SETTINGS", req.user!.id, req.user!.email, req.user!.shop_id, {});
      return res.json(settingsData);
    }
    const userSupabase = getSupabaseClient(req.token);
    await saveAccountSettings(userSupabase, req.user!.id, settingsData);
    await logAction(req.user!, "UPDATE_SETTINGS", {}, req.token);
    return res.json(settingsData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// GARMENT TYPES HELPERS & ENDPOINTS (Owner Only)
// -------------------------------------------------------------------------

async function getGarmentTypes(userSupabase: any, userId: string, shopId: string): Promise<any[]> {
  try {
    const { data, error } = await userSupabase
      .from("garment_types")
      .select("*")
      .eq("created_by", userId);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find")) {
        return await getGarmentTypesFromSettings(userSupabase, userId);
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.sort((a: any, b: any) => a.display_order - b.display_order);
  } catch (err) {
    console.warn("getGarmentTypes failed, falling back to shop_settings:", err);
    return await getGarmentTypesFromSettings(userSupabase, userId);
  }
}

async function getGarmentTypesFromSettings(userSupabase: any, userId: string): Promise<any[]> {
  const { data, error } = await userSupabase
    .from("shop_settings")
    .select("value")
    .eq("key", `${userId}:garment_types`)
    .maybeSingle();

  if (error || !data || !data.value) {
    return [];
  }

  return (data.value || []).sort((a: any, b: any) => a.display_order - b.display_order);
}

async function isGarmentTypeUsed(userSupabase: any, userId: string, garmentTypeName: string): Promise<boolean> {
  try {
    const { data: orders, error } = await userSupabase
      .from("orders")
      .select("items")
      .eq("created_by", userId);

    if (error || !orders) return false;

    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        if (item && typeof item === "object" && item.type === garmentTypeName) {
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    console.error("Error checking if garment type is used:", err);
    return false;
  }
}

app.get("/api/garment-types", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const data = db.getGarmentTypes(req.user!.id, req.user!.shop_id);
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);
    const data = await getGarmentTypes(userSupabase, req.user!.id, req.user!.shop_id || "default-shop");
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/garment-types", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { name, enabled, display_order, price, measurement_fields } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Garment Type name is required." });
  }

  const userId = req.user!.id;
  const shopId = req.user!.shop_id || "default-shop";
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const data = db.createGarmentType({
        name, enabled, display_order, price, measurement_fields,
        shop_id: shopId, created_by: userId, updated_by: userId
      });
      db.logAction("CREATE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id: data.id, name });
      sync.syncAfterMutation("garment_types", data.id, "insert", data, req.token);
      return res.status(201).json(data);
    }
    const userSupabase = getSupabaseClient(req.token);

    const { data, error } = await userSupabase
      .from("garment_types")
      .insert([{
        name,
        enabled: enabled !== false,
        display_order: display_order || 0,
        price: price || 0,
        measurement_fields: measurement_fields || [],
        shop_id: shopId,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();

    if (!error && data) {
      await logAction(req.user!, "CREATE_GARMENT_TYPE", { id: data.id, name }, req.token);
      return res.status(201).json(data);
    }

    if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
      const currentList = await getGarmentTypesFromSettings(userSupabase, userId);
      const newId = "gt-" + Math.random().toString(36).substring(2, 11);
      const newItem = {
        id: newId,
        name,
        enabled: enabled !== false,
        display_order: display_order !== undefined ? display_order : currentList.length,
        price: price || 0,
        measurement_fields: measurement_fields || []
      };
      const updatedList = [...currentList, newItem];
      await userSupabase.from("shop_settings").upsert({
        key: `${userId}:garment_types`,
        value: updatedList,
        updated_at: now,
        updated_by: userId,
        user_id: userId
      });
      await logAction(req.user!, "CREATE_GARMENT_TYPE_FALLBACK", { id: newId, name }, req.token);
      return res.status(201).json(newItem);
    }

    throw error;
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/garment-types/reorder", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "An array of garment type IDs is required." });
  }

  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      db.reorderGarmentTypes(ids, userId);
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);

    let isTableAvailable = true;
    for (let idx = 0; idx < ids.length; idx++) {
      const { error } = await userSupabase
        .from("garment_types")
        .update({ display_order: idx, updated_at: now })
        .eq("id", ids[idx])
        .eq("created_by", userId);

      if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
        isTableAvailable = false;
        break;
      }
    }

    if (isTableAvailable) {
      await logAction(req.user!, "REORDER_GARMENT_TYPES", { count: ids.length }, req.token);
      return res.json({ success: true });
    }

    const currentList = await getGarmentTypesFromSettings(userSupabase, userId);
    const updatedList = currentList.map((item) => {
      const idx = ids.indexOf(item.id);
      return {
        ...item,
        display_order: idx !== -1 ? idx : item.display_order
      };
    }).sort((a, b) => a.display_order - b.display_order);

    await userSupabase.from("shop_settings").upsert({
      key: `${userId}:garment_types`,
      value: updatedList,
      updated_at: now,
      updated_by: userId,
      user_id: userId
    });
    await logAction(req.user!, "REORDER_GARMENT_TYPES_FALLBACK", { count: ids.length }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/garment-types/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, enabled, display_order, price, measurement_fields } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const data = db.updateGarmentType(id, userId, { name, enabled, display_order, price, measurement_fields, updated_by: userId });
      if (!data) return res.status(404).json({ error: "Garment type not found." });
      db.logAction("UPDATE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id, name });
      sync.syncAfterMutation("garment_types", id, "update", data, req.token);
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);

    const updatePayload: any = { updated_at: now };
    if (name !== undefined) updatePayload.name = name;
    if (enabled !== undefined) updatePayload.enabled = enabled;
    if (display_order !== undefined) updatePayload.display_order = display_order;
    if (price !== undefined) updatePayload.price = price;
    if (measurement_fields !== undefined) updatePayload.measurement_fields = measurement_fields;

    const { data, error } = await userSupabase
      .from("garment_types")
      .update(updatePayload)
      .eq("id", id)
      .eq("created_by", userId)
      .select()
      .maybeSingle();

    if (!error && data) {
      await logAction(req.user!, "UPDATE_GARMENT_TYPE", { id, name }, req.token);
      return res.json(data);
    }

    if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
      // Proceed to fallback
    } else if (!error && !data) {
      // Try fallback if not found in physical DB table row
    } else {
      throw error;
    }

    const currentList = await getGarmentTypesFromSettings(userSupabase, userId);
    let updatedItem: any = null;
    const updatedList = currentList.map((item) => {
      if (item.id === id) {
        updatedItem = {
          ...item,
          name: name !== undefined ? name : item.name,
          enabled: enabled !== undefined ? enabled : item.enabled,
          display_order: display_order !== undefined ? display_order : item.display_order,
          price: price !== undefined ? price : item.price,
          measurement_fields: measurement_fields !== undefined ? measurement_fields : item.measurement_fields
        };
        return updatedItem;
      }
      return item;
    });

    if (!updatedItem) {
      return res.status(404).json({ error: "Garment type not found." });
    }

    await userSupabase.from("shop_settings").upsert({
      key: `${userId}:garment_types`,
      value: updatedList,
      updated_at: now,
      updated_by: userId,
      user_id: userId
    });
    await logAction(req.user!, "UPDATE_GARMENT_TYPE_FALLBACK", { id, name }, req.token);
    return res.json(updatedItem);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/garment-types/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const gt = db.getGarmentTypes(userId).find((g: any) => g.id === id);
      if (!gt) return res.status(404).json({ error: "Garment type not found." });
      const del = db.deleteGarmentType(id, userId);
      if (!del) return res.status(404).json({ error: "Garment type not found." });
      db.logAction("DELETE_GARMENT_TYPE", userId, req.user!.email, req.user!.shop_id, { id, name: gt.name });
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);

    let garmentTypeName = "";
    let isFromTable = true;

    const { data: dbItem, error: fetchErr } = await userSupabase
      .from("garment_types")
      .select("name")
      .eq("id", id)
      .eq("created_by", userId)
      .maybeSingle();

    if (dbItem) {
      garmentTypeName = dbItem.name;
    } else {
      isFromTable = false;
    }

    if (!isFromTable) {
      const currentList = await getGarmentTypesFromSettings(userSupabase, userId);
      const found = currentList.find((item) => item.id === id);
      if (found) {
        garmentTypeName = found.name;
      }
    }

    if (!garmentTypeName) {
      return res.status(404).json({ error: "Garment type not found." });
    }

    const used = await isGarmentTypeUsed(userSupabase, userId, garmentTypeName);
    if (used) {
      return res.status(400).json({ error: `Cannot delete garment type "${garmentTypeName}" because it is currently used in existing orders.` });
    }

    if (isFromTable) {
      const { error: delErr } = await userSupabase
        .from("garment_types")
        .delete()
        .eq("id", id)
        .eq("created_by", userId);
      if (!delErr) {
        if (IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE) {
          await userSupabase
            .from("styling_categories")
            .delete()
            .eq("garment_type_id", id)
            .eq("created_by", userId);
        } else {
          try {
            const currentStyling = await getStylingCategoriesFromSettings(userSupabase, userId);
            const updatedStyling = currentStyling.filter(sc => sc.garment_type_id !== id);
            await userSupabase.from("shop_settings").upsert({
              key: `${userId}:styling_categories`,
              value: updatedStyling,
              updated_at: now,
              updated_by: userId,
              user_id: userId
            });
          } catch (scErr) {
            console.error("Failed to clean up fallback styling categories on database delete:", scErr);
          }
        }

        await logAction(req.user!, "DELETE_GARMENT_TYPE", { id, name: garmentTypeName }, req.token);
        return res.json({ success: true });
      }
    }

    const currentList = await getGarmentTypesFromSettings(userSupabase, userId);
    const updatedList = currentList.filter((item) => item.id !== id);
    await userSupabase.from("shop_settings").upsert({
      key: `${userId}:garment_types`,
      value: updatedList,
      updated_at: now,
      updated_by: userId,
      user_id: userId
    });

    try {
      const currentStyling = await getStylingCategoriesFromSettings(userSupabase, userId);
      const updatedStyling = currentStyling.filter(sc => sc.garment_type_id !== id);
      await userSupabase.from("shop_settings").upsert({
        key: `${userId}:styling_categories`,
        value: updatedStyling,
        updated_at: now,
        updated_by: userId,
        user_id: userId
      });
    } catch (scErr) {
      console.error("Failed to clean up fallback styling categories on settings delete:", scErr);
    }

    await logAction(req.user!, "DELETE_GARMENT_TYPE_FALLBACK", { id, name: garmentTypeName }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// STYLING CATEGORIES HELPERS & ENDPOINTS (Owner Only)
// -------------------------------------------------------------------------

async function getStylingCategories(userSupabase: any, userId: string, shopId: string, garmentTypeId?: string): Promise<any[]> {
  try {
    if (!IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE) {
      return await getStylingCategoriesFromSettings(userSupabase, userId, garmentTypeId);
    }

    const { data, error } = await userSupabase
      .from("styling_categories")
      .select("*")
      .eq("created_by", userId);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find")) {
        return await getStylingCategoriesFromSettings(userSupabase, userId, garmentTypeId);
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    let result = data;
    if (garmentTypeId) {
      result = data.filter((item: any) => item.garment_type_id === garmentTypeId);
    }

    return result.sort((a: any, b: any) => a.display_order - b.display_order);
  } catch (err) {
    console.warn("getStylingCategories failed, falling back to shop_settings:", err);
    return await getStylingCategoriesFromSettings(userSupabase, userId, garmentTypeId);
  }
}

async function getStylingCategoriesFromSettings(userSupabase: any, userId: string, garmentTypeId?: string): Promise<any[]> {
  const { data, error } = await userSupabase
    .from("shop_settings")
    .select("value")
    .eq("key", `${userId}:styling_categories`)
    .maybeSingle();

  if (error || !data || !data.value) {
    return [];
  }

  let list = data.value || [];
  if (garmentTypeId) {
    list = list.filter((item: any) => item.garment_type_id === garmentTypeId);
  }

  return list.sort((a: any, b: any) => a.display_order - b.display_order);
}

app.get("/api/styling-categories", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const garmentTypeId = req.query.garment_type_id as string | undefined;
  try {
    if (useLocalDb()) {
      const data = db.getStylingCategories(req.user!.id, garmentTypeId);
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);
    const data = await getStylingCategories(userSupabase, req.user!.id, req.user!.shop_id || "default-shop", garmentTypeId);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/styling-categories", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { name, display_order, options, garment_type_id } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Styling Category name is required." });
  }

  const userId = req.user!.id;
  const shopId = req.user!.shop_id || "default-shop";
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const data = db.createStylingCategory({
        name, display_order, options, garment_type_id,
        shop_id: shopId, created_by: userId, updated_by: userId
      });
      db.logAction("CREATE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id: data.id, name });
      sync.syncAfterMutation("styling_categories", data.id, "insert", data, req.token);
      return res.status(201).json(data);
    }
    const userSupabase = getSupabaseClient(req.token);

    if (!IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE) {
      const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
      const newId = "sc-" + Math.random().toString(36).substring(2, 11);
      const newItem = { id: newId, name, display_order: display_order !== undefined ? display_order : currentList.length, options: options || [], garment_type_id: garment_type_id || null };
      const updatedList = [...currentList, newItem];
      await userSupabase.from("shop_settings").upsert({ key: `${userId}:styling_categories`, value: updatedList, updated_at: now, updated_by: userId, user_id: userId });
      await logAction(req.user!, "CREATE_STYLING_CATEGORY_FALLBACK", { id: newId, name }, req.token);
      return res.status(201).json(newItem);
    }

    const { data, error } = await userSupabase
      .from("styling_categories")
      .insert([{ name, display_order: display_order || 0, options: options || [], garment_type_id: garment_type_id || null, shop_id: shopId, created_by: userId, updated_by: userId, created_at: now, updated_at: now }])
      .select()
      .single();

    if (!error && data) {
      await logAction(req.user!, "CREATE_STYLING_CATEGORY", { id: data.id, name }, req.token);
      return res.status(201).json(data);
    }

    if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
      const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
      const newId = "sc-" + Math.random().toString(36).substring(2, 11);
      const newItem = { id: newId, name, display_order: display_order !== undefined ? display_order : currentList.length, options: options || [], garment_type_id: garment_type_id || null };
      const updatedList = [...currentList, newItem];
      await userSupabase.from("shop_settings").upsert({ key: `${userId}:styling_categories`, value: updatedList, updated_at: now, updated_by: userId, user_id: userId });
      await logAction(req.user!, "CREATE_STYLING_CATEGORY_FALLBACK", { id: newId, name }, req.token);
      return res.status(201).json(newItem);
    }

    throw error;
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/styling-categories/reorder", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "An array of styling category IDs is required." });
  }

  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      db.reorderStylingCategories(ids, userId);
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);

    let isTableAvailable = true;
    for (let idx = 0; idx < ids.length; idx++) {
      const { error } = await userSupabase
        .from("styling_categories")
        .update({ display_order: idx, updated_at: now })
        .eq("id", ids[idx])
        .eq("created_by", userId);

      if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
        isTableAvailable = false;
        break;
      }
    }

    if (isTableAvailable) {
      await logAction(req.user!, "REORDER_STYLING_CATEGORIES", { count: ids.length }, req.token);
      return res.json({ success: true });
    }

    const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
    const updatedList = currentList.map((item) => {
      const idx = ids.indexOf(item.id);
      return { ...item, display_order: idx !== -1 ? idx : item.display_order };
    }).sort((a, b) => a.display_order - b.display_order);

    await userSupabase.from("shop_settings").upsert({ key: `${userId}:styling_categories`, value: updatedList, updated_at: now, updated_by: userId, user_id: userId });
    await logAction(req.user!, "REORDER_STYLING_CATEGORIES_FALLBACK", { count: ids.length }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/styling-categories/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, display_order, options, garment_type_id } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      const data = db.updateStylingCategory(id, userId, { name, display_order, options, garment_type_id });
      if (!data) return res.status(404).json({ error: "Styling category not found." });
      db.logAction("UPDATE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id, name });
      sync.syncAfterMutation("styling_categories", id, "update", data, req.token);
      return res.json(data);
    }
    const userSupabase = getSupabaseClient(req.token);

    if (!IS_GARMENT_TYPE_ID_IN_STYLING_CATEGORIES_AVAILABLE) {
      const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
      let updatedItem: any = null;
      const updatedList = currentList.map((item) => {
        if (item.id === id) {
          updatedItem = { ...item, name: name !== undefined ? name : item.name, display_order: display_order !== undefined ? display_order : item.display_order, options: options !== undefined ? options : item.options, garment_type_id: garment_type_id !== undefined ? garment_type_id : item.garment_type_id };
          return updatedItem;
        }
        return item;
      });
      if (!updatedItem) return res.status(404).json({ error: "Styling category not found." });
      await userSupabase.from("shop_settings").upsert({ key: `${userId}:styling_categories`, value: updatedList, updated_at: now, updated_by: userId, user_id: userId });
      await logAction(req.user!, "UPDATE_STYLING_CATEGORY_FALLBACK", { id, name }, req.token);
      return res.json(updatedItem);
    }

    const updatePayload: any = { updated_at: now };
    if (name !== undefined) updatePayload.name = name;
    if (display_order !== undefined) updatePayload.display_order = display_order;
    if (options !== undefined) updatePayload.options = options;
    if (garment_type_id !== undefined) updatePayload.garment_type_id = garment_type_id;

    const { data, error } = await userSupabase
      .from("styling_categories")
      .update(updatePayload)
      .eq("id", id)
      .eq("created_by", userId)
      .select()
      .maybeSingle();

    if (!error && data) {
      await logAction(req.user!, "UPDATE_STYLING_CATEGORY", { id, name }, req.token);
      return res.json(data);
    }

    if (error && (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist") || error.message?.includes("Could not find"))) {
      // Proceed to fallback
    } else if (!error && !data) {
      // Try fallback if not found in physical DB table row
    } else {
      throw error;
    }

    const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
    let updatedItem: any = null;
    const updatedList = currentList.map((item) => {
      if (item.id === id) {
        updatedItem = {
          ...item,
          name: name !== undefined ? name : item.name,
          display_order: display_order !== undefined ? display_order : item.display_order,
          options: options !== undefined ? options : item.options,
          garment_type_id: garment_type_id !== undefined ? garment_type_id : item.garment_type_id
        };
        return updatedItem;
      }
      return item;
    });

    if (!updatedItem) {
      return res.status(404).json({ error: "Styling category not found." });
    }

    await userSupabase.from("shop_settings").upsert({
      key: `${userId}:styling_categories`,
      value: updatedList,
      updated_at: now,
      updated_by: userId,
      user_id: userId
    });
    await logAction(req.user!, "UPDATE_STYLING_CATEGORY_FALLBACK", { id, name }, req.token);
    return res.json(updatedItem);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/styling-categories/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (useLocalDb()) {
      db.deleteStylingCategory(id, userId);
      db.logAction("DELETE_STYLING_CATEGORY", userId, req.user!.email, req.user!.shop_id, { id });
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);

    let stylingCategoryName = "";
    let isFromTable = true;

    const { data: dbItem, error: fetchErr } = await userSupabase
      .from("styling_categories")
      .select("name")
      .eq("id", id)
      .eq("created_by", userId)
      .maybeSingle();

    if (dbItem) {
      stylingCategoryName = dbItem.name;
    } else {
      isFromTable = false;
    }

    if (!isFromTable) {
      const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
      const found = currentList.find((item) => item.id === id);
      if (found) { stylingCategoryName = found.name; }
    }

    if (!stylingCategoryName) {
      return res.status(404).json({ error: "Styling category not found." });
    }

    if (isFromTable) {
      const { error: delErr } = await userSupabase.from("styling_categories").delete().eq("id", id).eq("created_by", userId);
      if (!delErr) {
        await logAction(req.user!, "DELETE_STYLING_CATEGORY", { id, name: stylingCategoryName }, req.token);
        return res.json({ success: true });
      }
    }

    const currentList = await getStylingCategoriesFromSettings(userSupabase, userId);
    const updatedList = currentList.filter((item) => item.id !== id);
    await userSupabase.from("shop_settings").upsert({ key: `${userId}:styling_categories`, value: updatedList, updated_at: now, updated_by: userId, user_id: userId });
    await logAction(req.user!, "DELETE_STYLING_CATEGORY_FALLBACK", { id, name: stylingCategoryName }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/backup", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const data = db.exportBackup(req.user!.id);
      const backup = { timestamp: new Date().toISOString(), version: "1.0", data };
      db.logAction("SYSTEM_BACKUP", req.user!.id, req.user!.email, req.user!.shop_id, {});
      return res.json(backup);
    }
    const userSupabase = getSupabaseClient(req.token);
    const [profiles, customers, measurements, orders, settings] = await Promise.all([
      userSupabase.from("profiles").select("*").eq("created_by", req.user!.id),
      userSupabase.from("customers").select("*").eq("created_by", req.user!.id),
      userSupabase.from("measurements").select("*").eq("created_by", req.user!.id),
      userSupabase.from("orders").select("*").eq("created_by", req.user!.id),
      userSupabase.from("shop_settings").select("*").like("key", `${req.user!.id}:%`),
    ]);

    const backup = { timestamp: new Date().toISOString(), version: "1.0", data: {
      profiles: profiles.data || [], customers: customers.data || [],
      measurements: measurements.data || [], orders: orders.data || [],
      shop_settings: settings.data || []
    }};

    await logAction(req.user!, "SYSTEM_BACKUP", {}, req.token);
    return res.json(backup);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to download database backup: " + err.message });
  }
});

app.post("/api/restore", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { backupData } = req.body;
  if (!backupData || !backupData.data) {
    return res.status(400).json({ error: "Invalid backup data provided." });
  }

  try {
    if (useLocalDb()) {
      db.importBackup(backupData.data, req.user!.id);
      db.logAction("SYSTEM_RESTORE", req.user!.id, req.user!.email, req.user!.shop_id, { timestamp: backupData.timestamp });
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { customers, measurements, orders, shop_settings } = backupData.data;

    if (customers && customers.length > 0) {
      const sanitized = customers.map((c: any) => ({ ...c, shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id }));
      const { error } = await userSupabase.from("customers").upsert(sanitized);
      if (error) throw error;
    }
    if (measurements && measurements.length > 0) {
      const sanitized = measurements.map((m: any) => ({ ...m, shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id }));
      const { error } = await userSupabase.from("measurements").upsert(sanitized);
      if (error) throw error;
    }
    if (orders && orders.length > 0) {
      const sanitized = orders.map((o: any) => ({ ...o, shop_id: req.user!.shop_id, created_by: req.user!.id, updated_by: req.user!.id }));
      const { error } = await userSupabase.from("orders").upsert(sanitized);
      if (error) throw error;
    }
    if (shop_settings && shop_settings.length > 0) {
      const sanitized = shop_settings.map((s: any) => {
        let cleanKey = s.key;
        if (cleanKey.includes(":")) { const parts = cleanKey.split(":"); cleanKey = parts.slice(1).join(":"); }
        return { key: `${req.user!.id}:${cleanKey}`, value: s.value, updated_at: new Date().toISOString(), updated_by: req.user!.id };
      });
      const { error } = await userSupabase.from("shop_settings").upsert(sanitized);
      if (error) throw error;
    }

    await logAction(req.user!, "SYSTEM_RESTORE", { timestamp: backupData.timestamp }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to restore backup: " + err.message });
  }
});

app.post("/api/archive-orders", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { beforeDate } = req.body;
  if (!beforeDate) {
    return res.status(400).json({ error: "Please specify a cutoff date." });
  }

  const cutoff = new Date(beforeDate);

  try {
    if (useLocalDb()) {
      db.archiveOrders(req.user!.id, cutoff.toISOString());
      db.logAction("ARCHIVE_ORDERS", req.user!.id, req.user!.email, req.user!.shop_id, { beforeDate });
      return res.json({ success: true });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { error } = await userSupabase
      .from("orders")
      .update({ status: "Archived" })
      .eq("created_by", req.user!.id)
      .lt("created_at", cutoff.toISOString())
      .in("status", ["Delivered", "Ready"]);

    if (error) throw error;
    await logAction(req.user!, "ARCHIVE_ORDERS", { beforeDate }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// REPORTS & STATEMENTS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/reports/dashboard", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const stats = db.getDashboardStats(req.user!.id);
      const orders = db.getOrders(req.user!.id);
      const settingsMap = db.getSettings(req.user!.id);
      const stages = settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages;
      const orderStatuses: Record<string, number> = {};
      stages.forEach((s: any) => { orderStatuses[s.name] = orders.filter((o: any) => o.status === s.id).length; });
      orders.forEach((o: any) => {
        if (!stages.find((s: any) => s.id === o.status)) {
          orderStatuses[o.status] = (orderStatuses[o.status] || 0) + 1;
        }
      });
      const popularItems: Record<string, number> = {};
      orders.forEach((o: any) => {
        let items: any[];
        try { items = typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []); } catch { items = []; }
        items.forEach((item: any) => { popularItems[item.type] = (popularItems[item.type] || 0) + 1; });
      });
      return res.json({
        stats: { totalRevenue: stats.revenue, totalReceived: 0, totalPendingDues: stats.pendingAmount, customerCount: stats.totalCustomers, orderCount: stats.totalOrders },
        orderStatuses, popularItems
      });
    }
    const userSupabase = getSupabaseClient(req.token);
    const [ordersRes, customersCountRes, settingsMap] = await Promise.all([
      userSupabase.from("orders").select("total_amount, paid_amount, status, items").eq("created_by", req.user!.id),
      userSupabase.from("customers").select("*", { count: "exact", head: true }).eq("created_by", req.user!.id),
      getAccountSettings(userSupabase, req.user!.id)
    ]);

    const orders = ordersRes.data || [];
    const customerCount = customersCountRes.count || 0;
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalReceived = orders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
    const totalPendingDues = totalRevenue - totalReceived;
    const stages = settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages;
    const orderStatuses: Record<string, number> = {};
    stages.forEach((s: any) => { orderStatuses[s.name] = orders.filter(o => o.status === s.id).length; });
    orders.forEach(o => {
      if (!stages.find((s: any) => s.id === o.status)) {
        orderStatuses[o.status] = (orderStatuses[o.status] || 0) + 1;
      }
    });
    const popularItems: Record<string, number> = {};
    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => { popularItems[item.type] = (popularItems[item.type] || 0) + 1; });
      }
    });

    return res.json({
      stats: { totalRevenue, totalReceived, totalPendingDues, customerCount, orderCount: orders.length },
      orderStatuses, popularItems
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/financials", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const orders = db.getOrders(req.user!.id);
      const settingsMap = db.getSettings(req.user!.id);
      const mappedOrders = orders.map((o: any) => {
        const c = db.getCustomerById(o.customer_id, req.user!.id);
        return { ...o, customer_name: c?.name || "Unknown Customer", customer_phone: c?.phone || "N/A" };
      });
      return res.json({
        orders: mappedOrders, inventory: [],
        settings: { currency: settingsMap.currency || "$", pipeline_stages: settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages }
      });
    }
    const userSupabase = getSupabaseClient(req.token);
    const [ordersRes, inventoryRes, settingsMap] = await Promise.all([
      userSupabase.from("orders").select(`id,order_number,total_amount,paid_amount,status,created_at,due_date,items,customer_id,customers(id,name,phone)`).eq("created_by", req.user!.id),
      userSupabase.from("inventory").select("*").eq("created_by", req.user!.id),
      getAccountSettings(userSupabase, req.user!.id)
    ]);
    if (ordersRes.error) throw ordersRes.error;
    const orders = ordersRes.data || [];
    const inventory = inventoryRes.data || [];
    const mappedOrders = orders.map((o: any) => ({ ...o, customer_name: o.customers?.name || "Unknown Customer", customer_phone: o.customers?.phone || "N/A" }));
    return res.json({ orders: mappedOrders, inventory, settings: { currency: settingsMap.currency || "$", pipeline_stages: settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages } });
  } catch (err: any) {
    console.error("Error in /api/reports/financials:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-logs-debug", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (useLocalDb()) {
      const all = db.getAuditLogs({ limit: 5 });
      return res.json({ count: all.total, sample: all.data, mode: 'sqlite' });
    }
    const userSupabase = getSupabaseClient(req.token);
    const { data, error, count } = await userSupabase.from("audit_logs").select("*", { count: "exact" }).limit(5);
    if (error) return res.json({ error: error.message, mode: 'supabase' });
    return res.json({ count, sample: data, mode: 'supabase' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-logs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      search, from, to, userId, action, module,
      sort = 'newest', page = '1', limit = '50'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

    if (useLocalDb()) {
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
    }

    const userSupabase = getSupabaseClient(req.token);
    let query = userSupabase.from("audit_logs").select("*", { count: "exact" });

    query = query.eq("user_id", req.user!.id);

    if (action) query = query.eq("action", action);
    if (module) query = query.eq("module", module);
    if (userId && userId !== req.user!.id) {
      query = query.eq("user_id", userId);
    }
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    if (search) {
      const q = `%${search}%`;
      query = query.or(
        `action.ilike.${q},user_email.ilike.${q},user_name.ilike.${q},module.ilike.${q},notes.ilike.${q},record_id.ilike.${q}`
      );
    }

    const orderDir = sort === 'oldest' ? { ascending: true } : { ascending: false };
    query = query.order("created_at", orderDir);

    const fromIdx = (pageNum - 1) * limitNum;
    query = query.range(fromIdx, fromIdx + limitNum - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const parsed = (data || []).map((r: any) => {
      let meta: Record<string, any> = {};
      try { meta = r.details?._meta || {}; } catch { meta = {}; }
      const moduleVal = r.module || meta.module || getModuleFromAction(r.action) || 'General';
      const userRole = r.user_role || meta.userRole || '';
      const userName = r.user_name || meta.userName || r.user_email || 'Unknown';
      return {
        ...r,
        user_name: userName,
        user_role: userRole,
        module: moduleVal,
        previous_value: r.previous_value || meta.previousValue || null,
        new_value: r.new_value || meta.newValue || null,
        device: r.device || meta.device || '',
        ip_address: r.ip_address || meta.ipAddress || '',
        notes: r.notes || meta.notes || '',
      };
    });

    return res.json({ data: parsed, total: count || parsed.length, page: pageNum, limit: limitNum });
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
app.post("/api/import/customers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { customers, create_measurements, garment_type_id } = req.body;

  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: "No customer data provided." });
  }

  const useLocal = useLocalDb();
  const userSupabase = useLocal ? null : getSupabaseClient(req.token);
  const now = new Date().toISOString();
  const results = { imported: 0, skipped: 0, errors: [] as string[], details: [] as any[] };

  let knownFields: string[] = [];
  if (create_measurements && garment_type_id) {
    if (useLocal) {
      const dbFields = db.getGarmentTypes(req.user!.id);
      const found = dbFields.find((t: any) => t.id === garment_type_id);
      if (found?.measurement_fields) {
        try { knownFields = typeof found.measurement_fields === "string" ? JSON.parse(found.measurement_fields).map((f: any) => f.name || f) : found.measurement_fields.map((f: any) => f.name || f); } catch { knownFields = []; }
      }
    } else {
      const { data: gt } = await userSupabase!.from("garment_types").select("measurement_fields").eq("id", garment_type_id).maybeSingle();
      if (gt?.measurement_fields) { knownFields = gt.measurement_fields.map((f: any) => f.name || f); }
      if (knownFields.length === 0) {
        const { data: settings } = await userSupabase!.from("shop_settings").select("value").eq("key", `${req.user!.id}:garment_types`).maybeSingle();
        if (settings?.value) {
          const types = Array.isArray(settings.value) ? settings.value : [];
          const gt = types.find((t: any) => t.id === garment_type_id);
          if (gt?.measurement_fields) { knownFields = gt.measurement_fields.map((f: any) => f.name || f); }
        }
      }
    }
  }

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

      if (useLocal) {
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
          db.upsertMeasurement(created.id, req.user!.id, measurements, req.user!.id);
        }
        sync.syncAfterMutation("customers", created.id, "insert", created, req.token);
        results.imported++;
        results.details.push({ name: created.name, status: "imported" });
        continue;
      }

      if (cleanPhone) {
        const { data: existing } = await userSupabase!.from("customers").select("id, name").eq("phone", cleanPhone).eq("created_by", req.user!.id).maybeSingle();
        if (existing) { results.skipped++; results.details.push({ name: customerData.name, status: "skipped", reason: `Duplicate phone: ${cleanPhone}` }); continue; }
      }

      const { data: nameMatch } = await userSupabase!.from("customers").select("id").eq("created_by", req.user!.id).ilike("name", String(customerData.name).trim());
      if (nameMatch && nameMatch.length > 0 && !cleanPhone) { results.skipped++; results.details.push({ name: customerData.name, status: "skipped", reason: "Duplicate name, no phone." }); continue; }

      const { data: created, error: custErr } = await userSupabase!
        .from("customers")
        .insert([{
          name: String(customerData.name).trim(),
          phone: dbPhone,
          email: customerData.email ? String(customerData.email).trim() : null,
          address: customerData.address ? String(customerData.address).trim() : null,
          notes: customerData.notes ? String(customerData.notes).trim() : null,
          shop_id: req.user!.shop_id,
          created_by: req.user!.id,
          updated_by: req.user!.id,
          created_at: now,
          updated_at: now
        }])
        .select()
        .single();

      if (custErr || !created) {
        results.errors.push(`${customerData.name}: ${custErr?.message || "Failed"}`);
        results.skipped++;
        continue;
      }

      if (create_measurements && measurements && typeof measurements === "object") {
        const filtered: Record<string, string> = {};
        for (const field of knownFields) {
          if (measurements[field] !== undefined && measurements[field] !== null && measurements[field] !== "") {
            filtered[field] = String(measurements[field]);
          }
        }
        for (const [k, v] of Object.entries(measurements)) {
          if (v !== undefined && v !== null && v !== "" && !filtered[k]) {
            filtered[k] = String(v);
          }
        }
        if (Object.keys(filtered).length > 0) {
          const { data: existingMeas } = await userSupabase!
            .from("measurements")
            .select("id, data")
            .eq("customer_id", created.id)
            .maybeSingle();
          if (existingMeas) {
            await userSupabase!
              .from("measurements")
              .update({
                data: { ...(typeof existingMeas.data === "object" ? existingMeas.data : {}), ...filtered },
                updated_at: now,
                updated_by: req.user!.id
              })
              .eq("id", existingMeas.id);
          } else {
            await userSupabase!
              .from("measurements")
              .insert([{
                customer_id: created.id,
                data: filtered,
                shop_id: req.user!.shop_id,
                created_by: req.user!.id,
                updated_by: req.user!.id,
                created_at: now,
                updated_at: now
              }]);
          }
        }
      }

      results.imported++;
      results.details.push({ name: customerData.name, status: "imported" });
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

async function startServer(preferredPort?: number): Promise<number> {
  let initialized = false;

  async function initOnce(): Promise<void> {
    if (initialized) return;
    initialized = true;

    await checkDatabaseSchema();
    try {
      await runMigrations(supabaseAdmin);
    } catch (err: any) {
      console.warn("Migration check failed:", err.message);
    }
    if (process.env.ELECTRON_RUN === "true") {
      try {
        db.initDatabase();
        localDbAvailable = true;
        console.log("SQLite database initialized successfully");
      } catch (err: any) {
        localDbAvailable = false;
        console.error("Failed to initialize SQLite database:", err.message);
      }
    }
  }

  async function serveAtPort(port: number): Promise<number> {
    await initOnce();

    return new Promise<number>((resolve, reject) => {
      const server = app.listen(port, "0.0.0.0", () => {
        const actualPort = (server.address() as any).port;
        console.log(`Express Server booted successfully on http://0.0.0.0:${actualPort}`);
        if (!process.env.ELECTRON_RUN && !process.env.VERCEL && !process.env.NETLIFY) {
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
  if (!process.env.VERCEL && !process.env.NETLIFY && process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa"
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

if (!process.env.ELECTRON_RUN && !process.env.VERCEL && !process.env.NETLIFY) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
