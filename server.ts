/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// -------------------------------------------------------------------------
// DB & SUPABASE DETECTOR
// -------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const MOCK_OWNER_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_WORKER_ID = "00000000-0000-0000-0000-000000000002";

function getDbUserId(userId?: string): string | null {
  if (!userId || userId === MOCK_OWNER_ID || userId === MOCK_WORKER_ID || userId === "mock-owner-id" || userId === "mock-worker-id") {
    return null;
  }
  return userId;
}

const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabaseAdmin: SupabaseClient | null = null;
let supabaseAnon: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  try {
    // Service role client is used for admin tasks like worker list management
    if (SUPABASE_SERVICE_ROLE_KEY) {
      supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
    }
    // Anon client for regular auth mapping
    supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    // In bypassed-login mode, route all database operations through the service role client to bypass RLS policies
    if (supabaseAdmin) {
      supabaseAnon = supabaseAdmin;
    }
    console.log("Supabase successfully initialized.");
  } catch (err) {
    console.error("Failed to initialize Supabase clients:", err);
  }
} else {
  console.log("Supabase keys not found in environment. Running in persistent Sandbox Mode.");
}

// -------------------------------------------------------------------------
// SANDBOX ENGINE (JSON PERSISTENCE)
// -------------------------------------------------------------------------
const SANDBOX_FILE = path.join(process.cwd(), "sandbox_db.json");

interface SandboxSchema {
  profiles: any[];
  customers: any[];
  measurements: any[];
  orders: any[];
  audit_logs: any[];
  shop_settings: any;
  sessions: Record<string, any>; // maps token to user object
}

