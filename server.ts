/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient as originalCreateClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// -------------------------------------------------------------------------
// COMPATIBILITY LAYER FOR MISSING MULTI-TENANT DATABASE SCHEMA
// -------------------------------------------------------------------------
let IS_MULTI_TENANT_AVAILABLE = true;
let IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE = true;
let IS_DELIVERED_AT_AVAILABLE = true;

function proxyBuilder(builder: any, relation?: string): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === "function") {
        return function(...args: any[]) {
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
  const client = originalCreateClient(url, key, options);
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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("CRITICAL ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
}

// Service role client is used for administrative operations (like worker user creation/deletion)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
}, true);

// Anon client for general startup checks
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
}, false);

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
  } catch (err) {
    console.error("Database schema check failed, defaulting to single-tenant mode:", err);
    IS_MULTI_TENANT_AVAILABLE = false;
    IS_USER_ID_IN_SHOP_SETTINGS_AVAILABLE = false;
    IS_DELIVERED_AT_AVAILABLE = false;
  }
}

// Run schema diagnostic asynchronously at startup
checkDatabaseSchema();

// -------------------------------------------------------------------------
// DEFAULT BACKUP DATA FOR BOOTSTRAPPING DEFAULT VALUES
// -------------------------------------------------------------------------
const DEFAULT_SHOP_SETTINGS = {
  shop_name: "",
  phone: "",
  address: "",
  currency: "$",
  measurement_fields: [
    "Collar/Neck",
    "Chest",
    "Waist",
    "Hips",
    "Shoulder Width",
    "Sleeve Length",
    "Bicep",
    "Wrist",
    "Shirt/Jacket Length",
    "Trouser Length",
    "Inseam",
    "Thigh",
    "Ankle"
  ],
  pipeline_stages: [
    { id: "Pending", name: "Getting Ready", enabled: true },
    { id: "Ready to Deliver", name: "Ready to Deliver", enabled: true },
    { id: "Delivered", name: "Delivered", enabled: true },
    { id: "Archived", name: "Archived", enabled: true }
  ],
  auto_archive_days: 30,
  updated_at: new Date().toISOString(),
  updated_by: "system"
};

// -------------------------------------------------------------------------
// ACCOUNT-SPECIFIC SHOP SETTINGS HELPERS (PREFIX-BASED MULTI-TENANCY)
// -------------------------------------------------------------------------
async function getAccountSettings(userSupabase: any, userId: string): Promise<Record<string, any>> {
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
  const criticalKeys = ["shop_name", "phone", "address", "currency", "pipeline_stages", "measurement_fields", "auto_archive_days"];
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

  return settingsMap;
}

