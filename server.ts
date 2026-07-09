/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// -------------------------------------------------------------------------
// SUPABASE CLIENT INITIALIZATION
// -------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("CRITICAL ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
}

// Service role client is used for administrative operations (like worker user creation/deletion)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// Anon client for general startup checks
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

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
    });
  }
  return supabaseAnon;
}

// -------------------------------------------------------------------------
// DEFAULT BACKUP DATA FOR BOOTSTRAPPING DEFAULT VALUES
// -------------------------------------------------------------------------
const DEFAULT_SHOP_SETTINGS = {
  shop_name: "Classic Tailors",
  phone: "+1 (555) 123-4567",
  address: "123 Elegance Lane, Fashion District",
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
// BACKEND SECURITY MIDDLEWARE & ROLE AUTHORIZATION
// -------------------------------------------------------------------------
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: "Owner" | "Worker";
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

    if (profError || !profile) {
      // Bootstrap the first user as Owner if profiles table is completely empty
      const { count } = await supabaseAdmin.from("profiles").select("*", { count: "exact", head: true });
      if (count === 0) {
        const newProfile = {
          id: user.id,
          email: user.email,
          name: user.email?.split("@")[0] || "Owner",
          role: "Owner",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await supabaseAdmin.from("profiles").insert([newProfile]);
        
        req.user = {
          id: user.id,
          email: user.email || "",
          name: newProfile.name,
          role: "Owner"
        };
        req.token = token;
        return next();
      }
      return res.status(403).json({ error: "Access denied. Profile not found." });
    }

    // Parse Active Role from request header
    const activeRoleHeader = req.headers["x-active-role"];
    let activeRole = profile.role;
    if (activeRoleHeader === "Owner" || activeRoleHeader === "Worker") {
      activeRole = activeRoleHeader as "Owner" | "Worker";
    }

    // Owner protection: Worker must never gain Owner privileges without successful password verification
    if (activeRole === "Owner" && profile.role !== "Owner") {
      return res.status(403).json({ error: "Access denied. Active role violates profile permissions." });
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: activeRole
    };
    req.token = token;
    next();
  } catch (err) {
    console.error("Auth verification error:", err);
    return res.status(500).json({ error: "Internal security validation error." });
  }
}

function requireRole(roles: Array<"Owner" | "Worker">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Permission denied. Requires one of these roles: [${roles.join(", ")}]. Current: [${req.user.role}]`
      });
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
async function logAction(user: { id: string; email: string }, action: string, details: Record<string, any>, token?: string) {
  try {
    const userSupabase = getSupabaseClient(token);
    await userSupabase.from("audit_logs").insert([{
      user_id: user.id,
      user_email: user.email,
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

    if (profError || !profile) {
      const { count } = await supabaseAdmin.from("profiles").select("*", { count: "exact", head: true });
      if (count === 0) {
        const newProfile = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.email?.split("@")[0] || "Owner",
          role: "Owner",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await supabaseAdmin.from("profiles").insert([newProfile]);
        profile = newProfile;
      } else {
        return res.status(403).json({ error: "Your account exists, but no role profile has been created yet. Please ask an administrator." });
      }
    }

    await logAction({ id: profile.id, email: profile.email }, "USER_LOGIN", { ip: req.ip }, data.session.access_token);

    return res.json({
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role
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
    let reqQuery = userSupabase.from("customers").select("*");
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
    const { data, error } = await userSupabase.from("customers").select("*").eq("id", customerId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Customer not found." });
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
    const { data, error } = await userSupabase
      .from("measurements")
      .select("*")
      .eq("customer_id", customerId)
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
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("measurements")
      .select("*")
      .eq("customer_id", customerId)
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
      const { data: settingsData } = await userSupabase.from("shop_settings").select("*");
      if (settingsData) {
        const settingsMap: Record<string, any> = {};
        settingsData.forEach((row: any) => {
          settingsMap[row.key] = row.value;
        });
        if (settingsMap.auto_archive_days !== undefined) {
          autoArchiveDays = Number(settingsMap.auto_archive_days);
        }
      }
    } catch (err) {
      console.error("Error loading auto_archive_days from settings in Supabase:", err);
    }

    if (autoArchiveDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - autoArchiveDays);
      const { data: ordersToArchive } = await userSupabase
        .from("orders")
        .select("id")
        .eq("status", "Delivered")
        .lte("delivered_at", cutoffDate.toISOString());

      if (ordersToArchive && ordersToArchive.length > 0) {
        const ids = ordersToArchive.map((o: any) => o.id);
        await userSupabase
          .from("orders")
          .update({ status: "Archived", updated_at: new Date().toISOString() })
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
    `);

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
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found." });
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
    const { data: meas } = await userSupabase
      .from("measurements")
      .select("data")
      .eq("customer_id", customer_id)
      .maybeSingle();

    const snapshot = meas ? meas.data : {};

    let defaultStatus = "Pending";
    try {
      const { data: settingsData } = await userSupabase.from("shop_settings").select("*");
      const settingsMap: any = {};
      if (settingsData) {
        settingsData.forEach((row: any) => {
          settingsMap[row.key] = row.value;
        });
      }
      const stages = settingsMap.pipeline_stages || DEFAULT_SHOP_SETTINGS.pipeline_stages;
      const firstActive = stages.find((s: any) => s.enabled && s.id !== "Archived");
      if (firstActive) {
        defaultStatus = firstActive.id;
      }
    } catch (err) {
      console.error("Failed to resolve starting status:", err);
    }

    const { count } = await userSupabase.from("orders").select("*", { count: "exact", head: true });
    const orderNumber = `ORD-${(count || 0) + 1001}`;

    const { data: order, error: orderErr } = await userSupabase
      .from("orders")
      .insert([{
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
      .select()
      .single();

    if (orderErr) throw orderErr;

    await logAction(req.user!, "UPDATE_ORDER_STATUS", { order_id: orderId, order_number: order?.order_number, status }, req.token);
    return res.json(order);
  } catch (err: any) {
    return handleSupabaseError(err, res);
  }
});