const DEFAULT_SANDBOX_DB: SandboxSchema = {
  profiles: [
    {
      id: MOCK_OWNER_ID,
      email: "owner@tailor.com",
      name: "Owner Account",
      role: "Owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: MOCK_WORKER_ID,
      email: "worker@tailor.com",
      name: "Worker Account",
      role: "Worker",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  customers: [],
  measurements: [],
  orders: [],
  audit_logs: [],
  shop_settings: {
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
    updated_at: new Date().toISOString(),
    updated_by: "system"
  },
  sessions: {}
};

function loadSandboxDB(): SandboxSchema {
  if (!fs.existsSync(SANDBOX_FILE)) {
    fs.writeFileSync(SANDBOX_FILE, JSON.stringify(DEFAULT_SANDBOX_DB, null, 2), "utf8");
    return DEFAULT_SANDBOX_DB;
  }
  try {
    const content = fs.readFileSync(SANDBOX_FILE, "utf8");
    const data = JSON.parse(content);
    // Deep merge/fallback for structure updates
    return {
      profiles: data.profiles || DEFAULT_SANDBOX_DB.profiles,
      customers: data.customers || DEFAULT_SANDBOX_DB.customers,
      measurements: data.measurements || DEFAULT_SANDBOX_DB.measurements,
      orders: data.orders || DEFAULT_SANDBOX_DB.orders,
      audit_logs: data.audit_logs || DEFAULT_SANDBOX_DB.audit_logs,
      shop_settings: {
        ...DEFAULT_SANDBOX_DB.shop_settings,
        ...(data.shop_settings || {}),
        pipeline_stages: data.shop_settings?.pipeline_stages || DEFAULT_SANDBOX_DB.shop_settings.pipeline_stages
      },
      sessions: data.sessions || DEFAULT_SANDBOX_DB.sessions,
    };
  } catch (e) {
    console.error("Error reading sandbox_db.json, recreating...", e);
    return DEFAULT_SANDBOX_DB;
  }
}

function saveSandboxDB(data: SandboxSchema) {
  try {
    fs.writeFileSync(SANDBOX_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write to sandbox_db.json", e);
  }
}

// -------------------------------------------------------------------------
// BACKEND SECURITY MIDDLEWARE
// -------------------------------------------------------------------------
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: "Owner" | "Worker";
  };
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing authentication token." });
  }
  const token = authHeader.split(" ")[1];

  // Bypassed login mechanism
  if (token === "mock-owner-token") {
    req.user = {
      id: MOCK_OWNER_ID,
      email: "owner@tailor.com",
      name: "Owner Account",
      role: "Owner"
    };
    return next();
  }

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: "Session expired or invalid token." });
      }

      // Query database profile to check role
      const { data: profile, error: profError } = await supabaseAnon
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profError || !profile) {
        // Fallback: If no profile exists yet, check if there are any profiles at all.
        // If not, we bootstrap this first user as Owner. Otherwise, unauthorized.
        const { count } = await supabaseAnon.from("profiles").select("*", { count: "exact", head: true });
        if (count === 0) {
          // Create Owner profile
          const newProfile = {
            id: user.id,
            email: user.email,
            name: user.email?.split("@")[0] || "Owner",
            role: "Owner",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const clientToUse = supabaseAdmin || supabaseAnon;
          await clientToUse.from("profiles").insert([newProfile]);
          req.user = {
            id: user.id,
            email: user.email || "",
            name: newProfile.name,
            role: "Owner"
          };
          return next();
        }
        return res.status(403).json({ error: "Access denied. Profile not set up." });
      }

      req.user = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role
      };
      next();
    } catch (err) {
      console.error("Auth verification error:", err);
      return res.status(500).json({ error: "Internal security validation error." });
    }
  } else {
    // Sandbox authentication
    const db = loadSandboxDB();
    const session = db.sessions[token];
    if (!session) {
      return res.status(401).json({ error: "Sandbox session expired or invalid." });
    }
    // Keep session alive
    req.user = session;
    next();
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
  
  // Check for schema cache or missing column errors (PostgREST code PGRST204)
  if (
    errCode === "PGRST204" || 
    errMsg.includes("schema cache") || 
    errMsg.includes("Could not find the") || 
    errMsg.includes("column")
  ) {
    // Attempt to dynamically extract the missing column and table from the error message
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

    // Determine the type for the missing column if possible (default to TEXT)
    const columnType = "TEXT";

    return res.status(500).json({
      error: `Supabase Schema Cache Desync: ${errMsg}.\n\nThis means your Supabase project is either missing columns or has outdated cached schemas.\n\nTo resolve this immediately:\n1. Open your Supabase Dashboard.\n2. Navigate to the SQL Editor.\n3. Execute the following SQL statement to verify the '${missingColumn}' column exists:\n\n   ALTER TABLE public.${targetTable} ADD COLUMN IF NOT EXISTS ${missingColumn} ${columnType};\n\n4. Execute this statement to rebuild the PostgREST API schema cache:\n\n   NOTIFY pgrst, 'reload schema';`
    });
  }

  // Check for constraint violation errors (PostgreSQL code 23514)
  if (errCode === "23514" || errMsg.includes("violates check constraint")) {
    return res.status(400).json({
      error: `Supabase Check Constraint Violation: ${errMsg}.\n\nThis means that the status value (e.g. 'Ready to Deliver') violates the 'orders_status_check' constraint defined on your database 'orders' table.\n\nTo resolve this immediately:\n1. Open your Supabase Dashboard.\n2. Go to the SQL Editor.\n3. Execute the following SQL statements to update your constraint:\n\n   ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;\n   ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('Pending', 'Cutting', 'Stitching', 'Fitting', 'Ready', 'Ready to Deliver', 'Delivered', 'Archived'));`
    });
  }
  
  // Check for missing table errors (42P01 is PostgreSQL table not found)
  if (errCode === "42P01" || errMsg.includes("relation") || errMsg.includes("does not exist") || errMsg.includes("Could not find the table")) {
    return res.status(500).json({
      error: "Database tables are missing in your Supabase project. Please execute the complete SQL script in /src/schema.sql inside your Supabase SQL Editor to initialize all tables, then try again."
    });
  }

  return res.status(500).json({ error: errMsg });
}

// -------------------------------------------------------------------------
// LOGGER UTILITY
// -------------------------------------------------------------------------
async function logAction(user: { id: string; email: string }, action: string, details: Record<string, any>) {
  const dbUserId = getDbUserId(user.id);

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      await supabaseAnon.from("audit_logs").insert([{
        user_id: dbUserId,
        user_email: user.email,
        action,
        details,
        created_at: new Date().toISOString()
      }]);
    } catch (err) {
      console.error("Failed to write audit log in Supabase:", err);
    }
  } else {
    const logEntry = {
      id: Math.random().toString(36).substring(2, 11),
      user_id: user.id,
      user_email: user.email,
      action,
      details,
      created_at: new Date().toISOString()
    };
    const db = loadSandboxDB();
    db.audit_logs.unshift(logEntry);
    saveSandboxDB(db);
  }
}

// -------------------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------------------