async function saveAccountSettings(userSupabase: any, userId: string, settingsData: Record<string, any>): Promise<void> {
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
    activeRole?: string;
    managerId?: string | null;
  };
  token?: string;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing authentication token." });
  }
  const token = authHeader.split(" ")[1];

  try {
    const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Session expired or invalid token." });
    }

    // Query database profile to check role via admin client
    let { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile && profile.role === "Worker") {
      // Auto-migrate to Owner since only Owners can possess active Supabase Auth accounts
      await supabaseAdmin
        .from("profiles")
        .update({ role: "Owner" })
        .eq("id", profile.id);
      profile.role = "Owner";
    }

    const activeRole = (req.headers["x-active-role"] as string) || "Owner";
    const managerId = (req.headers["x-manager-id"] as string) || null;

    if (profError || !profile) {
      // Every newly created account must log in as Owner of their own shop by default
      let shopId = "default-shop";
      if (IS_MULTI_TENANT_AVAILABLE) {
        // Create brand new shop for the new owner
        const { data: newShop, error: shopErr } = await supabaseAdmin
          .from("shops")
          .insert([{ name: "My Tailor Shop" }])
          .select()
          .single();
        if (shopErr) throw shopErr;
        shopId = newShop.id;
      }

      const newProfile: any = {
        id: user.id,
        email: user.email,
        name: user.email?.split("@")[0] || "Owner",
        role: "Owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (IS_MULTI_TENANT_AVAILABLE) {
        newProfile.shop_id = shopId;
      }
      await supabaseAdmin.from("profiles").insert([newProfile]);
      
      // Seed default settings for this specific shop
      await getAccountSettings(supabaseAdmin, user.id);

      req.user = {
        id: user.id,
        email: user.email || "",
        name: newProfile.name,
        role: activeRole === "Manager" ? "Worker" : "Owner",
        shop_id: shopId,
        activeRole,
        managerId
      };
      req.token = token;
      return next();
    }

    // If profile exists but shop_id is missing, let's auto-create a shop for them
    if (IS_MULTI_TENANT_AVAILABLE && !profile.shop_id) {
      const { data: newShop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .insert([{ name: "My Tailor Shop" }])
        .select()
        .single();
      if (!shopErr && newShop) {
        await supabaseAdmin.from("profiles").update({ shop_id: newShop.id }).eq("id", profile.id);
        profile.shop_id = newShop.id;

        // Seed default settings for this specific shop
        await getAccountSettings(supabaseAdmin, user.id);
      }
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: activeRole === "Manager" ? "Worker" : "Owner",
      shop_id: profile.shop_id || "default-shop",
      activeRole,
      managerId
    };
    req.token = token;
    next();
  } catch (err: any) {
    console.error("Auth verification error:", err);
    if (err && typeof err === "object") {
      console.error("Auth verification error message:", err.message);
      console.error("Auth verification error stack:", err.stack);
      console.error("Auth verification error raw:", JSON.stringify(err, null, 2));
    }
    return res.status(500).json({ 
      error: "Internal security validation error.", 
      details: err?.message || String(err) 
    });
  }
}