app.put("/api/orders/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
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
    const { data: order } = await userSupabase.from("orders").select("order_number").eq("id", orderId).single();
    const { error } = await userSupabase.from("orders").delete().eq("id", orderId);
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
    const { data, error } = await supabaseAdmin.from("profiles").select("*");
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/workers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: "All worker fields (email, password, name, role) are required." });
  }

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
      created_at: now,
      updated_at: now,
      created_by: req.user!.id,
      updated_by: req.user!.id
    };

    const { error: profErr } = await supabaseAdmin.from("profiles").insert([newProfile]);
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw profErr;
    }

    await logAction(req.user!, "CREATE_WORKER", { email, role, name }, req.token);
    return res.status(201).json(newProfile);
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
    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("*").eq("id", workerId).single();
    if (targetProfile && targetProfile.role === "Owner") {
      const { count } = await supabaseAdmin.from("profiles").select("*", { count: "exact" }).eq("role", "Owner");
      if (count && count <= 1) {
        return res.status(400).json({ error: "Cannot delete the last Owner account. Create another Owner first." });
      }
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(workerId);
    if (authErr) throw authErr;

    const { error: profErr } = await supabaseAdmin.from("profiles").delete().eq("id", workerId);
    if (profErr) throw profErr;

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
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase.from("shop_settings").select("*");
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.json(DEFAULT_SHOP_SETTINGS);
    }
    const settingsMap: any = {};
    data.forEach((row: any) => {
      settingsMap[row.key] = row.value;
    });
    if (!settingsMap.pipeline_stages) {
      settingsMap.pipeline_stages = DEFAULT_SHOP_SETTINGS.pipeline_stages;
    }
    return res.json(settingsMap);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/settings", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const settingsData = req.body;
  const now = new Date().toISOString();

  try {
    const userSupabase = getSupabaseClient(req.token);
    const entries = Object.entries(settingsData);
    for (const [key, value] of entries) {
      const { error } = await userSupabase.from("shop_settings").upsert({
        key,
        value,
        updated_at: now,
        updated_by: req.user!.id
      });
      if (error) throw error;
    }
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
      userSupabase.from("profiles").select("*"),
      userSupabase.from("customers").select("*"),
      userSupabase.from("measurements").select("*"),
      userSupabase.from("orders").select("*"),
      userSupabase.from("shop_settings").select("*"),
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
      const { error } = await userSupabase.from("customers").upsert(customers);
      if (error) throw error;
    }
    if (measurements && measurements.length > 0) {
      const { error } = await userSupabase.from("measurements").upsert(measurements);
      if (error) throw error;
    }
    if (orders && orders.length > 0) {
      const { error } = await userSupabase.from("orders").upsert(orders);
      if (error) throw error;
    }
    if (shop_settings && shop_settings.length > 0) {
      const { error } = await userSupabase.from("shop_settings").upsert(shop_settings);
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
    const [ordersRes, customersCountRes, settingsRes] = await Promise.all([
      userSupabase.from("orders").select("total_amount, paid_amount, status, items"),
      userSupabase.from("customers").select("*", { count: "exact", head: true }),
      userSupabase.from("shop_settings").select("*")
    ]);

    const orders = ordersRes.data || [];
    const customerCount = customersCountRes.count || 0;
    const settingsRows = settingsRes.data || [];

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalReceived = orders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
    const totalPendingDues = totalRevenue - totalReceived;

    const settingsMap: Record<string, any> = {};
    settingsRows.forEach((row: any) => {
      settingsMap[row.key] = row.value;
    });

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

app.get("/api/audit-logs", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userSupabase = getSupabaseClient(req.token);
    const { data, error } = await userSupabase
      .from("audit_logs")
      .select("*")
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