// Configuration status endpoint
app.get("/api/config-status", (req: Request, res: Response) => {
  res.json({
    supabaseConnected: isSupabaseConfigured,
    supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 15)}...` : null
  });
});

// Authentication
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return res.status(400).json({ error: error?.message || "Invalid credentials." });
      }

      // Check profile
      let { data: profile, error: profError } = await supabaseAnon
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profError) {
        const errMsg = profError.message || "";
        if (profError.code === "42P01" || errMsg.includes("Could not find the table") || errMsg.includes("does not exist")) {
          return res.status(500).json({
            error: "Database tables are missing in your Supabase project. Please execute the SQL queries from /src/schema.sql inside your Supabase SQL Editor to create the tables, then try again."
          });
        }
      }

      if (profError || !profile) {
        // Bootstrap first user as Owner
        const { count } = await supabaseAnon.from("profiles").select("*", { count: "exact", head: true });
        if (count === 0) {
          const newProfile = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email?.split("@")[0] || "Owner",
            role: "Owner",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const clientToUse = supabaseAdmin || supabaseAnon;
          await clientToUse.from("profiles").insert([newProfile]);
          profile = newProfile;
        } else {
          return res.status(403).json({ error: "Your account exists, but no role profile has been created yet. Please ask an administrator." });
        }
      }

      await logAction({ id: profile.id, email: profile.email }, "USER_LOGIN", { ip: req.ip });

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
  } else {
    // Sandbox auth fallback
    const db = loadSandboxDB();
    const matchedProfile = db.profiles.find(
      (p) => p.email.toLowerCase() === email.toLowerCase() && password === "password123"
    );

    if (!matchedProfile) {
      return res.status(400).json({ error: "Invalid credentials. In Sandbox mode, use owner@tailor.com or worker@tailor.com with password 'password123'" });
    }

    const token = "mock-token-" + Math.random().toString(36).substring(2, 15);
    db.sessions[token] = {
      id: matchedProfile.id,
      email: matchedProfile.email,
      name: matchedProfile.name,
      role: matchedProfile.role
    };
    saveSandboxDB(db);

    await logAction(matchedProfile, "USER_LOGIN_SANDBOX", { ip: req.ip });

    return res.json({
      user: {
        id: matchedProfile.id,
        email: matchedProfile.email,
        name: matchedProfile.name,
        role: matchedProfile.role
      },
      token
    });
  }
});

app.post("/api/auth/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (isSupabaseConfigured && supabaseAnon) {
      await supabaseAnon.auth.signOut();
    } else {
      const db = loadSandboxDB();
      delete db.sessions[token];
      saveSandboxDB(db);
    }
  }
  return res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------------------
// CUSTOMER MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/customers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const query = (req.query.q as string || "").toLowerCase().trim();
  const page = parseInt(req.query.page as string || "1");
  const limit = parseInt(req.query.limit as string || "50");
  const offset = (page - 1) * limit;

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      let reqQuery = supabaseAnon.from("customers").select("*");
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
  } else {
    const db = loadSandboxDB();
    let result = db.customers;
    if (query) {
      result = result.filter(
        (c) => c.name.toLowerCase().includes(query) || c.phone.includes(query)
      );
    }
    // Sort by name
    result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    const paginatedResult = result.slice(offset, offset + limit);
    return res.json(paginatedResult);
  }
});

// Fetch single customer details
app.get("/api/customers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Customer not found." });
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    const matched = db.customers.find(c => c.id === customerId);
    if (!matched) return res.status(404).json({ error: "Customer not found." });
    return res.json(matched);
  }
});

app.post("/api/customers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { name, phone, whatsapp, address, email, notes, measurements } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Customer name is required." });
  }

  const cleanPhone = phone && phone.trim() !== "" ? phone.trim() : null;
  // If no phone number is provided, generate a unique placeholder starting with "NO-PHONE-"
  // to avoid violating UNIQUE constraints in database schemas
  const dbPhone = cleanPhone || `NO-PHONE-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;

  const customerId = isSupabaseConfigured ? undefined : "cust-" + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  // 1. Check duplicate phone number if provided
  if (cleanPhone) {
    if (isSupabaseConfigured && supabaseAnon) {
      try {
        const { data: existing, error: findErr } = await supabaseAnon
          .from("customers")
          .select("*")
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (existing) {
          await logAction(req.user!, "GET_EXISTING_CUSTOMER_DUPLICATE", { customer_id: existing.id, name: existing.name });
          return res.status(200).json({ alreadyExists: true, customer: existing });
        }
      } catch (err) {
        console.error("Error searching duplicate customer in Supabase:", err);
      }
    } else {
      const db = loadSandboxDB();
      const existing = db.customers.find(
        (c) => c.phone && c.phone.trim().toLowerCase() === cleanPhone.toLowerCase()
      );
      if (existing) {
        await logAction(req.user!, "GET_EXISTING_CUSTOMER_DUPLICATE_SANDBOX", { customer_id: existing.id, name: existing.name });
        return res.status(200).json({ alreadyExists: true, customer: existing });
      }
    }
  }

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      // 1. Insert customer
      const { data: customer, error: custErr } = await supabaseAnon
        .from("customers")
        .insert([{
          name,
          phone: dbPhone,
          whatsapp: whatsapp || null,
          address: address || null,
          email: email || null,
          notes: notes || null,
          created_by: getDbUserId(req.user!.id),
          updated_by: getDbUserId(req.user!.id),
          created_at: now,
          updated_at: now
        }])
        .select()
        .single();

      if (custErr || !customer) throw custErr;

      // 2. Insert initial empty measurements if not provided, or provided ones
      const initialMeas = {
        customer_id: customer.id,
        data: measurements || {},
        created_by: getDbUserId(req.user!.id),
        updated_by: getDbUserId(req.user!.id),
        created_at: now,
        updated_at: now
      };
      const { error: measErr } = await supabaseAnon.from("measurements").insert([initialMeas]);
      if (measErr) throw measErr;

      await logAction(req.user!, "CREATE_CUSTOMER", { customer_id: customer.id, name });
      return res.status(201).json(customer);
    } catch (err: any) {
      return handleSupabaseError(err, res);
    }
  } else {
    const db = loadSandboxDB();

    const newCustomer = {
      id: customerId!,
      name,
      phone: dbPhone,
      whatsapp: whatsapp || "",
      address: address || "",
      email: email || "",
      notes: notes || "",
      created_by: req.user!.id,
      updated_by: req.user!.id,
      created_at: now,
      updated_at: now
    };

    const newMeasurements = {
      id: "meas-" + Math.random().toString(36).substring(2, 11),
      customer_id: customerId!,
      data: measurements || {},
      created_by: req.user!.id,
      updated_by: req.user!.id,
      created_at: now,
      updated_at: now
    };

    db.customers.push(newCustomer);
    db.measurements.push(newMeasurements);
    saveSandboxDB(db);

    await logAction(req.user!, "CREATE_CUSTOMER_SANDBOX", { customer_id: customerId, name });
    return res.status(201).json(newCustomer);
  }
});