function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const currentRole = req.user.role;
    const matched = roles.some(role => {
      if (role === "Owner" && currentRole === "Owner") return true;
      if ((role === "Worker" || role === "Manager") && currentRole === "Worker") return true;
      return false;
    });
    if (!matched) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
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
    let missingColumn = "whatsapp";
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
async function logAction(user: { id: string; email: string; shop_id?: string }, action: string, details: Record<string, any>, token?: string) {
  try {
    const userSupabase = getSupabaseClient(token);
    await userSupabase.from("audit_logs").insert([{
      user_id: user.id,
      user_email: user.email,
      shop_id: user.shop_id,
      action,
      details,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error("Failed to write audit log in Supabase:", err);
  }
}

// -------------------------------------------------------------------------
// AUTHENTICATION API ENDPOINTS
// -------------------------------------------------------------------------

app.get("/api/config-status", (req: Request, res: Response) => {
  res.json({
    supabaseConnected: true,
    supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 15)}...` : null
  });
});

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return res.status(400).json({ error: error?.message || "Invalid credentials." });
    }

    let { data: profile, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profile && profile.role === "Worker") {
      // Auto-migrate to Owner since only Owners can possess active Supabase Auth accounts
      await supabaseAdmin
        .from("profiles")
        .update({ role: "Owner" })
        .eq("id", profile.id);
      profile.role = "Owner";
    }

    if (profError || !profile) {
      // Every newly created account must log in as Owner of their own shop by default
      let shopId = "default-shop";
      if (IS_MULTI_TENANT_AVAILABLE) {
        const { data: newShop, error: shopErr } = await supabaseAdmin
          .from("shops")
          .insert([{ name: "My Tailor Shop" }])
          .select()
          .single();
        if (shopErr) throw shopErr;
        shopId = newShop.id;
      }

      const newProfile: any = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.email?.split("@")[0] || "Owner",
        role: "Owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (IS_MULTI_TENANT_AVAILABLE) {
        newProfile.shop_id = shopId;
      }
      await supabaseAdmin.from("profiles").insert([newProfile]);

      // Seed default settings for this specific shop
      await getAccountSettings(supabaseAdmin, data.user.id);

      profile = newProfile;
      if (!profile.shop_id) {
        profile.shop_id = shopId;
      }
    }

    // Auto-create a shop if somehow profile exists but is missing shop_id
    if (IS_MULTI_TENANT_AVAILABLE && !profile.shop_id) {
      const { data: newShop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .insert([{ name: "My Tailor Shop" }])
        .select()
        .single();
      if (!shopErr && newShop) {
        await supabaseAdmin.from("profiles").update({ shop_id: newShop.id }).eq("id", profile.id);
        profile.shop_id = newShop.id;

        // Seed default settings for this specific shop
        await getAccountSettings(supabaseAdmin, profile.id);
      }
    }

    await logAction({ id: profile.id, email: profile.email, shop_id: profile.shop_id || "default-shop" }, "USER_LOGIN", { ip: req.ip }, data.session.access_token);

    return res.json({
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        shop_id: profile.shop_id || "default-shop"
      },
      token: data.session.access_token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Login failed due to a server error." });
  }
});

app.post("/api/auth/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    await getSupabaseClient(token).auth.signOut();
  }
  return res.json({ success: true });
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

    await logAction(req.user!, "ROLE_SWITCH_VERIFICATION_SUCCESS", {}, req.token);
    return res.json({ success: true });
  } catch (err) {
    console.error("Password switch verification error:", err);
    return res.status(401).json({ error: "Verification failed. Stayed in Worker mode." });
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

  try {
    const userSupabase = getSupabaseClient(req.token);
    let reqQuery = userSupabase.from("customers").select("*").eq("created_by", req.user!.id);
    if (query) {
      reqQuery = reqQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
    }
    const { data, error } = await reqQuery
      .order("name", { ascending: true })
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
  const { name, phone, whatsapp, address, email, notes, measurements } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Customer name is required." });
  }

  const cleanPhone = phone && phone.trim() !== "" ? phone.trim() : null;
  const dbPhone = cleanPhone || `NO-PHONE-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
  const now = new Date().toISOString();

  try {
    const userSupabase = getSupabaseClient(req.token);
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
        whatsapp: whatsapp || null,
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

// -------------------------------------------------------------------------
// MEASUREMENT MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/customers/:id/measurements", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
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

app.put("/api/customers/:id/measurements", requireAuth, requireRole(["Owner", "Worker"]), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { data: measurementData } = req.body;
  const now = new Date().toISOString();

  try {
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
        updated_by
      `)
      .eq("customer_id", customerId)
      .eq("created_by", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json(data || []);
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
      customer_phone: o.customers?.phone || "N/A"
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
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("orders")
      .select(`
        *,
        customers (
          name,
          phone
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
      customer_phone: data.customers?.phone || "N/A"
    };
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { customer_id, items, total_amount, paid_amount, due_date } = req.body;
  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer and at least one item are required." });
  }

  const now = new Date().toISOString();

  try {
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

    const { count } = await userSupabase.from("orders").select("*", { count: "exact", head: true }).eq("created_by", req.user!.id);
    const orderNumber = `ORD-${(count || 0) + 1001}`;

    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .insert([{
        shop_id: req.user!.shop_id,
        order_number: orderNumber,
        customer_id,
        status: defaultStatus,
        items,
        total_amount,
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

    await logAction(req.user!, "CREATE_ORDER", { order_id: order.id, order_number: orderNumber }, req.token);
    return res.status(201).json(order);
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
    const userSupabase = getSupabaseClient(req.token);
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

    await logAction(req.user!, "UPDATE_ORDER_STATUS", { order_id: orderId, order_number: order?.order_number, status }, req.token);
    return res.json(order);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.put("/api/orders/:id", requireAuth, requireRole(["Owner", "Worker"]), async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { items, total_amount, paid_amount, due_date, status, measurement_snapshot } = req.body;
  const now = new Date().toISOString();

  try {
    const userSupabase = getSupabaseClient(req.token);
    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .update({
        items,
        total_amount,
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

    await logAction(req.user!, "EDIT_ORDER", { order_id: orderId, order_number: order?.order_number }, req.token);
    return res.json(order);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.delete("/api/orders/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
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
// CUSTOMER DELETION (Owner Only)
// -------------------------------------------------------------------------
app.delete("/api/customers/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  try {
    const userSupabase = getSupabaseClient(req.token);
    
    // First retrieve customer name for logging
    const { data: customer } = await userSupabase
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .eq("created_by", req.user!.id)
      .single();

    const { error } = await userSupabase
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("created_by", req.user!.id);

    if (error) throw error;
    await logAction(req.user!, "DELETE_CUSTOMER", { id: customerId, name: customer?.name }, req.token);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// MANAGER MANAGEMENT (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/managers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userSupabase = getSupabaseClient(req.token);
    const settings = await getAccountSettings(userSupabase, req.user!.id);
    const managers = settings.managers || [];
    return res.json(managers);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/managers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { name, phone, photo, active } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Full Name is required." });
  }
  try {
    const userSupabase = getSupabaseClient(req.token);
    const settings = await getAccountSettings(userSupabase, req.user!.id);
    const managers = settings.managers || [];
    
    const newManager = {
      id: "mgr_" + Math.random().toString(36).substring(2, 11),
      name: name.trim(),
      phone: phone || "",
      photo: photo || "",
      active: active !== false,
      created_at: new Date().toISOString()
    };
    
    managers.push(newManager);
    await saveAccountSettings(userSupabase, req.user!.id, { managers });
    await logAction(req.user!, "CREATE_MANAGER", { name: newManager.name, id: newManager.id }, req.token);
    return res.status(201).json(newManager);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/managers/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const managerId = req.params.id;
  const { name, phone, photo, active } = req.body;
  if (name !== undefined && (!name || name.trim() === "")) {
    return res.status(400).json({ error: "Full Name cannot be empty." });
  }
  try {
    const userSupabase = getSupabaseClient(req.token);
    const settings = await getAccountSettings(userSupabase, req.user!.id);
    const managers = settings.managers || [];
    
    const index = managers.findIndex((m: any) => m.id === managerId);
    if (index === -1) {
      return res.status(404).json({ error: "Manager not found." });
    }
    
    const updatedManager = {
      ...managers[index],
      ...(name !== undefined && { name: name.trim() }),
      ...(phone !== undefined && { phone }),
      ...(photo !== undefined && { photo }),
      ...(active !== undefined && { active }),
      updated_at: new Date().toISOString()
    };
    
    managers[index] = updatedManager;
    await saveAccountSettings(userSupabase, req.user!.id, { managers });
    await logAction(req.user!, "UPDATE_MANAGER", { name: updatedManager.name, id: managerId }, req.token);
    return res.json(updatedManager);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/managers/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const managerId = req.params.id;
  try {
    const userSupabase = getSupabaseClient(req.token);
    const settings = await getAccountSettings(userSupabase, req.user!.id);
    const managers = settings.managers || [];
    
    const index = managers.findIndex((m: any) => m.id === managerId);
    if (index === -1) {
      return res.status(404).json({ error: "Manager not found." });
    }
    
    const target = managers[index];
    const updatedManagers = managers.filter((m: any) => m.id !== managerId);
    await saveAccountSettings(userSupabase, req.user!.id, { managers: updatedManagers });
    await logAction(req.user!, "DELETE_MANAGER", { name: target.name, id: managerId }, req.token);
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
    const userSupabase = getSupabaseClient(req.token);
    await saveAccountSettings(userSupabase, req.user!.id, settingsData);
    await logAction(req.user!, "UPDATE_SETTINGS", {}, req.token);
    return res.json(settingsData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/backup", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userSupabase = getSupabaseClient(req.token);
    const [profiles, customers, measurements, orders, settings] = await Promise.all([
      userSupabase.from("profiles").select("*").eq("created_by", req.user!.id),
      userSupabase.from("customers").select("*").eq("created_by", req.user!.id),
      userSupabase.from("measurements").select("*").eq("created_by", req.user!.id),
      userSupabase.from("orders").select("*").eq("created_by", req.user!.id),
      userSupabase.from("shop_settings").select("*").like("key", `${req.user!.id}:%`),
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        profiles: profiles.data || [],
        customers: customers.data || [],
        measurements: measurements.data || [],
        orders: orders.data || [],
        shop_settings: settings.data || []
      }
    };

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
    const userSupabase = getSupabaseClient(req.token);
    const { customers, measurements, orders, shop_settings } = backupData.data;

    if (customers && customers.length > 0) {
      const sanitized = customers.map((c: any) => ({
        ...c,
        shop_id: req.user!.shop_id,
        created_by: req.user!.id,
        updated_by: req.user!.id
      }));
      const { error } = await userSupabase.from("customers").upsert(sanitized);
      if (error) throw error;
    }
    if (measurements && measurements.length > 0) {
      const sanitized = measurements.map((m: any) => ({
        ...m,
        shop_id: req.user!.shop_id,
        created_by: req.user!.id,
        updated_by: req.user!.id
      }));
      const { error } = await userSupabase.from("measurements").upsert(sanitized);
      if (error) throw error;
    }
    if (orders && orders.length > 0) {
      const sanitized = orders.map((o: any) => ({
        ...o,
        shop_id: req.user!.shop_id,
        created_by: req.user!.id,
        updated_by: req.user!.id
      }));
      const { error } = await userSupabase.from("orders").upsert(sanitized);
      if (error) throw error;
    }
    if (shop_settings && shop_settings.length > 0) {
      const sanitized = shop_settings.map((s: any) => {
        let cleanKey = s.key;
        if (cleanKey.includes(":")) {
          const parts = cleanKey.split(":");
          cleanKey = parts.slice(1).join(":");
        }
        return {
          key: `${req.user!.id}:${cleanKey}`,
          value: s.value,
          updated_at: new Date().toISOString(),
          updated_by: req.user!.id
        };
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
    stages.forEach((s: any) => {
      orderStatuses[s.name] = orders.filter(o => o.status === s.id).length;
    });
    
    orders.forEach(o => {
      const matchingStage = stages.find((s: any) => s.id === o.status);
      if (!matchingStage) {
        orderStatuses[o.status] = (orderStatuses[o.status] || 0) + 1;
      }
    });

    const popularItems: Record<string, number> = {};
    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          popularItems[item.type] = (popularItems[item.type] || 0) + 1;
        });
      }
    });

    return res.json({
      stats: {
        totalRevenue,
        totalReceived,
        totalPendingDues,
        customerCount: customerCount,
        orderCount: orders.length,
      },
      orderStatuses,
      popularItems
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/financials", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userSupabase = getSupabaseClient(req.token);
    
    // Fetch orders, inventory and settings in parallel
    const [ordersRes, inventoryRes, settingsMap] = await Promise.all([
      userSupabase.from("orders").select(`
        id,
        order_number,
        total_amount,
        paid_amount,
        status,
        created_at,
        due_date,
        items,
        customer_id,
        customers (
          id,
          name,
          phone
        )
      `).eq("created_by", req.user!.id),
      userSupabase.from("inventory").select("*").eq("created_by", req.user!.id),
      getAccountSettings(userSupabase, req.user!.id)
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const orders = ordersRes.data || [];
    const inventory = inventoryRes.data || [];

    // Map the results cleanly
    const mappedOrders = orders.map((o: any) => ({
      ...o,
      customer_name: o.customers?.name || "Unknown Customer",
      customer_phone: o.customers?.phone || "N/A"
    }));

    return res.json({
      orders: mappedOrders,
      inventory: inventory,
      settings: {
        currency: settingsMap.currency || "$",
        pipeline_stages: settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages
      }
    });
  } catch (err: any) {
    console.error("Error in /api/reports/financials:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-logs", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("audit_logs")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Catch-all for undefined /api routes
app.all("/api/*", (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found.` });
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
// VITE DEV SERVER / STATIC ASSETS & SPA ROUTING
// -------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