// -------------------------------------------------------------------------
// MEASUREMENT MANAGEMENT
// -------------------------------------------------------------------------
app.get("/api/customers/:id/measurements", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
        .from("measurements")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // Return blank measurement schema
        return res.json({ customer_id: customerId, data: {} });
      }
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    const record = db.measurements.find(m => m.customer_id === customerId);
    if (!record) {
      return res.json({ customer_id: customerId, data: {} });
    }
    return res.json(record);
  }
});

app.put("/api/customers/:id/measurements", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { data: measurementData } = req.body;
  const now = new Date().toISOString();

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
        .from("measurements")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Update
        const { data: updated, error: uErr } = await supabaseAnon
          .from("measurements")
          .update({
            data: measurementData,
            updated_by: getDbUserId(req.user!.id),
            updated_at: now
          })
          .eq("customer_id", customerId)
          .select()
          .single();
        if (uErr) throw uErr;
        await logAction(req.user!, "UPDATE_MEASUREMENTS", { customer_id: customerId });
        return res.json(updated);
      } else {
        // Insert
        const { data: inserted, error: iErr } = await supabaseAnon
          .from("measurements")
          .insert([{
            customer_id: customerId,
            data: measurementData,
            created_by: getDbUserId(req.user!.id),
            updated_by: getDbUserId(req.user!.id),
            created_at: now,
            updated_at: now
          }])
          .select()
          .single();
        if (iErr) throw iErr;
        await logAction(req.user!, "CREATE_MEASUREMENTS", { customer_id: customerId });
        return res.json(inserted);
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    let record = db.measurements.find(m => m.customer_id === customerId);

    if (record) {
      record.data = measurementData;
      record.updated_by = req.user!.id;
      record.updated_at = now;
    } else {
      record = {
        id: "meas-" + Math.random().toString(36).substring(2, 11),
        customer_id: customerId,
        data: measurementData,
        created_by: req.user!.id,
        updated_by: req.user!.id,
        created_at: now,
        updated_at: now
      };
      db.measurements.push(record);
    }

    saveSandboxDB(db);
    await logAction(req.user!, "UPDATE_MEASUREMENTS_SANDBOX", { customer_id: customerId });
    return res.json(record);
  }
});

// Fetch order history for a single customer
app.get("/api/customers/:id/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
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
  } else {
    const db = loadSandboxDB();
    const results = db.orders
      .filter((o) => o.customer_id === customerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json(results);
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

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      // Optimize: Select only list columns, exclude heavy measurement_snapshot
      let query = supabaseAnon.from("orders").select(`
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
          phone
        )
      `);

      if (statusFilter && statusFilter !== "All") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      // Map joined fields
      let orders = data.map((o: any) => ({
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
  } else {
    const db = loadSandboxDB();
    let results = db.orders.map((o) => {
      const cust = db.customers.find((c) => c.id === o.customer_id);
      return {
        ...o,
        customer_name: cust ? cust.name : "Unknown Customer",
        customer_phone: cust ? cust.phone : "N/A"
      };
    });

    if (statusFilter && statusFilter !== "All") {
      results = results.filter((o) => o.status === statusFilter);
    }

    if (search) {
      results = results.filter(
        (o) =>
          o.order_number.toLowerCase().includes(search) ||
          o.customer_name.toLowerCase().includes(search) ||
          o.customer_phone.includes(search)
      );
    }

    // Sort descending by created_at
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const paginatedResults = results.slice(offset, offset + limit);
    return res.json(paginatedResults);
  }
});

// Fetch single order details (including full measurement snapshot)
app.get("/api/orders/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
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
  } else {
    const db = loadSandboxDB();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: "Order not found." });
    const cust = db.customers.find((c) => c.id === order.customer_id);
    const mapped = {
      ...order,
      customer_name: cust ? cust.name : "Unknown Customer",
      customer_phone: cust ? cust.phone : "N/A"
    };
    return res.json(mapped);
  }
});

app.post("/api/orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { customer_id, items, total_amount, paid_amount, due_date } = req.body;
  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer and at least one item are required." });
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      // 1. Fetch current customer measurements to build a solid, isolated SNAPSHOT
      const { data: meas, error: measErr } = await supabaseAnon
        .from("measurements")
        .select("data")
        .eq("customer_id", customer_id)
        .maybeSingle();

      const snapshot = meas ? meas.data : {};

      // Resolve starting status (first active stage ID)
      let defaultStatus = "Pending";
      try {
        const { data: settingsData } = await supabaseAnon.from("shop_settings").select("*");
        const settingsMap: any = {};
        if (settingsData) {
          settingsData.forEach((row: any) => {
            settingsMap[row.key] = row.value;
          });
        }
        const stages = settingsMap.pipeline_stages || DEFAULT_SANDBOX_DB.shop_settings.pipeline_stages;
        const firstActive = stages.find((s: any) => s.enabled && s.id !== "Archived" && s.id !== "archived");
        if (firstActive) {
          defaultStatus = firstActive.id;
        }
      } catch (err) {
        console.error("Failed to resolve starting status:", err);
      }

      // 2. Generate custom unique sequential order number
      const { count } = await supabaseAnon.from("orders").select("*", { count: "exact", head: true });
      const nextNum = (count || 0) + 1001;
      const orderNumber = `ORD-${nextNum}`;

      // 3. Create the order
      const { data: order, error: orderErr } = await supabaseAnon
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
          created_by: getDbUserId(req.user!.id),
          updated_by: getDbUserId(req.user!.id),
          created_at: now,
          updated_at: now
        }])
        .select()
        .single();

      if (orderErr) throw orderErr;

      await logAction(req.user!, "CREATE_ORDER", { order_id: order.id, order_number: orderNumber });
      return res.status(201).json(order);
    } catch (err: any) {
      return handleSupabaseError(err, res);
    }
  } else {
    const db = loadSandboxDB();

    const meas = db.measurements.find((m) => m.customer_id === customer_id);
    const snapshot = meas ? meas.data : {};

    const stages = db.shop_settings.pipeline_stages || DEFAULT_SANDBOX_DB.shop_settings.pipeline_stages;
    const firstActive = stages.find((s: any) => s.enabled && s.id !== "Archived" && s.id !== "archived");
    const defaultStatus = firstActive ? firstActive.id : "Pending";

    const orderNumber = `ORD-${db.orders.length + 1001}`;
    const newOrder = {
      id: "ord-" + Math.random().toString(36).substring(2, 11),
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
    };

    db.orders.push(newOrder);
    saveSandboxDB(db);

    await logAction(req.user!, "CREATE_ORDER_SANDBOX", { order_id: newOrder.id, order_number: orderNumber });
    return res.status(201).json(newOrder);
  }
});

// Update Order Status
app.put("/api/orders/:id/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const now = new Date().toISOString();

  if (!status) {
    return res.status(400).json({ error: "Status value is required." });
  }

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data: order, error: orderErr } = await supabaseAnon
        .from("orders")
        .update({
          status,
          updated_by: getDbUserId(req.user!.id),
          updated_at: now
        })
        .eq("id", orderId)
        .select()
        .single();

      if (orderErr) throw orderErr;

      await logAction(req.user!, "UPDATE_ORDER_STATUS", { order_id: orderId, order_number: order?.order_number, status });
      return res.json(order);
    } catch (err: any) {
      return handleSupabaseError(err, res);
    }
  } else {
    const db = loadSandboxDB();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const oldStatus = order.status;
    order.status = status;
    order.updated_by = req.user!.id;
    order.updated_at = now;

    saveSandboxDB(db);
    await logAction(req.user!, "UPDATE_ORDER_STATUS_SANDBOX", { order_id: orderId, order_number: order.order_number, from: oldStatus, to: status });
    return res.json(order);
  }
});

// Edit Full Order - Owner Only
app.put("/api/orders/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { items, total_amount, paid_amount, due_date, status, measurement_snapshot } = req.body;
  const now = new Date().toISOString();

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data: order, error: orderErr } = await supabaseAnon
        .from("orders")
        .update({
          items,
          total_amount,
          paid_amount,
          due_date,
          status,
          measurement_snapshot,
          updated_by: getDbUserId(req.user!.id),
          updated_at: now
        })
        .eq("id", orderId)
        .select()
        .single();

      if (orderErr) throw orderErr;

      await logAction(req.user!, "EDIT_ORDER", { order_id: orderId, order_number: order?.order_number });
      return res.json(order);
    } catch (err: any) {
      return handleSupabaseError(err, res);
    }
  } else {
    const db = loadSandboxDB();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (items !== undefined) order.items = items;
    if (total_amount !== undefined) order.total_amount = total_amount;
    if (paid_amount !== undefined) order.paid_amount = paid_amount;
    if (due_date !== undefined) order.due_date = due_date;
    if (status !== undefined) order.status = status;
    if (measurement_snapshot !== undefined) order.measurement_snapshot = measurement_snapshot;

    order.updated_by = req.user!.id;
    order.updated_at = now;

    saveSandboxDB(db);
    await logAction(req.user!, "EDIT_ORDER_SANDBOX", { order_id: orderId, order_number: order.order_number });
    return res.json(order);
  }
});

// -------------------------------------------------------------------------
// WORKER MANAGEMENT (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/workers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from("profiles").select("*");
      if (error) throw error;
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    return res.json(db.profiles);
  }
});

app.post("/api/workers", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: "All worker fields (email, password, name, role) are required." });
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      // 1. Create user in Supabase Auth using admin client
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authErr || !authUser.user) {
        throw new Error(authErr?.message || "Failed to create Supabase Auth credentials.");
      }

      // 2. Insert profile record
      const newProfile = {
        id: authUser.user.id,
        email,
        name,
        role,
        created_at: now,
        updated_at: now,
        created_by: getDbUserId(req.user!.id),
        updated_by: getDbUserId(req.user!.id)
      };

      const { error: profErr } = await supabaseAdmin.from("profiles").insert([newProfile]);
      if (profErr) {
        // Cleanup Auth user if profile failed
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        throw profErr;
      }

      await logAction(req.user!, "CREATE_WORKER", { email, role, name });
      return res.status(201).json(newProfile);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    const existing = db.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }

    const newWorker = {
      id: "mock-worker-" + Math.random().toString(36).substring(2, 11),
      email,
      name,
      role,
      created_at: now,
      updated_at: now,
      created_by: req.user!.id,
      updated_by: req.user!.id
    };

    db.profiles.push(newWorker);
    saveSandboxDB(db);

    await logAction(req.user!, "CREATE_WORKER_SANDBOX", { email, role, name });
    return res.status(201).json(newWorker);
  }
});

app.delete("/api/workers/:id", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.params.id;

  if (workerId === req.user!.id) {
    return res.status(400).json({ error: "You cannot delete your own Owner account." });
  }

  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      // 1. Check if we're deleting an Owner, and make sure there is at least one other Owner left
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("*").eq("id", workerId).single();
      if (targetProfile && targetProfile.role === "Owner") {
        const { count } = await supabaseAdmin.from("profiles").select("*", { count: "exact" }).eq("role", "Owner");
        if (count && count <= 1) {
          return res.status(400).json({ error: "Cannot delete the last Owner account. Create another Owner first." });
        }
      }

      // 2. Delete auth user
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(workerId);
      if (authErr) throw authErr;

      // 3. Delete profile
      const { error: profErr } = await supabaseAdmin.from("profiles").delete().eq("id", workerId);
      if (profErr) throw profErr;

      await logAction(req.user!, "DELETE_WORKER", { id: workerId, email: targetProfile?.email });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    const targetIdx = db.profiles.findIndex((p) => p.id === workerId);
    if (targetIdx === -1) {
      return res.status(404).json({ error: "Worker not found." });
    }

    const targetProfile = db.profiles[targetIdx];
    if (targetProfile.role === "Owner") {
      const owners = db.profiles.filter(p => p.role === "Owner");
      if (owners.length <= 1) {
        return res.status(400).json({ error: "Cannot delete the last Owner account." });
      }
    }

    db.profiles.splice(targetIdx, 1);
    // Remove active sessions
    Object.keys(db.sessions).forEach((token) => {
      if (db.sessions[token].id === workerId) {
        delete db.sessions[token];
      }
    });

    saveSandboxDB(db);
    await logAction(req.user!, "DELETE_WORKER_SANDBOX", { id: workerId, email: targetProfile.email });
    return res.json({ success: true });
  }
});

// -------------------------------------------------------------------------
// SHOP SETTINGS & SYSTEM BACKUPS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon.from("shop_settings").select("*");
      if (error) throw error;
      if (!data || data.length === 0) {
        // Return default structure
        return res.json(DEFAULT_SANDBOX_DB.shop_settings);
      }
      // Reassemble from key/value array or single settings row
      const settingsMap: any = {};
      data.forEach((row: any) => {
        settingsMap[row.key] = row.value;
      });
      if (!settingsMap.pipeline_stages) {
        settingsMap.pipeline_stages = DEFAULT_SANDBOX_DB.shop_settings.pipeline_stages;
      }
      return res.json(settingsMap);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    return res.json(db.shop_settings);
  }
});

app.put("/api/settings", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const settingsData = req.body;
  const now = new Date().toISOString();

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      // Clean delete & reinsert settings keys, or update directly
      const entries = Object.entries(settingsData);
      for (const [key, value] of entries) {
        const { error } = await supabaseAnon.from("shop_settings").upsert({
          key,
          value,
          updated_at: now,
          updated_by: getDbUserId(req.user!.id)
        });
        if (error) throw error;
      }
      await logAction(req.user!, "UPDATE_SETTINGS", {});
      return res.json(settingsData);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    db.shop_settings = {
      ...db.shop_settings,
      ...settingsData,
      updated_at: now,
      updated_by: req.user!.id
    };
    saveSandboxDB(db);
    await logAction(req.user!, "UPDATE_SETTINGS_SANDBOX", {});
    return res.json(db.shop_settings);
  }
});

// System backup download
app.post("/api/backup", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      // Pull all data from Supabase
      const [profiles, customers, measurements, orders, settings] = await Promise.all([
        supabaseAnon.from("profiles").select("*"),
        supabaseAnon.from("customers").select("*"),
        supabaseAnon.from("measurements").select("*"),
        supabaseAnon.from("orders").select("*"),
        supabaseAnon.from("shop_settings").select("*"),
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

      await logAction(req.user!, "SYSTEM_BACKUP", {});
      return res.json(backup);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to download database backup: " + err.message });
    }
  } else {
    const db = loadSandboxDB();
    const backup = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        profiles: db.profiles,
        customers: db.customers,
        measurements: db.measurements,
        orders: db.orders,
        shop_settings: db.shop_settings
      }
    };
    await logAction(req.user!, "SYSTEM_BACKUP_SANDBOX", {});
    return res.json(backup);
  }
});

// System backup restore
app.post("/api/restore", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { backupData } = req.body;
  if (!backupData || !backupData.data) {
    return res.status(400).json({ error: "Invalid backup data provided." });
  }

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { profiles, customers, measurements, orders, shop_settings } = backupData.data;

      // Real restore requires empty tables or batch upsert.
      // We will perform upserts to prevent deleting foreign keys.
      if (customers && customers.length > 0) {
        const { error } = await supabaseAnon.from("customers").upsert(customers);
        if (error) throw error;
      }
      if (measurements && measurements.length > 0) {
        const { error } = await supabaseAnon.from("measurements").upsert(measurements);
        if (error) throw error;
      }
      if (orders && orders.length > 0) {
        const { error } = await supabaseAnon.from("orders").upsert(orders);
        if (error) throw error;
      }
      if (shop_settings && shop_settings.length > 0) {
        const { error } = await supabaseAnon.from("shop_settings").upsert(shop_settings);
        if (error) throw error;
      }

      await logAction(req.user!, "SYSTEM_RESTORE", { timestamp: backupData.timestamp });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to restore backup: " + err.message });
    }
  } else {
    const db = loadSandboxDB();
    const { profiles, customers, measurements, orders, shop_settings } = backupData.data;

    if (profiles) db.profiles = profiles;
    if (customers) db.customers = customers;
    if (measurements) db.measurements = measurements;
    if (orders) db.orders = orders;
    if (shop_settings) db.shop_settings = shop_settings;

    saveSandboxDB(db);
    await logAction(req.user!, "SYSTEM_RESTORE_SANDBOX", { timestamp: backupData.timestamp });
    return res.json({ success: true });
  }
});

// Archive old orders (Owner Only)
app.post("/api/archive-orders", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  const { beforeDate } = req.body;
  if (!beforeDate) {
    return res.status(400).json({ error: "Please specify a cutoff date." });
  }

  const cutoff = new Date(beforeDate);

  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
        .from("orders")
        .update({ status: "Archived" })
        .lt("created_at", cutoff.toISOString())
        .in("status", ["Delivered", "Ready"]);

      if (error) throw error;
      await logAction(req.user!, "ARCHIVE_ORDERS", { beforeDate });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    let count = 0;
    db.orders.forEach((o) => {
      if (new Date(o.created_at) < cutoff && ["Delivered", "Ready"].includes(o.status)) {
        o.status = "Archived";
        count++;
      }
    });
    saveSandboxDB(db);
    await logAction(req.user!, "ARCHIVE_ORDERS_SANDBOX", { beforeDate, count });
    return res.json({ success: true, count });
  }
});

// -------------------------------------------------------------------------
// REPORTS & STATEMENTS (Owner Only)
// -------------------------------------------------------------------------
app.get("/api/reports/dashboard", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const [ordersRes, customersCountRes, settingsRes] = await Promise.all([
        supabaseAnon.from("orders").select("total_amount, paid_amount, status, items"),
        supabaseAnon.from("customers").select("*", { count: "exact", head: true }),
        supabaseAnon.from("shop_settings").select("*")
      ]);

      const orders = ordersRes.data || [];
      const customerCount = customersCountRes.count || 0;
      const settingsRows = settingsRes.data || [];

      // Calculate simple report parameters
      const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalReceived = orders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
      const totalPendingDues = totalRevenue - totalReceived;

      const settingsMap: Record<string, any> = {};
      settingsRows.forEach((row: any) => {
        settingsMap[row.key] = row.value;
      });

      const stages = settingsMap.pipeline_stages || [
        { id: 'Pending', name: 'Getting Ready', enabled: true },
        { id: 'Ready to Deliver', name: 'Ready to Deliver', enabled: true },
        { id: 'Delivered', name: 'Delivered', enabled: true },
        { id: 'Archived', name: 'Archived', enabled: true }
      ];

      const orderStatuses: Record<string, number> = {};
      stages.forEach((s: any) => {
        orderStatuses[s.name] = orders.filter(o => o.status === s.id).length;
      });
      // Catch any unassigned/legacy orders that don't match active stages
      orders.forEach(o => {
        const matchingStage = stages.find((s: any) => s.id === o.status);
        if (!matchingStage) {
          orderStatuses[o.status] = (orderStatuses[o.status] || 0) + 1;
        }
      });

      // Stitched garments report
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
  } else {
    const db = loadSandboxDB();
    const orders = db.orders;

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalReceived = orders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
    const totalPendingDues = totalRevenue - totalReceived;

    const stages = db.shop_settings.pipeline_stages || [
      { id: 'Pending', name: 'Getting Ready', enabled: true },
      { id: 'Ready to Deliver', name: 'Ready to Deliver', enabled: true },
      { id: 'Delivered', name: 'Delivered', enabled: true },
      { id: 'Archived', name: 'Archived', enabled: true }
    ];

    const orderStatuses: Record<string, number> = {};
    stages.forEach((s: any) => {
      orderStatuses[s.name] = orders.filter(o => o.status === s.id).length;
    });
    // Catch any unassigned/legacy orders that don't match active stages
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
        customerCount: db.customers.length,
        orderCount: orders.length,
      },
      orderStatuses,
      popularItems
    });
  }
});

app.get("/api/audit-logs", requireAuth, requireRole(["Owner"]), async (req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured && supabaseAnon) {
    try {
      const { data, error } = await supabaseAnon
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadSandboxDB();
    return res.json(db.audit_logs.slice(0, 100));
  }
});

// Catch-all for undefined /api routes to prevent falling back to HTML SPA index or Vite
app.all("/api/*", (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found.` });
});

// General error handler middleware for API routes to ensure they always return JSON
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
